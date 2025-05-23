// services/logger.js - Usar ESTE archivo (el completo)
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
    if (process.env.DISABLE_MONGO_LOGS === "true") {
      console.log(
        "Transporte MongoDB para logs deshabilitado por configuración"
      );
      return null;
    }

    const mongoTransport = new MongoDBTransport({
      level: process.env.MONGO_LOG_LEVEL || "info",
      silent: false,
      handleExceptions: true,
    });

    mongoTransport.on("error", (error) => {
      console.error("Error en transporte MongoDB (no fatal):", error.message);
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
    new transports.Console({
      format: combine(colorize(), timestamp(), myFormat),
      level: process.env.CONSOLE_LOG_LEVEL || "debug",
    }),
    new transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      level: process.env.FILE_LOG_LEVEL || "info",
    }),
    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ];

  const mongodbUriExists =
    !!process.env.MONGO_URI ||
    !!(process.env.DB_USER && process.env.DB_PASS && process.env.DB_HOST);

  if (process.env.DISABLE_MONGO_LOGS !== "true" && mongodbUriExists) {
    const mongoTransport = createMongoTransport();
    if (mongoTransport) {
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

// Método adicional para compatibilidad con el logger actual
logger.logError = function (error, context = {}) {
  this.error({
    message: error.message,
    stack: error.stack,
    ...context,
  });
};

module.exports = logger;
