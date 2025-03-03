const mongoose = require("mongoose");
const { Connection, Request } = require("tedious");
const DBConfig = require("../models/dbConfigModel");
const logger = require("./logger");
const { normalizeString } = require("../utils/stringUtils");

const {
  SERVER2_USER,
  SERVER2_PASS,
  SERVER2_HOST,
  SERVER2_INSTANCE,
  SERVER2_DB,
} = process.env;

/**
 * Obtiene la configuración de la base de datos desde MongoDB
 */
const getDBConfig = async (serverName) => {
  try {
    const config = await DBConfig.findOne({ serverName });
    if (!config)
      throw new Error(`⚠️ Configuración no encontrada para ${serverName}`);

    // Tratar la contraseña como si viniera de un archivo .env con comillas
    const password = config.password ? `"${config.password}"` : "";
    const processedPassword = password.replace(/^"(.*)"$/, "$1");

    // console.log("Password original:", config.password);
    // console.log("Password procesado:", processedPassword);

    return {
      user: config.user,
      password: normalizeString(config.password),
      server: config.host,
      database: config.database,
      instance: config.instance,
      port: config.port || 1433, // Puerto por defecto de SQL Server
      options: {
        encrypt: config.options?.encrypt || false,
        trustServerCertificate: config.options?.trustServerCertificate || true,
        connectionTimeout: config.options?.connectionTimeout || 30000,
        requestTimeout: config.options?.requestTimeout || 60000,
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
 * Crea una conexión usando tedious
 */
const createTediousConnection = (config) => {
  return new Promise((resolve, reject) => {
    const connection = new Connection({
      server: config.server,
      authentication: {
        type: "default",
        options: {
          userName: config.user,
          password: config.password,
        },
      },
      options: {
        database: config.database,
        port: config.port,
        encrypt: config.options.encrypt,
        trustServerCertificate: config.options.trustServerCertificate,
        connectionTimeout: config.options.connectionTimeout,
        requestTimeout: config.options.requestTimeout,
        rowCollectionOnRequestCompletion: true,
      },
    });

    connection.on("connect", (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(connection);
      }
    });

    connection.on("error", (err) => {
      reject(err);
    });
  });
};

/**
 * Cierra una conexión de forma segura
 */
const closeConnection = async (serverKey) => {
  try {
    const connection = global[`${serverKey}Connection`];
    if (connection && connection.connected) {
      connection.close();
      global[`${serverKey}Connection`] = null;
      logger.info(`✅ Conexión a ${serverKey} cerrada correctamente`);
    }
  } catch (error) {
    logger.error(`❌ Error al cerrar la conexión a ${serverKey}:`, error);
    global[`${serverKey}Connection`] = null;
  }
};

/**
 * Conecta a una base de datos SQL Server usando tedious
 * para el proceso actual (no global)
 */
const connectToDB = async (serverKey) => {
  try {
    if (!global.SQL_CONFIG || !global.SQL_CONFIG[serverKey]) {
      throw new Error(
        `❌ Configuración de ${serverKey} no está cargada en memoria.`
      );
    }
    const config = global.SQL_CONFIG[serverKey];
    const connection = await createTediousConnection(config);
    logger.debug(`✅ Nueva conexión a ${serverKey} establecida usando tedious`);
    return connection;
  } catch (err) {
    logger.error(
      `❌ Error en proceso de conexión a ${serverKey} usando tedious:`,
      err
    );
    throw err;
  }
};

/**
 * Obtiene o crea una conexión global para un servidor usando tedious
 */
const getGlobalConnection = async (serverKey) => {
  try {
    if (!global.SQL_CONFIG || !global.SQL_CONFIG[serverKey]) {
      throw new Error(
        `❌ Configuración de ${serverKey} no está cargada en memoria.`
      );
    }

    if (!global[`${serverKey}Connection`]) {
      global[`${serverKey}Connection`] = await createTediousConnection(
        global.SQL_CONFIG[serverKey]
      );
      logger.info(
        `✅ Conexión global a ${serverKey} establecida usando tedious`
      );
    }

    return global[`${serverKey}Connection`];
  } catch (err) {
    logger.error(
      `❌ Error conectando a la conexión global de ${serverKey} usando tedious:`,
      err
    );
    throw err;
  }
};

/**
 * Función de prueba para comparar la conexión usando datos de .env versus MongoDB,
 * usando tedious.
 */
const testEnvBasedConnection = async () => {
  try {
    console.log("⚙️ Ejecutando prueba de conexión alternativa con tedious...");

    const envBasedConfig = {
      user: SERVER2_USER,
      password: SERVER2_PASS, // Contraseña exacta del .env
      server: SERVER2_HOST,
      database: SERVER2_DB,
      instance: SERVER2_INSTANCE,
      port: 1433, // Ajusta el puerto si es necesario
      options: {
        encrypt: true,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 60000,
      },
    };

    console.log(
      "Probando conexión con configuración hardcoded basada en .env usando tedious..."
    );
    const connection = await createTediousConnection(envBasedConfig);
    console.log("✅ Conexión exitosa con configuración .env usando tedious!");
    connection.close();

    // Prueba usando la contraseña almacenada en MongoDB (sin procesar)
    const dbConfig = await DBConfig.findOne({ serverName: "server2" });
    envBasedConfig.password = dbConfig.password;
    console.log(
      "Probando con password directo de MongoDB sin procesar usando tedious..."
    );
    const connection2 = await createTediousConnection(envBasedConfig);
    console.log(
      "✅ Conexión exitosa con password directo de MongoDB usando tedious!"
    );
    connection2.close();

    // Prueba con la contraseña normalizada
    envBasedConfig.password = normalizeString(dbConfig.password);
    console.log(
      "Probando con password normalizado de MongoDB usando tedious..."
    );
    const connection3 = await createTediousConnection(envBasedConfig);
    console.log("✅ Conexión exitosa con password normalizado usando tedious!");
    connection3.close();

    return true;
  } catch (error) {
    console.error(
      "❌ Error en prueba de conexión alternativa usando tedious:",
      error
    );
    return false;
  }
};

module.exports = {
  loadConfigurations,
  connectToDB,
  connectToMongoDB,
  closeConnection,
  getGlobalConnection,
  testEnvBasedConnection,
};
