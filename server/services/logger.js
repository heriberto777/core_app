// services/logger.js
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize } = format;
const path = require("path");
const fs = require("fs");
const MongoDBTransport = require("./mongoDBTransport");

// Crear directorio de logs
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Formato mejorado
const customFormat = printf(
  ({ level, message, timestamp, source, requestId, ...rest }) => {
    let restString = "";
    if (Object.keys(rest).length > 0) {
      restString = JSON.stringify(rest, null, 2);
    }

    const sourceStr = source ? `[${source}]` : "";
    const requestStr = requestId ? `[${requestId}]` : "";

    return `${timestamp} [${level}]${sourceStr}${requestStr}: ${message} ${restString}`;
  }
);

// Crear transporte MongoDB con manejo de errores mejorado
const createMongoTransport = () => {
  try {
    if (process.env.DISABLE_MONGO_LOGS === "true") {
      console.log("🚫 Transporte MongoDB deshabilitado por configuración");
      return null;
    }

    const mongodbUriExists = !!(
      process.env.MONGO_URI ||
      (process.env.DB_USER && process.env.DB_PASS && process.env.DB_HOST)
    );

    if (!mongodbUriExists) {
      console.log("⚠️ No hay URI de MongoDB configurada");
      return null;
    }

    const mongoTransport = new MongoDBTransport({
      level: process.env.MONGO_LOG_LEVEL || "info",
      silent: false,
      handleExceptions: true,
    });

    mongoTransport.on("error", (error) => {
      console.error("❌ Error en MongoDB Transport:", error.message);
    });

    return mongoTransport;
  } catch (error) {
    console.error("❌ Error creando MongoDB Transport:", error.message);
    return null;
  }
};

// Configurar transportes
const configureTransports = () => {
  const transportsList = [
    new transports.Console({
      format: combine(colorize(), timestamp(), customFormat),
      level: process.env.CONSOLE_LOG_LEVEL || "debug",
    }),
    new transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      level: process.env.FILE_LOG_LEVEL || "info",
      format: combine(timestamp(), customFormat),
    }),
    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      format: combine(timestamp(), customFormat),
    }),
  ];

  // Agregar transporte MongoDB si está disponible
  const mongoTransport = createMongoTransport();
  if (mongoTransport) {
    transportsList.push(mongoTransport);
    console.log("✅ Transporte MongoDB agregado");
  }

  return transportsList;
};

// Crear logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp(), customFormat),
  transports: configureTransports(),
  exitOnError: false,
  // Configuración adicional
  defaultMeta: {
    service: process.env.SERVICE_NAME || "transfer-control",
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "1.0.0",
  },
});

// Stream mejorado para Morgan
logger.stream = {
  write: function (message) {
    try {
      const cleanMessage =
        typeof message === "string" ? message.trim() : String(message).trim();

      if (cleanMessage) {
        logger.info(cleanMessage, { source: "http" });
      }
    } catch (error) {
      console.log("Log stream error:", error.message);
    }
  },
};

// Helper para context específico
logger.withContext = function (context = {}) {
  return {
    error: (message, meta = {}) =>
      logger.error(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
    debug: (message, meta = {}) =>
      logger.debug(message, { ...context, ...meta }),
  };
};

// Helpers especializados
logger.system = logger.withContext({ source: "system" });
logger.db = logger.withContext({ source: "database" });
logger.api = logger.withContext({ source: "api" });
logger.transfer = logger.withContext({ source: "transfer" });

// Método para logging de errores con stack trace
logger.logError = function (error, context = {}) {
  try {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      ...context,
    };

    this.error("Error occurred", errorInfo);
  } catch (logError) {
    console.error("Error logging error:", logError.message);
    console.error("Original error:", error);
  }
};

// Método para logging de performance
logger.logPerformance = function (operation, duration, context = {}) {
  const perfInfo = {
    operation,
    duration: `${duration}ms`,
    source: "performance",
    ...context,
  };

  if (duration > 1000) {
    this.warn("Slow operation detected", perfInfo);
  } else {
    this.info("Operation completed", perfInfo);
  }
};

// Método para logging de requests
logger.logRequest = function (req, res, duration) {
  const requestInfo = {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    source: "request",
  };

  if (res.statusCode >= 400) {
    this.warn("Request completed with error", requestInfo);
  } else {
    this.info("Request completed", requestInfo);
  }
};

// Graceful shutdown
const gracefulShutdown = () => {
  console.log("🔄 Iniciando cierre graceful del logger...");

  // Cerrar transportes de MongoDB
  if (logger.transports) {
    logger.transports.forEach((transport) => {
      if (
        transport.name === "mongodb" &&
        typeof transport.close === "function"
      ) {
        transport.close();
      }
    });
  }

  // Cerrar winston
  logger.close();
  console.log("✅ Logger cerrado correctamente");
};

// Manejo de señales de cierre
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

module.exports = logger;
