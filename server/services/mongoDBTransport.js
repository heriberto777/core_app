// services/mongoDBTransport.js - Versión mejorada para manejar sesiones
const Transport = require("winston-transport");
const Log = require("../models/loggerModel");

class MongoDBTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.name = "mongodb";
    this.level = opts.level || "info";
    this.silent = opts.silent || false;

    // Estado del transporte
    this.isReady = false;
    this.errorCount = 0;
    this.maxErrors = 10; // Aumentado para ser más tolerante
    this.lastError = 0;
    this.cooldownTime = 60000; // 1 minuto de cooldown
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Buffer para logs
    this.logBuffer = [];
    this.maxBufferSize = 100;
    this.isProcessingBuffer = false;

    console.log("🔗 MongoDB Transport inicializado");

    // Verificar conexión con delay mayor
    setTimeout(() => this.initializeConnection(), 5000);

    // Limpiar buffer periódicamente
    this.bufferCleanupInterval = setInterval(() => {
      this.cleanupBuffer();
    }, 30000); // Cada 30 segundos
  }

  async initializeConnection() {
    try {
      if (this._isMongoConnected()) {
        this.isReady = true;
        this.errorCount = 0;
        this.reconnectAttempts = 0;
        console.log("✅ MongoDB Transport conectado y listo");

        // Procesar buffer de logs pendientes
        if (this.logBuffer.length > 0 && !this.isProcessingBuffer) {
          setTimeout(() => this.processBuffer(), 1000);
        }
      } else {
        this.reconnectAttempts++;
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
          console.log(
            `🔄 Intento de conexión ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
          );
          // Reintento con backoff exponencial
          const delay = Math.min(
            5000 * Math.pow(2, this.reconnectAttempts - 1),
            30000
          );
          setTimeout(() => this.initializeConnection(), delay);
        } else {
          console.warn("⚠️ MongoDB Transport: máximo de reintentos alcanzado");
          this.isReady = false;
        }
      }
    } catch (error) {
      console.warn("⚠️ Error inicializando MongoDB transport:", error.message);
      this.reconnectAttempts++;
      if (this.reconnectAttempts <= this.maxReconnectAttempts) {
        const delay = Math.min(
          5000 * Math.pow(2, this.reconnectAttempts - 1),
          30000
        );
        setTimeout(() => this.initializeConnection(), delay);
      }
    }
  }

  async processBuffer() {
    if (this.isProcessingBuffer || this.logBuffer.length === 0) return;

    this.isProcessingBuffer = true;
    const batchSize = 10; // Procesar en lotes pequeños

    try {
      while (this.logBuffer.length > 0 && this._isMongoConnected()) {
        const batch = this.logBuffer.splice(0, batchSize);

        for (const logInfo of batch) {
          try {
            await this.saveLogSafe(logInfo);
            // Pequeña pausa entre logs para no sobrecargar
            await new Promise((resolve) => setTimeout(resolve, 10));
          } catch (error) {
            // Si falla, reintroducir al buffer si hay espacio
            if (this.logBuffer.length < this.maxBufferSize) {
              this.logBuffer.push(logInfo);
            }
            console.warn("⚠️ Error procesando log del buffer:", error.message);
            break; // Parar el procesamiento del batch
          }
        }

        // Pausa entre batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.warn("⚠️ Error procesando buffer:", error.message);
    } finally {
      this.isProcessingBuffer = false;
    }
  }

  log(info, callback) {
    // Siempre llamar callback inmediatamente
    setImmediate(() => {
      callback();
    });

    if (this.silent || this.isInCooldown()) return;

    // Si MongoDB no está conectado, usar buffer
    if (!this.isReady || !this._isMongoConnected()) {
      this.addToBuffer(info);
      return;
    }

    // Procesar log con manejo de errores mejorado
    this.saveLogSafe(info).catch((error) => {
      this.handleError(error);
      // Guardar en buffer como respaldo
      this.addToBuffer(info);
    });
  }

  async saveLogSafe(info) {
    if (!this._isMongoConnected()) {
      throw new Error("MongoDB desconectado");
    }

    try {
      const { level, message, timestamp, source, stack, ...rest } = info;

      // ✅ Usar el método estático mejorado del modelo
      const log = await Log.createLog(level || "info", message || "", {
        source: source || "app",
        stack: stack,
        metadata: rest.metadata || rest,
        user: rest.user,
        ip: rest.ip,
      });

      if (log) {
        // Éxito - resetear contador de errores
        this.errorCount = Math.max(0, this.errorCount - 1);
        return log;
      } else {
        throw new Error("No se pudo crear el log");
      }
    } catch (error) {
      // Clasificar tipos de error
      if (this.isConnectionError(error)) {
        throw new Error(`Conexión: ${error.message}`);
      } else if (this.isSessionError(error)) {
        throw new Error(`Sesión: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") return {};

    try {
      // Convertir a JSON y limitar tamaño
      const jsonStr = JSON.stringify(metadata);
      if (jsonStr.length > 5000) {
        return { _truncated: true, _originalSize: jsonStr.length };
      }
      return metadata;
    } catch (error) {
      return { _error: "Error serializando metadata" };
    }
  }

  addToBuffer(info) {
    if (this.logBuffer.length >= this.maxBufferSize) {
      // Remover logs más antiguos, mantener los más recientes
      this.logBuffer.shift();
    }

    // Agregar timestamp si no existe
    if (!info.timestamp) {
      info.timestamp = new Date().toISOString();
    }

    this.logBuffer.push(info);
  }

  handleError(error) {
    this.errorCount++;
    this.lastError = Date.now();

    // Emitir error sin usar console para evitar loops
    this.emit("error", error);

    // Si hay muchos errores, intentar reconexión
    if (this.errorCount >= this.maxErrors) {
      this.isReady = false;
      console.warn(
        `⚠️ MongoDB Transport: demasiados errores (${this.errorCount}), intentando reconexión...`
      );

      // Reiniciar proceso de conexión
      setTimeout(() => {
        this.errorCount = Math.floor(this.maxErrors / 2); // Reducir pero no resetear completamente
        this.reconnectAttempts = 0;
        this.initializeConnection();
      }, this.cooldownTime);
    }
  }

  isInCooldown() {
    return (
      this.errorCount >= this.maxErrors &&
      Date.now() - this.lastError < this.cooldownTime
    );
  }

  isConnectionError(error) {
    const connectionErrors = [
      "connection",
      "pool",
      "socket",
      "network",
      "timeout",
      "closed",
      "cancelled",
    ];

    return connectionErrors.some((term) =>
      error.message?.toLowerCase().includes(term)
    );
  }

  isSessionError(error) {
    const sessionErrors = [
      "session",
      "expired",
      "ended",
      "MongoExpiredSessionError",
    ];

    return sessionErrors.some(
      (term) => error.message?.includes(term) || error.name?.includes(term)
    );
  }

  _isMongoConnected() {
    try {
      const mongoose = require("mongoose");
      return mongoose.connection.readyState === 1;
    } catch (error) {
      return false;
    }
  }

  cleanupBuffer() {
    // Limpiar logs muy antiguos del buffer
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutos

    this.logBuffer = this.logBuffer.filter((log) => {
      if (!log.timestamp) return true; // Mantener si no tiene timestamp

      const logTime = new Date(log.timestamp).getTime();
      return now - logTime < maxAge;
    });
  }

  getStats() {
    return {
      isReady: this.isReady,
      errorCount: this.errorCount,
      bufferedLogs: this.logBuffer.length,
      lastError: this.lastError,
      isInCooldown: this.isInCooldown(),
      reconnectAttempts: this.reconnectAttempts,
      isProcessingBuffer: this.isProcessingBuffer,
      mongoConnected: this._isMongoConnected(),
    };
  }

  // Método para limpiar recursos
  close() {
    if (this.bufferCleanupInterval) {
      clearInterval(this.bufferCleanupInterval);
    }
    this.logBuffer = [];
    this.isReady = false;
  }
}

module.exports = MongoDBTransport;
