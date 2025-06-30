// services/ConnectionCentralService.js
const { Connection, Request } = require("tedious");
const { createPool } = require("generic-pool");
const logger = require("./logger");
const DBConfig = require("../models/dbConfigModel");
const MongoDbService = require("./mongoDbService");
const Telemetry = require("./Telemetry");
const MemoryManager = require("./MemoryManager");

// ✅ CONFIGURACIÓN OPTIMIZADA - Timeouts aumentados
const DEFAULT_POOL_CONFIG = {
  min: 0,
  max: 5,
  acquireTimeoutMillis: 180000, // ✅ 3 minutos (era muy corto)
  idleTimeoutMillis: 300000,
  evictionRunIntervalMillis: 60000,
  softIdleTimeoutMillis: 180000,
  testOnBorrow: false,
  testOnReturn: false,
  fifo: true,
};

// ✅ NUEVA CONFIGURACIÓN TEDIOUS OPTIMIZADA
const TEDIOUS_CONFIG_OPTIMIZED = {
  connectTimeout: 180000, // 3 minutos para conexión inicial
  requestTimeout: 300000, // 5 minutos para consultas
  cancelTimeout: 30000,
  connectionRetryInterval: 5000,
  maxRetriesOnConnectionError: 3,
  packetSize: 4096,
  enableArithAbort: true,
  useUTC: false,
  rowCollectionOnRequestCompletion: true,
  useColumnNames: true,
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

    // ✅ NUEVOS CONTADORES para evitar reinicializaciones excesivas
    this._consecutiveInvalidConnections = {};
    this._timeoutCounts = {};

    // ✅ ELIMINAR: _closingPools que causaba problemas
    // this._closingPools = new Set(); // ELIMINADO

    this.healthCheckInterval = null;
    this.telemetryInterval = null;
  }

  initialize() {
    if (this.healthCheckInterval) return;

    logger.info("🚀 Inicializando ConnectionCentralService...");

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error("Error en health check:", error);
      }
    }, POOL_HEALTH.checkInterval);

    this.telemetryInterval = setInterval(() => {
      try {
        this.logTelemetry();
      } catch (error) {
        logger.debug("Error en telemetría:", error);
      }
    }, 60000);

    logger.info("✅ ConnectionCentralService inicializado");
  }

  async initPool(serverKey) {
    try {
      logger.info(`Inicializando pool para ${serverKey}...`);

      if (this.pools[serverKey]) {
        logger.info(`Pool ya existe para ${serverKey}, cerrando primero...`);
        await this.closePool(serverKey);
      }

      const dbConfig = await this._loadConfig(serverKey);
      if (!dbConfig) {
        logger.error(`No se encontró configuración para ${serverKey}`);
        return false;
      }

      logger.debug(`Configuración cargada desde MongoDB para ${serverKey}:`, {
        serverName: dbConfig.serverName,
        host: dbConfig.host,
        instance: dbConfig.instance,
        port: dbConfig.port,
        database: dbConfig.database,
      });

      const factory = this._createConnectionFactory(dbConfig, serverKey);
      const pool = createPool(factory, DEFAULT_POOL_CONFIG);

      pool.on("factoryCreateError", (err) => {
        logger.error(`Error en factory para ${serverKey}:`, err);
        this._registerConnectionError(serverKey, err);
      });

      pool.on("factoryDestroyError", (err) => {
        logger.warn(`Error destruyendo conexión en ${serverKey}:`, err);
      });

      this.pools[serverKey] = pool;

      this._schedulePoolRenewal(serverKey);

      logger.info(`Pool de conexiones inicializado para ${serverKey}`);
      return true;
    } catch (error) {
      logger.error(`Error inicializando pool para ${serverKey}:`, error);
      return false;
    }
  }

  async _loadConfig(serverKey) {
    try {
      if (MongoDbService.isConnected()) {
        const config = await DBConfig.findOne({ serverName: serverKey });
        return config;
      } else {
        logger.warn("MongoDB no conectado, usando configuración por defecto");
        return null;
      }
    } catch (error) {
      logger.error(`Error cargando configuración para ${serverKey}:`, error);
      return null;
    }
  }

  _createConnectionFactory(dbConfig, serverKey) {
    return {
      create: async () => {
        return new Promise((resolve, reject) => {
          if (!dbConfig || !dbConfig.host) {
            logger.error(`Configuración inválida para ${serverKey}:`, {
              hasHost: !!dbConfig?.host,
              hasUser: !!dbConfig?.user,
              hasPassword: !!dbConfig?.password,
              hasDatabase: !!dbConfig?.database,
            });
            return reject(
              new Error(
                `Configuración de base de datos incompleta para ${serverKey}`
              )
            );
          }

          let cleanPassword = dbConfig.password;

          logger.debug(
            `Password length: ${
              cleanPassword.length
            }, starts with: ${cleanPassword.substring(0, 2)}...`
          );

          // ✅ CONFIGURACIÓN OPTIMIZADA
          const config = {
            server: dbConfig.host.trim(),
            authentication: {
              type: "default",
              options: {
                userName: dbConfig.user.trim(),
                password: cleanPassword,
              },
            },
            options: {
              database: dbConfig.database.trim(),
              encrypt: false, // Para redes internas
              trustServerCertificate: true,

              // ✅ USAR CONFIGURACIÓN OPTIMIZADA
              ...TEDIOUS_CONFIG_OPTIMIZED,

              appName: `NodeApp_${Date.now()}`,
              readOnlyIntent: false,
              multiSubnetFailover: false,
            },
          };

          if (dbConfig.instance && dbConfig.instance.trim() !== "") {
            config.options.instanceName = dbConfig.instance.trim();
            logger.info(
              `🏷️ Configurando instancia nombrada: ${config.options.instanceName}`
            );
          } else if (dbConfig.port) {
            config.options.port = parseInt(dbConfig.port);
            logger.info(
              `✅ Configurando puerto específico: ${config.options.port}`
            );
          } else {
            config.options.port = 1433;
          }

          logger.info("🔧 Configuración Tedious final:");
          logger.info(`🏭 Creando factory de conexión para ${serverKey}:`);

          const connection = new Connection(config);
          let isResolved = false;

          // ✅ TIMEOUT MÁS LARGO
          const timeout = setTimeout(() => {
            if (!isResolved) {
              isResolved = true;
              connection.removeAllListeners();
              try {
                connection.close();
              } catch (e) {}
              reject(
                new Error(
                  `Timeout de conexión después de ${config.options.connectTimeout}ms`
                )
              );
            }
          }, config.options.connectTimeout);

          connection.on("connect", (err) => {
            if (isResolved) return;
            clearTimeout(timeout);
            isResolved = true;

            if (err) {
              logger.error(`❌ Error de conexión para ${serverKey}:`, {
                message: err.message,
                code: err.code,
                state: err.state,
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
                  ? `\\${config.options.instanceName}`
                  : `:${config.options.port}`
              }`
            );
            connection.connect();
          } catch (error) {
            clearTimeout(timeout);
            if (!isResolved) {
              isResolved = true;
              reject(error);
            }
          }
        });
      },

      destroy: async (connection) => {
        return new Promise((resolve) => {
          try {
            if (connection && connection.connected) {
              connection.on("end", () => resolve());
              connection.close();
            } else {
              resolve();
            }
          } catch (error) {
            logger.debug(`Error cerrando conexión: ${error.message}`);
            resolve();
          }
        });
      },

      validate: async (connection) => {
        return new Promise((resolve) => {
          try {
            if (!connection || !connection.connected || !connection.loggedIn) {
              resolve(false);
              return;
            }

            if (typeof connection.execSql !== "function") {
              resolve(false);
              return;
            }

            const now = Date.now();
            if (
              connection._createdAt &&
              now - connection._createdAt > CONNECTION_LIMITS.maxAge
            ) {
              resolve(false);
              return;
            }

            const operationCount =
              CONNECTION_LIMITS.operationCounter.get(connection) || 0;
            if (operationCount > CONNECTION_LIMITS.maxOperations) {
              resolve(false);
              return;
            }

            resolve(true);
          } catch (error) {
            resolve(false);
          }
        });
      },
    };
  }

  // ✅ MÉTODO getConnection CORREGIDO
  async getConnection(serverKey, options = {}) {
    const startTime = Date.now();
    Telemetry.startTimer(`connection_acquire_${Date.now()}`);

    try {
      if (!this.healthCheckInterval) {
        this.initialize();
      }

      // ✅ ELIMINAR: Verificación problemática de _closingPools
      // if (this._closingPools && this._closingPools.has(serverKey)) {
      //   throw new Error(`El pool para ${serverKey} está en proceso de cierre...`);
      // }

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

      // ✅ TIMEOUT AUMENTADO
      const timeout = options.timeout || 60000; // 60 segundos (era 30)

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

      // ✅ VALIDACIÓN MEJORADA
      if (typeof connection.execSql !== "function") {
        logger.error(
          `Se obtuvo una conexión sin método execSql para ${serverKey}`
        );

        try {
          await this.pools[serverKey].destroy(connection);
        } catch (e) {
          logger.warn(`Error destruyendo conexión inválida: ${e.message}`);
        }

        // ✅ CONTADOR PARA EVITAR REINICIALIZACIONES EXCESIVAS
        this._consecutiveInvalidConnections[serverKey] =
          (this._consecutiveInvalidConnections[serverKey] || 0) + 1;

        if (this._consecutiveInvalidConnections[serverKey] >= 3) {
          logger.warn(
            `Múltiples conexiones inválidas para ${serverKey}, reinicializando pool...`
          );
          await this.closePool(serverKey);
          await this.initPool(serverKey);
          this._consecutiveInvalidConnections[serverKey] = 0;
        }

        return this.getConnection(serverKey, options);
      }

      // ✅ RESETEAR contador en éxito
      if (this._consecutiveInvalidConnections[serverKey]) {
        this._consecutiveInvalidConnections[serverKey] = 0;
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
        "connection limit exceeded",
        "econnreset",
        "etimedout",
      ];

      const isCriticalError = criticalErrors.some((term) =>
        error.message.toLowerCase().includes(term)
      );

      // ✅ REINICIALIZACIÓN INTELIGENTE para timeouts
      if (
        error.message.includes("Timeout al obtener conexión") &&
        this._shouldReinitializePool(serverKey)
      ) {
        logger.warn(
          `Múltiples timeouts para ${serverKey}, reinicializando pool...`
        );

        try {
          await this.closePool(serverKey);
          await this.initPool(serverKey);
          logger.info(`Pool reinicializado para ${serverKey}`);
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

  // ✅ NUEVO: Método para determinar reinicialización inteligente
  _shouldReinitializePool(serverKey) {
    this._timeoutCounts[serverKey] = (this._timeoutCounts[serverKey] || 0) + 1;

    // Solo reinicializar después de 3 timeouts consecutivos
    if (this._timeoutCounts[serverKey] >= 3) {
      this._timeoutCounts[serverKey] = 0;
      return true;
    }

    return false;
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
      MemoryManager.checkMemory(
        `Conexión ${connection._serverKey} - ${count} operaciones`
      );
    }

    return count;
  }

  // ✅ MÉTODO closePool SIMPLIFICADO
  async closePool(serverKey) {
    try {
      logger.info(`Cerrando pool para ${serverKey}...`);

      // ✅ ELIMINAR lógica problemática de _closingPools
      const pool = this.pools[serverKey];
      if (!pool) {
        logger.warn(`No existe un pool para ${serverKey} que cerrar`);
        return true;
      }

      if (this.renewalTimers && this.renewalTimers[serverKey]) {
        clearTimeout(this.renewalTimers[serverKey]);
        this.renewalTimers[serverKey] = null;
      }

      try {
        // ✅ CIERRE SIMPLIFICADO con timeout
        await Promise.race([
          pool.drain(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Drain timeout")), 30000)
          ),
        ]);

        await pool.clear();
        logger.info(`✅ Pool drenado y limpiado para ${serverKey}`);
      } catch (timeoutError) {
        logger.warn(
          `⚠️ Timeout durante cierre de ${serverKey}, forzando limpieza`
        );
      }

      delete this.pools[serverKey];
      logger.info(`Pool para ${serverKey} cerrado correctamente`);
      return true;
    } catch (error) {
      logger.error(`Error cerrando pool para ${serverKey}: ${error.message}`);
      return false;
    }
  }

  async closePools() {
    const results = {};
    const serverKeys = Object.keys(this.pools);

    logger.info(`Cerrando ${serverKeys.length} pools...`);

    for (const serverKey of serverKeys) {
      try {
        results[serverKey] = await this.closePool(serverKey);
      } catch (error) {
        results[serverKey] = false;
        logger.error(`Error cerrando pool ${serverKey}: ${error.message}`);
      }
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }

    logger.info(`Pools cerrados. Resultados:`, results);
    return results;
  }

  async beginTransaction(connection, options = {}) {
    return new Promise((resolve, reject) => {
      const transaction = connection.beginTransaction((err) => {
        if (err) {
          reject(err);
        } else {
          this.activeTransactions.set(connection, transaction);
          transaction._connection = connection;
          resolve(transaction);
        }
      });
    });
  }

  async commitTransaction(transaction) {
    return new Promise((resolve, reject) => {
      transaction.commitTransaction((err) => {
        if (err) {
          reject(err);
        } else {
          this.activeTransactions.delete(transaction._connection);
          resolve();
        }
      });
    });
  }

  async rollbackTransaction(transaction) {
    return new Promise((resolve, reject) => {
      transaction.rollbackTransaction((err) => {
        if (err) {
          reject(err);
        } else {
          this.activeTransactions.delete(transaction._connection);
          resolve();
        }
      });
    });
  }

  async diagnoseConnection(serverKey) {
    try {
      logger.info(`🔍 Diagnosticando ${serverKey}...`);

      const connection = await this.getConnection(serverKey, {
        timeout: 15000,
      });

      const testQuery = "SELECT 1 as test_value, GETDATE() as server_time";
      const testResult = await this.executeTestQuery(connection, testQuery);

      await this.releaseConnection(connection);

      return {
        success: true,
        serverKey,
        message: "Conexión exitosa",
        testResult,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        serverKey,
        error: error.message,
        phase: "connection_test",
        timestamp: new Date().toISOString(),
      };
    }
  }

  executeTestQuery(connection, sql) {
    return new Promise((resolve, reject) => {
      const rows = [];

      const request = new Request(sql, (err, rowCount) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            rows,
            rowCount,
            success: true,
          });
        }
      });

      // ✅ CORREGIDO: Manejo robusto del evento "row"
      request.on("row", (columns) => {
        const row = {};

        try {
          // Verificar si columns es un array (versiones anteriores de Tedious)
          if (Array.isArray(columns)) {
            columns.forEach((column) => {
              if (column && column.metadata && column.metadata.colName) {
                row[column.metadata.colName] = column.value;
              }
            });
          }
          // Verificar si columns es un objeto (versiones más recientes)
          else if (columns && typeof columns === "object") {
            // Si tiene propiedades que parecen columnas
            for (const [key, value] of Object.entries(columns)) {
              if (
                value &&
                typeof value === "object" &&
                value.metadata &&
                value.metadata.colName
              ) {
                row[value.metadata.colName] = value.value;
              } else if (key !== "meta" && value !== undefined) {
                row[key] = value;
              }
            }
          }
          // Fallback para casos no esperados
          else {
            logger.warn(
              "Formato de columnas no reconocido en executeTestQuery"
            );
            row["unknown_result"] = String(columns);
          }

          // Solo agregar si la fila tiene datos
          if (Object.keys(row).length > 0) {
            rows.push(row);
          }
        } catch (parseError) {
          logger.warn(
            `Error parseando fila en executeTestQuery: ${parseError.message}`
          );
          // En caso de error, agregar información básica
          rows.push({
            error: "Error parseando fila",
            raw_data: String(columns),
          });
        }
      });

      // Manejar errores en la request
      request.on("error", (err) => {
        reject(err);
      });

      // Ejecutar la consulta
      try {
        connection.execSql(request);
      } catch (execError) {
        reject(
          new Error(`Error ejecutando consulta de prueba: ${execError.message}`)
        );
      }
    });
  }

  async performHealthCheck() {
    try {
      logger.debug("Realizando health check...");

      const poolKeys = Object.keys(this.pools);
      const results = {};

      for (const poolKey of poolKeys) {
        try {
          const pool = this.pools[poolKey];
          if (pool) {
            results[poolKey] = {
              size: pool.size,
              available: pool.available,
              borrowed: pool.borrowed,
              pending: pool.pending,
              status: pool._draining ? "draining" : "active",
            };
          }
        } catch (error) {
          results[poolKey] = {
            status: "error",
            error: error.message,
          };
        }
      }

      POOL_HEALTH.lastCheck[Date.now()] = results;

      if (Object.keys(POOL_HEALTH.lastCheck).length > 10) {
        const oldestKey = Math.min(...Object.keys(POOL_HEALTH.lastCheck));
        delete POOL_HEALTH.lastCheck[oldestKey];
      }

      logger.debug("Health check completado:", results);
    } catch (error) {
      logger.error("Error en health check:", error);
    }
  }

  _schedulePoolRenewal(serverKey) {
    if (this.renewalTimers[serverKey]) {
      clearTimeout(this.renewalTimers[serverKey]);
    }

    this.renewalTimers[serverKey] = setTimeout(async () => {
      try {
        logger.info(`Renovando pool automáticamente para ${serverKey}...`);
        await this._renewPool(serverKey);
      } catch (error) {
        logger.error(
          `Error en renovación automática para ${serverKey}:`,
          error
        );
      }
    }, POOL_HEALTH.renewalTimeout);
  }

  async _renewPool(serverKey) {
    try {
      const currentPool = this.pools[serverKey];

      if (currentPool && !currentPool._draining) {
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

  getConnectionStats() {
    const poolStats = {};

    for (const [key, pool] of Object.entries(this.pools)) {
      poolStats[key] = {
        size: pool.size,
        available: pool.available,
        borrowed: pool.borrowed,
        pending: pool.pending,
        status: pool._draining ? "draining" : "active",
      };
    }

    return {
      pools: poolStats,
      stats: this.stats,
      activeTransactions: this.activeTransactions.size,
      healthChecks: Object.keys(POOL_HEALTH.lastCheck).length,
      errorCounts: POOL_HEALTH.errorCount,
    };
  }

  logTelemetry() {
    try {
      const stats = this.getConnectionStats();
      const memInfo = MemoryManager.getMemoryInfo();

      logger.debug("📊 Telemetría de conexiones:", {
        pools: Object.keys(stats.pools).length,
        totalAcquired: stats.stats.acquired,
        totalReleased: stats.stats.released,
        totalErrors: stats.stats.errors,
        activeConnections: stats.stats.activeConnections.size,
        activeTransactions: stats.activeTransactions,
        memory: {
          used: `${Math.round(memInfo.used / 1024 / 1024)}MB`,
          total: `${Math.round(memInfo.total / 1024 / 1024)}MB`,
        },
      });

      Telemetry.updateGauge(
        "activeConnections",
        stats.stats.activeConnections.size
      );
      Telemetry.updateGauge("activePools", Object.keys(stats.pools).length);
      Telemetry.updateGauge("activeTransactions", stats.activeTransactions);
    } catch (error) {
      logger.debug("Error en telemetría:", error);
    }
  }

  /**
   * 🔗 Método de conexión robusta mejorada (compatibilidad con código existente)
   * @param {string} serverKey - Clave del servidor
   * @param {Object} options - Opciones de conexión
   * @returns {Promise<Object>} - Resultado con conexión
   */
  async enhancedRobustConnect(serverKey, options = {}) {
    try {
      logger.info(`🔗 Iniciando conexión robusta para ${serverKey}...`);

      const startTime = Date.now();
      const connection = await this.getConnection(serverKey, {
        ...options,
        timeout: options.timeout || 90000,
      });

      const connectionTime = Date.now() - startTime;

      // ✅ QUITAR validación adicional - getConnection ya valida
      // Si getConnection devuelve una conexión, asumimos que es válida

      logger.info(
        `✅ Conexión robusta establecida para ${serverKey} en ${connectionTime}ms`
      );

      return {
        success: true,
        connection: connection,
        connectionTime: `${connectionTime}ms`,
        serverKey: serverKey,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(
        `❌ Error en conexión robusta para ${serverKey}: ${error.message}`
      );

      return {
        success: false,
        connection: null,
        error: {
          message: error.message,
          code: error.code || "CONNECTION_ERROR",
          serverKey: serverKey,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 🔍 Validar que una conexión esté en buen estado (versión simplificada)
   * @param {Object} connection - Conexión a validar
   * @returns {boolean} - true si la conexión es válida
   */
  validateConnection(connection) {
    try {
      // Verificaciones básicas y esenciales únicamente
      if (!connection) {
        logger.debug("Validación falló: conexión es null/undefined");
        return false;
      }

      // Lo más importante: que tenga el método execSql
      if (typeof connection.execSql !== "function") {
        logger.debug("Validación falló: no tiene método execSql");
        return false;
      }

      // Verificar que esté conectada (propiedad básica de Tedious)
      if (!connection.connected) {
        logger.debug("Validación falló: not connected");
        return false;
      }

      // ✅ RELAJAR: No verificar loggedIn ya que puede variar según el estado
      // Solo verificar si existe la propiedad y es true, pero no fallar si no existe
      if (connection.hasOwnProperty("loggedIn") && !connection.loggedIn) {
        logger.debug("Validación falló: not logged in");
        return false;
      }

      // Todo bien - conexión válida
      logger.debug(
        `Validación exitosa para conexión ${connection._serverKey || "unknown"}`
      );
      return true;
    } catch (error) {
      logger.warn(`Error validando conexión: ${error.message}`);
      return false;
    }
  }

  /**
   * 🔍 Validar conexión de forma asíncrona (más completa)
   * @param {Object} connection - Conexión a validar
   * @returns {Promise<boolean>} - true si la conexión es válida
   */
  async validateConnectionAsync(connection) {
    try {
      // Primero hacer validación básica
      if (!this.validateConnection(connection)) {
        return false;
      }

      // Test opcional con consulta simple (solo si es necesario)
      if (connection._needsValidation) {
        try {
          const testResult = await this.executeTestQuery(
            connection,
            "SELECT 1"
          );
          return testResult.success && testResult.rows.length > 0;
        } catch (testError) {
          logger.warn(`Test de validación falló: ${testError.message}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.warn(`Error en validación asíncrona: ${error.message}`);
      return false;
    }
  }

  /**
   * 🔗 Método alternativo para obtener conexión con diagnóstico
   * @param {string} serverKey - Clave del servidor
   * @returns {Promise<Object>} - Resultado con conexión y diagnóstico
   */
  async getConnectionWithDiagnostic(serverKey) {
    try {
      // Primero realizar diagnóstico
      const diagnostic = await this.diagnoseConnection(serverKey);

      if (!diagnostic.success) {
        return {
          success: false,
          connection: null,
          error: diagnostic.error,
          diagnostic: diagnostic,
        };
      }

      // Si el diagnóstico es exitoso, obtener conexión
      const connection = await this.getConnection(serverKey);

      return {
        success: true,
        connection: connection,
        diagnostic: diagnostic,
        serverKey: serverKey,
      };
    } catch (error) {
      return {
        success: false,
        connection: null,
        error: error.message,
        serverKey: serverKey,
      };
    }
  }
}

module.exports = new ConnectionCentralService();
