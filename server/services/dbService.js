const mongoose = require("mongoose");
const { Connection, Request } = require("tedious");
const { wrapConnection } = require("./tediousAdapter"); // Importar el adaptador
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
 * Obtiene la configuración de la base de datos desde MongoDB en formato tedious nativo
 */
const getDBConfig = async (serverName) => {
  try {
    const config = await DBConfig.findOne({ serverName });
    if (!config)
      throw new Error(`⚠️ Configuración no encontrada para ${serverName}`);

    // Construir directamente en formato tedious
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
        connectionTimeout: config.options?.connectionTimeout || 15000,
        requestTimeout: config.options?.requestTimeout || 30000,
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
 * Crea una conexión usando tedious con manejo de timeout mejorado
 * y soporte apropiado para instanceName
 */
const createTediousConnection = (config, timeoutMs = 10000) => {
  return new Promise((resolve, reject) => {
    // Si hay cualquier error, establecer un timeout de seguridad
    const connectionTimeoutId = setTimeout(() => {
      // Si llegamos aquí, la conexión nunca emitió un evento 'connect' o 'error'
      logger.error(
        `⚠️ Timeout excedido (${timeoutMs}ms) al conectar a ${config.server}`
      );
      reject(
        new Error(
          `Timeout al conectar a ${config.server} después de ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

    try {
      // Verificar que la configuración no tiene port y instanceName al mismo tiempo
      if (config.options.port && config.options.instanceName) {
        logger.warn(
          `⚠️ Port y instanceName son mutuamente excluyentes. Eliminando port.`
        );
        delete config.options.port;
      }

      // Debuggear la configuración para diagnóstico
      logger.debug(`Configuración de conexión para ${config.server}:`, {
        user: config.authentication.options.userName,
        server: config.server,
        database: config.options.database,
        instanceName: config.options.instanceName || "N/A",
      });

      logger.debug(`Intentando conectar a ${config.server} con tedious...`);

      const connection = new Connection(config);

      // Manejar eventos de conexión
      connection.on("connect", (err) => {
        clearTimeout(connectionTimeoutId);

        if (err) {
          logger.error(
            `Error en evento connect: ${err.message || JSON.stringify(err)}`
          );
          reject(err);
        } else {
          logger.info(`✅ Conexión establecida a ${config.server}`);
          // Envolver la conexión con nuestro adaptador
          const wrappedConnection = wrapConnection(connection);
          resolve(wrappedConnection);
        }
      });

      connection.on("error", (err) => {
        clearTimeout(connectionTimeoutId);
        logger.error(`Error en conexión a ${config.server}: ${err.message}`);
        reject(err);
      });

      // Manejar específicamente error de timeout
      connection.on("connectTimeout", () => {
        clearTimeout(connectionTimeoutId);
        logger.error(`Timeout de conexión a ${config.server}`);
        reject(new Error(`Timeout al conectar a ${config.server}`));
      });

      // Desconexión inesperada
      connection.on("end", () => {
        logger.warn(`Conexión a ${config.server} cerrada inesperadamente`);
      });

      // Iniciar la conexión
      connection.connect();
    } catch (error) {
      clearTimeout(connectionTimeoutId);
      logger.error(`Error creando conexión: ${error.message}`);
      reject(error);
    }
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
 * Versión mejorada con timeout y mejor manejo de instancias SQL
 */
const connectToDB = async (serverKey, timeoutMs = 30000) => {
  // Aumento a 30 segundos
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

      // Verificar campos críticos con mejor diagnóstico
      if (!config.server) {
        clearTimeout(timeoutId);
        reject(
          new Error(
            `Configuración de ${serverKey} no tiene server definido. Config: ${JSON.stringify(
              config,
              (key, value) =>
                key === "password" || key === "userName" ? "***" : value
            )}`
          )
        );
        return;
      }

      // ... resto del código sin cambios ...

      try {
        const connection = await createTediousConnection(config, timeoutMs);
        clearTimeout(timeoutId);
        logger.info(
          `✅ Nueva conexión a ${serverKey} establecida usando tedious`
        );

        // Ejecutar una consulta simple para verificar que la conexión realmente funciona
        try {
          const request = connection.request();
          request.timeout = 15000; // 15 segundos para esta prueba
          const result = await request.query("SELECT @@VERSION as version");
          logger.debug(`Prueba de conexión a ${serverKey} exitosa:`, {
            version:
              result.recordset[0]?.version?.substring(0, 50) ||
              "No version info",
          });
        } catch (testError) {
          logger.warn(
            `⚠️ La conexión a ${serverKey} se estableció pero falló la prueba:`,
            testError.message
          );

          // Si la prueba falla, intenta cerrar y reintentar una vez
          try {
            await connection.close();
          } catch (e) {}

          // Reintentar con configuración alternativa
          logger.info(
            `🔄 Reintentando conexión a ${serverKey} con configuración alternativa...`
          );
          const altConfig = { ...config };

          // Si hay instanceName, intentar sin él
          if (altConfig.options.instanceName) {
            delete altConfig.options.instanceName;
            logger.debug(`Reintento sin instanceName`);
          }

          // O si hay puerto, intentar sin él
          if (altConfig.options.port) {
            delete altConfig.options.port;
            logger.debug(`Reintento sin port`);
          }

          const altConnection = await createTediousConnection(
            altConfig,
            timeoutMs
          );
          logger.info(`✅ Conexión alternativa a ${serverKey} establecida`);
          resolve(altConnection);
          return;
        }

        resolve(connection);
      } catch (connErr) {
        clearTimeout(timeoutId);
        throw connErr; // Re-lanzar para que el manejador de errores lo capture
      }
    } catch (err) {
      clearTimeout(timeoutId);
      logger.error(
        `❌ Error en proceso de conexión a ${serverKey} usando tedious:`,
        err
      );
      reject(err);
    }
  });
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
 * Prueba conexión directa a SQL Server sin usar adaptadores.
 * Útil para diagnóstico cuando el adaptador no funciona pero sabemos que
 * tedious debería funcionar.
 */
const testDirectConnection = async (serverKey = "server2") => {
  return new Promise((resolve, reject) => {
    let config;

    // Usar configuración explícita para server2 (la que causa problemas)
    if (serverKey === "server2") {
      const server = process.env.SERVER2_HOST;
      const user = process.env.SERVER2_USER;
      const password = process.env.SERVER2_PASS;
      const database = process.env.SERVER2_DB;
      const instanceName = process.env.SERVER2_INSTANCE;

      // Verificar que tenemos todos los datos necesarios
      if (!server || !user || !password || !database) {
        return reject(
          new Error("Faltan variables de entorno para la conexión directa")
        );
      }

      // Usar configuración similar a la de tu ejemplo que funciona
      config = {
        server,
        authentication: {
          type: "default",
          options: {
            userName: user,
            password: password,
          },
        },
        options: {
          database,
          trustServerCertificate: true,
          rowCollectionOnRequestCompletion: true,
        },
      };

      // Añadir instanceName solo si está definido
      if (instanceName) {
        config.options.instanceName = instanceName;
        console.log(`Usando instanceName: ${instanceName}`);
      }
    } else {
      // Para otras conexiones, usar la configuración de MongoDB adaptada
      if (!global.SQL_CONFIG || !global.SQL_CONFIG[serverKey]) {
        return reject(
          new Error(`Configuración para ${serverKey} no disponible`)
        );
      }

      // Ya está en formato correcto desde la modificación de getDBConfig
      config = global.SQL_CONFIG[serverKey];
    }

    console.log(`Intentando conexión directa a ${config.server}...`);

    // Usar la conexión directa de tedious (sin adaptador)
    const connection = new Connection(config);

    connection.on("connect", function (err) {
      if (err) {
        console.error(`Error en conexión directa a ${config.server}:`, err);
        reject(err);
      } else {
        console.log(`✅ Conexión directa establecida a ${config.server}`);

        // Ejecutar una consulta simple para verificar
        const request = new Request("SELECT @@VERSION as version", function (
          err,
          rowCount,
          rows
        ) {
          if (err) {
            console.error("Error en consulta directa:", err);
            reject(err);
          } else {
            console.log(`Consulta directa exitosa: ${rowCount} filas`);

            // Extraer información de la versión
            let version = "Desconocida";
            if (rows && rows.length > 0 && rows[0] && rows[0].length > 0) {
              version = rows[0][0].value;
            }

            console.log(`Versión SQL Server: ${version}`);

            connection.close();
            resolve({
              success: true,
              server: config.server,
              version: version,
            });
          }
        });

        // Procesar los resultados (si queremos ver más detalles)
        request.on("row", (columns) => {
          let rowData = {};
          columns.forEach((column) => {
            rowData[column.metadata.colName] = column.value;
          });
          console.log("Fila recibida:", rowData);
        });

        connection.execSql(request);
      }
    });

    // Manejar errores
    connection.on("error", (err) => {
      console.error(`Error en la conexión directa a ${config.server}:`, err);
      reject(err);
    });

    // Iniciar la conexión
    connection.connect();
  });
};

/**
 * Función de prueba para comparar la conexión usando datos de .env versus MongoDB,
 * usando tedious.
 */
const testEnvBasedConnection = async () => {
  try {
    console.log("⚙️ Ejecutando prueba de conexión alternativa con tedious...");

    const envBasedConfig = {
      server: SERVER2_HOST,
      authentication: {
        type: "default",
        options: {
          userName: SERVER2_USER,
          password: SERVER2_PASS,
        },
      },
      options: {
        database: SERVER2_DB,
        instanceName: SERVER2_INSTANCE,
        encrypt: true,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 60000,
        rowCollectionOnRequestCompletion: true,
      },
    };

    console.log(
      "Probando conexión con configuración hardcoded basada en .env usando tedious..."
    );
    const connection = await createTediousConnection(envBasedConfig);
    console.log("✅ Conexión exitosa con configuración .env usando tedious!");
    connection.close();

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
  testDirectConnection,
};
