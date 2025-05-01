// services/logger.js - Versión simple y robusta
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

// Métodos auxiliares
logger.logError = function (error, context = {}) {
  this.error({
    message: error.message,
    stack: error.stack,
    ...context,
  });
};

module.exports = logger;
