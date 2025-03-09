const { createPool } = require("generic-pool");
const { Connection } = require("tedious");
const logger = require("./logger");
const DBConfig = require("../models/dbConfigModel");
const MongoDbService = require("./mongoDbService");

// Configuración del pool con timeouts ajustados
const DEFAULT_POOL_CONFIG = {
  min: 1, // Reducido a 1 para minimizar fallos iniciales
  max: 10, // Máximo de conexiones
  acquireTimeoutMillis: 90000, // Aumentado a 90s
  idleTimeoutMillis: 300000, // Timeout de conexiones inactivas (5min)
  evictionRunIntervalMillis: 60000, // Verificación de conexiones inactivas (60s)
  testOnBorrow: false, // DESACTIVADO para evitar timeouts
  testOnReturn: false, // No validar conexiones cuando se devuelven
  fifo: false, // Utilizar LIFO para mejorar la eficiencia
};

// Sistema de contador de operaciones por conexión
const CONNECTION_OPERATION_LIMITS = {
  maxOperations: 500, // Número máximo de operaciones por conexión
  operationCounter: new Map(), // Mapa para contar operaciones por conexión
};

// Variables para gestionar el estado y renovación del pool
const POOL_HEALTH = {
  lastCheck: {},
  errorCount: {},
  maxErrorThreshold: 5, // Después de este número de errores, renovar el pool
  checkInterval: 5 * 60 * 1000, // Revisar cada 5 minutos
  renewalTimeout: 2 * 60 * 60 * 1000, // Renovar cada 2 horas
};

// Map global para rastrear conexiones
const connectionPoolMap = new Map();

class ConnectionManager {
  constructor() {
    this.pools = {};
    this.renewalTimers = {};
    this.connectionStats = {
      acquired: 0,
      released: 0,
      errors: 0,
      renewals: 0,
    };
  }

  // Singleton para gestionar todas las conexiones
  static getInstance() {
    if (!this.instance) {
      this.instance = new ConnectionManager();
    }
    return this.instance;
  }

  // Inicializar pool para un servidor específico
  async initPool(serverKey, customConfig = {}) {
    try {
      logger.info(`Inicializando pool para ${serverKey}...`);

      // Verificar si hay que cerrar un pool existente
      if (this.pools[serverKey]) {
        await this.closePool(serverKey);
      }

      // Inicializar estado del pool para este servidor
      POOL_HEALTH.lastCheck[serverKey] = Date.now();
      POOL_HEALTH.errorCount[serverKey] = 0;

      // Cargar configuración desde MongoDB
      const dbConfig = await this.loadConfig(serverKey);
      if (!dbConfig) {
        logger.error(
          `No se encontró configuración para ${serverKey} en MongoDB`
        );
        return false;
      }

      // Crear factory y pool
      const factory = this.createConnectionFactory(dbConfig);
      this.pools[serverKey] = createPool(factory, {
        ...DEFAULT_POOL_CONFIG,
        ...customConfig,
      });

      logger.info(`Pool de conexiones inicializado para ${serverKey}`);

      // Configurar renovación automática
      this.setupAutoRenewal(serverKey);

      return true;
    } catch (error) {
      logger.error(`Error al inicializar pool para ${serverKey}:`, error);
      return false;
    }
  }

