const logger = require("./logger");

const retry = async (fn, retries = 3, delay = 2000, taskName = "Tarea") => {
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) {
        logger.warn(`Reintento ${i} para ${taskName}`);
      }
      return await fn(); // Ejecuta la función
    } catch (error) {
      logger.error(`Error en ${taskName} (Intento ${i + 1}): ${error.message}`);
      if (i === retries - 1) {
        throw new Error(
          `Fallo en ${taskName} después de ${retries} intentos: ${error.message}`
        );
      }
      // Espera antes de intentar de nuevo
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

module.exports = retry;
