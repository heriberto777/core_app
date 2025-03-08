const morgan = require("morgan");
const logger = require("../services/logger");

// Crear un formato de logging personalizado para Morgan
morgan.token("body", (req) => {
  if (req.method === "POST" || req.method === "PUT") {
    if (!req.body) return "";

    try {
      // Ocultar información sensible
      const body = { ...req.body };
      if (body.password) body.password = "******";
      if (body.token) body.token = "******";

      return JSON.stringify(body);
    } catch (err) {
      return "";
    }
  }
  return "";
});

// Middleware de logging con Morgan que usa Winston
// Manejo de errores mejorado
function loggerMiddleware(req, res, next) {
  try {
    // Verificar que logger.stream.write sea una función
    if (!logger.stream || typeof logger.stream.write !== "function") {
      console.warn(
        "⚠️ Logger stream no está configurado correctamente, usando configuración alternativa"
      );
      // Backup: configurar un stream alternativo si el principal no está disponible
      const alternativeStream = {
        write: (message) => {
          console.log(message.trim());
        },
      };

      return morgan(
        ":method :url :status :response-time ms - :res[content-length]",
        { stream: alternativeStream }
      )(req, res, next);
    }

    // Si todo está bien, usar el stream del logger
    return morgan(
      ":method :url :status :response-time ms - :res[content-length] :body",
      { stream: logger.stream }
    )(req, res, next);
  } catch (error) {
    console.error("Error en middleware de logging:", error);
    // No interrumpir la cadena de middleware
    next();
  }
}

module.exports = loggerMiddleware;
