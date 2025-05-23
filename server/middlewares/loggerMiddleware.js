let morgan;
try {
  morgan = require("morgan");
} catch (morganError) {
  console.warn("⚠️ Morgan no disponible:", morganError.message);
  morgan = null;
}

const logger = require("../services/logger");

// Crear un middleware de logging robusto
const createLoggerMiddleware = () => {
  try {
    // Si Morgan no está disponible, usar middleware básico
    if (!morgan) {
      console.log("📝 Usando middleware de logging básico (sin Morgan)");
      return (req, res, next) => {
        const start = Date.now();

        const logRequest = () => {
          try {
            const duration = Date.now() - start;
            const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

            if (res.statusCode >= 500) {
              logger.error(message);
            } else if (res.statusCode >= 400) {
              logger.warn(message);
            } else {
              logger.info(message);
            }
          } catch (logError) {
            console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
          }
        };

        res.on("finish", logRequest);
        res.on("close", logRequest);
        next();
      };
    }

    // Verificar si logger tiene el stream necesario
    if (!logger.stream) {
      console.warn("⚠️ Logger no tiene stream, creando uno básico...");
      logger.stream = {
        write: function (message) {
          try {
            if (typeof message === "string") {
              logger.info(message.trim());
            } else {
              logger.info(String(message).trim());
            }
          } catch (error) {
            console.log(message.trim());
          }
        },
      };
    }

    // Configurar formato de Morgan
    const format =
      process.env.NODE_ENV === "production"
        ? "combined"
        : ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms';

    // Crear middleware con manejo de errores
    const morganMiddleware = morgan(format, {
      stream: logger.stream,
      skip: (req, res) => {
        // Omitir logs de health check en producción
        if (process.env.NODE_ENV === "production" && req.path === "/health") {
          return true;
        }
        return false;
      },
    });

    // Wrapper para manejar errores del middleware
    return (req, res, next) => {
      try {
        return morganMiddleware(req, res, (err) => {
          if (err) {
            console.error("Error en middleware de logging:", err.message);
          }
          next(err);
        });
      } catch (error) {
        console.warn(
          "⚠️ Error en loggerMiddleware, continuando sin logging:",
          error.message
        );
        next();
      }
    };
  } catch (error) {
    console.error("❌ Error creando middleware de logging:", error.message);

    // Retornar middleware básico como fallback usando tu lógica
    return (req, res, next) => {
      const start = Date.now();

      const logRequest = () => {
        try {
          const duration = Date.now() - start;
          const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

          if (res.statusCode >= 500) {
            logger.error(message);
          } else if (res.statusCode >= 400) {
            logger.warn(message);
          } else {
            logger.info(message);
          }
        } catch (logError) {
          console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
        }
      };

      res.on("finish", logRequest);
      res.on("close", logRequest);
      next();
    };
  }
};

module.exports = createLoggerMiddleware();
