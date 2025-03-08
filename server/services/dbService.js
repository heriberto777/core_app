// services/dbService.js
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

// Pools de conexiones
let poolServer1 = null;
let poolServer2 = null;

// Map global para rastrear conexiones
const connectionPoolMap = new Map();

function convertDbConfigToTediousConfig(dbConfig) {
  if (!dbConfig) {
    throw new Error("No se proporcionó configuración de base de datos");
  }

  if (dbConfig.type !== "mssql") {
    throw new Error(
      `Tipo de conexión no soportado: ${dbConfig.type}. Se esperaba 'mssql'`
    );
  }

  // Detectar si es una dirección IP para manejar correctamente TLS
  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(dbConfig.host);

  // Crear configuración para Tedious
  const tediousConfig = {
    server: dbConfig.host,
    authentication: {
      type: "default",
      options: {
        userName: dbConfig.user,
        password: dbConfig.password,
      },
    },
    options: {
      // Ajustar encrypt según es IP o nombre de host
      encrypt: isIpAddress ? false : dbConfig.options?.encrypt || false,
      trustServerCertificate: true, // Siempre true para evitar problemas de certificados
      enableArithAbort: true,
      database: dbConfig.database,
      connectTimeout: 60000, // Aumentado a 60 segundos (era 30s)
      requestTimeout: 120000, // Aumentado a 120 segundos (era 60s)
      rowCollectionOnRequestCompletion: true,
      useColumnNames: true,
      validateBulkLoadParameters: false, // Reducir validaciones estrictas
    },
  };

  // Si es una dirección IP, establecer explícitamente estas opciones
  if (isIpAddress) {
    tediousConfig.options.encrypt = false;
    tediousConfig.options.trustServerCertificate = true;
    // Añadir un log para claridad
    logger.info(
      `Conexión a IP detectada (${dbConfig.host}), desactivando TLS/encrypt`
    );
  }

  // Añadir instance si está definida
  if (dbConfig.instance) {
    tediousConfig.options.instanceName = dbConfig.instance;
  }

  // Añadir port si está definido
  if (dbConfig.port) {
    tediousConfig.options.port = dbConfig.port;
  }

  return tediousConfig;
}

