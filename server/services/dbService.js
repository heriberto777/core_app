const mongoose = require("mongoose");
const sql = require("mssql");
const DBConfig = require("../models/dbConfigModel");
const logger = require("./logger");
const { normalizeString } = require("../utils/stringUtils");

/**
 * Obtiene la configuración de la base de datos desde MongoDB
 */
const getDBConfig = async (serverName) => {
  try {
    const config = await DBConfig.findOne({ serverName });
    if (!config)
      throw new Error(`⚠️ Configuración no encontrada para ${serverName}`);

    // console.log("Aqui obtenemos los datos de conexion -> ", config);

    // Tratar la contraseña como si viniera de un archivo .env con comillas
    const password = config.password ? `"${config.password}"` : "";
    // Ahora procesa la contraseña como lo hacía con .env
    const processedPassword = password.replace(/^"(.*)"$/, "$1"); // Elimina comillas

    console.log("Password original:", config.password);
    console.log("Password procesado:", processedPassword);

    return {
      user: config.user,
      password: normalizeString(config.password),
      server: config.instance
        ? `${config.host}\\${config.instance}`
        : config.host,
      database: config.database,
      port: config.port || 1433, // Puerto por defecto de SQL Server si no está definido
      options: {
        encrypt: config.options?.encrypt || false,
        trustServerCertificate: config.options?.trustServerCertificate || true,
        enableArithAbort: config.options?.enableArithAbort || true,
        connectionTimeout: 30000, // 30 segundos timeout para conexión
        requestTimeout: 60000, // 60 segundos timeout para solicitudes
      },
      pool: {
        max: 10, // Máximo de 10 conexiones en el pool
        min: 0, // Mínimo de 0 conexiones
        idleTimeoutMillis: 30000, // 30 segundos para timeout de conexiones inactivas
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
    // Usando directamente MONGO_URI como primera opción
    // Si no está disponible, verifica que todas las variables necesarias estén definidas
    let MONGO_URI = process.env.MONGO_URI;

    if (!MONGO_URI) {
      const DB_USER = process.env.DB_USER || "heriberto777";
      const DB_PASS = process.env.DB_PASS || "eli112910";
      const DB_HOST = process.env.DB_HOST || "localhost";
      const DB_PORT = process.env.DB_PORT || "27017";
      const DB_NAME = process.env.DB_NAME || "core_app";

      // Validar que tenemos al menos host y nombre de la base de datos
      if (!DB_HOST || !DB_NAME) {
        throw new Error(
          "Faltan variables de entorno para la conexión a MongoDB"
        );
      }

      // Construir la URI con los valores disponibles
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
    if (typeof logger.error === "function") {
      logger.error("❌ Error al conectar a MongoDB:", error);
    } else {
      console.error("❌ Error al conectar a MongoDB:", error);
    }
    throw error;
  }
};

/**
 * Carga las configuraciones desde MongoDB al inicio
 */
const loadConfigurations = async () => {
  try {
    // Primero establecer la conexión a MongoDB
    await connectToMongoDB();

    // Asegurar que siempre obtenemos configuraciones frescas
    global.SQL_CONFIG = {
      server1: await getDBConfig("server1"),
      server2: await getDBConfig("server2"),
    };

    // Verificar que las configuraciones son válidas
    if (!global.SQL_CONFIG.server1 || !global.SQL_CONFIG.server2) {
      throw new Error(
        "❌ No se pudieron cargar todas las configuraciones de bases de datos."
      );
    }

    logger.info("✅ Configuración de bases de datos cargada en memoria.");

    // Inicializar los pools globales solo si no existen
    if (!global.server1Pool) {
      global.server1Pool = null;
    }
    if (!global.server2Pool) {
      global.server2Pool = null;
    }
  } catch (error) {
    if (typeof logger.error === "function") {
      logger.error("❌ Error cargando configuraciones:", error);
    } else {
      console.error("❌ Error cargando configuraciones:", error);
    }
    throw error;
  }
};

/**
 * Verifica si un pool está activo y utilizable
 */
const isPoolActive = (pool) => {
  return pool && pool.connected && !pool.closed;
};

/**
 * Cierra un pool de forma segura
 */
const closePool = async (serverKey) => {
  try {
    const pool = global[`${serverKey}Pool`];
    if (isPoolActive(pool)) {
      await pool.close();
      global[`${serverKey}Pool`] = null;
      logger.info(`✅ Conexión a ${serverKey} cerrada correctamente`);
    }
  } catch (error) {
    logger.error(`❌ Error al cerrar la conexión a ${serverKey}:`, error);
    // Resetear la variable global en caso de error
    global[`${serverKey}Pool`] = null;
  }
};

/**
 * Conecta a una base de datos SQL Server usando una conexión dedicada
 * para el proceso actual, no la global
 */
const connectToDB = async (serverKey) => {
  try {
    // Verificar que tenemos la configuración
    if (!global.SQL_CONFIG || !global.SQL_CONFIG[serverKey]) {
      throw new Error(
        `❌ Configuración de ${serverKey} no está cargada en memoria.`
      );
    }

    // Crear un nuevo pool de conexión específico para esta solicitud
    const config = global.SQL_CONFIG[serverKey];
    const pool = new sql.ConnectionPool(config);

    try {
      await pool.connect();
      logger.debug(`✅ Nueva conexión a ${serverKey} establecida`);
      return pool;
    } catch (connError) {
      logger.error(`❌ Error al conectar a ${serverKey}:`, connError);

      // Si hay un error de conexión, intentamos cerrar el pool
      try {
        if (pool && pool.connected) {
          await pool.close();
        }
      } catch (closeError) {
        logger.error(
          `Error adicional al cerrar pool fallido de ${serverKey}:`,
          closeError
        );
      }

      throw new Error(
        `No se pudo conectar a ${serverKey}: ${connError.message}`
      );
    }
  } catch (err) {
    logger.error(`❌ Error en proceso de conexión a ${serverKey}:`, err);
    throw err;
  }
};

/**
 * Obtiene o crea un pool global para un servidor
 * Usar solo para conexiones que se mantienen a lo largo de toda la aplicación
 */
const getGlobalPool = async (serverKey) => {
  try {
    if (!global.SQL_CONFIG || !global.SQL_CONFIG[serverKey]) {
      throw new Error(
        `❌ Configuración de ${serverKey} no está cargada en memoria.`
      );
    }

    // Verificar si el pool global existe y está activo
    if (!isPoolActive(global[`${serverKey}Pool`])) {
      // Si no existe o no está activo, cerrarlo por si acaso y crear uno nuevo
      if (global[`${serverKey}Pool`]) {
        try {
          await global[`${serverKey}Pool`].close();
        } catch (e) {
          logger.warn(
            `Error al cerrar pool global existente de ${serverKey}:`,
            e
          );
        }
      }

      global[`${serverKey}Pool`] = await new sql.ConnectionPool(
        global.SQL_CONFIG[serverKey]
      ).connect();

      logger.info(`✅ Conexión global a ${serverKey} establecida`);
    }

    return global[`${serverKey}Pool`];
  } catch (err) {
    logger.error(`❌ Error conectando al pool global de ${serverKey}:`, err);
    throw err;
  }
};

module.exports = {
  loadConfigurations,
  connectToDB,
  connectToMongoDB,
  closePool,
  getGlobalPool,
};
