const mongoose = require("mongoose");
const { Connection } = require("tedious");
const SqlService = require("./tediousService");
const DBConfig = require("../models/dbConfigModel");
const logger = require("./logger");

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

module.exports = {
  loadConfigurations,
  connectToDB,
  connectToMongoDB,
  closeConnection,
  getGlobalConnection,
  testDirectConnection,
  getDBConfig,
};
