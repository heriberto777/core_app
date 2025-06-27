// services/ConnectionCentralService.js
const { Connection, Request } = require("tedious");
const { createPool } = require("generic-pool");
const logger = require("./logger");
const DBConfig = require("../models/dbConfigModel");
const MongoDbService = require("./mongoDbService");
const Telemetry = require("./Telemetry");
const MemoryManager = require("./MemoryManager");

// Configuración global para pools de conexiones
const DEFAULT_POOL_CONFIG = {
  min: 0, // Empezar sin conexiones mínimas para evitar errores iniciales
  max: 5, // Reducir máximo inicialmente
  acquireTimeoutMillis: 120000, // 2 minutos para instancias nombradas
  idleTimeoutMillis: 300000, // 5 minutos
  evictionRunIntervalMillis: 60000, // 1 minuto
  softIdleTimeoutMillis: 180000, // 3 minutos
  testOnBorrow: false,
  testOnReturn: false,
  fifo: true, // Cambiar a FIFO para mejor consistencia con instancias
};

// Límites y contadores para operaciones
const CONNECTION_LIMITS = {
  maxOperations: 500,
  operationCounter: new Map(),
  maxAge: 3600000, // 1 hora
};

// Estado y monitoreo de salud de pools
const POOL_HEALTH = {
  lastCheck: {},
  errorCount: {},
  maxErrorThreshold: 5,
  checkInterval: 300000, // 5 minutos
  renewalTimeout: 7200000, // 2 horas
};

// Mapa global para rastrear conexiones
const connectionPoolMap = new Map();

class ConnectionCentralService {
  constructor() {
    this.pools = {};
    this.renewalTimers = {};
    this.stats = {
      acquired: 0,
      released: 0,
      errors: 0,
      renewals: 0,
      activeConnections: new Set(),
    };

    // Mapa de transacciones activas
    this.activeTransactions = new Map();

    // Flag de inicialización para evitar múltiples inicializaciones
    this._initializingPools = new Map();
    this._closingPools = new Set();

    // Intervalo para verificación de salud
    this.healthCheckInterval = null;
  }

  /**
   * Inicializa el servicio central de conexiones
   */
  initialize() {
    if (this.healthCheckInterval) {
      return; // Ya inicializado
    }

    // Configurar verificación periódica de salud
    this.healthCheckInterval = setInterval(() => {
      this._checkPoolsHealth();
    }, POOL_HEALTH.checkInterval);

    logger.info("✅ Servicio central de conexiones inicializado");
  }

