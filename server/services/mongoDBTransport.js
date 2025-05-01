// services/mongoDBTransport.js - Versión refactorizada
const Transport = require("winston-transport");
const Log = require("../models/loggerModel");

/**
 * Transporte optimizado de Winston para MongoDB
 */
class MongoDBTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.name = "mongodb";
    this.level = opts.level || "info";
    this.silent = opts.silent || false;

    // Control de errores mejorado
    this.errorThresholds = {
      connectionErrors: 0,
      savingErrors: 0,
      maxErrors: 5,
      cooldownPeriod: 30000, // 30 segundos
    };

    // Estado de conexión
    this.connectionStatus = {
      isHealthy: true,
      lastErrorTime: 0,
      consecutiveErrors: 0,
    };

    console.log("Transporte MongoDB para logs inicializado");
  }

  /**
   * Procesa logs con mejor manejo de errores y reconexión automática
   */
  log(info, callback) {
    // Siempre llamar al callback primero para evitar múltiples llamadas
    setImmediate(() => {
      callback();
    });

    // Si está en modo silencioso, no hacer nada más
    if (this.silent) return;

    // Verificar si estamos en modo de enfriamiento
    if (this.isInCooldown()) {
      return;
    }

    // Procesar el log de forma asíncrona
    this._processLogAsync(info).catch((error) => {
      this._handleError(error);
    });
  }

  /**
   * Verifica si estamos en período de enfriamiento
   */
  isInCooldown() {
    const now = Date.now();
    const lastError = this.connectionStatus.lastErrorTime;
    return now - lastError < this.errorThresholds.cooldownPeriod;
  }

  /**
   * Procesa el log de forma asíncrona con mejor manejo de errores
   */
  async _processLogAsync(info) {
    // Verificar conexión antes de intentar guardar
    if (!this._isMongoConnected()) {
      throw new Error("MongoDB no está conectado");
    }

    try {
      const { level, message, timestamp, ...rest } = info;

      // Crear objeto de log
      const log = new Log({
        level: level || "info",
        message: message || "",
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        source: rest.source || "app",
        stack: rest.stack || "",
        metadata: rest.metadata || rest,
      });

      // Guardar en MongoDB con timeout
      await Promise.race([
        log.save(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout guardando log")), 5000)
        ),
      ]);

      // Éxito - resetear contadores de errores
      this.connectionStatus.consecutiveErrors = 0;
      this.connectionStatus.isHealthy = true;

      // Emitir evento logged
      this.emit("logged", info);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Maneja errores con estrategia de reconexión
   */
  _handleError(error) {
    this.connectionStatus.consecutiveErrors++;
    this.connectionStatus.lastErrorTime = Date.now();

    // Incrementar contador según tipo de error
    if (error.message?.includes("no está conectado")) {
      this.errorThresholds.connectionErrors++;
    } else {
      this.errorThresholds.savingErrors++;
    }

    // Emitir error para logging interno
    this.emit("error", error);

    // Si superamos el umbral, poner en modo silencioso temporal
    if (
      this.connectionStatus.consecutiveErrors >= this.errorThresholds.maxErrors
    ) {
      this.connectionStatus.isHealthy = false;

      // Programar reactivación
      setTimeout(() => {
        this.connectionStatus.consecutiveErrors = 0;
        this.connectionStatus.isHealthy = true;
        console.log("MongoDB transport re-enabled after error threshold");
      }, this.errorThresholds.cooldownPeriod);
    }
  }

  /**
   * Verifica si MongoDB está conectado
   */
  _isMongoConnected() {
    // Importar dinámicamente para evitar dependencias circulares
    const mongoose = require("mongoose");
    return mongoose.connection.readyState === 1;
  }

  /**
   * Obtiene estadísticas del transporte
   */
  getStats() {
    return {
      connectionStatus: this.connectionStatus,
      errorThresholds: this.errorThresholds,
      isHealthy: this.connectionStatus.isHealthy,
      lastError: this.connectionStatus.lastErrorTime,
    };
  }
}

module.exports = MongoDBTransport;
