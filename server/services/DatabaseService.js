// server/services/DatabaseService.js
const { createPool } = require("generic-pool");
const { Connection, Request, TYPES } = require("tedious");
const logger = require("./logger");
const DBConfig = require("../models/dbConfigModel");
const MongoDbService = require("./mongoDbService");

/**
 * Servicio centralizado para manejo de bases de datos
 * Reemplaza: ConnectionCentralService, ConnectionManager, parte de SqlService
 */
class DatabaseService {
  constructor() {
    this.pools = new Map();
    this.activeTransactions = new Map();
    this.connectionStats = {
      acquired: 0,
      released: 0,
      errors: 0,
      activeConnections: new Set(),
    };
    this._initialized = false;
    this._shutdownInProgress = false;
  }

  /**
   * Inicializa el servicio cargando todas las configuraciones de BD
   */
  async initialize() {
    if (this._initialized) return;

    try {
      if (!MongoDbService.isConnected()) {
        const connected = await MongoDbService.connect();
        if (!connected) {
          logger.error("❌ No se pudo conectar a MongoDB. No se pueden cargar configuraciones de SQL Server.");
          throw new Error("Fallo de conexión crítico a MongoDB");
        }
      }

      const configs = await DBConfig.find({}).lean();

      logger.info(
        `Cargando ${configs.length} configuraciones de base de datos`
      );

      for (const config of configs) {
        await this.createPool(config.serverName, config);
      }

      this._initialized = true;
      logger.info(
        `DatabaseService inicializado exitosamente con ${configs.length} configuraciones de BD`
      );
    } catch (error) {
      logger.error(`Error inicializando DatabaseService: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crea un pool de conexiones para un servidor específico
   */
  async createPool(serverKey, dbConfig) {
    try {
      if (dbConfig.type && dbConfig.type.toLowerCase() === "mongodb") {
        logger.info(`Registrando servidor MongoDB: ${serverKey}`);
        this.pools.set(serverKey, {
          type: "mongodb",
          config: dbConfig,
          isMongo: true,
        });
        return;
      }

      logger.info(`Creando pool SQL para ${serverKey}...`);

      const factory = {
        create: () => this._createConnection(dbConfig),
        destroy: (connection) => this._destroyConnection(connection),
        validate: (connection) => this._validateConnection(connection),
      };

      const poolConfig = {
        min: 1,
        max: 10,
        acquireTimeoutMillis: 90000, // 90 segundos
        idleTimeoutMillis: 600000, // 10 minutos
        evictionRunIntervalMillis: 120000, // 2 minutos
        testOnBorrow: false,
        testOnReturn: false,
        fifo: false,
      };

      const pool = createPool(factory, poolConfig);

      // Manejar eventos del pool
      pool.on("factoryCreateError", (err) => {
        logger.error(`Error creando conexión en pool ${serverKey}:`, err);
      });

      pool.on("factoryDestroyError", (err) => {
        logger.error(`Error destruyendo conexión en pool ${serverKey}:`, err);
      });

      this.pools.set(serverKey, pool);
      logger.info(`Pool creado exitosamente para ${serverKey}`);
    } catch (error) {
      logger.error(`Error creando pool para ${serverKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crea una nueva conexión a la base de datos
   * @private
   */
  async _createConnection(dbConfig) {
    return new Promise((resolve, reject) => {
      try {
        const config = this._buildTediousConfig(dbConfig);
        const connection = new Connection(config);

        const timeout = setTimeout(() => {
          reject(
            new Error(`Timeout conectando a ${dbConfig.host}:${dbConfig.port}`)
          );
        }, 120000); // 2 minutos

        connection.connect((err) => {
          clearTimeout(timeout);
          if (err) {
            logger.error(`Error conectando a ${dbConfig.serverName}:`, err);
            reject(err);
          } else {
            // Marcar metadatos de la conexión
            connection._serverKey = dbConfig.serverName;
            connection._createdAt = Date.now();
            connection._isHealthy = true;

            logger.debug(
              `Conexión creada exitosamente para ${dbConfig.serverName}`
            );
            resolve(connection);
          }
        });

        // Manejar errores de conexión
        connection.on("error", (err) => {
          logger.error(`Error en conexión a ${dbConfig.serverName}:`, err);
          connection._isHealthy = false;
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Construye la configuración para Tedious
   * @private
   */
  _buildTediousConfig(dbConfig) {
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
        encrypt: dbConfig.options?.mssqlEncrypt !== undefined ? dbConfig.options.mssqlEncrypt : (isIpAddress ? false : true),
        trustServerCertificate: true,
        enableArithAbort: true,
        database: dbConfig.database,
        connectTimeout: 120000,
        requestTimeout: 240000,
        cancelTimeout: 30000,
        rowCollectionOnRequestCompletion: true,
        useColumnNames: true,
        validateParameters: false,
        packetSize: 8192,
        useUTC: true,
      },
    };

    // CORREGIDO: Priorizar instancia sobre puerto
    if (dbConfig.instance && dbConfig.instance.trim() !== "") {
      // Si hay instancia, NO usar puerto
      config.options.instanceName = dbConfig.instance.trim();
      logger.debug(
        `${dbConfig.serverName}: Usando instancia '${config.options.instanceName}' (puerto ignorado)`
      );
    } else if (dbConfig.port) {
      // Solo usar puerto si NO hay instancia
      config.options.port = parseInt(dbConfig.port);
      logger.debug(
        `${dbConfig.serverName}: Usando puerto ${config.options.port}`
      );
    } else {
      // Puerto por defecto
      config.options.port = 1433;
      logger.debug(`${dbConfig.serverName}: Usando puerto por defecto 1433`);
    }

    logger.debug(`Configuración final para ${dbConfig.serverName}:`, {
      server: config.server,
      port: config.options.port,
      instance: config.options.instanceName,
      database: config.options.database,
    });

    return config;
  }

  /**
   * Destruye una conexión de forma segura
   * @private
   */
  async _destroyConnection(connection) {
    return new Promise((resolve) => {
      try {
        if (connection && !connection.closed) {
          connection.close();
        }
      } catch (error) {
        logger.warn(`Error destruyendo conexión: ${error.message}`);
      }
      resolve();
    });
  }

  /**
   * Valida si una conexión está en estado usable
   * @private
   */
  async _validateConnection(connection) {
    if (!connection) return false;
    if (connection.closed) return false;
    if (!connection._isHealthy) return false;
    if (typeof connection.execSql !== "function") return false;

    // Verificar estado de la conexión
    if (connection.state && connection.state.name) {
      const stateName = connection.state.name;
      if (stateName !== "LoggedIn" && stateName !== "SentLogin7") {
        return false;
      }
    }

    // Test rápido opcional (comentado para evitar overhead)
    // try {
    //   await this._quickConnectionTest(connection);
    //   return true;
    // } catch {
    //   return false;
    // }

    return true;
  }

  /**
   * Test rápido de conexión
   * @private
   */
  async _quickConnectionTest(connection) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection test timeout"));
      }, 5000);

      const request = new Request("SELECT 1 AS test", (err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });

      try {
        connection.execSql(request);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Obtiene una conexión del pool
   */
  async getConnection(serverKey, options = {}) {
    const maxRetries = 3;
    let attempt = 0;
    const operationId = `conn-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 5)}`;

    logger.debug(`[${operationId}] Solicitando conexión para ${serverKey}`);

    // Verificar que el servicio esté inicializado
    if (!this._initialized) {
      await this.initialize();
    }

    if (this._shutdownInProgress) {
      throw new Error("DatabaseService está cerrando");
    }

    while (attempt <= maxRetries) {
      try {
        // Verificar que el pool existe
        if (!this.pools.has(serverKey)) {
          // Cargar configuración y crear pool
          const dbConfig = await DBConfig.findOne({
            serverName: serverKey,
          }).lean();
          if (!dbConfig) {
            throw new Error(`Configuración no encontrada para ${serverKey}`);
          }
          await this.createPool(serverKey, dbConfig);
        }

        const pool = this.pools.get(serverKey);
        if (!pool) {
          throw new Error(`Pool no disponible para ${serverKey}`);
        }

        // NUEVO: Manejo directo de MongoDB (sin generic-pool)
        if (pool.isMongo) {
          logger.debug(`[${operationId}] Retornando conexión MongoDB para ${serverKey}`);
          const mongoose = require("mongoose");
          if (mongoose.connection.readyState !== 1) {
            await MongoDbService.connect();
          }
          this.connectionStats.acquired++;
          return mongoose.connection;
        }

        // Verificar estado del pool SQL
        if (pool._draining || pool.destroyed) {
          logger.warn(
            `[${operationId}] Pool corrupto para ${serverKey}, recreando...`
          );
          await this._recreatePool(serverKey);
        }

        // Obtener conexión
        logger.debug(`[${operationId}] Adquiriendo conexión del pool...`);
        const connection = await pool.acquire();

        // Validar conexión obtenida
        if (!(await this._validateConnection(connection))) {
          logger.warn(
            `[${operationId}] Conexión inválida obtenida, destruyendo...`
          );

          try {
            await pool.destroy(connection);
          } catch (destroyError) {
            logger.warn(
              `[${operationId}] Error destruyendo conexión inválida: ${destroyError.message}`
            );
          }

          throw new Error(`Conexión inválida obtenida para ${serverKey}`);
        }

        // Marcar conexión como activa
        connection._acquiredAt = Date.now();
        connection._operationId = operationId;
        connection._isHealthy = true;

        this.connectionStats.acquired++;
        this.connectionStats.activeConnections.add(connection);

        logger.debug(
          `[${operationId}] Conexión obtenida exitosamente para ${serverKey}`
        );
        return connection;
      } catch (error) {
        attempt++;
        logger.warn(
          `[${operationId}] Intento ${attempt}/${maxRetries + 1} falló: ${error.message
          }`
        );

        if (attempt > maxRetries) {
          this.connectionStats.errors++;
          logger.error(
            `[${operationId}] Todos los intentos agotados para ${serverKey}`
          );
          throw new Error(
            `No se pudo obtener conexión para ${serverKey}: ${error.message}`
          );
        }

        // Manejar errores críticos
        if (this._isCriticalError(error)) {
          logger.warn(`[${operationId}] Error crítico, recreando pool...`);
          try {
            await this._recreatePool(serverKey);
          } catch (recreateError) {
            logger.error(
              `[${operationId}] Error recreando pool: ${recreateError.message}`
            );
          }
        }

        // Esperar antes del siguiente intento
        const delay = Math.min(2000 * attempt, 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Libera una conexión de vuelta al pool
   */
  async releaseConnection(connection) {
    if (!connection || !connection._serverKey) {
      logger.debug("Intento de liberar conexión nula o sin serverKey");
      return;
    }

    const operationId = connection._operationId || "unknown";
    const serverKey = connection._serverKey;

    try {
      const pool = this.pools.get(serverKey);
      if (pool && !pool._draining) {
        await pool.release(connection);
        this.connectionStats.released++;
        this.connectionStats.activeConnections.delete(connection);

        logger.debug(`[${operationId}] Conexión liberada para ${serverKey}`);
      } else {
        // Reducir nivel de log durante shutdown para evitar ruido
        const logLevel = this._shutdownInProgress ? "debug" : "warn";
        logger[logLevel](
          `[${operationId}] Pool no disponible o drenando para liberar conexión de ${serverKey}`
        );
      }
    } catch (error) {
      logger.error(
        `[${operationId}] Error liberando conexión para ${serverKey}: ${error.message}`
      );
    }
  }

  /**
   * Determina si un error es crítico y requiere recrear el pool
   * @private
   */
  _isCriticalError(error) {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || "";
    const errorName = error.name?.toLowerCase() || "";
    const errorCode = error.code;

    const criticalPatterns = [
      "aggregateerror",
      "econnreset",
      "etimeout",
      "timeout",
      "draining",
      "cannot accept work",
      "connection limit exceeded",
      "pool is draining",
      "connection closed",
      "invalid connection",
    ];

    const isCritical =
      criticalPatterns.some(
        (pattern) =>
          errorMessage.includes(pattern) || errorName.includes(pattern)
      ) || ["ECONNRESET", "ETIMEOUT", "ENOTFOUND"].includes(errorCode);

    if (isCritical) {
      logger.debug(`Error crítico detectado: ${error.message}`);
    }

    return isCritical;
  }

  /**
   * Recrea un pool corrupto
   * @private
   */
  async _recreatePool(serverKey) {
    try {
      logger.info(`Recreando pool para ${serverKey}...`);

      // Cerrar pool actual si existe
      const existingPool = this.pools.get(serverKey);
      if (existingPool) {
        try {
          if (!existingPool.isMongo) {
            await existingPool.drain();
            await existingPool.clear();
          }
        } catch (closeError) {
          logger.warn(`Error cerrando pool existente: ${closeError.message}`);
        }
        this.pools.delete(serverKey);
      }

      // Cargar configuración y crear nuevo pool
      const dbConfig = await DBConfig.findOne({ serverName: serverKey }).lean();
      if (!dbConfig) {
        throw new Error(`Configuración no encontrada para ${serverKey}`);
      }

      await this.createPool(serverKey, dbConfig);
      logger.info(`Pool recreado exitosamente para ${serverKey}`);
    } catch (error) {
      logger.error(`Error recreando pool para ${serverKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de conexiones
   */
  getStats() {
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
      global: this.connectionStats,
      activeConnections: this.connectionStats.activeConnections.size,
      initialized: this._initialized,
    };
  }

  /**
   * Cierra todos los pools y limpia recursos
   */
  async shutdown() {
    this._shutdownInProgress = true;
    logger.info("Iniciando shutdown de DatabaseService...");

    const closePromises = Array.from(this.pools.keys()).map(
      async (serverKey) => {
        try {
          const pool = this.pools.get(serverKey);
          if (pool && !pool.isMongo) {
            await pool.drain();
            await pool.clear();
            this.pools.delete(serverKey);
            logger.info(`Pool ${serverKey} cerrado`);
          } else if (pool && pool.isMongo) {
            this.pools.delete(serverKey);
            logger.info(`Conexión MongoDB ${serverKey} removida del registro`);
          }
        } catch (error) {
          logger.error(`Error cerrando pool ${serverKey}: ${error.message}`);
        }
      }
    );

    await Promise.allSettled(closePromises);
    logger.info("DatabaseService shutdown completado");
  }

  // ===============================
  // MÉTODOS DE TRANSACCIONES
  // ===============================

  /**
   * Ejecuta callback dentro de una transacción automática
   */
  /**
   * Ejecuta callback dentro de una transacción automática
   */
  async withTransaction(serverKey, callback) {
    let connection = null;
    let isTransactionActive = false;
    const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    try {
      logger.debug(`[${txId}] Iniciando transacción para ${serverKey}`);

      connection = await this.getConnection(serverKey);

      // Iniciar transacción
      await this._beginTransaction(connection);
      isTransactionActive = true;
      this.activeTransactions.set(connection, { txId, startTime: Date.now() });

      // Ejecutar callback - pasamos la conexión, no un objeto transaction separado
      const result = await callback(connection, null);

      // Commit
      await this._commitTransaction(connection);
      isTransactionActive = false;
      this.activeTransactions.delete(connection);

      logger.debug(`[${txId}] Transacción confirmada exitosamente`);
      return result;
    } catch (error) {
      logger.error(`[${txId}] Error en transacción: ${error.message}`);

      if (isTransactionActive && connection) {
        try {
          await this._rollbackTransaction(connection);
          logger.debug(`[${txId}] Rollback ejecutado`);
        } catch (rollbackError) {
          logger.error(`[${txId}] Error en rollback: ${rollbackError.message}`);
        }
        isTransactionActive = false;
        this.activeTransactions.delete(connection);
      }

      throw error;
    } finally {
      if (connection) {
        await this.releaseConnection(connection);
      }
    }
  }

  /**
   * Ejecuta un callback con una conexión obtenida y liberada automáticamente
   * Útil para compatibilidad con código legado que usaba conConnection
   */
  async withConnection(serverKey, callback) {
    let connection = null;
    try {
      connection = await this.getConnection(serverKey);
      return await callback(connection);
    } catch (error) {
      logger.error(`Error en withConnection para ${serverKey}: ${error.message}`);
      throw error;
    } finally {
      if (connection) {
        await this.releaseConnection(connection);
      }
    }
  }

  async _beginTransaction(connection) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Transaction begin timeout"));
      }, 45000);

      connection.beginTransaction((err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async _commitTransaction(connection) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Transaction commit timeout"));
      }, 45000);

      connection.commitTransaction((err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async _rollbackTransaction(connection) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // No fallar en timeout de rollback
      }, 30000);

      connection.rollbackTransaction((err) => {
        clearTimeout(timeout);
        if (err) {
          logger.warn(`Rollback warning: ${err.message}`);
        }
        resolve(); // Siempre resolver rollback
      });
    });
  }

  // ===============================
  // MÉTODOS DE QUERIES
  // ===============================

  /**
   * Ejecuta query SQL (con serverKey o conexión directa)
   */
  async query(serverKeyOrConnection, sql, params = {}) {
    if (typeof serverKeyOrConnection === "string") {
      // Usar pool
      const connection = await this.getConnection(serverKeyOrConnection);

      // AGREGAR VALIDACIÓN
      if (!connection) {
        throw new Error(
          `getConnection returned null for server ${serverKeyOrConnection}`
        );
      }

      try {
        return await this._executeQuery(connection, sql, params);
      } finally {
        await this.releaseConnection(connection);
      }
    } else {
      // Usar conexión directa (para transacciones)

      // AGREGAR VALIDACIONES PARA CONEXIÓN DIRECTA
      if (!serverKeyOrConnection) {
        throw new Error("Connection parameter is null or undefined");
      }

      if (typeof serverKeyOrConnection.execSql !== "function") {
        throw new Error("Invalid connection object - missing execSql method");
      }

      if (serverKeyOrConnection.closed) {
        throw new Error("Connection is closed");
      }

      return await this._executeQuery(serverKeyOrConnection, sql, params);
    }
  }

  async _executeQuery(connection, sql, params) {
    return new Promise((resolve, reject) => {
      // AGREGAR VALIDACIONES AL INICIO
      if (!connection) {
        reject(new Error("Connection is null or undefined in _executeQuery"));
        return;
      }

      if (typeof connection.execSql !== "function") {
        reject(
          new Error("Connection object is invalid - missing execSql method")
        );
        return;
      }

      if (connection.closed) {
        reject(new Error("Connection is closed"));
        return;
      }

      const rows = [];
      const request = new Request(sql, (err, rowCount) => {
        if (err) {
          if (err instanceof AggregateError) {
            logger.error(`[${connection._operationId || 'direct'}] SQL AggregateError (${err.errors.length} errors):`);
            err.errors.forEach((e, i) => logger.error(`  Error ${i + 1}: ${e.message}`));
          } else {
            logger.debug(`[${connection._operationId || 'direct'}] SQL Error encountered: ${err.message}`);
          }
          reject(err);
        } else {
          logger.debug(`[${connection._operationId || 'direct'}] SQL Success: ${rowCount} rows`);
          resolve({
            recordset: rows,
            rowsAffected: rowCount || 0,
          });
        }
      });

      // Agregar parámetros
      for (const [key, value] of Object.entries(params)) {
        const sqlType = this._getSqlType(value);
        request.addParameter(key, sqlType, value === null ? null : value);
      }

      request.on("row", (columns) => {
        const row = {};
        Object.entries(columns).forEach(([key, column]) => {
          if (
            column &&
            typeof column === "object" &&
            column.value !== undefined
          ) {
            row[key] = column.value;
          } else {
            row[key] = column;
          }
        });
        if (Object.keys(row).length > 0) {
          rows.push(row);
        }
      });

      // ENVOLVER EN TRY-CATCH
      try {
        connection.execSql(request);
      } catch (execError) {
        reject(new Error(`Error calling execSql: ${execError.message}`));
      }
    });
  }

  _getSqlType(value) {
    if (value === null || value === undefined) return TYPES.NVarChar;
    if (typeof value === "number") {
      return Number.isInteger(value) ? TYPES.Int : TYPES.Float;
    }
    if (value instanceof Date) return TYPES.DateTime;
    if (typeof value === "boolean") return TYPES.Bit;
    return TYPES.NVarChar;
  }
}

// Exportar instancia singleton
module.exports = new DatabaseService();
