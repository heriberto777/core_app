const { Connection, Request } = require("tedious");
const { createPool } = require("generic-pool");
const logger = require("./logger");
const DBConfig = require("../models/dbConfigModel");
const MongoDbService = require("./mongoDbService");

// ✅ CONFIGURACIÓN MEJORADA PARA EVITAR TIMEOUTS
const DEFAULT_POOL_CONFIG = {
  min: 1, // Empezar con 1 conexión
  max: 10, // Máximo 10 conexiones
  acquireTimeoutMillis: 120000, // 2 minutos para obtener conexión
  idleTimeoutMillis: 900000, // 15 minutos idle
  evictionRunIntervalMillis: 300000, // Check cada 5 minutos
  softIdleTimeoutMillis: 600000, // 10 minutos soft timeout
  testOnBorrow: false,
  testOnReturn: false,
  fifo: false,
};

class ConnectionCentralService {
  constructor() {
    this.pools = new Map();
    this.stats = {
      acquired: 0,
      released: 0,
      errors: 0,
      activeConnections: new Set(),
    };
    this._initializingPools = new Map();
    this._closingPools = new Set();
    this._isShuttingDown = false;
  }

  async initialize() {
    if (this._initialized) return;

    try {
      if (!MongoDbService.isConnected()) {
        await MongoDbService.connect();
      }

      this._initialized = true;
      logger.info("✅ ConnectionCentralService inicializado");
    } catch (error) {
      logger.error("❌ Error inicializando ConnectionCentralService:", error);
      throw error;
    }
  }

