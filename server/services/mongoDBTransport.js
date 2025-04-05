// services/mongoDBTransport.js
const Transport = require("winston-transport");
const Log = require("../models/loggerModel");

/**
 * Transporte simplificado de Winston para MongoDB
 * Diseñado para evitar completamente el error "Callback called multiple times"
 */
class MongoDBTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.name = "mongodb";
    this.level = opts.level || "info";
    this.silent = opts.silent || false;

    // Flags para manejo de errores
    this.connected = false;
    this.errorCount = 0;
    this.maxRetries = 3;

    console.log("Transporte MongoDB para logs inicializado");
  }

  /**
   * Método simplificado para procesar logs sin usar callbacks múltiples
   */
  log(info, callback) {
    // IMPORTANTE: Llamar al callback INMEDIATAMENTE y SOLO UNA VEZ
    callback(null, true);

    // Si está en modo silencioso, no hacer nada más
    if (this.silent) return;

    // Procesar el log de forma asíncrona sin afectar a Winston
    this._processLogAsync(info).catch((err) => {
      console.error(
        "Error al guardar log en MongoDB (modo silencioso):",
        err.message
      );
    });
  }

  /**
   * Procesa el log de forma asíncrona, completamente separado del flujo de Winston
   * @private
   */
  async _processLogAsync(info) {
    try {
      const { level, message, timestamp, ...rest } = info;

      // Si hemos tenido muchos errores consecutivos, no intentar más
      if (this.errorCount > this.maxRetries) {
        return;
      }

      // Crear objeto de log
      const log = new Log({
        level: level || "info",
        message: message || "",
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        source: rest.source || "app",
        stack: rest.stack || "",
        metadata: rest.metadata || rest,
      });

      // Guardar en MongoDB
      await log.save();

      // Éxito - resetear contador de errores
      this.errorCount = 0;
      this.connected = true;

      // Emitir evento logged para estadísticas internas de Winston
      this.emit("logged", info);
    } catch (error) {
      // Incrementar contador de errores
      this.errorCount++;

      // Solo emitir error si no estamos en modo silencioso para errors
      this.emit("error", error);

      // Si supera el máximo de reintentos, desactivar temporalmente
      if (this.errorCount > this.maxRetries) {
        console.error(
          `MongoDB transport disabled after ${this.errorCount} consecutive errors`
        );
        this.silent = true;

        // Re-habilitar después de un tiempo (5 minutos)
        setTimeout(() => {
          this.silent = false;
          this.errorCount = 0;
          console.log("MongoDB transport re-enabled after cooling period");
        }, 5 * 60 * 1000);
      }
    }
  }
}

module.exports = MongoDBTransport;