  /**
   * Inicializa un pool de conexiones para un servidor específico
   */
  async initPool(serverKey, customConfig = {}) {
    if (!this._initializingPools) this._initializingPools = new Map();

    if (this._initializingPools.has(serverKey)) {
      try {
        logger.info(
          `Esperando inicialización en curso de pool para ${serverKey}...`
        );
        await this._initializingPools.get(serverKey);
        return true;
      } catch (error) {
        logger.error(
          `Error esperando inicialización de pool: ${error.message}`
        );
        return false;
      }
    }

    const initPromise = new Promise(async (resolve, reject) => {
      try {
        logger.info(`Inicializando pool para ${serverKey}...`);

        if (this.pools[serverKey]) {
          if (!this._closingPools || !this._closingPools.has(serverKey)) {
            await this.closePool(serverKey);
          } else {
            logger.info(
              `Esperando a que termine el cierre del pool para ${serverKey}...`
            );
            while (this._closingPools && this._closingPools.has(serverKey)) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }

        POOL_HEALTH.lastCheck[serverKey] = Date.now();
        POOL_HEALTH.errorCount[serverKey] = 0;

        const dbConfig = await this._loadConfig(serverKey);
        if (!dbConfig) {
          reject(
            new Error(
              `No se encontró configuración para ${serverKey} en MongoDB`
            )
          );
          return;
        }

        const factory = this._createConnectionFactory(dbConfig, serverKey);

        const poolConfig = {
          ...DEFAULT_POOL_CONFIG,
          ...customConfig,
          acquireTimeoutMillis: 120000,
        };

        this.pools[serverKey] = createPool(factory, poolConfig);

        logger.info(`Pool de conexiones inicializado para ${serverKey}`);

        this._setupAutoRenewal(serverKey);

        resolve(true);
      } catch (error) {
        logger.error(`Error al inicializar pool para ${serverKey}:`, error);
        reject(error);
      }
    });

    this._initializingPools.set(serverKey, initPromise);

    try {
      const result = await initPromise;
      this._initializingPools.delete(serverKey);
      return result;
    } catch (error) {
      this._initializingPools.delete(serverKey);
      throw error;
    }
  }

  /**
   * Carga la configuración de un servidor desde MongoDB
   */
  async _loadConfig(serverKey) {
    try {
      if (!MongoDbService.isConnected()) {
        await MongoDbService.connect();
        if (!MongoDbService.isConnected()) {
          throw new Error(
            "No se pudo conectar a MongoDB para cargar configuraciones"
          );
        }
      }

      const dbConfig = await DBConfig.findOne({ serverName: serverKey }).lean();
      if (!dbConfig) {
        logger.error(
          `No se encontró configuración en MongoDB para ${serverKey}`
        );
        return null;
      }

      logger.debug(`Configuración cargada desde MongoDB para ${serverKey}:`, {
        serverName: dbConfig.serverName,
        host: dbConfig.host,
        instance: dbConfig.instance,
        port: dbConfig.port,
        database: dbConfig.database,
      });

      const tediousConfig = this._convertToTediousConfig(dbConfig);

      if (!tediousConfig || !tediousConfig.server) {
        logger.error(`Configuración Tedious inválida para ${serverKey}`);
        return null;
      }

      return tediousConfig;
    } catch (error) {
      logger.error(`Error al cargar configuración para ${serverKey}:`, error);
      return null;
    }
  }

  /**
   * Convierte la configuración de MongoDB al formato requerido por Tedious
   */
  _convertToTediousConfig(dbConfig) {
    if (!dbConfig) {
      logger.error("dbConfig es null o undefined");
      return null;
    }

    logger.info(`Convertiendo configuración para: ${dbConfig.serverName}`);
    logger.info(
      `Host: ${dbConfig.host}, Instance: ${dbConfig.instance}, Port: ${dbConfig.port}`
    );

    if (
      !dbConfig.host ||
      !dbConfig.user ||
      !dbConfig.password ||
      !dbConfig.database
    ) {
      logger.error(`Configuración incompleta para ${dbConfig.serverName}`, {
        hasHost: !!dbConfig.host,
        hasUser: !!dbConfig.user,
        hasPassword: !!dbConfig.password,
        hasDatabase: !!dbConfig.database,
      });
      return null;
    }

    // CRÍTICO: Manejo especial para passwords con caracteres especiales
    let cleanPassword = dbConfig.password;

    // Log para debug (sin mostrar el password completo)
    logger.debug(
      `Password length: ${
        cleanPassword.length
      }, starts with: ${cleanPassword.substring(0, 2)}...`
    );

    const config = {
      server: dbConfig.host.trim(), // Asegurar que no hay espacios
      authentication: {
        type: "default",
        options: {
          userName: dbConfig.user.trim(),
          password: cleanPassword, // Tedious maneja caracteres especiales automáticamente
        },
      },
      options: {
        // CONFIGURACIÓN CRÍTICA para instancias nombradas
        database: dbConfig.database.trim(),
        encrypt: false, // IMPORTANTE: Desactivar para conexiones LAN/VPN
        trustServerCertificate: true,
        enableArithAbort: true,

        // TIMEOUTS AUMENTADOS para instancias nombradas y VPN
        connectTimeout: 120000, // 2 minutos (crítico para VPN)
        requestTimeout: 180000, // 3 minutos
        cancelTimeout: 30000,

        // CONFIGURACIONES DE RED OPTIMIZADAS para VPN
        packetSize: 4096,
        useUTC: false,
        dateFormat: "mdy",
        language: "us_english",
        rowCollectionOnRequestCompletion: true,
        useColumnNames: true,

        // CONFIGURACIONES ESPECÍFICAS PARA INSTANCIAS NOMBRADAS
        connectionRetryInterval: 3000, // 3 segundos entre reintentos (VPN puede ser lento)
        maxRetriesOnConnectionError: 8, // Más reintentos para VPN
        multiSubnetFailover: false,
        appName: `NodeApp_${dbConfig.serverName}`,
        isolationLevel: 1, // READ_UNCOMMITTED

        // CONFIGURACIONES ADICIONALES PARA ESTABILIDAD
        abortTransactionOnError: true,
        enableNumericRoundabort: false,

        // CONFIGURACIONES ESPECÍFICAS PARA VPN
        keepAlive: true,
        keepAliveInitialDelay: 30000, // 30 segundos
      },
    };

    // MANEJO CRÍTICO DE INSTANCIA NOMBRADA
    if (dbConfig.instance && dbConfig.instance.trim() !== "") {
      config.options.instanceName = dbConfig.instance.trim();
      logger.info(
        `✅ Configurando instancia nombrada: ${config.options.instanceName}`
      );

      logger.info(
        `⚠️ Puerto omitido para instancia nombrada (usa puerto dinámico)`
      );
    } else if (dbConfig.port && !isNaN(parseInt(dbConfig.port))) {
      config.options.port = parseInt(dbConfig.port);
      logger.info(`✅ Configurando puerto específico: ${config.options.port}`);
    } else {
      config.options.port = 1433;
      logger.info(`✅ Usando puerto por defecto: 1433`);
    }

    // LOG FINAL (sin contraseña por seguridad)
    const logConfig = {
      server: config.server,
      instance: config.options.instanceName,
      port: config.options.port,
      database: config.options.database,
      user: config.authentication.options.userName,
      encrypt: config.options.encrypt,
      connectTimeout: config.options.connectTimeout,
      requestTimeout: config.options.requestTimeout,
      passwordLength: cleanPassword.length,
    };

    logger.info(
      `🔧 Configuración Tedious final:`,
      JSON.stringify(logConfig, null, 2)
    );

    return config;
  }

  /**
   * Crea un factory de conexiones para el pool
   */
  _createConnectionFactory(config, serverKey) {
    const configInfo = {
      server: config.server,
      instance: config.options.instanceName,
      database: config.options.database,
      user: config.authentication.options.userName,
    };

    logger.info(
      `🏭 Creando factory de conexión para ${serverKey}:`,
      JSON.stringify(configInfo, null, 2)
    );

    return {
      create: () => {
        return new Promise((resolve, reject) => {
          logger.info(`🔄 Creando nueva conexión para ${serverKey}...`);

          const connection = new Connection(config);
          let isResolved = false;

          const timeout = setTimeout(() => {
            if (!isResolved) {
              isResolved = true;
              connection.removeAllListeners();
              try {
                connection.close();
              } catch (e) {}

              const errorMsg = `❌ Timeout al crear conexión para ${serverKey} después de ${config.options.connectTimeout}ms`;
              logger.error(errorMsg);
              reject(new Error(errorMsg));
            }
          }, config.options.connectTimeout + 5000);

          connection.on("connect", (err) => {
            clearTimeout(timeout);
            if (isResolved) return;
            isResolved = true;

            if (err) {
              logger.error(`❌ Error de conexión para ${serverKey}:`, {
                message: err.message,
                code: err.code,
                state: err.state,
                serverName: err.serverName,
                procName: err.procName,
                lineNumber: err.lineNumber,
              });
              reject(err);
            } else {
              logger.info(
                `✅ Conexión establecida exitosamente para ${serverKey}`
              );

              connection._poolOrigin = serverKey;
              connection._serverKey = serverKey;
              connection._acquiredAt = Date.now();
              connection._createdAt = Date.now();
              connection._operationCount = 0;

              resolve(connection);
            }
          });

          connection.on("error", (err) => {
            if (!isResolved) {
              clearTimeout(timeout);
              isResolved = true;
              logger.error(`❌ Error durante conexión para ${serverKey}:`, {
                message: err.message,
                code: err.code,
                state: err.state,
                severity: err.class,
                serverName: err.serverName,
              });
              reject(err);
            }
          });

          connection.on("infoMessage", (info) => {
            logger.debug(`📋 Info SQL Server (${serverKey}): ${info.message}`);
          });

          connection.on("errorMessage", (error) => {
            logger.warn(
              `⚠️ Mensaje de error SQL Server (${serverKey}): ${error.message}`
            );
          });

          connection.on("end", () => {
            logger.debug(`🔚 Conexión terminada para ${serverKey}`);
          });

          connection.on("debug", (text) => {
            logger.debug(`🐛 Debug SQL Server (${serverKey}): ${text}`);
          });

          try {
            logger.info(
              `🚀 Iniciando conexión a ${config.server}${
                config.options.instanceName
                  ? "\\" + config.options.instanceName
                  : ""
              }:${config.options.port || "dinámico"}...`
            );
            connection.connect();
          } catch (error) {
            clearTimeout(timeout);
            if (!isResolved) {
              isResolved = true;
              logger.error(`💥 Excepción al conectar ${serverKey}:`, error);
              reject(error);
            }
          }
        });
      },

      destroy: (connection) => {
        return new Promise((resolve) => {
          try {
            if (connection && typeof connection.close === "function") {
              connection.removeAllListeners();

              if (this.stats && this.stats.activeConnections) {
                this.stats.activeConnections.delete(connection);
              }

              connectionPoolMap.delete(connection);
              CONNECTION_LIMITS.operationCounter.delete(connection);

              logger.debug(
                `🗑️ Cerrando conexión para ${
                  connection._serverKey || "unknown"
                }`
              );
              connection.close();
            }
          } catch (error) {
            logger.warn(`⚠️ Error al cerrar conexión:`, error.message);
          } finally {
            resolve();
          }
        });
      },

      validate: (connection) => {
        return Promise.resolve(
          connection &&
            connection.state &&
            connection.state.name === "LoggedIn" &&
            typeof connection.execSql === "function"
        );
      },
    };
  }

  /**
   * Test específico para server2 con caracteres especiales
   */
  async testServer2WithSpecialChars(serverKey = "server2") {
    try {
      logger.info(
        `🧪 Test específico para server2 con caracteres especiales...`
      );

      const testConfig = {
        server: "sql-calidad.miami",
        authentication: {
          type: "default",
          options: {
            userName: "cliente-catelli",
            password: "Smk1$kE[qVc%5fY",
          },
        },
        options: {
          database: "stdb_gnd",
          instanceName: "calidadstdb",
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
          connectTimeout: 120000,
          requestTimeout: 180000,
          connectionRetryInterval: 3000,
          maxRetriesOnConnectionError: 8,
          keepAlive: true,
          keepAliveInitialDelay: 30000,
          useColumnNames: true,
          rowCollectionOnRequestCompletion: true,
          appName: "NodeApp_Test_Server2",
        },
      };

      logger.info(`🔧 Test config:`, {
        server: testConfig.server,
        instance: testConfig.options.instanceName,
        database: testConfig.options.database,
        user: testConfig.authentication.options.userName,
        passwordLength: testConfig.authentication.options.password.length,
      });

      return new Promise((resolve, reject) => {
        const connection = new Connection(testConfig);
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            connection.removeAllListeners();
            try {
              connection.close();
            } catch (e) {}
            resolve({
              success: false,
              error: "Timeout en test server2 después de 2 minutos",
              phase: "connection_timeout",
            });
          }
        }, 120000);

        connection.on("connect", (err) => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;

          if (err) {
            logger.error(`❌ Error de conexión server2:`, {
              message: err.message,
              code: err.code,
              state: err.state,
              serverName: err.serverName,
            });

            resolve({
              success: false,
              error: err.message,
              code: err.code,
              state: err.state,
              phase: "connection_error",
            });
          } else {
            logger.info(`✅ Conexión exitosa a server2`);

            const testRequest = new Request(
              "SELECT @@SERVERNAME AS ServerName, DB_NAME() AS CurrentDatabase, GETDATE() AS CurrentTime",
              (err, rowCount) => {
                try {
                  connection.close();
                } catch (e) {}

                if (err) {
                  resolve({
                    success: false,
                    error: err.message,
                    phase: "query_error",
                  });
                } else {
                  resolve({
                    success: true,
                    message: "Conexión y consulta exitosas",
                    rowCount: rowCount,
                  });
                }
              }
            );

            let queryData = [];

            // CORRECCIÓN: Manejo compatible de columnas para diferentes versiones de Tedious
            testRequest.on("row", (columns) => {
              const row = {};

              try {
                // Verificar si columns es un array (versión antigua) o un objeto (versión nueva)
                if (Array.isArray(columns)) {
                  // Versión antigua de Tedious
                  columns.forEach((column) => {
                    if (column && column.metadata && column.metadata.colName) {
                      row[column.metadata.colName] = column.value;
                    }
                  });
                } else if (columns && typeof columns === "object") {
                  // Versión nueva de Tedious - columns es un objeto
                  Object.keys(columns).forEach((key) => {
                    if (key !== "meta" && columns[key] !== undefined) {
                      // Puede ser que el valor esté directamente o en una propiedad value
                      const column = columns[key];
                      if (
                        column &&
                        typeof column === "object" &&
                        "value" in column
                      ) {
                        row[key] = column.value;
                      } else {
                        row[key] = column;
                      }
                    }
                  });
                } else {
                  // Fallback: intentar convertir a string
                  logger.warn(
                    "Formato de columnas no reconocido:",
                    typeof columns
                  );
                  row.result = String(columns);
                }

                queryData.push(row);
              } catch (rowError) {
                logger.error("Error procesando fila:", rowError);
                // Continuar con la siguiente fila
              }
            });

            testRequest.on("done", () => {
              try {
                connection.close();
              } catch (e) {}
              resolve({
                success: true,
                message: "Test server2 exitoso",
                data: queryData,
              });
            });

            connection.execSql(testRequest);
          }
        });

        connection.on("error", (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            logger.error(`❌ Error durante conexión server2:`, err);
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              phase: "connection_error",
            });
          }
        });

        connection.on("infoMessage", (info) => {
          logger.debug(`📋 Info server2: ${info.message}`);
        });

        connection.on("errorMessage", (error) => {
          logger.warn(`⚠️ Mensaje de error server2: ${error.message}`);
        });

        logger.info(`🚀 Iniciando test de conexión server2...`);
        connection.connect();
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        phase: "test_error",
      };
    }
  }

  /**
   * Verifica y actualiza las credenciales de server2
   */
  async updateServer2Credentials() {
    try {
      if (!MongoDbService.isConnected()) {
        await MongoDbService.connect();
      }

      // Buscar configuración actual
      const currentConfig = await DBConfig.findOne({ serverName: "server2" });

      if (!currentConfig) {
        logger.error("❌ No se encontró configuración para server2");
        return { success: false, error: "Configuración no encontrada" };
      }

      // Configuración correcta para server2
      const correctConfig = {
        serverName: "server2",
        type: "mssql",
        host: "sql-calidad.miami",
        instance: "calidadstdb",
        port: null, // No usar puerto para instancia nombrada
        database: "stdb_gnd",
        user: "cliente-catelli",
        password: "Smk1$kE[qVc%5fY", // Con caracteres especiales
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
        },
      };

      // Actualizar configuración
      const updated = await DBConfig.findOneAndUpdate(
        { serverName: "server2" },
        correctConfig,
        { new: true, upsert: true }
      );

      logger.info("✅ Configuración server2 actualizada:", {
        serverName: updated.serverName,
        host: updated.host,
        instance: updated.instance,
        database: updated.database,
        user: updated.user,
        passwordLength: updated.password.length,
      });

      return { success: true, updated: true };
    } catch (error) {
      logger.error("❌ Error actualizando configuración server2:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Diagnostica problemas de conexión específicos para instancias nombradas
   */
  async diagnoseConnection(serverKey) {
    try {
      logger.info(`🔍 Iniciando diagnóstico de conexión para ${serverKey}...`);

      const dbConfig = await this._loadConfig(serverKey);
      if (!dbConfig) {
        throw new Error(`No se encontró configuración para ${serverKey}`);
      }

      const diagConfig = JSON.parse(JSON.stringify(dbConfig));

      diagConfig.options.connectTimeout = 120000;
      diagConfig.options.requestTimeout = 180000;

      logger.info(`🔧 Configuración de diagnóstico:`, {
        server: diagConfig.server,
        instance: diagConfig.options.instanceName,
        port: diagConfig.options.port,
        database: diagConfig.options.database,
        connectTimeout: diagConfig.options.connectTimeout,
      });

      if (!diagConfig.server || typeof diagConfig.server !== "string") {
        throw new Error(
          `Configuración inválida: server no está definido para ${serverKey}`
        );
      }

      return new Promise((resolve, reject) => {
        const connection = new Connection(diagConfig);
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            connection.removeAllListeners();
            try {
              connection.close();
            } catch (e) {}
            resolve({
              success: false,
              error: "Timeout en diagnóstico después de 2 minutos",
              phase: "connection_timeout",
            });
          }
        }, 120000);

        connection.on("connect", (err) => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;

          if (err) {
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              state: err.state,
              phase: "connection_error",
            });
          } else {
            const testRequest = new Request(
              "SELECT @@SERVERNAME AS ServerName, DB_NAME() AS CurrentDatabase",
              (err, rowCount) => {
                try {
                  connection.close();
                } catch (e) {}

                if (err) {
                  resolve({
                    success: false,
                    error: err.message,
                    phase: "query_error",
                  });
                } else {
                  resolve({
                    success: true,
                    message: "Conexión y consulta exitosas",
                    rowCount: rowCount,
                  });
                }
              }
            );

            let queryData = [];

            // CORRECCIÓN: Manejo compatible de columnas
            testRequest.on("row", (columns) => {
              const row = {};

              try {
                if (Array.isArray(columns)) {
                  // Versión antigua de Tedious
                  columns.forEach((column) => {
                    if (column && column.metadata && column.metadata.colName) {
                      row[column.metadata.colName] = column.value;
                    }
                  });
                } else if (columns && typeof columns === "object") {
                  // Versión nueva de Tedious
                  Object.keys(columns).forEach((key) => {
                    if (key !== "meta" && columns[key] !== undefined) {
                      const column = columns[key];
                      if (
                        column &&
                        typeof column === "object" &&
                        "value" in column
                      ) {
                        row[key] = column.value;
                      } else {
                        row[key] = column;
                      }
                    }
                  });
                } else {
                  logger.warn(
                    "Formato de columnas no reconocido en diagnóstico:",
                    typeof columns
                  );
                  row.result = String(columns);
                }

                if (Object.keys(row).length > 0) {
                  queryData.push(row);
                }
              } catch (rowError) {
                logger.error("Error procesando fila en diagnóstico:", rowError);
              }
            });

            testRequest.on("done", () => {
              try {
                connection.close();
              } catch (e) {}
              resolve({
                success: true,
                message: "Diagnóstico exitoso",
                data: queryData,
              });
            });

            connection.execSql(testRequest);
          }
        });

        connection.on("error", (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              phase: "connection_error",
            });
          }
        });

        logger.info(`🚀 Iniciando diagnóstico de conexión...`);
        connection.connect();
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        phase: "diagnosis_error",
      };
    }
  }

  // ... [Resto de métodos como getConnection, releaseConnection, etc. - manteniendo los originales]

  async getConnection(serverKey, options = {}) {
    const startTime = Date.now();
    Telemetry.startTimer(`connection_acquire_${Date.now()}`);

    try {
      if (!this.healthCheckInterval) {
        this.initialize();
      }

      if (this._closingPools && this._closingPools.has(serverKey)) {
        throw new Error(
          `El pool para ${serverKey} está en proceso de cierre y no puede aceptar trabajo`
        );
      }

      if (!this.pools[serverKey]) {
        const initialized = await this.initPool(serverKey);
        if (!initialized) {
          throw new Error(`No se pudo inicializar el pool para ${serverKey}`);
        }
      }

      if (!this.pools[serverKey]) {
        throw new Error(`No se encontró pool para ${serverKey}`);
      }

      if (this.pools[serverKey]._draining) {
        throw new Error(
          `El pool para ${serverKey} está drenando y no puede aceptar trabajo`
        );
      }

      const timeout = options.timeout || 30000;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Timeout al obtener conexión para ${serverKey} después de ${timeout}ms`
            )
          );
        }, timeout);
      });

      const acquirePromise = this.pools[serverKey].acquire();
      const connection = await Promise.race([acquirePromise, timeoutPromise]);

      if (!connection) {
        throw new Error(`Se obtuvo una conexión nula para ${serverKey}`);
      }

      if (typeof connection.execSql !== "function") {
        logger.error(
          `Se obtuvo una conexión sin método execSql para ${serverKey}`
        );

        try {
          await this.pools[serverKey].destroy(connection);
        } catch (e) {}

        await this.closePool(serverKey);
        await this.initPool(serverKey);

        return this.getConnection(serverKey, options);
      }

      connection._poolOrigin = serverKey;
      connection._acquiredAt = Date.now();
      connection._operationCount = connection._operationCount || 0;
      connection._serverKey = serverKey;

      connectionPoolMap.set(connection, serverKey);
      this.stats.activeConnections.add(connection);

      this.stats.acquired++;

      const acquireTime = Date.now() - startTime;
      Telemetry.endTimer(`connection_acquire_${Date.now()}`);
      Telemetry.updateAverage("avgConnectionAcquireTime", acquireTime);

      logger.debug(`Conexión obtenida para ${serverKey} en ${acquireTime}ms`);

      if (options.useTransaction) {
        return await this.beginTransaction(connection, options);
      }

      return connection;
    } catch (error) {
      this.stats.errors++;
      const acquireTime = Date.now() - startTime;
      Telemetry.endTimer(`connection_acquire_${Date.now()}`);

      this._registerConnectionError(serverKey, error);

      const criticalErrors = [
        "draining",
        "cannot accept work",
        "timeout",
        "connection limit exceeded",
        "econnreset",
        "etimedout",
      ];

      const isCriticalError = criticalErrors.some((term) =>
        error.message.toLowerCase().includes(term)
      );

      if (isCriticalError) {
        logger.warn(
          `Error crítico de pool para ${serverKey}: ${error.message}. Reinicializando pool...`
        );

        try {
          await this.closePool(serverKey);
          await this.initPool(serverKey);

          logger.info(
            `Reintentando obtener conexión después de reinicializar pool para ${serverKey}`
          );
          return await this.getConnection(serverKey, options);
        } catch (reinitError) {
          logger.error(`Error al reinicializar pool: ${reinitError.message}`);
        }
      }

      logger.error(
        `Error al obtener conexión para ${serverKey} (${acquireTime}ms): ${error.message}`
      );
      throw error;
    }
  }

  async releaseConnection(connection) {
    if (!connection) {
      logger.debug(`Intento de liberar una conexión nula, ignorando`);
      return;
    }

    try {
      if (!connection.connected && !connection.loggedIn) {
        logger.debug(`Conexión ya cerrada, solo limpiando referencias`);

        this.stats.activeConnections.delete(connection);
        connectionPoolMap.delete(connection);
        CONNECTION_LIMITS.operationCounter.delete(connection);
        return;
      }

      if (this.activeTransactions.has(connection)) {
        const transaction = this.activeTransactions.get(connection);
        logger.warn(
          `Liberando conexión con transacción activa, haciendo rollback`
        );

        try {
          await this.rollbackTransaction(transaction);
        } catch (rollbackError) {
          logger.warn(`Error en rollback automático: ${rollbackError.message}`);
        }
      }

      let poolKey = connection._poolOrigin || connection._serverKey;

      if (!poolKey) {
        poolKey = connectionPoolMap.get(connection);
        if (!poolKey) {
          logger.debug(`No se pudo determinar origen, cerrando directamente`);

          try {
            if (connection.connected) {
              connection.close();
            }
          } catch (directCloseError) {
            // Ignorar errores al cerrar directamente
          }

          this._cleanupConnectionReferences(connection);
          return;
        }
      }

      const pool = this.pools[poolKey];

      if (pool && !pool._draining) {
        if (connection._acquiredAt) {
          const usageTime = Date.now() - connection._acquiredAt;
          logger.debug(`Conexión usada durante ${usageTime}ms (${poolKey})`);
        }

        await pool.release(connection);
        this.stats.released++;
        logger.debug(`Conexión liberada correctamente (${poolKey})`);
      } else {
        logger.debug(
          `Pool no disponible para ${poolKey}, cerrando directamente`
        );

        try {
          if (connection.connected) {
            connection.close();
          }
        } catch (directCloseError) {
          // Ignorar errores al cerrar
        }
      }

      this._cleanupConnectionReferences(connection);
    } catch (error) {
      this.stats.errors++;
      logger.warn(`Advertencia al liberar conexión: ${error.message}`);

      if (connection._poolOrigin || connection._serverKey) {
        this._registerConnectionError(
          connection._poolOrigin || connection._serverKey,
          error
        );
      }

      this._cleanupConnectionReferences(connection);
    }
  }

  _cleanupConnectionReferences(connection) {
    try {
      this.stats.activeConnections.delete(connection);
      connectionPoolMap.delete(connection);
      CONNECTION_LIMITS.operationCounter.delete(connection);

      if (this.activeTransactions.has(connection)) {
        this.activeTransactions.delete(connection);
      }
    } catch (cleanupError) {
      logger.debug(`Error limpiando referencias: ${cleanupError.message}`);
    }
  }

  incrementOperationCount(connection) {
    if (!connection) return 0;

    if (connection._operationCount !== undefined) {
      connection._operationCount++;
    } else {
      connection._operationCount = 1;
    }

    if (!CONNECTION_LIMITS.operationCounter.has(connection)) {
      CONNECTION_LIMITS.operationCounter.set(connection, 0);
    }

    const count = CONNECTION_LIMITS.operationCounter.get(connection) + 1;
    CONNECTION_LIMITS.operationCounter.set(connection, count);

    if (count % 10 === 0) {
      MemoryManager.trackOperation("connection_operation");
    }

    return count;
  }

  async enhancedRobustConnect(serverKey, maxAttempts = 5, baseDelay = 3000) {
    let attempt = 0;
    let delay = baseDelay;
    let existingPool = false;

    if (!this.healthCheckInterval) {
      this.initialize();
    }

    try {
      if (this.pools && this.pools[serverKey]) {
        try {
          const testConnection = await this.getConnection(serverKey);
          if (testConnection) {
            const testRequest = new Request(
              "SELECT 1 AS test",
              (err, rowCount, rows) => {
                if (err) throw err;
              }
            );

            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error("Timeout during connection test"));
              }, 10000);

              testRequest.on("done", () => {
                clearTimeout(timeout);
                resolve();
              });

              testRequest.on("error", (err) => {
                clearTimeout(timeout);
                reject(err);
              });

              testConnection.execSql(testRequest);
            });
          }
        } catch (poolTestError) {
          logger.warn(
            `Error al verificar pool existente: ${poolTestError.message}`
          );
          existingPool = true;
        }
      }
    } catch (checkError) {
      logger.warn(`Error al verificar estado de pools: ${checkError.message}`);
    }

    if (existingPool) {
      try {
        logger.info(
          `Cerrando pool con problemas para ${serverKey} antes de reconectar`
        );
        await this.closePool(serverKey);
      } catch (closeError) {
        logger.warn(`Error al cerrar pool existente: ${closeError.message}`);
      }
    }

    while (attempt < maxAttempts) {
      attempt++;

      try {
        logger.info(
          `Intento ${attempt}/${maxAttempts} para conectar a ${serverKey}...`
        );

        const initialized = await this.initPool(serverKey);
        if (!initialized) {
          throw new Error(`No se pudo inicializar el pool para ${serverKey}`);
        }

        const connection = await this.getConnection(serverKey);
        if (!connection) {
          throw new Error(`No se pudo obtener una conexión a ${serverKey}`);
        }

        await new Promise((resolve, reject) => {
          const testRequest = new Request(
            "SELECT 1 AS test",
            (err, rowCount) => {
              if (err) {
                reject(err);
              } else {
                resolve(rowCount);
              }
            }
          );

          const timeout = setTimeout(() => {
            reject(new Error(`Timeout al verificar conexión a ${serverKey}`));
          }, 10000);

          testRequest.on("done", () => {
            clearTimeout(timeout);
            resolve();
          });

          testRequest.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });

          connection.execSql(testRequest);
        });

        logger.info(
          `Conexión a ${serverKey} establecida y verificada (intento ${attempt})`
        );
        return { success: true, connection };
      } catch (error) {
        logger.warn(
          `Error en intento ${attempt} para ${serverKey}: ${error.message}`
        );

        if (attempt >= maxAttempts) {
          return {
            success: false,
            error: new Error(
              `No se pudo establecer conexión a ${serverKey} después de ${attempt} intentos: ${error.message}`
            ),
          };
        }

        try {
          if (
            error.message &&
            (error.message.includes("timeout") ||
              error.message.includes("network") ||
              error.message.includes("state"))
          ) {
            await this.closePool(serverKey);
          }
        } catch (cleanupError) {
          logger.warn(
            `Error al limpiar recursos antes de reintento: ${cleanupError.message}`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 30000);
      }
    }

    return {
      success: false,
      error: new Error(
        `No se pudo establecer conexión a ${serverKey} después de ${maxAttempts} intentos`
      ),
    };
  }

  async closePool(serverKey) {
    try {
      logger.info(`Cerrando pool para ${serverKey}...`);

      if (this._closingPools && this._closingPools.has(serverKey)) {
        logger.info(
          `Pool para ${serverKey} ya está en proceso de cierre, esperando...`
        );
        while (this._closingPools.has(serverKey)) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        return true;
      }

      if (!this._closingPools) this._closingPools = new Set();
      this._closingPools.add(serverKey);

      const pool = this.pools[serverKey];
      if (!pool) {
        logger.warn(`No existe un pool para ${serverKey} que cerrar`);
        this._closingPools.delete(serverKey);
        return true;
      }

      if (this.renewalTimers && this.renewalTimers[serverKey]) {
        clearTimeout(this.renewalTimers[serverKey]);
        this.renewalTimers[serverKey] = null;
      }

      let forcedCleanup = false;
      const drainPromise = pool.drain().catch((err) => {
        logger.error(`Error during pool drain: ${err.message}`);
        throw err;
      });

      try {
        await Promise.race([
          drainPromise,
          new Promise((_, reject) => {
            setTimeout(() => {
              forcedCleanup = true;
              reject(new Error("Drain timeout"));
            }, 30000);
          }),
        ]);
      } catch (timeoutError) {
        logger.warn(
          `Timeout durante drain para ${serverKey}, forzando limpieza`
        );
      }

      try {
        if (!forcedCleanup) {
          await pool.clear();
        }
      } catch (clearError) {
        logger.error(`Error durante clear del pool: ${clearError.message}`);
      }

      delete this.pools[serverKey];
      this._closingPools.delete(serverKey);

      logger.info(
        `Pool para ${serverKey} cerrado ${
          forcedCleanup ? "forzosamente" : "correctamente"
        }`
      );
      return true;
    } catch (outerError) {
      logger.error(
        `Error externo al cerrar pool para ${serverKey}: ${outerError.message}`
      );

      if (this._closingPools) {
        this._closingPools.delete(serverKey);
      }
      if (this.pools[serverKey]) {
        delete this.pools[serverKey];
      }
      return false;
    }
  }

  async closePools() {
    const results = {};

    for (const [serverKey, pool] of Object.entries(this.pools)) {
      try {
        logger.info(`Cerrando pool para ${serverKey}...`);

        if (this.renewalTimers[serverKey]) {
          clearTimeout(this.renewalTimers[serverKey]);
          this.renewalTimers[serverKey] = null;
        }

        await pool.drain();
        await pool.clear();

        delete this.pools[serverKey];
        results[serverKey] = true;

        logger.info(`Pool para ${serverKey} cerrado correctamente`);
      } catch (error) {
        logger.error(`Error al cerrar pool para ${serverKey}:`, error);
        results[serverKey] = false;
      }
    }

    connectionPoolMap.clear();
    CONNECTION_LIMITS.operationCounter.clear();
    this.stats.activeConnections.clear();

    return results;
  }

  _setupAutoRenewal(serverKey) {
    if (this.renewalTimers[serverKey]) {
      clearTimeout(this.renewalTimers[serverKey]);
    }

    this.renewalTimers[serverKey] = setTimeout(async () => {
      logger.info(
        `Iniciando renovación programada del pool para ${serverKey}...`
      );
      await this._renewPool(serverKey);

      this._setupAutoRenewal(serverKey);
    }, POOL_HEALTH.renewalTimeout);
  }

  async _renewPool(serverKey) {
    try {
      const currentPool = this.pools[serverKey];

      if (currentPool) {
        logger.info(`Creando nuevo pool para ${serverKey}...`);

        const dbConfig = await this._loadConfig(serverKey);
        if (!dbConfig) {
          throw new Error(`No se encontró configuración para ${serverKey}`);
        }

        const factory = this._createConnectionFactory(dbConfig, serverKey);
        const newPool = createPool(factory, DEFAULT_POOL_CONFIG);

        this.pools[serverKey] = newPool;

        setTimeout(async () => {
          try {
            logger.info(`Cerrando pool antiguo para ${serverKey}...`);
            await currentPool.drain();
            await currentPool.clear();

            this.stats.renewals++;

            logger.info(`Pool antiguo para ${serverKey} cerrado correctamente`);
          } catch (error) {
            logger.error(
              `Error al cerrar pool antiguo para ${serverKey}:`,
              error
            );
          }
        }, 60000);

        logger.info(`Pool para ${serverKey} renovado correctamente`);
        return true;
      } else {
        return await this.initPool(serverKey);
      }
    } catch (error) {
      logger.error(`Error al renovar pool para ${serverKey}:`, error);
      return false;
    }
  }

  _registerConnectionError(serverKey, error) {
    if (!POOL_HEALTH.errorCount[serverKey]) {
      POOL_HEALTH.errorCount[serverKey] = 0;
    }

    POOL_HEALTH.errorCount[serverKey]++;

    logger.warn(
      `Error de conexión en ${serverKey} (${POOL_HEALTH.errorCount[serverKey]}/${POOL_HEALTH.maxErrorThreshold}): ${error.message}`
    );

    if (POOL_HEALTH.errorCount[serverKey] >= POOL_HEALTH.maxErrorThreshold) {
      logger.info(
        `Umbral de errores alcanzado para ${serverKey}, iniciando renovación de pool...`
      );
      this._renewPool(serverKey);

      POOL_HEALTH.errorCount[serverKey] = 0;
    }
  }

  async _checkPoolsHealth() {
    try {
      logger.debug("Verificando salud de pools de conexión...");

      for (const [serverKey, pool] of Object.entries(this.pools)) {
        try {
          const now = Date.now();
          const lastCheck = POOL_HEALTH.lastCheck[serverKey] || 0;
          const timeSinceLastCheck = now - lastCheck;

          if (
            timeSinceLastCheck > POOL_HEALTH.checkInterval * 2 ||
            POOL_HEALTH.errorCount[serverKey] >
              POOL_HEALTH.maxErrorThreshold / 2
          ) {
            logger.info(
              `Realizando verificación de salud para pool ${serverKey}...`
            );

            try {
              const testConnection = await this.getConnection(serverKey, {
                timeout: 10000,
              });
              await this.releaseConnection(testConnection);

              POOL_HEALTH.errorCount[serverKey] = 0;
              logger.info(`Verificación de salud exitosa para ${serverKey}`);
            } catch (testError) {
              logger.warn(
                `Falló verificación de salud para ${serverKey}: ${testError.message}`
              );
              this._registerConnectionError(serverKey, testError);
            }
          }

          POOL_HEALTH.lastCheck[serverKey] = now;
        } catch (poolError) {
          logger.error(
            `Error verificando pool ${serverKey}: ${poolError.message}`
          );
        }
      }
    } catch (error) {
      logger.error(`Error general en verificación de salud: ${error.message}`);
    }
  }

  async checkPoolsHealth() {
    const results = {};

    try {
      for (const [serverKey, pool] of Object.entries(this.pools)) {
        results[serverKey] = {
          healthy: false,
          error: null,
          size: pool.size,
          borrowed: pool.borrowed,
        };

        try {
          const testConnection = await this.getConnection(serverKey, {
            timeout: 5000,
          });

          const testRequest = new Request(
            "SELECT 1 AS test",
            (err, rowCount, rows) => {
              if (err) throw err;
            }
          );

          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Query timeout"));
            }, 5000);

            testRequest.on("done", () => {
              clearTimeout(timeout);
              resolve();
            });

            testRequest.on("error", (err) => {
              clearTimeout(timeout);
              reject(err);
            });

            testConnection.execSql(testRequest);
          });

          await this.releaseConnection(testConnection);

          results[serverKey].healthy = true;

          POOL_HEALTH.errorCount[serverKey] = 0;
        } catch (error) {
          results[serverKey].error = error.message;

          this._registerConnectionError(serverKey, error);
        }
      }

      logger.debug(`Health check results: ${JSON.stringify(results)}`);
      return results;
    } catch (error) {
      logger.error(`Error during pools health check: ${error.message}`);
      return { error: error.message, results };
    }
  }

  getConnectionStats() {
    const poolStats = {};

    for (const [serverKey, pool] of Object.entries(this.pools)) {
      poolStats[serverKey] = {
        size: pool.size,
        available: pool.available,
        borrowed: pool.borrowed,
        pending: pool.pending,
        max: pool.max,
        min: pool.min,
        errors: POOL_HEALTH.errorCount[serverKey] || 0,
        lastCheck: new Date(
          POOL_HEALTH.lastCheck[serverKey] || Date.now()
        ).toISOString(),
      };
    }

    return {
      ...this.stats,
      activeCount: this.stats.activeConnections.size,
      timestamp: new Date().toISOString(),
      pools: poolStats,
    };
  }

  async beginTransaction(connection, options = {}) {
    if (!connection) {
      throw new Error(
        "Se requiere una conexión válida para iniciar transacción"
      );
    }

    if (this.activeTransactions.has(connection)) {
      logger.warn(
        "Intento de iniciar transacción en una conexión que ya tiene una transacción activa"
      );
      return {
        connection,
        transaction: this.activeTransactions.get(connection),
      };
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout al iniciar transacción"));
      }, options.timeout || 30000);

      connection.transaction((err, transaction) => {
        clearTimeout(timeout);

        if (err) {
          logger.error(`Error al iniciar transacción: ${err.message}`);
          reject(err);
        } else {
          this.activeTransactions.set(connection, transaction);

          transaction._startTime = Date.now();
          transaction._connection = connection;

          logger.debug("Transacción iniciada correctamente");
          resolve({ connection, transaction });
        }
      });
    });
  }

  async commitTransaction(transaction) {
    if (!transaction) {
      throw new Error("Se requiere una transacción válida para confirmar");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout al confirmar transacción"));
      }, 30000);

      transaction.commit((err) => {
        clearTimeout(timeout);

        if (err) {
          logger.error(`Error al confirmar transacción: ${err.message}`);
          reject(err);
        } else {
          if (transaction._connection) {
            this.activeTransactions.delete(transaction._connection);
          }

          logger.debug("Transacción confirmada correctamente");
          resolve();
        }
      });
    });
  }

  async rollbackTransaction(transaction) {
    if (!transaction) return;

    return new Promise((resolve, reject) => {
      try {
        const timeout = setTimeout(() => {
          if (transaction._connection) {
            this.activeTransactions.delete(transaction._connection);
          }

          logger.warn("Timeout en rollback de transacción, continuando...");
          resolve();
        }, 30000);

        if (typeof transaction.rollback === "function") {
          transaction.rollback((err) => {
            clearTimeout(timeout);

            if (transaction._connection) {
              this.activeTransactions.delete(transaction._connection);
            }

            if (err) {
              logger.error(`Error en rollback: ${err.message}`);
              reject(err);
            } else {
              logger.debug("Rollback completado correctamente");
              resolve();
            }
          });
        } else {
          clearTimeout(timeout);

          if (transaction._connection) {
            this.activeTransactions.delete(transaction._connection);
          }

          logger.warn(
            "No se encontró método rollback en el objeto de transacción"
          );
          resolve();
        }
      } catch (error) {
        logger.error(`Error general en rollback: ${error.message}`);

        if (transaction._connection) {
          this.activeTransactions.delete(transaction._connection);
        }

        reject(error);
      }
    });
  }

  shutdown() {
    logger.info("Deteniendo servicio central de conexiones...");

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    for (const timer of Object.values(this.renewalTimers)) {
      if (timer) clearTimeout(timer);
    }
    this.renewalTimers = {};

    this.closePools().catch((err) => {
      logger.error(`Error al cerrar pools durante shutdown: ${err.message}`);
    });

    logger.info("Servicio central de conexiones detenido");
  }

  /**
   * Función auxiliar para procesar filas de Tedious de manera compatible
   * @param {Array|Object} columns - Columnas de Tedious
   * @returns {Object} - Fila procesada
   */
  _processRowColumns(columns) {
    const row = {};

    try {
      if (Array.isArray(columns)) {
        // Versión antigua de Tedious - columns es un array
        columns.forEach((column) => {
          if (column && column.metadata && column.metadata.colName) {
            row[column.metadata.colName] = column.value;
          }
        });
      } else if (columns && typeof columns === "object") {
        // Versión nueva de Tedious - columns es un objeto
        Object.keys(columns).forEach((key) => {
          if (key !== "meta" && columns[key] !== undefined) {
            const column = columns[key];
            if (column && typeof column === "object" && "value" in column) {
              // El valor está en column.value
              row[key] = column.value;
            } else {
              // El valor está directamente
              row[key] = column;
            }
          }
        });
      } else {
        // Fallback para casos raros
        logger.warn("Formato de columnas no reconocido:", typeof columns);
        row.result = String(columns);
      }
    } catch (error) {
      logger.error("Error procesando columnas:", error);
      row.error = "Error procesando datos";
    }

    return row;
  }

  /**
   * Debug detallado para server2 - Investigar problema de autenticación
   */
  async debugServer2Authentication() {
    try {
      logger.info("🔍 Iniciando debug detallado de autenticación server2...");

      // 1. Verificar configuración actual en MongoDB
      if (!MongoDbService.isConnected()) {
        await MongoDbService.connect();
      }

      const currentConfig = await DBConfig.findOne({
        serverName: "server2",
      }).lean();

      if (!currentConfig) {
        logger.error("❌ No se encontró configuración para server2 en MongoDB");
        return { success: false, error: "Configuración no encontrada" };
      }

      // Log de configuración actual (sin password completo)
      logger.info("📋 Configuración actual en MongoDB:", {
        serverName: currentConfig.serverName,
        host: currentConfig.host,
        instance: currentConfig.instance,
        port: currentConfig.port,
        database: currentConfig.database,
        user: currentConfig.user,
        passwordLength: currentConfig.password
          ? currentConfig.password.length
          : 0,
        passwordStart: currentConfig.password
          ? currentConfig.password.substring(0, 3) + "..."
          : "no password",
        type: currentConfig.type,
      });

      // 2. Test con diferentes variaciones del password
      const passwordVariations = [
        currentConfig.password, // Original
        "Smk1$kE[qVc%5fY", // Hardcoded correcto
        currentConfig.password?.trim(), // Sin espacios
      ].filter(Boolean);

      for (let i = 0; i < passwordVariations.length; i++) {
        const testPassword = passwordVariations[i];
        if (!testPassword) continue;

        logger.info(
          `🧪 Test ${i + 1}: Probando password variación (longitud: ${
            testPassword.length
          })`
        );

        const testResult = await this.testServer2WithPassword(testPassword);

        logger.info(`Resultado test ${i + 1}:`, {
          success: testResult.success,
          error: testResult.error || "ninguno",
          phase: testResult.phase,
        });

        if (testResult.success) {
          logger.info(
            `✅ ¡Password correcto encontrado en variación ${i + 1}!`
          );

          // Actualizar en MongoDB con el password que funciona
          await DBConfig.findOneAndUpdate(
            { serverName: "server2" },
            {
              password: testPassword,
              host: "sql-calidad.miami",
              instance: "calidadstdb",
              database: "stdb_gnd",
              user: "cliente-catelli",
            },
            { new: true }
          );

          return {
            success: true,
            workingPassword: true,
            passwordIndex: i + 1,
            message: `Password funcional encontrado y actualizado`,
          };
        }
      }

      // 3. Test con diferentes usuarios
      const userVariations = [
        "cliente-catelli",
        "cliente_catelli",
        "CLIENTE-CATELLI",
        "catelli\\cliente-catelli", // Con dominio
      ];

      for (let i = 0; i < userVariations.length; i++) {
        const testUser = userVariations[i];

        logger.info(`🧪 Test usuario ${i + 1}: ${testUser}`);

        const testResult = await this.testServer2WithUser(
          testUser,
          "Smk1$kE[qVc%5fY"
        );

        logger.info(`Resultado test usuario ${i + 1}:`, {
          success: testResult.success,
          error: testResult.error || "ninguno",
          phase: testResult.phase,
        });

        if (testResult.success) {
          logger.info(`✅ ¡Usuario correcto encontrado: ${testUser}!`);

          // Actualizar en MongoDB
          await DBConfig.findOneAndUpdate(
            { serverName: "server2" },
            {
              user: testUser,
              password: "Smk1$kE[qVc%5fY",
              host: "sql-calidad.miami",
              instance: "calidadstdb",
              database: "stdb_gnd",
            },
            { new: true }
          );

          return {
            success: true,
            workingUser: testUser,
            message: `Usuario funcional encontrado y actualizado`,
          };
        }
      }

      // 4. Test sin instancia nombrada (usando puerto directo)
      logger.info("🧪 Test sin instancia nombrada...");
      const noInstanceResult = await this.testServer2WithoutInstance();
      logger.info("Resultado sin instancia:", noInstanceResult);

      return {
        success: false,
        error: "No se encontró combinación funcional",
        testedPasswords: passwordVariations.length,
        testedUsers: userVariations.length,
      };
    } catch (error) {
      logger.error("❌ Error en debug de autenticación:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test con password específico
   */
  async testServer2WithPassword(password) {
    try {
      const testConfig = {
        server: "sql-calidad.miami",
        authentication: {
          type: "default",
          options: {
            userName: "cliente-catelli",
            password: password,
          },
        },
        options: {
          database: "stdb_gnd",
          instanceName: "calidadstdb",
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
          connectTimeout: 60000, // Reducir timeout para tests rápidos
          requestTimeout: 30000,
          useColumnNames: true,
          rowCollectionOnRequestCompletion: true,
          appName: "NodeApp_PasswordTest",
        },
      };

      return new Promise((resolve) => {
        const connection = new Connection(testConfig);
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            connection.removeAllListeners();
            try {
              connection.close();
            } catch (e) {}
            resolve({
              success: false,
              error: "Timeout en test de password",
              phase: "connection_timeout",
            });
          }
        }, 60000);

        connection.on("connect", (err) => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;

          try {
            connection.close();
          } catch (e) {}

          if (err) {
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              phase: "connection_error",
            });
          } else {
            resolve({
              success: true,
              message: "Password funciona",
              phase: "connection_success",
            });
          }
        });

        connection.on("error", (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              phase: "connection_error",
            });
          }
        });

        connection.connect();
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        phase: "test_error",
      };
    }
  }

  /**
   * Test con usuario específico
   */
  async testServer2WithUser(userName, password) {
    try {
      const testConfig = {
        server: "sql-calidad.miami",
        authentication: {
          type: "default",
          options: {
            userName: userName,
            password: password,
          },
        },
        options: {
          database: "stdb_gnd",
          instanceName: "calidadstdb",
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
          connectTimeout: 60000,
          requestTimeout: 30000,
          useColumnNames: true,
          rowCollectionOnRequestCompletion: true,
          appName: "NodeApp_UserTest",
        },
      };

      return new Promise((resolve) => {
        const connection = new Connection(testConfig);
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            connection.removeAllListeners();
            try {
              connection.close();
            } catch (e) {}
            resolve({
              success: false,
              error: "Timeout en test de usuario",
              phase: "connection_timeout",
            });
          }
        }, 60000);

        connection.on("connect", (err) => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;

          try {
            connection.close();
          } catch (e) {}

          if (err) {
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              phase: "connection_error",
            });
          } else {
            resolve({
              success: true,
              message: `Usuario ${userName} funciona`,
              phase: "connection_success",
            });
          }
        });

        connection.on("error", (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              phase: "connection_error",
            });
          }
        });

        connection.connect();
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        phase: "test_error",
      };
    }
  }

  /**
   * Test sin instancia nombrada (usando puerto 1433)
   */
  async testServer2WithoutInstance() {
    try {
      const testConfig = {
        server: "sql-calidad.miami",
        authentication: {
          type: "default",
          options: {
            userName: "cliente-catelli",
            password: "Smk1$kE[qVc%5fY",
          },
        },
        options: {
          database: "stdb_gnd",
          port: 1433, // Puerto directo en lugar de instancia
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
          connectTimeout: 60000,
          requestTimeout: 30000,
          useColumnNames: true,
          rowCollectionOnRequestCompletion: true,
          appName: "NodeApp_PortTest",
        },
      };

      return new Promise((resolve) => {
        const connection = new Connection(testConfig);
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            connection.removeAllListeners();
            try {
              connection.close();
            } catch (e) {}
            resolve({
              success: false,
              error: "Timeout en test sin instancia",
              phase: "connection_timeout",
            });
          }
        }, 60000);

        connection.on("connect", (err) => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;

          try {
            connection.close();
          } catch (e) {}

          if (err) {
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              phase: "connection_error",
            });
          } else {
            resolve({
              success: true,
              message: "Conexión sin instancia funciona",
              phase: "connection_success",
            });
          }
        });

        connection.on("error", (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            resolve({
              success: false,
              error: err.message,
              code: err.code,
              phase: "connection_error",
            });
          }
        });

        connection.connect();
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        phase: "test_error",
      };
    }
  }

  /**
   * Estado de salud mejorado del sistema
   */
  async performSystemHealthCheck() {
    try {
      logger.info("🏥 Iniciando chequeo completo de salud del sistema...");

      const healthResults = {
        timestamp: new Date().toISOString(),
        mongodb: { connected: false },
        server1: { connected: false },
        server2: { connected: false },
        pools: {},
        system: {},
      };

      // 1. MongoDB
      healthResults.mongodb.connected = MongoDbService.isConnected();
      if (!healthResults.mongodb.connected) {
        const mongoConnect = await MongoDbService.connect();
        healthResults.mongodb.connected = mongoConnect;
        healthResults.mongodb.reconnected = mongoConnect;
      }

      // 2. Estadísticas de pools
      try {
        const poolStats = this.getConnectionStats();
        healthResults.pools = poolStats.pools || {};
      } catch (poolError) {
        healthResults.pools.error = poolError.message;
      }

      // 3. Server1
      try {
        const server1Result = await this.diagnoseConnection("server1");
        healthResults.server1 = {
          connected: server1Result.success,
          error: server1Result.success ? null : server1Result.error,
          phase: server1Result.phase,
          data: server1Result.data || null,
        };
      } catch (error) {
        healthResults.server1 = {
          connected: false,
          error: error.message,
          phase: "diagnosis_error",
        };
      }

      // 4. Server2 con debug
      try {
        const server2Result = await this.diagnoseConnection("server2");
        healthResults.server2 = {
          connected: server2Result.success,
          error: server2Result.success ? null : server2Result.error,
          phase: server2Result.phase,
          data: server2Result.data || null,
        };

        // Si server2 falla, ejecutar debug automáticamente
        if (!server2Result.success) {
          logger.info("🔧 Server2 falló, ejecutando debug automático...");
          const debugResult = await this.debugServer2Authentication();
          healthResults.server2.debugExecuted = true;
          healthResults.server2.debugResult = debugResult;
        }
      } catch (error) {
        healthResults.server2 = {
          connected: false,
          error: error.message,
          phase: "diagnosis_error",
        };
      }

      // 5. Sistema
      healthResults.system = {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
      };

      // 6. Resumen
      const allOk =
        healthResults.mongodb.connected &&
        healthResults.server1.connected &&
        healthResults.server2.connected;

      healthResults.overall = {
        healthy: allOk,
        issues: [
          !healthResults.mongodb.connected ? "MongoDB desconectado" : null,
          !healthResults.server1.connected ? "Server1 no conecta" : null,
          !healthResults.server2.connected ? "Server2 no conecta" : null,
        ].filter(Boolean),
      };

      logger.info("📊 Resultado de salud del sistema:", {
        overall: healthResults.overall.healthy ? "SALUDABLE" : "CON PROBLEMAS",
        mongodb: healthResults.mongodb.connected ? "OK" : "ERROR",
        server1: healthResults.server1.connected ? "OK" : "ERROR",
        server2: healthResults.server2.connected ? "OK" : "ERROR",
        issues: healthResults.overall.issues,
      });

      return healthResults;
    } catch (error) {
      logger.error("❌ Error en chequeo de salud del sistema:", error);
      return {
        timestamp: new Date().toISOString(),
        overall: { healthy: false, error: error.message },
        error: error.message,
      };
    }
  }
}

// Exportar instancia singleton
module.exports = new ConnectionCentralService();