  async getConnection(serverKey) {
    try {
      if (this._isShuttingDown) {
        throw new Error(`El servicio está cerrando`);
      }

      if (!this.pools.has(serverKey) || this._closingPools.has(serverKey)) {
        logger.info(`Inicializando pool para ${serverKey}...`);
        const initialized = await this.initPool(serverKey);
        if (!initialized) {
          throw new Error(`No se pudo inicializar pool para ${serverKey}`);
        }
      }

      const pool = this.pools.get(serverKey);
      if (!pool) {
        throw new Error(`Pool no disponible para ${serverKey}`);
      }

      if (pool._draining) {
        throw new Error(
          `El pool para ${serverKey} está en proceso de cierre y no puede aceptar trabajo`
        );
      }

      const connection = await pool.acquire();

      if (!connection || connection.closed) {
        throw new Error(`Conexión inválida obtenida para ${serverKey}`);
      }

      this.stats.acquired++;
      this.stats.activeConnections.add(connection);

      connection._serverKey = serverKey;
      connection._acquiredAt = Date.now();

      return connection;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Error obteniendo conexión para ${serverKey}:`, error);
      throw error;
    }
  }

  async initPool(serverKey, customConfig = {}) {
    if (this._initializingPools.has(serverKey)) {
      return await this._initializingPools.get(serverKey);
    }

    const initPromise = this._doInitPool(serverKey, customConfig);
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

  async _doInitPool(serverKey, customConfig = {}) {
    try {
      logger.info(`🔄 Inicializando pool para ${serverKey}...`);

      if (this.pools.has(serverKey)) {
        await this._forceClosePool(serverKey);
      }

      const dbConfig = await this._loadConfig(serverKey);
      if (!dbConfig) {
        throw new Error(`No se encontró configuración para ${serverKey}`);
      }

      const factory = this._createConnectionFactory(dbConfig, serverKey);
      const poolConfig = { ...DEFAULT_POOL_CONFIG, ...customConfig };
      const pool = createPool(factory, poolConfig);

      pool.on("factoryCreateError", (err) => {
        logger.error(`Error en factory para ${serverKey}:`, err);
      });

      pool.on("factoryDestroyError", (err) => {
        logger.error(`Error destruyendo conexión para ${serverKey}:`, err);
      });

      this.pools.set(serverKey, pool);

      logger.info(`✅ Pool inicializado para ${serverKey}`);
      return true;
    } catch (error) {
      logger.error(`❌ Error inicializando pool para ${serverKey}:`, error);
      throw error;
    }
  }

  async _loadConfig(serverKey) {
    try {
      if (!MongoDbService.isConnected()) {
        await MongoDbService.connect();
      }

      const dbConfig = await DBConfig.findOne({ serverName: serverKey }).lean();
      if (!dbConfig) {
        throw new Error(`Configuración no encontrada para ${serverKey}`);
      }

      return this._convertToTediousConfig(dbConfig);
    } catch (error) {
      logger.error(`Error cargando config para ${serverKey}:`, error);
      throw error;
    }
  }

  /**
   * Convierte la configuración de MongoDB al formato requerido por Tedious
   * Configuración robusta para prevenir AggregateError
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
        // MEJORADO: Configuración SSL/TLS más robusta para AggregateError
        encrypt: isIpAddress ? false : dbConfig.options?.encrypt || false,
        trustServerCertificate: true,
        enableArithAbort: true,

        // MEJORADO: Timeouts más largos y configuración de retry para AggregateError
        connectTimeout: 90000, // Aumentado a 90 segundos
        requestTimeout: 180000, // Aumentado a 3 minutos
        cancelTimeout: 15000,
        connectionRetryInterval: 3000,

        // MEJORADO: Configuración de pool y manejo de resultados
        database: dbConfig.database,
        rowCollectionOnRequestCompletion: true,
        useColumnNames: true,

        // NUEVO: Configuración adicional para estabilidad y AggregateError
        validateParameters: false,
        abortTransactionOnError: false,
        enableConcurrentExecution: false,

        // NUEVO: Configuración específica para prevenir AggregateError
        enableImplicitTransactions: false,
        isolationLevel: 2, // READ_COMMITTED
        readOnlyIntent: false,

        // NUEVO: Configuración de red mejorada para AggregateError
        packetSize: 8192, // Aumentado para mejor rendimiento
        useUTC: true,
        dateFirst: 7,

        // NUEVO: Configuración de debug para troubleshooting
        debug: {
          packet: false,
          data: false,
          payload: false,
          token: false,
        },
      },
    };

    if (dbConfig.instance) {
      config.options.instanceName = dbConfig.instance;
    }

    if (dbConfig.port) {
      config.options.port = parseInt(dbConfig.port);
    }

    // NUEVO: Configuración específica por entorno para AggregateError
    if (process.env.NODE_ENV === "production") {
      config.options.connectTimeout = 120000; // Más tiempo en producción
      config.options.requestTimeout = 240000;
    }

    logger.info(
      `Configuración Tedious robusta creada para ${dbConfig.host}:${
        dbConfig.port || 1433
      }`
    );

    return config;
  }

  _createConnectionFactory(config, serverKey) {
    return {
      create: () => {
        return new Promise((resolve, reject) => {
          const connection = new Connection(config);

          // ✅ TIMEOUT INCREMENTADO A 2 MINUTOS
          const timeout = setTimeout(() => {
            reject(
              new Error(
                `Timeout conectando a ${serverKey} después de 120 segundos`
              )
            );
          }, 120000);

          connection.connect((err) => {
            clearTimeout(timeout);
            if (err) {
              logger.error(`Error conectando a ${serverKey}:`, {
                message: err.message,
                code: err.code,
                state: err.state,
              });
              reject(err);
            } else {
              logger.debug(`Conexión exitosa a ${serverKey}`);
              resolve(connection);
            }
          });

          // ✅ MANEJAR ERRORES DE CONEXIÓN
          connection.on("error", (err) => {
            logger.error(`Error en conexión a ${serverKey}:`, err);
          });
        });
      },
      destroy: (connection) => {
        return new Promise((resolve) => {
          try {
            if (connection && !connection.closed) {
              connection.close();
            }
          } catch (error) {
            logger.warn(`Error cerrando conexión: ${error.message}`);
          }
          resolve();
        });
      },
      validate: (connection) => {
        return Promise.resolve(connection && !connection.closed);
      },
    };
  }

  async releaseConnection(connection) {
    try {
      if (!connection || !connection._serverKey) {
        return;
      }

      const serverKey = connection._serverKey;
      const pool = this.pools.get(serverKey);

      if (pool && !pool._draining) {
        await pool.release(connection);
        this.stats.released++;
        this.stats.activeConnections.delete(connection);
        logger.debug(`Conexión liberada para ${serverKey}`);
      }
    } catch (error) {
      logger.error("Error liberando conexión:", error);
    }
  }

  async _forceClosePool(serverKey) {
    try {
      const pool = this.pools.get(serverKey);
      if (!pool) return;

      this._closingPools.add(serverKey);

      await pool.drain();
      await pool.clear();

      this.pools.delete(serverKey);
      this._closingPools.delete(serverKey);

      logger.info(`🗑️ Pool ${serverKey} cerrado forzadamente`);
    } catch (error) {
      logger.error(`Error cerrando pool ${serverKey}:`, error);
      this._closingPools.delete(serverKey);
    }
  }

  // ✅ MÉTODO FALTANTE AGREGADO
  getConnectionStats() {
    const poolStats = {};

    for (const [serverKey, pool] of this.pools) {
      poolStats[serverKey] = {
        size: pool.size,
        available: pool.available,
        borrowed: pool.borrowed,
        pending: pool.pending,
        max: pool.max,
        min: pool.min,
      };
    }

    return {
      pools: poolStats,
      globalStats: this.stats,
      activeConnections: this.stats.activeConnections.size,
    };
  }

  async shutdown() {
    this._isShuttingDown = true;

    const closePromises = Array.from(this.pools.keys()).map((serverKey) =>
      this._forceClosePool(serverKey)
    );

    await Promise.all(closePromises);
    logger.info("🔴 ConnectionCentralService shutdown completado");
  }

  /**
   * Inicia una transacción en una conexión
   * MEJORADO: Con manejo robusto para AggregateError
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
      }, options.timeout || 45000); // Aumentado para AggregateError

      try {
        connection.transaction((err, transaction) => {
          clearTimeout(timeout);

          if (err) {
            logger.error(`Error al iniciar transacción: ${err.message}`);

            // NUEVO: Manejo específico para AggregateError en transacciones
            if (err.name === "AggregateError") {
              logger.error(`AggregateError al iniciar transacción:`, err);
              Telemetry.trackError("transaction_begin_aggregate_error", {
                serverKey: connection._serverKey,
              });
            }

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
      } catch (error) {
        clearTimeout(timeout);

        if (error.name === "AggregateError") {
          logger.error(`AggregateError en try de beginTransaction:`, error);
        }

        reject(error);
      }
    });
  }

  /**
   * Confirma una transacción
   * MEJORADO: Con manejo robusto para AggregateError
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
      }, 45000); // Aumentado para AggregateError

      try {
        transaction.commit((err) => {
          clearTimeout(timeout);

          if (err) {
            logger.error(`Error al confirmar transacción: ${err.message}`);

            // NUEVO: Manejo específico para AggregateError en commit
            if (err.name === "AggregateError") {
              logger.error(`AggregateError al confirmar transacción:`, err);
              Telemetry.trackError("transaction_commit_aggregate_error", {
                serverKey: transaction._connection?._serverKey,
              });
            }

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
      } catch (error) {
        clearTimeout(timeout);

        if (error.name === "AggregateError") {
          logger.error(`AggregateError en try de commitTransaction:`, error);
        }

        reject(error);
      }
    });
  }
  /**
   * Revierte una transacción
   * MEJORADO: Con manejo robusto para AggregateError
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
        }, 45000); // Aumentado para AggregateError

        if (typeof transaction.rollback === "function") {
          transaction.rollback((err) => {
            clearTimeout(timeout);

            // Siempre limpiar la referencia
            if (transaction._connection) {
              this.activeTransactions.delete(transaction._connection);
            }

            if (err) {
              logger.error(`Error en rollback: ${err.message}`);

              // NUEVO: Manejo específico para AggregateError en rollback
              if (err.name === "AggregateError") {
                logger.error(`AggregateError en rollback:`, err);
                Telemetry.trackError("transaction_rollback_aggregate_error", {
                  serverKey: transaction._connection?._serverKey,
                });
              }

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

        // NUEVO: Manejo específico para AggregateError en catch general
        if (error.name === "AggregateError") {
          logger.error(`AggregateError en try de rollbackTransaction:`, error);
        }

        // Limpiar conexión incluso en error
        if (transaction._connection) {
          this.activeTransactions.delete(transaction._connection);
        }

        reject(error);
      }
    });
  }
}

const connectionCentralService = new ConnectionCentralService();
module.exports = connectionCentralService;
