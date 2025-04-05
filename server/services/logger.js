// services/logger.js
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize } = format;
const path = require("path");
const fs = require("fs");
const MongoDBTransport = require("./mongoDBTransport");

// Crear directorio de logs si no existe
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Formato personalizado
const myFormat = printf(({ level, message, timestamp, ...rest }) => {
  let restString = "";
  if (Object.keys(rest).length > 0) {
    restString = JSON.stringify(rest);
  }
  return `${timestamp} [${level}]: ${message} ${restString}`;
});

// Crear transporte MongoDB con manejo de errores
const createMongoTransport = () => {
  try {
    // Verificar si el transporte MongoDB está explícitamente deshabilitado
    if (process.env.DISABLE_MONGO_LOGS === "true") {
      console.log(
        "Transporte MongoDB para logs deshabilitado por configuración"
      );
      return null;
    }

    // Crear instancia con timeouts aumentados
    const mongoTransport = new MongoDBTransport({
      level: process.env.MONGO_LOG_LEVEL || "info",
      silent: false,
      handleExceptions: true,
    });

    // Capturar eventos de error para evitar que se propaguen
    mongoTransport.on("error", (error) => {
      console.error("Error en transporte MongoDB (no fatal):", error.message);
      // No hacer nada más, el error ya está manejado
    });

    return mongoTransport;
  } catch (error) {
    console.error("Error al crear transporte MongoDB para logs:", error);
    return null;
  }
};

// Configurar transportes
const configureTransports = () => {
  const transportsList = [
    // Log a consola
    new transports.Console({
      format: combine(colorize(), timestamp(), myFormat),
      level: process.env.CONSOLE_LOG_LEVEL || "debug",
    }),

    // Logs de info y niveles superiores
    new transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      level: process.env.FILE_LOG_LEVEL || "info",
    }),

    // Solo errores
    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ];

  // Agregar transporte MongoDB si está habilitado y MongoDB está configurado
  const mongodbUriExists =
    !!process.env.MONGO_URI ||
    !!(process.env.DB_USER && process.env.DB_PASS && process.env.DB_HOST);

  if (process.env.DISABLE_MONGO_LOGS !== "true" && mongodbUriExists) {
    const mongoTransport = createMongoTransport();
    if (mongoTransport) {
      // Agregar con try/catch para asegurar que si falla, no afecte al resto de transportes
      try {
        transportsList.push(mongoTransport);
        console.log("Transporte MongoDB agregado al logger");
      } catch (e) {
        console.error("Error al agregar transporte MongoDB al logger:", e);
      }
    }
  } else if (!mongodbUriExists) {
    console.log(
      "No se agregó transporte MongoDB porque no hay URI de MongoDB configurada"
    );
  }

  return transportsList;
};

// Crear logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp(), myFormat),
  transports: configureTransports(),
  exitOnError: false,
});

// Stream para Morgan
logger.stream = {
  write: function (message) {
    // Asegurarse de que el mensaje sea una cadena
    if (typeof message === "string") {
      logger.info(message.trim());
    } else {
      logger.info(String(message).trim());
    }
  },
};

// Helper para agregar información adicional al log
logger.withSource = function (source) {
  return {
    error: (message, ...args) => logger.error(message, { source, ...args }),
    warn: (message, ...args) => logger.warn(message, { source, ...args }),
    info: (message, ...args) => logger.info(message, { source, ...args }),
    debug: (message, ...args) => logger.debug(message, { source, ...args }),
  };
};

// Helper para logs del sistema
logger.system = logger.withSource("system");

// Helper para logs de base de datos
logger.db = logger.withSource("database");

module.exports = logger;
