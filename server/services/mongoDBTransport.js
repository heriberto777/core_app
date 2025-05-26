// services/mongoDBTransport.js - Versión corregida para trabajar con tu loggerModel
const Transport = require("winston-transport");
const Log = require("../models/loggerModel");

class MongoDBTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.name = "mongodb";
    this.level = opts.level || "info";
    this.silent = opts.silent || false;

    // NUEVA BANDERA para shutdown
    this.isShuttingDown = false;

    // Estado del transporte
    this.isReady = false;
    this.errorCount = 0;
    this.maxErrors = 10;
    this.lastError = 0;
    this.cooldownTime = 60000;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Buffer para logs
    this.logBuffer = [];
    this.maxBufferSize = 100;
    this.isProcessingBuffer = false;

    console.log("🔗 MongoDB Transport inicializado");
    setTimeout(() => this.initializeConnection(), 5000);

    // Limpiar buffer periódicamente
    this.bufferCleanupInterval = setInterval(() => {
      this.cleanupBuffer();
    }, 30000);
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
    const batchSize = 5; // Reducir tamaño del lote para mayor estabilidad

    try {
      while (this.logBuffer.length > 0 && this._isMongoConnected()) {
        const batch = this.logBuffer.splice(0, batchSize);

        for (const logInfo of batch) {
          try {
            await this.saveLogSafe(logInfo);
            // Pausa más larga entre logs
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (error) {
            // Si falla, reintroducir al buffer si hay espacio
            if (this.logBuffer.length < this.maxBufferSize) {
              this.logBuffer.unshift(logInfo); // Agregar al inicio para reintentarlo pronto
            }
            console.warn("⚠️ Error procesando log del buffer:", error.message);
            break;
          }
        }

        // Pausa entre batches
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.warn("⚠️ Error procesando buffer:", error.message);
    } finally {
      this.isProcessingBuffer = false;
    }
  }

  log(info, callback) {
    // MEJORA: Verificar shutdown temprano
    if (this.isShuttingDown) {
      if (callback && typeof callback === "function") {
        setImmediate(callback);
      }
      return;
    }

    // Siempre llamar callback inmediatamente
    if (callback && typeof callback === "function") {
      setImmediate(() => {
        try {
          callback();
        } catch (callbackError) {
          // Ignorar errores del callback silenciosamente
        }
      });
    }

    // Verificar si debemos procesar este log
    if (this.silent || this.isInCooldown()) {
      return;
    }

    // Si MongoDB no está conectado, usar buffer (solo si no estamos cerrando)
    if (!this.isReady || !this._isMongoConnected()) {
      if (!this.isShuttingDown) {
        this.addToBuffer(info);
      }
      return;
    }

    // Procesar log de forma asíncrona
    setImmediate(() => {
      this.saveLogSafe(info).catch((error) => {
        if (!this.isShuttingDown) {
          this.handleError(error);
          this.addToBuffer(info);
        }
      });
    });
  }

  async saveLogSafe(info) {
    // MEJORA: No intentar guardar si estamos cerrando
    if (this.isShuttingDown || !this._isMongoConnected()) {
      throw new Error("MongoDB desconectado o cerrando");
    }

    try {
      const { level, message, timestamp, source, stack, ...rest } = info;

      const logOptions = {
        source: source || rest.source || "app",
        stack: stack || rest.stack,
        metadata: this.sanitizeMetadata(rest.metadata || rest),
        user: rest.user,
        ip: rest.ip,
      };

      // Limpiar opciones undefined
      Object.keys(logOptions).forEach((key) => {
        if (logOptions[key] === undefined) {
          delete logOptions[key];
        }
      });

      // USAR EL MÉTODO createLog CON TIMEOUT
      const Log = require("../models/loggerModel");

      // TIMEOUT más corto durante shutdown
      const timeoutMs = this.isShuttingDown ? 1000 : 5000;

      const log = await Promise.race([
        Log.createLog(level || "info", message || "", logOptions),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout guardando log")),
            timeoutMs
          )
        ),
      ]);

      if (log) {
        this.errorCount = Math.max(0, this.errorCount - 1);
        return log;
      } else {
        throw new Error("No se pudo crear el log - modelo devolvió null");
      }
    } catch (error) {
      // Clasificar errores
      if (this.isConnectionError(error)) {
        throw new Error(`Conexión MongoDB: ${error.message}`);
      } else if (this.isSessionError(error)) {
        throw new Error(`Sesión MongoDB: ${error.message}`);
      } else if (error.name === "ValidationError") {
        const validationErrors =
          Object.values(error.errors || {})
            .map((e) => e.message)
            .join(", ") || error.message;
        throw new Error(`Validación: ${validationErrors}`);
      } else {
        throw new Error(`Log creation: ${error.message}`);
      }
    }
  }

  sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") {
      return undefined;
    }

    try {
      // Crear una copia limpia del objeto
      const cleanMetadata = {};

      for (const [key, value] of Object.entries(metadata)) {
        // Filtrar propiedades internas de winston
        if (
          key.startsWith("Symbol(") ||
          key === "level" ||
          key === "message" ||
          key === "timestamp"
        ) {
          continue;
        }

        // Sanitizar el valor
        if (value !== undefined && value !== null) {
          if (typeof value === "string" && value.length > 500) {
            cleanMetadata[key] = value.substring(0, 497) + "...";
          } else if (typeof value === "object") {
            try {
              const jsonStr = JSON.stringify(value);
              if (jsonStr.length > 1000) {
                cleanMetadata[key] = {
                  _truncated: true,
                  _size: jsonStr.length,
                };
              } else {
                cleanMetadata[key] = value;
              }
            } catch {
              cleanMetadata[key] = "[Object not serializable]";
            }
          } else {
            cleanMetadata[key] = value;
          }
        }
      }

      return Object.keys(cleanMetadata).length > 0 ? cleanMetadata : undefined;
    } catch (error) {
      return { _error: "Error sanitizing metadata" };
    }
  }

  addToBuffer(info) {
    // Evitar buffer overflow
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.logBuffer.shift(); // Remover el más antiguo
    }

    // Asegurar timestamp
    if (!info.timestamp) {
      info.timestamp = new Date().toISOString();
    }

    // Crear una copia limpia para el buffer
    const bufferedInfo = {
      level: info.level || "info",
      message: info.message || "",
      timestamp: info.timestamp,
      source: info.source || "app",
      stack: info.stack,
      metadata: this.sanitizeMetadata(info.metadata || info),
      user: info.user,
      ip: info.ip,
    };

    this.logBuffer.push(bufferedInfo);
  }

  handleError(error) {
    // MEJORA: No manejar errores durante shutdown
    if (this.isShuttingDown) {
      return;
    }

    this.errorCount++;
    this.lastError = Date.now();

    // Solo emitir error si no estamos cerrando
    try {
      this.emit("error", error);
    } catch (emitError) {
      console.warn("MongoDB Transport Error:", error.message);
    }

    // Cooldown solo si no estamos cerrando
    if (this.errorCount >= this.maxErrors && !this.isShuttingDown) {
      this.isReady = false;
      console.warn(
        `⚠️ MongoDB Transport: demasiados errores (${this.errorCount}), entrando en cooldown...`
      );

      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.errorCount = Math.floor(this.maxErrors / 2);
          this.reconnectAttempts = 0;
          this.initializeConnection();
        }
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
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
    ];

    const message = (error.message || "").toLowerCase();
    return connectionErrors.some((term) => message.includes(term));
  }

  isSessionError(error) {
    const sessionErrors = [
      "session",
      "expired",
      "ended",
      "MongoExpiredSessionError",
      "transaction",
      "aborted",
    ];

    const message = error.message || "";
    const name = error.name || "";

    return sessionErrors.some(
      (term) => message.includes(term) || name.includes(term)
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
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutos

    const originalLength = this.logBuffer.length;

    this.logBuffer = this.logBuffer.filter((log) => {
      if (!log.timestamp) return true; // Mantener si no tiene timestamp

      const logTime = new Date(log.timestamp).getTime();
      return now - logTime < maxAge;
    });

    // Log solo si se eliminaron elementos
    if (originalLength > this.logBuffer.length) {
      console.log(
        `🧹 Buffer cleanup: eliminados ${
          originalLength - this.logBuffer.length
        } logs antiguos`
      );
    }
  }

  getStats() {
    return {
      isReady: this.isReady,
      errorCount: this.errorCount,
      bufferedLogs: this.logBuffer.length,
      lastError: this.lastError ? new Date(this.lastError).toISOString() : null,
      isInCooldown: this.isInCooldown(),
      reconnectAttempts: this.reconnectAttempts,
      isProcessingBuffer: this.isProcessingBuffer,
      mongoConnected: this._isMongoConnected(),
    };
  }

  // Método para limpiar recursos
  close() {
    console.log("🔄 Cerrando MongoDB Transport...");

    // MARCAR COMO CERRANDO
    this.isShuttingDown = true;
    this.isReady = false;

    // Limpiar interval
    if (this.bufferCleanupInterval) {
      clearInterval(this.bufferCleanupInterval);
      this.bufferCleanupInterval = null;
    }

    // PROCESAR LOGS PENDIENTES RÁPIDAMENTE
    if (this.logBuffer.length > 0 && this._isMongoConnected()) {
      console.log(
        `📝 Intentando procesar ${this.logBuffer.length} logs pendientes...`
      );

      // Procesar máximo 10 logs pendientes con timeout corto
      const quickProcess = async () => {
        const logsToProcess = this.logBuffer.splice(0, 10);
        for (const logInfo of logsToProcess) {
          try {
            await Promise.race([
              this.saveLogSafe(logInfo),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 500)
              ),
            ]);
          } catch (error) {
            // Ignorar errores durante cierre rápido
            break;
          }
        }
      };

      // Ejecutar con timeout global
      Promise.race([
        quickProcess(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]).finally(() => {
        this.logBuffer = [];
        console.log("✅ MongoDB Transport cerrado");
      });
    } else {
      this.logBuffer = [];
      console.log("✅ MongoDB Transport cerrado");
    }
  }
}

module.exports = MongoDBTransport;
