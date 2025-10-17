const logger = require("../services/logger")

/**
 * Wrapper que intercepta errores en servicios automáticamente
 */
function wrapService(ServiceClass, serviceName) {
  const wrappedMethods = {};

  // Obtener todos los métodos del servicio
  const methodNames = Object.getOwnPropertyNames(ServiceClass).filter(
    (prop) => typeof ServiceClass[prop] === "function"
  );

  methodNames.forEach((methodName) => {
    wrappedMethods[methodName] = async function (...args) {
      const startTime = Date.now();

      try {
        logger.debug(`🔄 Iniciando ${serviceName}.${methodName}()`, {
          source: serviceName.toLowerCase(),
          method: methodName,
          argsCount: args.length,
          timestamp: new Date().toISOString(),
        });

        const result = await ServiceClass[methodName].apply(this, args);
        const duration = Date.now() - startTime;

        logger.debug(`✅ ${serviceName}.${methodName}() completado`, {
          source: serviceName.toLowerCase(),
          method: methodName,
          duration: `${duration}ms`,
          success: true,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Usar tu logger existente con análisis automático
        logger.captureError(error, {
          service: serviceName,
          method: methodName,
          duration: `${duration}ms`,
          args: args.map((arg) =>
            typeof arg === "object"
              ? JSON.stringify(arg).substring(0, 100)
              : arg
          ),
        });

        throw error; // Re-lanzar para no romper el flujo
      }
    };
  });

  return wrappedMethods;
}

module.exports = { wrapService };
