const mongoose = require("mongoose");
const { Connection } = require("tedious");
const { SqlService } = require("./tediousService");
const DBConfig = require("../models/dbConfigModel");
const logger = require("./logger");
const ConnectionPool = require("tedious-connection-pool");

// Configuración del pool
const poolConfig = {
  min: 2, // Mínimo de conexiones en el pool
  max: 10, // Máximo de conexiones en el pool
  log: false, // Desactivar logs internos del pool
  acquireTimeout: 30000, // Timeout para adquirir conexión (30s)
  idleTimeoutMillis: 300000, // Timeout de conexiones inactivas (5min)
  retryDelay: 5000, // Delay entre reintentos (5s)
};

// Objeto para almacenar los pools
const pools = {};

/**
 * Obtiene la configuración de la base de datos desde MongoDB
 */
const getDBConfig = async (serverName) => {
  try {
    const config = await DBConfig.findOne({ serverName });
    if (!config)
      throw new Error(`⚠️ Configuración no encontrada para ${serverName}`);

    return {
      server: config.host,
      authentication: {
        type: "default",
        options: {
          userName: config.user,
          password: config.password,
        },
      },
      options: {
        database: config.database,
        instanceName: config.instance || undefined,
        encrypt: config.options?.encrypt || false,
        trustServerCertificate: config.options?.trustServerCertificate || true,
        connectionTimeout: config.options?.connectionTimeout || 30000,
        requestTimeout: config.options?.requestTimeout || 60000,
        rowCollectionOnRequestCompletion: true,
      },
    };
  } catch (error) {
    logger.error(
      `⚠️ Error obteniendo configuración para ${serverName}:`,
      error
    );
    return null;
  }
};

/**
 * Conecta a MongoDB
 */
