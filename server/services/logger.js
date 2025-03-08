const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize } = format;
const path = require("path");

// Crear directorio de logs si no existe
const fs = require("fs");
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

// Crear logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp(), myFormat),
  transports: [
    // Log a consola
    new transports.Console({
      format: combine(colorize(), timestamp(), myFormat),
    }),

    // Logs de info y niveles superiores
    new transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Solo errores
    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  exitOnError: false,
});

// Stream para Morgan - CORREGIDO
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

module.exports = logger;
