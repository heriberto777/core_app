const logger = require("./logger");

class RetryService {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelay = options.initialDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.factor = options.factor || 2;
    this.retryableErrors = options.retryableErrors || [
      "ECONNCLOSED",
      "timeout",
      "connection",
      "network",
      "state",
      "LoggedIn state",
      "Final state",
    ];
    this.logPrefix = options.logPrefix || "";
  }

  isRetryable(error) {
    // Lógica para determinar si un error es recuperable
    if (!error) return false;

    // Errores específicos conocidos
    if (error.code && this.retryableErrors.includes(error.code)) return true;

    // Análisis de mensaje de error
    if (error.message) {
      return this.retryableErrors.some((term) =>
        error.message.toLowerCase().includes(term.toLowerCase())
      );
    }

    return false;
  }

  async execute(operation, context = {}) {
    const name = context.name || "operación";
    let lastError;
    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        // Si hay contexto de cancelación, verificar antes de cada intento
        if (context.signal && context.signal.aborted) {
          throw new Error(`${name} cancelada por el usuario`);
        }

        // Si no es el primer intento, loguear
        if (attempt > 0) {
          logger.info(
            `${this.logPrefix}Reintentando ${name} (intento ${attempt + 1}/${
              this.maxRetries
            })...`
          );
        }

        // Ejecutar la operación
        return await operation(attempt);
      } catch (error) {
        lastError = error;

        // Verificar si la operación fue cancelada
        if (
          (context.signal && context.signal.aborted) ||
          (error.message && error.message.includes("cancelada"))
        ) {
          logger.info(
            `${this.logPrefix}${name} cancelada durante el intento ${
              attempt + 1
            }`
          );
          throw error;
        }

        // Si no es retry-able o es el último intento, lanzar error
        if (!this.isRetryable(error) || attempt >= this.maxRetries - 1) {
          if (!this.isRetryable(error)) {
            logger.error(
              `${this.logPrefix}Error no recuperable en ${name}: ${error.message}`
            );
          } else {
            logger.error(
              `${this.logPrefix}Error en ${name} después de ${
                attempt + 1
              } intentos: ${error.message}`
            );
          }
          throw error;
        }

        // Calcular delay con backoff exponencial
        const delay = Math.min(
          this.initialDelay * Math.pow(this.factor, attempt),
          this.maxDelay
        );

        logger.warn(
          `${this.logPrefix}Error recuperable en ${name} (intento ${
            attempt + 1
          }/${this.maxRetries}): ${error.message}. Reintentando en ${Math.round(
            delay / 1000
          )}s...`
        );

        // Esperar antes del siguiente intento
        if (context.signal) {
          // Espera cancelable
          await this.cancelableWait(delay, context.signal);
        } else {
          // Espera normal
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        attempt++;
      }
    }

    // No debería llegar aquí, pero por seguridad
    throw (
      lastError ||
      new Error(
        `Error desconocido en ${name} después de ${this.maxRetries} intentos`
      )
    );
  }

  // Espera que puede ser cancelada
  async cancelableWait(ms, signal) {
    return new Promise((resolve, reject) => {
      // Si ya está cancelada, rechazar inmediatamente
      if (signal.aborted) {
        reject(new Error("Operación cancelada durante espera"));
        return;
      }

      // Configurar timeout
      const timeout = setTimeout(resolve, ms);

      // Configurar listener para cancelación
      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new Error("Operación cancelada durante espera"));
      };

      signal.addEventListener("abort", abortHandler, { once: true });

      // Limpiar listener cuando se resuelva
      timeout.unref(); // Evitar que el timeout impida que el proceso termine
      setTimeout(() => {
        signal.removeEventListener("abort", abortHandler);
      }, ms);
    });
  }
}

// Exportar instance default para uso general
module.exports = RetryService;

// Exportar instancia default como propiedad
module.exports.defaultInstance = new RetryService({
  logPrefix: "[Retry] ",
});
