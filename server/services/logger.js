const winston = require("winston");
const MongoDBTransport = require("./mongoDBTransport"); // Transporte personalizado

// Niveles de logs personalizados
const logLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
  },
  colors: {
    error: "red",
    warn: "yellow",
    info: "green",
    http: "magenta",
    verbose: "cyan",
    debug: "blue",
    silly: "gray",
  },
};

// Configuración del logger
const logger = winston.createLogger({
  levels: logLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // mongoDBTransport, // Guardar en MongoDB
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
    new MongoDBTransport(), // Guardar logs en MongoDB
  ],
});

// Agregar transporte de consola en desarrollo
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
      ),
    })
  );
}

module.exports = logger;
