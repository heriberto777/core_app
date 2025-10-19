// server/services/ConnectionCentralService.js - VERSIÓN CONSOLIDADA

const { Connection, Request } = require("tedious");
const { createPool } = require("generic-pool");
const logger = require("./logger");
const DBConfig = require("../models/dbConfigModel");
const MongoDbService = require("./mongoDbService");

// Configuración mejorada para evitar pool closing errors
const DEFAULT_POOL_CONFIG = {
  min: 2,            // Mínimo 2 conexiones activas
  max: 15,           // Máximo 15 conexiones
  acquireTimeoutMillis: 45000,   // 45 segundos
  idleTimeoutMillis: 600000,     // 10 minutos idle
  evictionRunIntervalMillis: 120000, // Check cada 2 minutos
  softIdleTimeoutMillis: 300000,     // 5 minutos soft timeout
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

  /**
   * Inicializar servicio
   */
  async initialize() {
    if (this._initialized) return;

    try {
      // Asegurar conexión a MongoDB
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

  /**
   * Obtener conexión con manejo robusto
   */
  async getConnection(serverKey) {
    try {
      // Verificar si el servicio está cerrando
      if (this._isShuttingDown) {
        throw new Error(`El servicio está cerrando`);
      }

      // Verificar si el pool existe y no está cerrando
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

      // Verificar estado del pool antes de obtener conexión
      if (pool._draining) {
        throw new Error(`El pool para ${serverKey} está en proceso de cierre y no puede aceptar trabajo`);
      }

      const connection = await pool.acquire();

      if (!connection || connection.closed) {
        throw new Error(`Conexión inválida obtenida para ${serverKey}`);
      }

      this.stats.acquired++;
      this.stats.activeConnections.add(connection);

      // Marcar conexión con metadata
      connection._serverKey = serverKey;
      connection._acquiredAt = Date.now();

      return connection;

    } catch (error) {
      this.stats.errors++;
      logger.error(`Error obteniendo conexión para ${serverKey}:`, error);
      throw error;
    }
  }

  /**
   * Inicializar pool con protección contra concurrencia
   */
  async initPool(serverKey, customConfig = {}) {
    // Evitar inicializaciones concurrentes
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

  /**
   * Implementación real de inicialización
   */
  async _doInitPool(serverKey, customConfig = {}) {
    try {
      logger.info(`🔄 Inicializando pool para ${serverKey}...`);

      // Cerrar pool existente si hay uno
      if (this.pools.has(serverKey)) {
        await this._forceClosePool(serverKey);
      }

      // Cargar configuración desde MongoDB
      const dbConfig = await this._loadConfig(serverKey);
      if (!dbConfig) {
        throw new Error(`No se encontró configuración para ${serverKey}`);
      }

      // Crear factory
      const factory = this._createConnectionFactory(dbConfig, serverKey);

      // Configuración del pool
      const poolConfig = { ...DEFAULT_POOL_CONFIG, ...customConfig };

      // Crear pool
      const pool = createPool(factory, poolConfig);

      // Manejar eventos del pool
      pool.on('factoryCreateError', (err) => {
        logger.error(`Error en factory para ${serverKey}:`, err);
      });

      pool.on('factoryDestroyError', (err) => {
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

  /**
   * Cargar configuración desde MongoDB
   */
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
   * Convertir config de MongoDB a Tedious
   */
  _convertToTediousConfig(dbConfig) {
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(dbConfig.host);

    return {
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
        encrypt: isIpAddress ? false : true,
        trustServerCertificate: true,
        connectTimeout: 60000,
        requestTimeout: 120000,
        port: dbConfig.port || 1433,
        rowCollectionOnRequestCompletion: true,
        validateParameters: false,
        enableArithAbort: true,
      },
    };
  }

  /**
   * Crear factory de conexiones
   */
  _createConnectionFactory(config, serverKey) {
    return {
      create: () => {
        return new Promise((resolve, reject) => {
          const connection = new Connection(config);

          const timeout = setTimeout(() => {
            reject(new Error(`Timeout conectando a ${serverKey}`));
          }, 60000);

          connection.connect((err) => {
            clearTimeout(timeout);
            if (err) {
              reject(err);
            } else {
              resolve(connection);
            }
          });
        });
      },
      destroy: (connection) => {
        return new Promise((resolve) => {
          if (connection && !connection.closed) {
            connection.close();
          }
          resolve();
        });
      },
      validate: (connection) => {
        return Promise.resolve(!connection.closed);
      }
    };
  }

  /**
   * Liberar conexión
   */
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
      }
    } catch (error) {
      logger.error("Error liberando conexión:", error);
    }
  }

  /**
   * Forzar cierre de pool
   */
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

  /**
   * Obtener estadísticas (AGREGAR MÉTODO FALTANTE)
   */
  getConnectionStats() {
    const poolStats = {};

    for (const [serverKey, pool] of this.pools) {
      poolStats[serverKey] = {
        size: pool.size,
        available: pool.available,
        borrowed: pool.borrowed,
        pending: pool.pending,
        max: pool.max,
        min: pool.min
      };
    }

    return {
      pools: poolStats,
      globalStats: this.stats,
      activeConnections: this.stats.activeConnections.size
    };
  }

  /**
   * Cerrar todos los pools (shutdown graceful)
   */
  async shutdown() {
    this._isShuttingDown = true;

    const closePromises = Array.from(this.pools.keys()).map(serverKey =>
      this._forceClosePool(serverKey)
    );

    await Promise.all(closePromises);
    logger.info("🔴 ConnectionCentralService shutdown completado");
  }
}

// Instancia singleton
const connectionCentralService = new ConnectionCentralService();
module.exports = connectionCentralService;