  // Cargar configuración de base de datos
  async loadConfig(serverKey) {
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

      return this.convertToTediousConfig(dbConfig);
    } catch (error) {
      logger.error(`Error al cargar configuración para ${serverKey}:`, error);
      return null;
    }
  }

  // Convertir config de MongoDB a formato Tedious
  convertToTediousConfig(dbConfig) {
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

  // Crear factory de conexiones para el pool
  createConnectionFactory(config) {
    const configInfo = {
      server: config.server,
      database: config.options.database,
      user: config.authentication.options.userName,
    };

    logger.info(
      `Creando factory de conexión con: ${JSON.stringify(configInfo)}`
    );

    return {
      create: () => {
        return new Promise((resolve, reject) => {
          logger.debug(`Intentando crear nueva conexión a ${config.server}...`);

          const { Connection } = require("tedious");
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

            logger.debug(
              `Conexión establecida correctamente a ${config.server}`
            );
            connection._createdAt = Date.now();
            connection._operationCount = 0;
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

          // Verificar edad de la conexión
          try {
            const connectionAge = Date.now() - (connection._createdAt || 0);
            const maxConnectionAge = 3600000; // 1 hora

            if (connectionAge > maxConnectionAge) {
              logger.debug(
                `Descartando conexión que lleva ${connectionAge}ms abierta`
              );
              resolve(false);
              return;
            }

            // Verificar número de operaciones
            if (
              connection._operationCount >
              CONNECTION_OPERATION_LIMITS.maxOperations
            ) {
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

  // Obtener una conexión del pool
  async getConnection(serverKey) {
    try {
      // Inicializar el pool si no existe
      if (!this.pools[serverKey]) {
        const initialized = await this.initPool(serverKey);
        if (!initialized) {
          throw new Error(`No se pudo inicializar el pool para ${serverKey}`);
        }
      }

      // Adquirir conexión del pool
      const connection = await this.pools[serverKey].acquire();

      if (!connection) {
        throw new Error(`Se obtuvo una conexión nula para ${serverKey}`);
      }

      // Verificar que la conexión es válida
      if (typeof connection.execSql !== "function") {
        logger.error(
          `Se obtuvo una conexión sin método execSql para ${serverKey}`
        );

        // Intentar liberar esta conexión inválida
        try {
          await this.pools[serverKey].destroy(connection);
        } catch (e) {}

        // Reinicializar el pool y volver a intentar
        await this.closePool(serverKey);
        await this.initPool(serverKey);

        // Recurrir llamando al método de nuevo
        return this.getConnection(serverKey);
      }

      // Adjuntar metadatos para rastreo
      connection._poolOrigin = serverKey;
      connection._acquiredAt = Date.now();
      connection._operationCount = connection._operationCount || 0;

      // Registrar en el mapa global
      connectionPoolMap.set(connection, serverKey);

      // Actualizar estadísticas
      this.connectionStats.acquired++;

      logger.debug(`Conexión obtenida para ${serverKey}`);
      return connection;
    } catch (error) {
      this.connectionStats.errors++;

      // Registrar error para renovación potencial
      this.registerConnectionError(serverKey, error);

      logger.error(`Error al obtener conexión para ${serverKey}:`, error);
      throw error;
    }
  }

  // Liberar conexión
  async releaseConnection(connection) {
    if (!connection) {
      logger.debug(`Intento de liberar una conexión nula, ignorando`);
      return;
    }

    try {
      // Determinar a qué pool pertenece la conexión
      let poolKey = connection._poolOrigin;

      if (!poolKey) {
        poolKey = connectionPoolMap.get(connection);
        if (!poolKey) {
          logger.warn(
            `No se pudo determinar el origen de la conexión, intentando con server1`
          );
          poolKey = "server1";
        }
      }

      const pool = this.pools[poolKey];

      if (pool) {
        // Registrar tiempo de uso
        if (connection._acquiredAt) {
          const usageTime = Date.now() - connection._acquiredAt;
          logger.debug(`Conexión usada durante ${usageTime}ms (${poolKey})`);
        }

        await pool.release(connection);

        // Limpiar referencias
        connectionPoolMap.delete(connection);
        CONNECTION_OPERATION_LIMITS.operationCounter.delete(connection);

        // Actualizar estadísticas
        this.connectionStats.released++;

        logger.debug(`Conexión liberada correctamente (${poolKey})`);
      } else {
        logger.warn(
          `No se encontró pool para ${poolKey}, cerrando conexión directamente`
        );
        connection.close();
        connectionPoolMap.delete(connection);
        CONNECTION_OPERATION_LIMITS.operationCounter.delete(connection);
      }
    } catch (error) {
      this.connectionStats.errors++;
      logger.error(`Error al liberar conexión:`, error);

      // Intentar cerrar directamente como último recurso
      try {
        connection.close();
        connectionPoolMap.delete(connection);
        CONNECTION_OPERATION_LIMITS.operationCounter.delete(connection);
      } catch (closeError) {
        logger.error(`Error al cerrar conexión directamente:`, closeError);
      }
    }
  }

  // Establecer temporizador para renovación automática
  setupAutoRenewal(serverKey) {
    // Limpiar timer anterior si existe
    if (this.renewalTimers[serverKey]) {
      clearTimeout(this.renewalTimers[serverKey]);
    }

    // Establecer nuevo timer
    this.renewalTimers[serverKey] = setTimeout(async () => {
      logger.info(
        `Iniciando renovación programada del pool para ${serverKey}...`
      );
      await this.renewPool(serverKey);

      // Reiniciar el temporizador
      this.setupAutoRenewal(serverKey);
    }, POOL_HEALTH.renewalTimeout);
  }

  // Renovar pool de conexiones
  async renewPool(serverKey) {
    try {
      const currentPool = this.pools[serverKey];

      if (currentPool) {
        logger.info(`Creando nuevo pool para ${serverKey}...`);

        // Crear un nuevo pool
        const dbConfig = await this.loadConfig(serverKey);
        if (!dbConfig) {
          throw new Error(`No se encontró configuración para ${serverKey}`);
        }

        const factory = this.createConnectionFactory(dbConfig);
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
            this.connectionStats.renewals++;

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

  // Registrar error de conexión
  registerConnectionError(serverKey, error) {
    if (!POOL_HEALTH.errorCount[serverKey]) {
      POOL_HEALTH.errorCount[serverKey] = 0;
    }

    POOL_HEALTH.errorCount[serverKey]++;

    logger.warn(
      `Error de conexión en ${serverKey} (${POOL_HEALTH.errorCount[serverKey]}/${POOL_HEALTH.maxErrorThreshold}):`,
      error.message
    );

    // Si superamos el umbral, renovar el pool
    if (POOL_HEALTH.errorCount[serverKey] >= POOL_HEALTH.maxErrorThreshold) {
      logger.info(
        `Umbral de errores alcanzado para ${serverKey}, iniciando renovación de pool...`
      );
      this.renewPool(serverKey);

      // Reiniciar contador
      POOL_HEALTH.errorCount[serverKey] = 0;
    }
  }

  // Incrementar contador de operaciones
  incrementOperationCount(connection) {
    if (!connection) return;

    if (connection._operationCount !== undefined) {
      connection._operationCount++;
    } else {
      connection._operationCount = 1;
    }

    // También mantener en el mapa global
    if (!CONNECTION_OPERATION_LIMITS.operationCounter.has(connection)) {
      CONNECTION_OPERATION_LIMITS.operationCounter.set(connection, 0);
    }

    const count =
      CONNECTION_OPERATION_LIMITS.operationCounter.get(connection) + 1;
    CONNECTION_OPERATION_LIMITS.operationCounter.set(connection, count);

    return count;
  }

  // Verificar si una conexión necesita ser renovada
  async shouldRenewConnection(connection, serverKey) {
    if (!connection) return { renewed: false, connection: null };

    const count =
      connection._operationCount ||
      CONNECTION_OPERATION_LIMITS.operationCounter.get(connection) ||
      0;

    if (count >= CONNECTION_OPERATION_LIMITS.maxOperations) {
      logger.info(
        `Renovando conexión a ${serverKey} después de ${count} operaciones`
      );

      try {
        await this.releaseConnection(connection);
      } catch (e) {
        logger.warn(
          `Error al liberar conexión durante renovación: ${e.message}`
        );
      }

      try {
        const newConnection = await this.getConnection(serverKey);
        return { renewed: true, connection: newConnection };
      } catch (error) {
        logger.error(
          `Error al obtener nueva conexión durante renovación: ${error.message}`
        );
        return { renewed: false, connection: null };
      }
    }

    return { renewed: false, connection };
  }

  // Verificar y renovar conexión si es necesario
  async verifyConnection(connection, serverKey) {
    if (!connection || !connection.connected) {
      logger.warn(
        `Conexión a ${serverKey} inválida o cerrada, reconectando...`
      );

      // Liberar esta conexión si existe
      try {
        if (connection) {
          await this.releaseConnection(connection);
        }
      } catch (releaseError) {
        logger.warn(
          `Error al liberar conexión cerrada: ${releaseError.message}`
        );
      }

      // Obtener una nueva conexión
      try {
        const newConnection = await this.getConnection(serverKey);
        if (!newConnection) {
          throw new Error(`No se pudo obtener nueva conexión a ${serverKey}`);
        }
        return newConnection;
      } catch (error) {
        throw new Error(
          `Error al obtener nueva conexión a ${serverKey}: ${error.message}`
        );
      }
    }

    try {
      // Ejecutar una consulta simple para verificar la conexión
      const request = new Request("SELECT 1 AS test", (err, rowCount, rows) => {
        if (err) throw err;
      });

      return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => {
          reject(new Error(`Timeout al verificar conexión a ${serverKey}`));
        }, 10000);

        request.on("done", () => {
          clearTimeout(timeout);
          resolve(connection);
        });

        request.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        // Ejecutar la consulta
        connection.execSql(request);
      });
    } catch (error) {
      logger.warn(
        `Error al verificar conexión a ${serverKey}: ${error.message}`
      );

      // Si falla la verificación, liberar esta conexión
      try {
        await this.releaseConnection(connection);
      } catch (e) {}

      // Intentar obtener una nueva conexión
      const newConnection = await this.getConnection(serverKey);
      if (!newConnection) {
        throw new Error(
          `No se pudo obtener nueva conexión después de fallo en verificación`
        );
      }

      return newConnection;
    }
  }

  // Cerrar todos los pools
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
    CONNECTION_OPERATION_LIMITS.operationCounter.clear();

    return results;
  }

  async closePool(serverKey) {
    try {
      logger.info(`Cerrando pool individual para ${serverKey}...`);

      const pool = this.pools[serverKey];
      if (!pool) {
        logger.warn(`No existe un pool para ${serverKey} que cerrar`);
        return true; // Retornar true porque técnicamente el pool ya está cerrado
      }

      // Limpiar timer de renovación
      if (this.renewalTimers && this.renewalTimers[serverKey]) {
        clearTimeout(this.renewalTimers[serverKey]);
        this.renewalTimers[serverKey] = null;
      }

      // Cerrar pool
      await pool.drain();
      await pool.clear();

      delete this.pools[serverKey];

      logger.info(`Pool para ${serverKey} cerrado correctamente`);
      return true;
    } catch (error) {
      logger.error(`Error al cerrar pool para ${serverKey}:`, error);
      return false;
    }
  }

  // Obtener estado de los pools
  getPoolsStatus() {
    const status = {};

    // Verificar que this.pools exista
    if (!this.pools) {
      logger.warn("No hay pools inicializados para obtener estado");
      return status;
    }

    for (const [serverKey, pool] of Object.entries(this.pools)) {
      status[serverKey] = {
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

    return status;
  }

  // Obtener estadísticas de conexiones
  getConnectionStats() {
    return {
      ...this.connectionStats,
      timestamp: new Date().toISOString(),
      pools: this.getPoolsStatus(),
    };
  }

  // Conexión robusta con reintentos
  async enhancedRobustConnect(serverKey, maxAttempts = 5, baseDelay = 3000) {
    let attempt = 0;
    let delay = baseDelay;

    // Limpiar pools si existen para forzar nuevas conexiones
    try {
      if (this.pools && this.pools[serverKey]) {
        logger.info(
          `Cerrando pool existente para ${serverKey} antes de reconectar`
        );
        await this.closePool(serverKey);
      }
    } catch (error) {
      logger.warn(
        `Error al cerrar pool existente para ${serverKey}: ${error.message}`
      );
    }

    while (attempt < maxAttempts) {
      attempt++;

      try {
        logger.info(
          `Intento ${attempt}/${maxAttempts} para conectar a ${serverKey}...`
        );

        // Inicializar el pool desde cero
        const initialized = await this.initPool(serverKey);

        if (!initialized) {
          throw new Error(`No se pudo inicializar el pool para ${serverKey}`);
        }

        // Obtener una conexión del pool
        const connection = await this.getConnection(serverKey);

        if (!connection) {
          throw new Error(`No se pudo obtener una conexión a ${serverKey}`);
        }

        // Verificar la conexión con una query simple
        await this.verifyConnection(connection, serverKey);

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

        // Esperar antes del siguiente intento con backoff exponencial
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 30000); // Máximo 30 segundos
      }
    }
  }
}

// Crear la instancia singleton
const connectionManagerInstance = new ConnectionManager();

// Exportar instancia singleton
module.exports = connectionManagerInstance;
