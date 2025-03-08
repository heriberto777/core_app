const logger = require("../services/logger");

/**
 * Middleware de logging simple que no depende de Morgan
 * Útil como fallback si hay problemas con Morgan
 */
function simpleLoggerMiddleware(req, res, next) {
  // Capturar tiempo de inicio
  const start = Date.now();

  // Función para registrar la petición cuando finalice
  const logRequest = () => {
    try {
      const duration = Date.now() - start;
      const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

      // Usar diferentes niveles según el código de estado
      if (res.statusCode >= 500) {
        logger.error(message);
      } else if (res.statusCode >= 400) {
        logger.warn(message);
      } else {
        logger.info(message);
      }
    } catch (error) {
      // Si hay error en el logging, al menos escribir a la consola
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
    }
  };

  // Registrar eventos para capturar cuando finalice la petición
  res.on("finish", logRequest);
  res.on("close", logRequest);

  next();
}

module.exports = simpleLoggerMiddleware;
