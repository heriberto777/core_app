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

  // ✅ CONFIGURACIÓN SSL CORREGIDA SEGÚN TU ESTRUCTURA ORIGINAL
  _convertToTediousConfig(dbConfig) {
    // Detectar si es dirección IP
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(dbConfig.host);

    // ✅ USAR CONFIGURACIÓN SSL ORIGINAL
    const useEncryption = dbConfig.options?.encrypt !== false && !isIpAddress;
    const trustCertificate =
      dbConfig.options?.trustServerCertificate !== false || isIpAddress;

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
        database: dbConfig.database,
        // ✅ CONFIGURACIÓN SSL MEJORADA
        encrypt: useEncryption,
        trustServerCertificate: trustCertificate,

        // ✅ TIMEOUTS INCREMENTADOS
        connectTimeout: 90000, // 90 segundos para conectar
        requestTimeout: 180000, // 3 minutos para queries
        cancelTimeout: 30000, // 30 segundos para cancelar

        port: dbConfig.port || 1433,
        rowCollectionOnRequestCompletion: true,
        validateParameters: false,
        enableArithAbort: true,

        // ✅ CONFIGURACIONES ADICIONALES PARA ESTABILIDAD
        useColumnNames: false,
        camelCaseColumns: false,
        debug: {
          packet: false,
          data: false,
          payload: false,
          token: false,
        },
      },
    };

    // ✅ AGREGAR INSTANCIA SI EXISTE (IMPORTANTE PARA SQL SERVER)
    if (dbConfig.instance) {
      config.options.instanceName = dbConfig.instance;
    }

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
}

const connectionCentralService = new ConnectionCentralService();
module.exports = connectionCentralService;
