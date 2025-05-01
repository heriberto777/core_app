// services/logger.js - Con soporte para Morgan
const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Asegurar que existe el directorio de logs
const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Formato personalizado para consola
const consoleFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level.toUpperCase()}: ${message}`;
});

// Crear logger con configuración simple y robusta
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json()
  ),
  transports: [
    // Transporte de consola con colores y formato legible
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        consoleFormat
      ),
      handleExceptions: true,
    }),
    // Archivo para todos los logs
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      handleExceptions: true,
    }),
    // Archivo solo para errores
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      handleExceptions: true,
    }),
  ],
  exitOnError: false, // No cerrar en errores no manejados
});

// IMPORTANTE: Añadir stream para Morgan
logger.stream = {
  write: function (message) {
    // Remover salto de línea que Morgan añade al final
    logger.info(message.trim());
  },
};

// Métodos auxiliares
logger.logError = function (error, context = {}) {
  this.error({
    message: error.message,
    stack: error.stack,
    ...context,
  });
};

// Opcional: Intenta configurar transporte MongoDB si está disponible
try {
  // Importamos estos módulos solo si los necesitamos
  const mongoose = require("mongoose");
  const { MongoDBTransport } = require("./mongoDBTransport");

  // Verificar si MongoDB está conectado
  if (
    mongoose.connection.readyState === 1 &&
    process.env.DISABLE_MONGO_LOGS !== "true"
  ) {
    // Agregar transporte MongoDB
    const mongoTransport = new MongoDBTransport({
      level: "info",
      handleExceptions: true,
    });

    // Manejo de errores
    mongoTransport.on("error", (error) => {
      console.error("Error en transporte MongoDB (no fatal):", error.message);
    });

    logger.add(mongoTransport);
    logger.info("Transporte MongoDB agregado al logger");
  }
} catch (error) {
  console.warn("No se pudo configurar transporte MongoDB:", error.message);
}

module.exports = logger;
