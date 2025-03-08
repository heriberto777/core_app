const logger = require("./logger");

/**
 * Función para reintentar operaciones con un número específico de intentos
 * @param {Function} operation - Función asíncrona a ejecutar
 * @param {Number} retries - Número de reintentos
 * @param {Number} delay - Retardo entre reintentos en milisegundos
 * @param {String} operationName - Nombre de la operación (para logs)
 * @returns {Promise<*>} - Resultado de la operación
 */
async function retry(
  operation,
  retries = 3,
  delay = 1000,
  operationName = "Operación"
) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Si no es el primer intento, registrar el reintento
      if (attempt > 1) {
        logger.info(
          `Reintentando ${operationName} (intento ${attempt} de ${retries})`
        );
      }

      // Ejecutar la operación
      return await operation();
    } catch (error) {
      lastError = error;

      // Registrar el error
      logger.warn(
        `Error en ${operationName} (intento ${attempt} de ${retries}): ${error.message}`
      );

      if (attempt < retries) {
        // Esperar antes de reintentar
        logger.debug(`Esperando ${delay}ms antes de reintentar...`);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Aumentar el delay para backoff exponencial
        delay = delay * 1.5;
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  logger.error(
    `Todos los intentos de ${operationName} fallaron después de ${retries} intentos`
  );
  throw lastError;
}

module.exports = retry;