const connectToMongoDB = async () => {
  try {
    let MONGO_URI = process.env.MONGO_URI;

    if (!MONGO_URI) {
      const DB_USER = process.env.DB_USER || "heriberto777";
      const DB_PASS = process.env.DB_PASS || "eli112910";
      const DB_HOST = process.env.DB_HOST || "localhost";
      const DB_PORT = process.env.DB_PORT || "27017";
      const DB_NAME = process.env.DB_NAME || "core_app";

      if (!DB_HOST || !DB_NAME) {
        throw new Error(
          "Faltan variables de entorno para la conexión a MongoDB"
        );
      }

      if (DB_USER && DB_PASS) {
        MONGO_URI = `mongodb://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
      } else {
        MONGO_URI = `mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`;
      }
    }

    logger.info(
      `Intentando conectar a MongoDB con URI: ${MONGO_URI.replace(
        /:[^:]*@/,
        ":****@"
      )}`
    );

    await mongoose.connect(MONGO_URI, {
      authSource: "admin",
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });

    logger.info("✅ Conexión a MongoDB establecida.");
  } catch (error) {
    logger.error("❌ Error al conectar a MongoDB:", error);
    throw error;
  }
};

/**
 * Inicializa los pools de conexiones
 */
function initPools() {
  if (!global.SQL_CONFIG) {
    logger.warn("SQL_CONFIG no está definido, no se pueden inicializar pools");
    return false;
  }

  try {
    // Crear pool para server1
    if (global.SQL_CONFIG.server1) {
      pools.server1 = new ConnectionPool(poolConfig, global.SQL_CONFIG.server1);

      pools.server1.on("error", (err) => {
        logger.error("Error en pool de server1:", err);
      });
    }

    // Crear pool para server2
    if (global.SQL_CONFIG.server2) {
      pools.server2 = new ConnectionPool(poolConfig, global.SQL_CONFIG.server2);

      pools.server2.on("error", (err) => {
        logger.error("Error en pool de server2:", err);
      });
    }

    logger.info("✅ Pools de conexiones inicializados correctamente");
    return true;
  } catch (error) {
    logger.error("❌ Error al inicializar pools de conexiones:", error);
    return false;
  }
}

/**
 * Cierra todos los pools de conexiones
 */
function closePools() {
  Object.keys(pools).forEach((serverKey) => {
    if (pools[serverKey]) {
      try {
        pools[serverKey].drain();
        logger.info(`Pool para ${serverKey} cerrado correctamente`);
      } catch (error) {
        logger.error(`Error al cerrar pool para ${serverKey}:`, error);
      }
    }
  });
}

/**
 * Obtiene una conexión del pool
 * @param {string} serverKey - Clave del servidor (server1 o server2)
 * @returns {Promise<Connection>} - Conexión del pool
 */
async function getPoolConnection(serverKey) {
  return new Promise((resolve, reject) => {
    if (!pools[serverKey]) {
      return reject(new Error(`Pool para ${serverKey} no está inicializado`));
    }

    pools[serverKey].acquire((err, connection) => {
      if (err) {
        logger.error(`Error al obtener conexión de ${serverKey}:`, err);
        return reject(err);
      }

      // Agregar un manejador de error a la conexión
      connection.on("error", (err) => {
        logger.error(`Error en conexión de ${serverKey}:`, err);
      });

      logger.debug(`Conexión obtenida del pool para ${serverKey}`);

      // Marcar la conexión como proveniente del pool
      connection._pooled = true;

      resolve(connection);
    });
  });
}

/**
 * Devuelve una conexión al pool
 * @param {string} serverKey - Clave del servidor (server1 o server2)
 * @param {Connection} connection - Conexión a devolver
 */
function releasePoolConnection(serverKey, connection) {
  if (!pools[serverKey]) {
    logger.warn(
      `Pool para ${serverKey} no está inicializado, no se puede liberar la conexión`
    );
    return;
  }

  if (!connection._pooled) {
    logger.warn(`La conexión no parece provenir del pool para ${serverKey}`);
  }

  try {
    pools[serverKey].release(connection);
    logger.debug(`Conexión devuelta al pool para ${serverKey}`);
  } catch (error) {
    logger.warn(`Error al devolver conexión al pool para ${serverKey}:`, error);
  }
}

/**
 * Carga las configuraciones desde MongoDB al inicio
 */
const loadConfigurations = async () => {
  try {
    await connectToMongoDB();

    global.SQL_CONFIG = {
      server1: await getDBConfig("server1"),
      server2: await getDBConfig("server2"),
    };

    if (!global.SQL_CONFIG.server1 || !global.SQL_CONFIG.server2) {
      throw new Error(
        "❌ No se pudieron cargar todas las configuraciones de bases de datos."
      );
    }

    logger.info("✅ Configuración de bases de datos cargada en memoria.");

    // Inicializar los pools de conexiones
    initPools();

    // Inicializar las conexiones globales si no existen
    if (!global.server1Connection) {
      global.server1Connection = null;
    }
    if (!global.server2Connection) {
      global.server2Connection = null;
    }
  } catch (error) {
    logger.error("❌ Error cargando configuraciones:", error);
    throw error;
  }
};

/**
 * Conecta a una base de datos SQL Server usando Tedious directamente
 */
const connectToDB = async (serverKey, timeoutMs = 30000) => {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Timeout al conectar a ${serverKey} después de ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

    try {
      if (!global.SQL_CONFIG || !global.SQL_CONFIG[serverKey]) {
        clearTimeout(timeoutId);
        reject(
          new Error(
            `❌ Configuración de ${serverKey} no está cargada en memoria.`
          )
        );
        return;
      }

      const config = global.SQL_CONFIG[serverKey];

      // Verificar campos críticos
      if (!config.server) {
        clearTimeout(timeoutId);
        reject(
          new Error(`Configuración de ${serverKey} no tiene server definido`)
        );
        return;
      }

      if (
        !config.authentication ||
        !config.authentication.options ||
        !config.authentication.options.userName ||
        !config.authentication.options.password
      ) {
        clearTimeout(timeoutId);
        reject(
          new Error(
            `Configuración de ${serverKey} no tiene credenciales válidas`
          )
        );
        return;
      }

      // Imprimir información de diagnóstico
      logger.debug(`Intentando conectar a ${serverKey}:`, {
        server: config.server,
        user: config.authentication.options.userName,
        database: config.options.database,
        instanceName: config.options.instanceName || "N/A",
      });

      // Usar variables de entorno como fallback para server2
      if (serverKey === "server2" && !config.server) {
        logger.warn(
          `⚠️ Usando variables de entorno para server2 como fallback`
        );
        config.server = process.env.SERVER2_HOST;
        config.authentication.options.userName = process.env.SERVER2_USER;
        config.authentication.options.password = process.env.SERVER2_PASS;
        config.options.database = process.env.SERVER2_DB;
        config.options.instanceName = process.env.SERVER2_INSTANCE;
      }

      try {
        // Establecer conexión directamente con Tedious
        const connection = new Connection(config);

        connection.on("connect", async (err) => {
          clearTimeout(timeoutId);

          if (err) {
            logger.error(`Error al conectar a ${serverKey}:`, err);
            reject(err);
            return;
          }

          logger.info(
            `✅ Conexión establecida a ${serverKey} usando Tedious directo`
          );

          // Verificar con consulta sencilla
          try {
            const testResult = await SqlService.query(
              connection,
              "SELECT @@VERSION as version"
            );
            logger.debug(`Prueba de conexión a ${serverKey} exitosa:`, {
              version:
                testResult.recordset[0]?.version?.substring(0, 50) ||
                "No version info",
            });
          } catch (testError) {
            logger.warn(
              `La conexión a ${serverKey} se estableció pero falló la prueba:`,
              testError
            );
          }

          resolve(connection);
        });

        connection.on("error", (err) => {
          logger.error(`Error en conexión a ${serverKey}:`, err);
          if (!timeoutId._destroyed) {
            clearTimeout(timeoutId);
            reject(err);
          }
        });

        connection.connect();
      } catch (connErr) {
        clearTimeout(timeoutId);
        logger.error(`Error al crear conexión a ${serverKey}:`, connErr);
        reject(connErr);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      logger.error(`Error en proceso de conexión a ${serverKey}:`, err);
      reject(err);
    }
  });
};

/**
 * Cierra una conexión de forma segura
 */
const closeConnection = async (connection) => {
  if (connection) {
    return new Promise((resolve) => {
      try {
        connection.close();
        logger.info(`Conexión cerrada correctamente`);
      } catch (error) {
        logger.error(`Error al cerrar conexión:`, error);
      }
      resolve();
    });
  }
};

/**
 * Obtiene una conexión del pool o crea una nueva si no hay pool disponible
 * @param {string} serverKey - Clave del servidor (server1 o server2)
 * @param {number} timeoutMs - Timeout en milisegundos
 * @returns {Promise<Connection>} - Conexión
 */
const getConnection = async (serverKey, timeoutMs = 30000) => {
  try {
    // Intentar obtener conexión del pool
    return await getPoolConnection(serverKey);
  } catch (poolError) {
    logger.warn(
      `No se pudo obtener conexión del pool para ${serverKey}, intentando conexión directa:`,
      poolError.message
    );

    // Fallback a conexión directa (tu método actual)
    return await connectToDB(serverKey, timeoutMs);
  }
};

/**
 * Libera o cierra una conexión dependiendo de su origen
 * @param {Connection} connection - Conexión a liberar o cerrar
 * @param {string} serverKey - Clave del servidor
 */
const releaseConnection = async (connection, serverKey) => {
  if (!connection) return;

  try {
    // Verificar si la conexión proviene del pool
    if (connection._pooled) {
      // Devolver al pool
      releasePoolConnection(serverKey, connection);
    } else {
      // Cerrar conexión directa
      await closeConnection(connection);
    }
  } catch (error) {
    logger.error(`Error al liberar conexión para ${serverKey}:`, error);
  }
};

/**
 * Obtiene o crea una conexión global para un servidor
 */
const getGlobalConnection = async (serverKey) => {
  try {
    if (!global.SQL_CONFIG || !global.SQL_CONFIG[serverKey]) {
      throw new Error(
        `❌ Configuración de ${serverKey} no está cargada en memoria.`
      );
    }

    if (!global[`${serverKey}Connection`]) {
      global[`${serverKey}Connection`] = await connectToDB(serverKey);
      logger.info(`✅ Conexión global a ${serverKey} establecida`);
    }

    return global[`${serverKey}Connection`];
  } catch (err) {
    logger.error(
      `❌ Error conectando a la conexión global de ${serverKey}:`,
      err
    );
    throw err;
  }
};

/**
 * Ejecuta una consulta SQL utilizando una conexión del pool
 * @param {string} serverKey - Clave del servidor
 * @param {string} query - Consulta SQL
 * @param {Object} params - Parámetros
 * @returns {Promise<Object>} - Resultado de la consulta
 */
const executePoolQuery = async (serverKey, query, params = {}) => {
  let connection = null;

  try {
    // Obtener conexión del pool
    connection = await getConnection(serverKey);

    // Ejecutar la consulta
    const result = await SqlService.query(connection, query, params);

    // Devolver la conexión al pool o cerrarla
    await releaseConnection(connection, serverKey);

    return result;
  } catch (error) {
    logger.error(`Error en executePoolQuery para ${serverKey}:`, error);

    // En caso de error, asegurarse de liberar la conexión
    if (connection) {
      await releaseConnection(connection, serverKey);
    }

    throw error;
  }
};

/**
 * Prueba una conexión directa
 */
const testDirectConnection = async (serverKey = "server2") => {
  try {
    const connection = await connectToDB(serverKey);
    const result = await SqlService.query(
      connection,
      "SELECT @@VERSION as version"
    );

    logger.info(`✅ Prueba directa exitosa para ${serverKey}`);

    await closeConnection(connection);

    return {
      success: true,
      server: serverKey,
      version: result.recordset[0]?.version || "Unknown",
    };
  } catch (error) {
    logger.error(`❌ Prueba directa fallida para ${serverKey}:`, error);
    throw error;
  }
};

/**
 * Prueba una conexión usando el pool
 */
const testPoolConnection = async (serverKey = "server2") => {
  try {
    const result = await executePoolQuery(
      serverKey,
      "SELECT @@VERSION as version"
    );

    logger.info(`✅ Prueba de pool exitosa para ${serverKey}`);

    return {
      success: true,
      server: serverKey,
      version: result.recordset[0]?.version || "Unknown",
      fromPool: true,
    };
  } catch (error) {
    logger.error(`❌ Prueba de pool fallida para ${serverKey}:`, error);
    throw error;
  }
};

/**
 * Obtiene el estado de los pools de conexiones
 */
const getPoolsStatus = () => {
  if (!pools) {
    return { error: "Pools no inicializados" };
  }

  const status = {};

  try {
    Object.keys(pools).forEach((serverKey) => {
      if (!pools[serverKey]) {
        status[serverKey] = { status: "no inicializado" };
        return;
      }

      // Verificar si los métodos existen antes de llamarlos
      status[serverKey] = {
        status: "activo",
        size:
          typeof pools[serverKey].getPoolSize === "function"
            ? pools[serverKey].getPoolSize()
            : "n/a",
        // Compatibilidad con diferentes versiones de pool de conexiones
        available:
          typeof pools[serverKey].availableObjectsCount === "function"
            ? pools[serverKey].availableObjectsCount()
            : pools[serverKey].available || "n/a",
        used:
          typeof pools[serverKey].getPoolSize === "function" &&
          typeof pools[serverKey].availableObjectsCount === "function"
            ? pools[serverKey].getPoolSize() -
              pools[serverKey].availableObjectsCount()
            : pools[serverKey].borrowed || "n/a",
        pending:
          typeof pools[serverKey].waitingClientsCount === "function"
            ? pools[serverKey].waitingClientsCount()
            : pools[serverKey].pending || "n/a",
      };
    });
  } catch (error) {
    status.error = `Error obteniendo estado: ${error.message}`;
  }

  return status;
};

module.exports = {
  loadConfigurations,
  connectToDB,
  connectToMongoDB,
  closeConnection,
  getGlobalConnection,
  testDirectConnection,
  getDBConfig,
  // Funciones del pool
  initPools,
  closePools,
  getPoolConnection,
  releasePoolConnection,
  getConnection,
  releaseConnection,
  executePoolQuery,
  testPoolConnection,
  getPoolsStatus,
};
