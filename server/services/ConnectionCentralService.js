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
  min: 1,
  max: 10,
  acquireTimeoutMillis: 60000, // 60 segundos para adquisición
  idleTimeoutMillis: 300000, // 5 minutos para conexiones inactivas
  evictionRunIntervalMillis: 60000, // Verificar conexiones cada 1 minuto
  softIdleTimeoutMillis: 180000, // 3 minutos de soft timeout
  testOnBorrow: false, // No hacer test en cada adquisición para mejor rendimiento
  testOnReturn: false,
  fifo: false, // LIFO para mejores "cache hits"
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
   * @param {string} serverKey - Clave del servidor (server1, server2, etc.)
   * @param {Object} customConfig - Configuración personalizada opcional
   * @returns {Promise<boolean>} - true si el pool se inicializó correctamente
   */
  async initPool(serverKey, customConfig = {}) {
    // Protect against simultaneous initializations
    if (!this._initializingPools) this._initializingPools = new Map();

    // If there's already an initialization in progress, wait for it to finish
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

    // Create promise for this initialization
    const initPromise = new Promise(async (resolve, reject) => {
      try {
        logger.info(`Inicializando pool para ${serverKey}...`);

        // Check if we need to close an existing pool
        if (this.pools[serverKey]) {
          // If there's an existing pool, close it only if not already in process
          if (!this._closingPools || !this._closingPools.has(serverKey)) {
            await this.closePool(serverKey);
          } else {
            // Wait for closing to finish
            logger.info(
              `Esperando a que termine el cierre del pool para ${serverKey}...`
            );
            while (this._closingPools && this._closingPools.has(serverKey)) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }

        // Initialize pool state for this server
        POOL_HEALTH.lastCheck[serverKey] = Date.now();
        POOL_HEALTH.errorCount[serverKey] = 0;

        // Load configuration from MongoDB
        const dbConfig = await this._loadConfig(serverKey);
        if (!dbConfig) {
          reject(
            new Error(
              `No se encontró configuración para ${serverKey} en MongoDB`
            )
          );
          return;
        }

        // Create factory and pool with improved configuration
        const factory = this._createConnectionFactory(dbConfig, serverKey);

        // Configure longer timeout for initial connections
        const poolConfig = {
          ...DEFAULT_POOL_CONFIG,
          ...customConfig,
          acquireTimeoutMillis: 120000, // 2 minutes for initial acquisition
        };

        this.pools[serverKey] = createPool(factory, poolConfig);

        logger.info(`Pool de conexiones inicializado para ${serverKey}`);

        // Setup automatic renewal
        this._setupAutoRenewal(serverKey);

        resolve(true);
      } catch (error) {
        logger.error(`Error al inicializar pool para ${serverKey}:`, error);
        reject(error);
      }
    });

    // Register the promise
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
   * Implementación real de inicialización de pool
   * @private
   */
  async _doInitPool(serverKey, customConfig = {}) {
    try {
      logger.info(`Inicializando pool para ${serverKey}...`);

      // Verificar si hay que cerrar un pool existente
      if (this.pools[serverKey]) {
        // Si hay un pool existente, cerrarlo solo si no está en proceso ya
        if (!this._closingPools || !this._closingPools.has(serverKey)) {
          await this.closePool(serverKey);
        } else {
          // Esperar a que termine el cierre en curso
          logger.info(
            `Esperando a que termine el cierre del pool para ${serverKey}...`
          );
          while (this._closingPools && this._closingPools.has(serverKey)) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      // Inicializar estado del pool para este servidor
      POOL_HEALTH.lastCheck[serverKey] = Date.now();
      POOL_HEALTH.errorCount[serverKey] = 0;

      // Cargar configuración desde MongoDB
      const dbConfig = await this._loadConfig(serverKey);
      if (!dbConfig) {
        logger.error(`No se encontró configuración para ${serverKey}`);
        return false;
      }

      // Crear factory y pool con configuración mejorada
      const factory = this._createConnectionFactory(dbConfig, serverKey);

      // Configurar timeout más largo para conexiones iniciales
      const poolConfig = {
        ...DEFAULT_POOL_CONFIG,
        ...customConfig,
        acquireTimeoutMillis: 120000, // 2 minutos para adquisición inicial
      };

      this.pools[serverKey] = createPool(factory, poolConfig);

      logger.info(`Pool de conexiones inicializado para ${serverKey}`);

      // Configurar renovación automática
      this._setupAutoRenewal(serverKey);

      return true;
    } catch (error) {
      logger.error(`Error al inicializar pool para ${serverKey}:`, error);
      return false;
    }
  }

  /**
   * Carga la configuración de un servidor desde MongoDB
   * @private
   * @param {string} serverKey - Clave del servidor
   * @returns {Promise<Object>} - Configuración del servidor
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
      if (!dbConfig) return null;

      return this._convertToTediousConfig(dbConfig);
    } catch (error) {
      logger.error(`Error al cargar configuración para ${serverKey}:`, error);
      return null;
    }
  }

  /**
   * Convierte la configuración de MongoDB al formato requerido por Tedious
   * @private
   * @param {Object} dbConfig - Configuración de MongoDB
   * @returns {Object} - Configuración en formato Tedious
   */
  _convertToTediousConfig(dbConfig) {
    // Verificar si es una dirección IP
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(dbConfig.host);

    const config = {
      server: dbConfig.host,
      authentication: {
        type: "default",
        options: {
          userName: dbConfig.user,
          password: dbConfig.password,
        },
      },
      options: {
        encrypt: isIpAddress ? false : dbConfig.options?.encrypt || false,
        trustServerCertificate: true,
        enableArithAbort: true,
        database: dbConfig.database,
        connectTimeout: 30000,
        requestTimeout: 60000,
        rowCollectionOnRequestCompletion: true,
        useColumnNames: true,
      },
    };

    if (dbConfig.instance) {
      config.options.instanceName = dbConfig.instance;
    }

    if (dbConfig.port) {
      config.options.port = dbConfig.port;
    }

    return config;
  }

  /**
   * Crea un factory de conexiones para el pool
   * @private
   * @param {Object} config - Configuración Tedious
   * @param {string} serverKey - Clave del servidor
   * @returns {Object} - Factory para el pool
   */
  _createConnectionFactory(config, serverKey) {
    const configInfo = {
      server: config.server,
      database: config.options.database,
      user: config.authentication.options.userName,
    };

    logger.info(
      `Creando factory de conexión para ${serverKey}: ${JSON.stringify(
        configInfo
      )}`
    );

    return {
      create: () => {
        return new Promise((resolve, reject) => {
          logger.debug(`Intentando crear nueva conexión a ${config.server}...`);

          const connection = new Connection(config);

          // Comprobar que la conexión tiene el método execSql
          if (typeof connection.execSql !== "function") {
            logger.error(`La conexión creada no tiene el método execSql`);
            reject(new Error(`Conexión inválida: no tiene el método execSql`));
            return;
          }

          // Timeout para la creación de conexión
          const timeout = setTimeout(() => {
            connection.removeAllListeners();
            try {
              connection.close();
            } catch (e) {}
            reject(new Error(`Timeout al crear conexión a ${config.server}`));
          }, config.options.connectTimeout || 30000);

          connection.on("connect", (err) => {
            clearTimeout(timeout);

            if (err) {
              logger.error(`Error conectando a ${config.server}:`, err);
              reject(err);
              return;
            }

            // Verificar de nuevo que la conexión es válida después del evento connect
            if (typeof connection.execSql !== "function") {
              logger.error(
                `La conexión después de connect no tiene el método execSql`
              );
              reject(new Error(`Conexión inválida después de connect`));
              return;
            }

            // Añadir metadatos para seguimiento
            connection._createdAt = Date.now();
            connection._operationCount = 0;
            connection._serverKey = serverKey;

            logger.debug(
              `Conexión establecida correctamente a ${config.server}`
            );
            resolve(connection);
          });

          connection.on("error", (err) => {
            clearTimeout(timeout);
            logger.error(`Error en la conexión a ${config.server}:`, err);
            reject(err);
          });

          // Iniciar conexión
          try {
            connection.connect();
          } catch (error) {
            clearTimeout(timeout);
            logger.error(
              `Excepción al intentar conectar a ${config.server}:`,
              error
            );
            reject(error);
          }
        });
      },

      destroy: (connection) => {
        return new Promise((resolve) => {
          if (!connection) {
            resolve();
            return;
          }

          // Limpiar listeners de errores para evitar memory leaks
          connection.removeAllListeners("error");

          // Eliminar de mapas de seguimiento
          if (this.stats.activeConnections.has(connection)) {
            this.stats.activeConnections.delete(connection);
          }

          if (connectionPoolMap.has(connection)) {
            connectionPoolMap.delete(connection);
          }

          if (CONNECTION_LIMITS.operationCounter.has(connection)) {
            CONNECTION_LIMITS.operationCounter.delete(connection);
          }

          // Timeout para cierre
          const timeout = setTimeout(() => {
            logger.warn(`Timeout al cerrar conexión después de 5 segundos`);
            resolve();
          }, 5000);

          try {
            connection.on("end", () => {
              clearTimeout(timeout);
              resolve();
            });

            connection.close();
          } catch (error) {
            clearTimeout(timeout);
            logger.warn(`Error al cerrar conexión (ignorando):`, error);
            resolve();
          }
        });
      },

      validate: (connection) => {
        return new Promise((resolve) => {
          if (!connection || !connection.connected) {
            logger.debug(`Conexión inválida (no conectada), desechando`);
            resolve(false);
            return;
          }

          try {
            // Verificar edad de la conexión
            const connectionAge = Date.now() - (connection._createdAt || 0);

            if (connectionAge > CONNECTION_LIMITS.maxAge) {
              logger.debug(
                `Descartando conexión que lleva ${connectionAge}ms abierta`
              );
              resolve(false);
              return;
            }

            // Verificar número de operaciones
            if (connection._operationCount > CONNECTION_LIMITS.maxOperations) {
              logger.debug(
                `Descartando conexión que ha realizado ${connection._operationCount} operaciones`
              );
              resolve(false);
              return;
            }

            resolve(true);
          } catch (error) {
            logger.error(`Error al validar conexión:`, error);
            resolve(false);
          }
        });
      },
    };
  }

  /**
   * Obtener una conexión del pool con verificación de estado
   * @param {string} serverKey - Clave del servidor
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Connection>} - Conexión a la base de datos
   */
  async getConnection(serverKey, options = {}) {
    const startTime = Date.now();
    Telemetry.startTimer(`connection_acquire_${Date.now()}`);

    try {
      // Check if service is initialized
      if (!this.healthCheckInterval) {
        this.initialize();
      }

      // Check if pool is in closing process
      if (this._closingPools && this._closingPools.has(serverKey)) {
        throw new Error(
          `El pool para ${serverKey} está en proceso de cierre y no puede aceptar trabajo`
        );
      }

      // Initialize pool if it doesn't exist
      if (!this.pools[serverKey]) {
        const initialized = await this.initPool(serverKey);
        if (!initialized) {
          throw new Error(`No se pudo inicializar el pool para ${serverKey}`);
        }
      }

      // Check pool state before acquiring
      if (!this.pools[serverKey]) {
        throw new Error(`No se encontró pool para ${serverKey}`);
      }

      if (this.pools[serverKey]._draining) {
        throw new Error(
          `El pool para ${serverKey} está drenando y no puede aceptar trabajo`
        );
      }

      // Implement timeout for acquire
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

      // Try to acquire connection
      const acquirePromise = this.pools[serverKey].acquire();
      const connection = await Promise.race([acquirePromise, timeoutPromise]);

      if (!connection) {
        throw new Error(`Se obtuvo una conexión nula para ${serverKey}`);
      }

      // Verify connection has required methods
      if (typeof connection.execSql !== "function") {
        logger.error(
          `Se obtuvo una conexión sin método execSql para ${serverKey}`
        );

        try {
          // Try to destroy this invalid connection
          await this.pools[serverKey].destroy(connection);
        } catch (e) {}

        // Reinitialize the pool and try again
        await this.closePool(serverKey);
        await this.initPool(serverKey);

        // Recurse to the method again
        return this.getConnection(serverKey, options);
      }

      // Attach tracking metadata
      connection._poolOrigin = serverKey;
      connection._acquiredAt = Date.now();
      connection._operationCount = connection._operationCount || 0;
      connection._serverKey = serverKey; // Important for identification

      // Update tracking maps
      connectionPoolMap.set(connection, serverKey);
      this.stats.activeConnections.add(connection);

      // Update statistics
      this.stats.acquired++;

      // Register acquisition time
      const acquireTime = Date.now() - startTime;
      Telemetry.endTimer(`connection_acquire_${Date.now()}`);
      Telemetry.updateAverage("avgConnectionAcquireTime", acquireTime);

      logger.debug(`Conexión obtenida para ${serverKey} en ${acquireTime}ms`);

      // If connection needs to be in a transaction
      if (options.useTransaction) {
        return await this.beginTransaction(connection, options);
      }

      return connection;
    } catch (error) {
      this.stats.errors++;
      const acquireTime = Date.now() - startTime;
      Telemetry.endTimer(`connection_acquire_${Date.now()}`);

      // Register error for potential pool renewal
      this._registerConnectionError(serverKey, error);

      // Handle specific errors that require pool reinitialization
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

          // Try again after reinitialization
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

  /**
   * Obtiene una conexión con reintentos automáticos, optimizada para robustez
   * @param {string} serverKey - Clave del servidor
   * @param {number} maxAttempts - Número máximo de intentos
   * @param {number} baseDelay - Retraso base entre intentos (ms)
   * @returns {Promise<Object>} - Resultado con conexión o error
   */
  async enhancedRobustConnect(serverKey, maxAttempts = 5, baseDelay = 3000) {
    let attempt = 0;
    let delay = baseDelay;
    let existingPool = false;

    // Verificar si el servicio está inicializado
    if (!this.healthCheckInterval) {
      this.initialize();
    }

    // Verificar si ya existe un pool y está funcionando
    try {
      if (this.pools && this.pools[serverKey]) {
        // Intentar verificar el pool existente
        try {
          // INSTEAD OF directly passing the query string to SqlService
          const testConnection = await this.getConnection(serverKey);
          if (testConnection) {
            // Create a proper Request object for verification
            const testRequest = new Request(
              "SELECT 1 AS test",
              (err, rowCount, rows) => {
                if (err) throw err;
              }
            );

            // Use a promise to properly handle the test
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

              // Execute the request
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

    // Solo cerrar el pool si existe y está teniendo problemas
    if (existingPool) {
      try {
        logger.info(
          `Cerrando pool con problemas para ${serverKey} antes de reconectar`
        );
        await this.closePool(serverKey);
      } catch (closeError) {
        logger.warn(`Error al cerrar pool existente: ${closeError.message}`);
        // Continuar de todos modos
      }
    }

    while (attempt < maxAttempts) {
      attempt++;

      try {
        logger.info(
          `Intento ${attempt}/${maxAttempts} para conectar a ${serverKey}...`
        );

        // Inicializar el pool desde cero solo si no existe o se cerró
        const initialized = await this.initPool(serverKey);
        if (!initialized) {
          throw new Error(`No se pudo inicializar el pool para ${serverKey}`);
        }

        // Obtener una conexión del pool
        const connection = await this.getConnection(serverKey);
        if (!connection) {
          throw new Error(`No se pudo obtener una conexión a ${serverKey}`);
        }

        // IMPORTANT CHANGE: Test the connection using tedious directly
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

          // Add a timeout
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout al verificar conexión a ${serverKey}`));
          }, 10000);

          // Handle request events
          testRequest.on("done", () => {
            clearTimeout(timeout);
            resolve();
          });

          testRequest.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });

          // Execute the request
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

        // Si es el último intento, fallar
        if (attempt >= maxAttempts) {
          return {
            success: false,
            error: new Error(
              `No se pudo establecer conexión a ${serverKey} después de ${attempt} intentos: ${error.message}`
            ),
          };
        }

        // Liberar recursos antes de reintentar
        try {
          // Cerrar pool solo si hay un error grave
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

        // Esperar antes del siguiente intento con backoff exponencial
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 30000); // Máximo 30 segundos
      }
    }

    // No debería llegar aquí debido al retorno en la última iteración
    return {
      success: false,
      error: new Error(
        `No se pudo establecer conexión a ${serverKey} después de ${maxAttempts} intentos`
      ),
    };
  }

  /**
   * Liberar una conexión de forma segura
   * @param {Connection} connection - Conexión a liberar
   * @returns {Promise<void>}
   */
  async releaseConnection(connection) {
    if (!connection) {
      logger.debug(`Intento de liberar una conexión nula, ignorando`);
      return;
    }

    // MEJORA: Verificar estado de la conexión antes de liberar
    try {
      // Verificar si la conexión ya está cerrada
      if (!connection.connected && !connection.loggedIn) {
        logger.debug(`Conexión ya cerrada, solo limpiando referencias`);

        // Solo limpiar referencias sin intentar liberar
        this.stats.activeConnections.delete(connection);
        connectionPoolMap.delete(connection);
        CONNECTION_LIMITS.operationCounter.delete(connection);
        return;
      }

      // Verificar transacciones activas
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

      // Determinar pool de origen
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

          // Limpiar referencias
          this._cleanupConnectionReferences(connection);
          return;
        }
      }

      const pool = this.pools[poolKey];

      if (pool && !pool._draining) {
        // Registrar tiempo de uso
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

      // Limpiar referencias
      this._cleanupConnectionReferences(connection);
    } catch (error) {
      this.stats.errors++;
      logger.warn(`Advertencia al liberar conexión: ${error.message}`);

      // Registrar error para posible renovación
      if (connection._poolOrigin || connection._serverKey) {
        this._registerConnectionError(
          connection._poolOrigin || connection._serverKey,
          error
        );
      }

      // Limpiar referencias como último recurso
      this._cleanupConnectionReferences(connection);
    }
  }

  // NUEVO MÉTODO: Limpieza centralizada de referencias
  _cleanupConnectionReferences(connection) {
    try {
      this.stats.activeConnections.delete(connection);
      connectionPoolMap.delete(connection);
      CONNECTION_LIMITS.operationCounter.delete(connection);

      // Limpiar transacciones si existen
      if (this.activeTransactions.has(connection)) {
        this.activeTransactions.delete(connection);
      }
    } catch (cleanupError) {
      logger.debug(`Error limpiando referencias: ${cleanupError.message}`);
    }
  }

  /**
   * Incrementa el contador de operaciones para una conexión
   * @param {Connection} connection - Conexión
   * @returns {number} - Nuevo contador de operaciones
   */
  incrementOperationCount(connection) {
    if (!connection) return 0;

    if (connection._operationCount !== undefined) {
      connection._operationCount++;
    } else {
      connection._operationCount = 1;
    }

    // También mantener en el mapa global
    if (!CONNECTION_LIMITS.operationCounter.has(connection)) {
      CONNECTION_LIMITS.operationCounter.set(connection, 0);
    }

    const count = CONNECTION_LIMITS.operationCounter.get(connection) + 1;
    CONNECTION_LIMITS.operationCounter.set(connection, count);

    // Monitorear uso de memoria ocasionalmente
    if (count % 10 === 0) {
      MemoryManager.trackOperation("connection_operation");
    }

    return count;
  }

  /**
   * Verifica si una conexión necesita ser renovada
   * @param {Connection} connection - Conexión a verificar
   * @param {string} serverKey - Clave del servidor
   * @returns {Promise<Object>} - Resultado con conexión posiblemente renovada
   */
  async verifyAndRenewConnection(connection, serverKey) {
    if (!connection) return { renewed: false, connection: null };

    try {
      // Verificar si la conexión sigue activa
      if (!connection.connected) {
        logger.info(
          `Conexión a ${serverKey} desconectada, obteniendo nueva conexión...`
        );

        try {
          // Limpiar la conexión vieja
          await this.releaseConnection(connection);
        } catch (releaseError) {
          logger.warn(
            `Error al liberar conexión inactiva: ${releaseError.message}`
          );
        }

        // Obtener nueva conexión
        const newConnection = await this.getConnection(serverKey);
        return { renewed: true, connection: newConnection };
      }

      // Verificar número de operaciones
      const count =
        connection._operationCount ||
        CONNECTION_LIMITS.operationCounter.get(connection) ||
        0;

      if (count >= CONNECTION_LIMITS.maxOperations) {
        logger.info(
          `Renovando conexión a ${serverKey} después de ${count} operaciones`
        );

        try {
          await this.releaseConnection(connection);
        } catch (releaseError) {
          logger.warn(
            `Error al liberar conexión durante renovación: ${releaseError.message}`
          );
        }

        const newConnection = await this.getConnection(serverKey);
        return { renewed: true, connection: newConnection };
      }

      // Verificar edad de la conexión
      const connectionAge = Date.now() - (connection._createdAt || 0);
      if (connectionAge > CONNECTION_LIMITS.maxAge) {
        logger.info(
          `Renovando conexión a ${serverKey} por edad (${Math.round(
            connectionAge / 1000
          )}s)`
        );

        try {
          await this.releaseConnection(connection);
        } catch (releaseError) {
          logger.warn(
            `Error al liberar conexión antigua: ${releaseError.message}`
          );
        }

        const newConnection = await this.getConnection(serverKey);
        return { renewed: true, connection: newConnection };
      }

      // Verificar que la conexión responde
      try {
        const testRequest = new Request(
          "SELECT 1 AS test",
          (err, rowCount, rows) => {
            if (err) throw err;
          }
        );

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout verificando conexión"));
          }, 5000); // 5 segundos máximo

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

        // Conexión está ok
        return { renewed: false, connection };
      } catch (testError) {
        logger.warn(
          `Error al verificar conexión a ${serverKey}: ${testError.message}`
        );

        try {
          await this.releaseConnection(connection);
        } catch (releaseError) {
          logger.warn(
            `Error al liberar conexión fallida: ${releaseError.message}`
          );
        }

        const newConnection = await this.getConnection(serverKey);
        return { renewed: true, connection: newConnection };
      }
    } catch (error) {
      logger.error(`Error al verificar/renovar conexión: ${error.message}`);
      // Intentar obtener una nueva conexión como último recurso
      try {
        await this.releaseConnection(connection);
      } catch (e) {}

      const newConnection = await this.getConnection(serverKey);
      return { renewed: true, connection: newConnection };
    }
  }

  /**
   * Cerrar un pool de conexiones
   * @param {string} serverKey - Clave del servidor
   * @returns {Promise<boolean>} - true si se cerró correctamente
   */
  async closePool(serverKey) {
    try {
      logger.info(`Cerrando pool para ${serverKey}...`);

      // Mark the pool as in closing process
      if (!this._closingPools) this._closingPools = new Set();
      this._closingPools.add(serverKey);

      const pool = this.pools[serverKey];
      if (!pool) {
        logger.warn(`No existe un pool para ${serverKey} que cerrar`);
        this._closingPools.delete(serverKey);
        return true; // Already closed
      }

      // Clear renewal timer
      if (this.renewalTimers && this.renewalTimers[serverKey]) {
        clearTimeout(this.renewalTimers[serverKey]);
        this.renewalTimers[serverKey] = null;
      }

      // Set up a more robust timeout mechanism with forced cleanup
      let forcedCleanup = false;
      const drainPromise = pool.drain().catch((err) => {
        logger.error(`Error during pool drain: ${err.message}`);
        throw err;
      });

      // Use Promise.race with a timeout
      try {
        await Promise.race([
          drainPromise,
          new Promise((_, reject) => {
            setTimeout(() => {
              forcedCleanup = true;
              reject(new Error("Drain timeout"));
            }, 15000);
          }),
        ]);
      } catch (timeoutError) {
        logger.warn(
          `Timeout durante drain para ${serverKey}, forzando limpieza`
        );
      }

      // If we got here either by successful drain or timeout, proceed with cleanup
      try {
        if (!forcedCleanup) {
          await pool.clear();
        }
      } catch (clearError) {
        logger.error(`Error durante clear del pool: ${clearError.message}`);
      }

      // Force cleanup in either case
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

      // Ensure cleanup even on errors
      if (this._closingPools) {
        this._closingPools.delete(serverKey);
      }

      if (this.pools[serverKey]) {
        delete this.pools[serverKey];
      }

      return false;
    }
  }

  /**
   * Cerrar todos los pools de conexiones
   * @returns {Promise<Object>} - Resultados por servidor
   */
  async closePools() {
    const results = {};

    for (const [serverKey, pool] of Object.entries(this.pools)) {
      try {
        logger.info(`Cerrando pool para ${serverKey}...`);

        // Limpiar timer de renovación
        if (this.renewalTimers[serverKey]) {
          clearTimeout(this.renewalTimers[serverKey]);
          this.renewalTimers[serverKey] = null;
        }

        // Cerrar pool
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

    // Limpiar mapas globales
    connectionPoolMap.clear();
    CONNECTION_LIMITS.operationCounter.clear();
    this.stats.activeConnections.clear();

    return results;
  }

  /**
   * Configurar la renovación automática de un pool
   * @private
   * @param {string} serverKey - Clave del servidor
   */
  _setupAutoRenewal(serverKey) {
    // Limpiar timer anterior si existe
    if (this.renewalTimers[serverKey]) {
      clearTimeout(this.renewalTimers[serverKey]);
    }

    // Establecer nuevo timer
    this.renewalTimers[serverKey] = setTimeout(async () => {
      logger.info(
        `Iniciando renovación programada del pool para ${serverKey}...`
      );
      await this._renewPool(serverKey);

      // Reiniciar el temporizador
      this._setupAutoRenewal(serverKey);
    }, POOL_HEALTH.renewalTimeout);
  }

  /**
   * Renovar un pool de conexiones
   * @private
   * @param {string} serverKey - Clave del servidor
   * @returns {Promise<boolean>} - true si se renovó correctamente
   */
  async _renewPool(serverKey) {
    try {
      const currentPool = this.pools[serverKey];

      if (currentPool) {
        logger.info(`Creando nuevo pool para ${serverKey}...`);

        // Crear un nuevo pool
        const dbConfig = await this._loadConfig(serverKey);
        if (!dbConfig) {
          throw new Error(`No se encontró configuración para ${serverKey}`);
        }

        const factory = this._createConnectionFactory(dbConfig, serverKey);
        const newPool = createPool(factory, DEFAULT_POOL_CONFIG);

        // Reemplazar el pool viejo con el nuevo
        this.pools[serverKey] = newPool;

        // Cerrar el pool antiguo gradualmente
        setTimeout(async () => {
          try {
            logger.info(`Cerrando pool antiguo para ${serverKey}...`);
            await currentPool.drain();
            await currentPool.clear();

            // Actualizar estadísticas
            this.stats.renewals++;

            logger.info(`Pool antiguo para ${serverKey} cerrado correctamente`);
          } catch (error) {
            logger.error(
              `Error al cerrar pool antiguo para ${serverKey}:`,
              error
            );
          }
        }, 60000); // 1 minuto para permitir migración

        logger.info(`Pool para ${serverKey} renovado correctamente`);
        return true;
      } else {
        // No hay pool existente, crear uno nuevo
        return await this.initPool(serverKey);
      }
    } catch (error) {
      logger.error(`Error al renovar pool para ${serverKey}:`, error);
      return false;
    }
  }

  /**
   * Registrar un error de conexión para monitoreo
   * @private
   * @param {string} serverKey - Clave del servidor
   * @param {Error} error - Error ocurrido
   */
  _registerConnectionError(serverKey, error) {
    if (!POOL_HEALTH.errorCount[serverKey]) {
      POOL_HEALTH.errorCount[serverKey] = 0;
    }

    POOL_HEALTH.errorCount[serverKey]++;

    logger.warn(
      `Error de conexión en ${serverKey} (${POOL_HEALTH.errorCount[serverKey]}/${POOL_HEALTH.maxErrorThreshold}): ${error.message}`
    );

    // Si superamos el umbral, renovar el pool
    if (POOL_HEALTH.errorCount[serverKey] >= POOL_HEALTH.maxErrorThreshold) {
      logger.info(
        `Umbral de errores alcanzado para ${serverKey}, iniciando renovación de pool...`
      );
      this._renewPool(serverKey);

      // Reiniciar contador
      POOL_HEALTH.errorCount[serverKey] = 0;
    }
  }

  /**
   * Verificar periódicamente la salud de los pools
   * @private
   */
  async _checkPoolsHealth() {
    try {
      logger.debug("Verificando salud de pools de conexión...");

      for (const [serverKey, pool] of Object.entries(this.pools)) {
        try {
          const now = Date.now();
          const lastCheck = POOL_HEALTH.lastCheck[serverKey] || 0;
          const timeSinceLastCheck = now - lastCheck;

          // Si ha pasado mucho tiempo desde la última verificación o hay muchos errores
          if (
            timeSinceLastCheck > POOL_HEALTH.checkInterval * 2 ||
            POOL_HEALTH.errorCount[serverKey] >
              POOL_HEALTH.maxErrorThreshold / 2
          ) {
            logger.info(
              `Realizando verificación de salud para pool ${serverKey}...`
            );

            // Intentar obtener y liberar una conexión como prueba
            try {
              const testConnection = await this.getConnection(serverKey, {
                timeout: 10000,
              });
              await this.releaseConnection(testConnection);

              // Reset error count si la prueba fue exitosa
              POOL_HEALTH.errorCount[serverKey] = 0;
              logger.info(`Verificación de salud exitosa para ${serverKey}`);
            } catch (testError) {
              logger.warn(
                `Falló verificación de salud para ${serverKey}: ${testError.message}`
              );
              this._registerConnectionError(serverKey, testError);
            }
          }

          // Actualizar timestamp de última verificación
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

  /**
   * Performs a proactive health check on all pools
   * @returns {Promise<Object>} - Health check results by server
   */
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
          // Get a connection from the pool
          const testConnection = await this.getConnection(serverKey, {
            timeout: 5000,
          });

          // Run a simple test query
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

          // Release the connection
          await this.releaseConnection(testConnection);

          results[serverKey].healthy = true;

          // Reset error count if check was successful
          POOL_HEALTH.errorCount[serverKey] = 0;
        } catch (error) {
          results[serverKey].error = error.message;

          // Register error for potential renewal
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

  /**
   * Obtener estadísticas de uso de conexiones
   * @returns {Object} - Estadísticas
   */
  getConnectionStats() {
    const poolStats = {};

    // Obtener estadísticas por pool
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

    // Estadísticas generales
    return {
      ...this.stats,
      activeCount: this.stats.activeConnections.size,
      timestamp: new Date().toISOString(),
      pools: poolStats,
    };
  }

  /**
   * Inicia una transacción en una conexión
   * @param {Connection} connection - Conexión
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} - Conexión con transacción
   */
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
          // Registrar la transacción activa
          this.activeTransactions.set(connection, transaction);

          // Añadir metadatos a la transacción
          transaction._startTime = Date.now();
          transaction._connection = connection;

          logger.debug("Transacción iniciada correctamente");
          resolve({ connection, transaction });
        }
      });
    });
  }

  /**
   * Confirma una transacción
   * @param {Transaction} transaction - Transacción
   * @returns {Promise<void>}
   */
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
          // Limpiar referencia en el mapa de transacciones activas
          if (transaction._connection) {
            this.activeTransactions.delete(transaction._connection);
          }

          logger.debug("Transacción confirmada correctamente");
          resolve();
        }
      });
    });
  }

  /**
   * Revierte una transacción
   * @param {Transaction} transaction - Transacción
   * @returns {Promise<void>}
   */
  async rollbackTransaction(transaction) {
    if (!transaction) return;

    return new Promise((resolve, reject) => {
      try {
        const timeout = setTimeout(() => {
          // Limpiar conexión incluso en timeout
          if (transaction._connection) {
            this.activeTransactions.delete(transaction._connection);
          }

          logger.warn("Timeout en rollback de transacción, continuando...");
          resolve();
        }, 30000);

        if (typeof transaction.rollback === "function") {
          transaction.rollback((err) => {
            clearTimeout(timeout);

            // Siempre limpiar la referencia
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

          // Limpiar conexión
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

        // Limpiar conexión incluso en error
        if (transaction._connection) {
          this.activeTransactions.delete(transaction._connection);
        }

        reject(error);
      }
    });
  }

  /**
   * Detiene el servicio central de conexiones
   */
  shutdown() {
    logger.info("Deteniendo servicio central de conexiones...");

    // Limpiar intervalo de verificación de salud
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Limpiar timers de renovación
    for (const timer of Object.values(this.renewalTimers)) {
      if (timer) clearTimeout(timer);
    }
    this.renewalTimers = {};

    // Cerrar pools (sin esperar)
    this.closePools().catch((err) => {
      logger.error(`Error al cerrar pools durante shutdown: ${err.message}`);
    });

    logger.info("Servicio central de conexiones detenido");
  }
}

// Exportar instancia singleton
module.exports = new ConnectionCentralService();
