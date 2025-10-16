const logger = require("../services/logger");

/**
 * Middleware de logging simple que no depende de Morgan
 * Útil como fallback si hay problemas con Morgan
 * Versión mejorada con mejor manejo de errores
 */
function simpleLoggerMiddleware(req, res, next) {
  // Capturar tiempo de inicio
  const start = Date.now();

  // Capturar información adicional de la request
  const userAgent = req.get("User-Agent") || "Unknown";
  const ip = req.ip || req.connection.remoteAddress || "Unknown";

  // Función para registrar la petición cuando finalice
  const logRequest = () => {
    try {
      const duration = Date.now() - start;
      const contentLength = res.get("Content-Length") || 0;

      // Mensaje base
      const baseMessage = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

      // Mensaje detallado para desarrollo
      const detailedMessage =
        process.env.NODE_ENV !== "production"
          ? `${ip} - "${req.method} ${req.originalUrl}" ${res.statusCode} ${contentLength} bytes - ${duration}ms - ${userAgent}`
          : baseMessage;

      // Usar diferentes niveles según el código de estado
      if (res.statusCode >= 500) {
        logger.error(detailedMessage);
      } else if (res.statusCode >= 400) {
        logger.warn(detailedMessage);
      } else {
        logger.info(detailedMessage);
      }

      // Log adicional para requests lentas (más de 1 segundo)
      if (duration > 1000) {
        logger.warn(
          `⚠️ SLOW REQUEST: ${req.method} ${req.originalUrl} took ${duration}ms`
        );
      }
    } catch (error) {
      // Si hay error en el logging, al menos escribir a la consola
      try {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
      } catch (consoleError) {
        // Último recurso - log mínimo
        console.log(`Request completed with status ${res.statusCode}`);
      }
    }
  };

  // Registrar eventos para capturar cuando finalice la petición
  res.on("finish", logRequest);
  res.on("close", logRequest);

  next();
}

module.exports = simpleLoggerMiddleware;