async function createDefaultConfigs() {
  try {
    const count = await DBConfig.countDocuments();
    if (count > 0) {
      return;
    }

    if (!process.env.SERVER1_HOST || !process.env.SERVER1_USER) {
      return;
    }

    // Configuración server1
    const server1Config = {
      serverName: "server1",
      type: "mssql",
      user: process.env.SERVER1_USER,
      password: process.env.SERVER1_PASS || "",
      host: process.env.SERVER1_HOST,
      port: parseInt(process.env.SERVER1_PORT || "1433"),
      database: process.env.SERVER1_DB || "master",
      instance: process.env.SERVER1_INSTANCE || "",
      options: {
        encrypt: process.env.SERVER1_ENCRYPT === "true",
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    };

    // Configuración server2
    const server2Config = {
      serverName: "server2",
      type: "mssql",
      user: process.env.SERVER2_USER || process.env.SERVER1_USER,
      password: process.env.SERVER2_PASS || process.env.SERVER1_PASS || "",
      host: process.env.SERVER2_HOST || process.env.SERVER1_HOST,
      port: parseInt(
        process.env.SERVER2_PORT || process.env.SERVER1_PORT || "1433"
      ),
      database: process.env.SERVER2_DB || "master",
      instance: process.env.SERVER2_INSTANCE || "",
      options: {
        encrypt: process.env.SERVER2_ENCRYPT === "true",
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    };

    await DBConfig.create(server1Config);
    await DBConfig.create(server2Config);
  } catch (error) {
    console.error("Error al crear configuraciones predeterminadas:", error);
  }
}

async function loadDbConfigs() {
  try {
    if (!MongoDbService.isConnected()) {
      await MongoDbService.connect();
      if (!MongoDbService.isConnected()) {
        throw new Error(
          "No se pudo conectar a MongoDB para cargar configuraciones"
        );
      }
    }

    await createDefaultConfigs();

    const server1Config = await DBConfig.findOne({
      serverName: "server1",
    }).lean();
    const server2Config = await DBConfig.findOne({
      serverName: "server2",
    }).lean();

    if (!server1Config && !server2Config) {
      logger.error(
        "No se encontraron configuraciones para los servidores SQL. Ejecute updateDBConfig.js"
      );
    } else {
      if (server1Config) {
        const configInfo = {
          host: server1Config.host,
          database: server1Config.database,
          user: server1Config.user,
          port: server1Config.port,
          instance: server1Config.instance || "default",
        };
        logger.info(
          `Configuración para server1 encontrada: ${JSON.stringify(configInfo)}`
        );
      }

      if (server2Config) {
        const configInfo = {
          host: server2Config.host,
          database: server2Config.database,
          user: server2Config.user,
          port: server2Config.port,
          instance: server2Config.instance || "default",
        };
        logger.info(
          `Configuración para server2 encontrada: ${JSON.stringify(configInfo)}`
        );
      }
    }

    return {
      server1: server1Config
        ? convertDbConfigToTediousConfig(server1Config)
        : null,
      server2: server2Config
        ? convertDbConfigToTediousConfig(server2Config)
        : null,
    };
  } catch (error) {
    logger.error("Error al cargar configuraciones de MongoDB:", error);
    throw error;
  }
}

function createConnectionFactory(config) {
  // Mostrar detalles de la configuración (sin contraseña)
  const configInfo = {
    server: config.server,
    database: config.options.database,
    user: config.authentication.options.userName,
    instanceName: config.options.instanceName,
    port: config.options.port,
    encrypt: config.options.encrypt,
  };

  logger.info(`Creando factory de conexión con: ${JSON.stringify(configInfo)}`);

  return {
    create: function () {
      return new Promise((resolve, reject) => {
        logger.debug(`Intentando crear nueva conexión a ${config.server}...`);

        // Crear la conexión
        const connection = new Connection(config);

        // Agregar un timeout explícito para crear la conexión
        const connectionTimeout = setTimeout(() => {
          logger.error(
            `Timeout al crear conexión a ${config.server} después de ${
              config.options.connectTimeout / 1000
            } segundos`
          );
          connection.removeAllListeners();

          try {
            connection.close();
          } catch (e) {
            // Ignorar errores al cerrar una conexión que probablemente nunca se estableció
          }

          reject(new Error(`Timeout al crear conexión a ${config.server}`));
        }, config.options.connectTimeout || 60000);

        // Manejar evento de conexión
        connection.on("connect", (err) => {
          clearTimeout(connectionTimeout); // Cancelar el timeout

          if (err) {
            logger.error(`Error conectando a ${config.server}:`, err);
            reject(err);
            return;
          }

          logger.debug(
            `✅ Conexión establecida correctamente a ${config.server}`
          );
          connection._createdAt = Date.now();
          resolve(connection);
        });

        // Manejar errores de conexión
        connection.on("error", (err) => {
          clearTimeout(connectionTimeout); // Cancelar el timeout
          logger.error(`Error en la conexión a ${config.server}:`, err);
          reject(err);
        });

        // Iniciar conexión con manejo de excepciones
        try {
          connection.connect();
        } catch (connectError) {
          clearTimeout(connectionTimeout); // Cancelar el timeout
          logger.error(
            `Excepción al intentar conectar a ${config.server}:`,
            connectError
          );
          reject(connectError);
        }
      });
    },
    destroy: function (connection) {
      return new Promise((resolve) => {
        if (!connection) {
          resolve();
          return;
        }

        // Limpiar listeners de errores para evitar memory leaks
        connection.removeAllListeners("error");

        // Agregar listener para evento 'end'
        connection.on("end", () => {
          logger.debug(`Conexión cerrada correctamente`);
          resolve();
        });

        // Cerrar conexión con timeout de seguridad
        const closeTimeout = setTimeout(() => {
          logger.warn(`Timeout al cerrar conexión después de 5 segundos`);
          resolve(); // Resolver de todas formas
        }, 5000);

        try {
          connection.on("end", () => {
            clearTimeout(closeTimeout);
            resolve();
          });

          connection.close();
        } catch (closeError) {
          clearTimeout(closeTimeout);
          logger.warn(`Error al cerrar conexión (ignorando):`, closeError);
          resolve(); // Resolver de todas formas
        }
      });
    },
    validate: function (connection) {
      return new Promise((resolve) => {
        // Si no hay conexión o no está conectada, es inválida
        if (!connection || !connection.connected) {
          logger.debug(`Conexión inválida (no conectada), desechando`);
          resolve(false);
          return;
        }

        // Verificar si la conexión lleva demasiado tiempo abierta
        try {
          const connectionAge = Date.now() - (connection._createdAt || 0);
          const maxConnectionAge = 3600000; // 1 hora en ms

          if (connectionAge > maxConnectionAge) {
            logger.debug(
              `Descartando conexión que lleva ${connectionAge}ms abierta`
            );
            resolve(false);
          } else {
            resolve(true);
          }
        } catch (error) {
          logger.error("Error al validar conexión:", error);
          resolve(false);
        }
      });
    },
  };
}

async function initPools(customPoolConfig = {}) {
  try {
    logger.info("Iniciando inicialización de pools de conexiones...");

    // Verificar que MongoDB esté conectado
    if (!MongoDbService.isConnected()) {
      logger.info("MongoDB no está conectado. Intentando conectar...");
      const connected = await MongoDbService.connect();
      if (!connected) {
        logger.error(
          "No se pudo conectar a MongoDB. No se pueden inicializar los pools."
        );
        return false;
      }
      logger.info("Conexión a MongoDB establecida correctamente");
    }

    // Cargar configuraciones desde MongoDB
    const dbConfigs = await loadDbConfigs();

    if (!dbConfigs.server1 && !dbConfigs.server2) {
      logger.warn(
        "No se encontraron configuraciones de bases de datos SQL en MongoDB"
      );
      return false;
    }

    // Combinar configuración predeterminada con la personalizada
    const poolConfig = { ...DEFAULT_POOL_CONFIG, ...customPoolConfig };

    // MODIFICACIÓN CRÍTICA: Deshabilitar prueba inicial para evitar timeouts
    const skipPoolTest = process.env.SKIP_POOL_TEST === "true" || true; // Por defecto, omitir prueba

    // Inicializar pool para server1 si hay configuración y el pool no existe
    if (dbConfigs.server1 && !poolServer1) {
      try {
        logger.info("Creando pool para Server1...");

        // Crear factory para server1
        const factory = createConnectionFactory(dbConfigs.server1);

        // Crear pool para server1
        poolServer1 = createPool(factory, poolConfig);
        logger.info("Pool de conexiones inicializado para Server1");

        // Probar el pool solo si no se está saltando la prueba
        if (!skipPoolTest) {
          try {
            logger.debug(
              "Probando pool de Server1 con una conexión de prueba..."
            );
            const testConnection = await poolServer1.acquire();
            logger.info(
              "Conexión de prueba obtenida correctamente de pool Server1"
            );
            await poolServer1.release(testConnection);
            logger.info(
              "Conexión de prueba devuelta correctamente al pool Server1"
            );
          } catch (testError) {
            logger.warn(
              `Error en prueba de pool Server1: ${testError.message}`
            );
            // No fallamos la inicialización por un error en la prueba, pero marcamos el warning
          }
        } else {
          logger.info("Prueba de pool Server1 omitida por configuración");
        }
      } catch (server1Error) {
        logger.error("Error al inicializar pool para Server1:", server1Error);
        // Continuamos para intentar inicializar Server2 aunque Server1 falle
      }
    } else if (!dbConfigs.server1) {
      logger.warn(
        "No se encontró configuración para Server1, omitiendo inicialización del pool"
      );
    } else if (poolServer1) {
      logger.debug("Pool para Server1 ya existe, omitiendo inicialización");
    }

    // Inicializar pool para server2 si hay configuración y el pool no existe
    if (dbConfigs.server2 && !poolServer2) {
      try {
        logger.info("Creando pool para Server2...");

        // Crear factory para server2
        const factory = createConnectionFactory(dbConfigs.server2);

        // Crear pool para server2
        poolServer2 = createPool(factory, poolConfig);
        logger.info("Pool de conexiones inicializado para Server2");

        // Probar el pool solo si no se está saltando la prueba
        if (!skipPoolTest) {
          try {
            logger.debug(
              "Probando pool de Server2 con una conexión de prueba..."
            );
            const testConnection = await poolServer2.acquire();
            logger.info(
              "Conexión de prueba obtenida correctamente de pool Server2"
            );
            await poolServer2.release(testConnection);
            logger.info(
              "Conexión de prueba devuelta correctamente al pool Server2"
            );
          } catch (testError) {
            logger.warn(
              `Error en prueba de pool Server2: ${testError.message}`
            );
            // No fallamos la inicialización por un error en la prueba
          }
        } else {
          logger.info("Prueba de pool Server2 omitida por configuración");
        }
      } catch (server2Error) {
        logger.error("Error al inicializar pool para Server2:", server2Error);
      }
    } else if (!dbConfigs.server2) {
      logger.warn(
        "No se encontró configuración para Server2, omitiendo inicialización del pool"
      );
    } else if (poolServer2) {
      logger.debug("Pool para Server2 ya existe, omitiendo inicialización");
    }

    // Verificar si al menos un pool se inicializó correctamente
    if (poolServer1 || poolServer2) {
      logger.info("Al menos un pool de conexiones inicializado correctamente");
      return true;
    } else {
      logger.warn("No se pudo inicializar ningún pool de conexiones");
      return false;
    }
  } catch (error) {
    logger.error("Error al inicializar pools de conexiones:", error);
    throw error;
  }
}

async function connectToDB(serverKey = "server1", timeout = 60000) {
  try {
    // Inicializar pools si es necesario
    if (!poolServer1 && !poolServer2) {
      logger.info(
        `Pools no inicializados. Inicializando antes de obtener conexión para ${serverKey}...`
      );
      await initPools({ acquireTimeoutMillis: timeout });
    }

    const pool = serverKey === "server1" ? poolServer1 : poolServer2;

    if (!pool) {
      logger.error(`Pool de conexiones no disponible para ${serverKey}`);
      return null;
    }

    logger.debug(`Solicitando conexión para ${serverKey}...`);

    // Adquirir conexión del pool con timeout ampliado
    const connection = await pool.acquire();

    if (!connection) {
      logger.error(`Se obtuvo una conexión nula para ${serverKey}`);
      return null;
    }

    // Adjuntar metadatos para identificar el origen del pool
    connection._poolOrigin = serverKey;
    connection._acquiredAt = Date.now();

    // Registrar también en el Map global para redundancia
    connectionPoolMap.set(connection, serverKey);

    logger.debug(`Conexión obtenida para ${serverKey}`);
    return connection;
  } catch (error) {
    logger.error(`Error al conectar a la base de datos ${serverKey}:`, error);
    return null;
  }
}

async function closeConnection(connection) {
  if (!connection) {
    logger.debug("Intento de cerrar una conexión nula, ignorando");
    return;
  }

  try {
    // Usar el metadato para identificar el pool (primera opción)
    let poolKey = connection._poolOrigin;

    // Si no está disponible, intentar con el Map (segunda opción)
    if (!poolKey) {
      poolKey = connectionPoolMap.get(connection);
      if (!poolKey) {
        logger.warn(
          "No se pudo determinar el origen de la conexión, intentando con server1"
        );
        poolKey = "server1";
      }
    }

    const pool = poolKey === "server1" ? poolServer1 : poolServer2;

    if (pool) {
      // Calcular y registrar tiempo de uso de la conexión (opcional)
      if (connection._acquiredAt) {
        const usageTime = Date.now() - connection._acquiredAt;
        logger.debug(`Conexión usada durante ${usageTime}ms (${poolKey})`);
      }

      await pool.release(connection);
      // Limpiar referencias
      connectionPoolMap.delete(connection);
      logger.debug(`Conexión liberada correctamente (${poolKey})`);
    } else {
      logger.warn(
        `No se encontró pool para ${poolKey}, cerrando conexión directamente`
      );
      connection.close();
      connectionPoolMap.delete(connection);
    }
  } catch (error) {
    logger.error(`Error al liberar conexión:`, error);

    // Fallback - intentar con el otro pool si falla
    try {
      const otherPoolKey =
        connection._poolOrigin === "server1" ? "server2" : "server1";
      const otherPool = otherPoolKey === "server1" ? poolServer1 : poolServer2;

      if (otherPool) {
        logger.debug(
          `Intentando liberar conexión en pool alternativo (${otherPoolKey})...`
        );
        await otherPool.release(connection);
        connectionPoolMap.delete(connection);
        logger.debug(
          `Conexión liberada correctamente en pool alternativo (${otherPoolKey})`
        );
        return;
      }
    } catch (fallbackError) {
      logger.error(
        "Error al liberar conexión en pool alternativo:",
        fallbackError
      );
    }

    // Último recurso - intentar cerrar directamente
    try {
      connection.close();
      connectionPoolMap.delete(connection);
      logger.debug("Conexión cerrada directamente");
    } catch (closeError) {
      logger.error("Error al cerrar conexión directamente:", closeError);
    }
  }
}

async function closePools() {
  try {
    if (poolServer1) {
      logger.info("Cerrando pool Server1...");
      await poolServer1.drain();
      await poolServer1.clear();
      poolServer1 = null;
      logger.info("Pool de Server1 cerrado correctamente");
    }

    if (poolServer2) {
      logger.info("Cerrando pool Server2...");
      await poolServer2.drain();
      await poolServer2.clear();
      poolServer2 = null;
      logger.info("Pool de Server2 cerrado correctamente");
    }

    // Limpiar el Map de conexiones
    connectionPoolMap.clear();

    return true;
  } catch (error) {
    logger.error("Error al cerrar pools de conexiones:", error);
    return false;
  }
}

function getPoolsStatus() {
  const status = {};

  if (poolServer1) {
    status.server1 = {
      size: poolServer1.size,
      available: poolServer1.available,
      borrowed: poolServer1.borrowed,
      pending: poolServer1.pending,
      max: poolServer1.max,
      min: poolServer1.min,
    };
  }

  if (poolServer2) {
    status.server2 = {
      size: poolServer2.size,
      available: poolServer2.available,
      borrowed: poolServer2.borrowed,
      pending: poolServer2.pending,
      max: poolServer2.max,
      min: poolServer2.min,
    };
  }

  return status;
}

module.exports = {
  connectToDB,
  closeConnection,
  closePools,
  initPools,
  getPoolsStatus,
};
