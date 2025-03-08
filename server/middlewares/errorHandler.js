const logger = require("../services/logger");

/**
 * Middleware centralizado para manejo de errores
 */
function errorHandler(err, req, res, next) {
  // Determinar código de estado HTTP
  const statusCode = err.statusCode || err.status || 500;

  // Preparar mensaje de error
  const errorResponse = {
    error: true,
    message: err.message || "Error interno del servidor",
  };

  // En desarrollo, incluir stack trace
  if (process.env.NODE_ENV !== "production") {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details || null;
  }

  // Registrar el error con diferentes niveles según la gravedad
  if (statusCode >= 500) {
    logger.error(
      `${statusCode} - ${req.method} ${req.originalUrl} - ${err.message}`,
      {
        url: req.originalUrl,
        method: req.method,
        statusCode,
        body: req.body,
        params: req.params,
        query: req.query,
        stack: err.stack,
        ip: req.ip,
        user: req.user ? req.user._id : "anonymous",
      }
    );
  } else if (statusCode >= 400) {
    logger.warn(
      `${statusCode} - ${req.method} ${req.originalUrl} - ${err.message}`,
      {
        url: req.originalUrl,
        method: req.method,
        statusCode,
        body: req.body,
        params: req.params,
        query: req.query,
      }
    );
  }

  // Enviar respuesta al cliente
  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
