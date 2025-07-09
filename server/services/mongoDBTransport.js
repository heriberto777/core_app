// services/mongoDBTransport.js
const Transport = require("winston-transport");
const Log = require("../models/loggerModel");
const fs = require("fs");
const path = require("path");

class MongoDBTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.name = "mongodb";
    this.level = opts.level || "info";
    this.silent = opts.silent || false;

    // Estado del transporte
    this.isReady = false;
    this.isShuttingDown = false;
    this.errorCount = 0;
    this.maxErrors = 5; // Reducido de 10 a 5
    this.lastError = 0;
    this.cooldownTime = 30000; // Reducido de 60s a 30s
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;

    // Buffer mejorado
    this.logBuffer = [];
    this.maxBufferSize = 500; // Aumentado de 100 a 500
    this.isProcessingBuffer = false;
    this.bufferPersistFile = path.join("logs", "buffer_backup.json");

    // Configuración de batch processing
    this.batchSize = 10;
    this.batchTimeout = 2000; // 2 segundos
    this.pendingBatch = [];
    this.batchTimer = null;

    console.log("🔗 MongoDB Transport inicializado con batch processing");

    // Restaurar buffer desde archivo si existe
    this.restoreBufferFromFile();

    // Inicializar conexión
    setTimeout(() => this.initializeConnection(), 1000);

    // Limpiar buffer y procesar batches periódicamente
    this.setupPeriodicTasks();
  }

  setupPeriodicTasks() {
    // Limpiar buffer cada 60 segundos
    this.bufferCleanupInterval = setInterval(() => {
      this.cleanupBuffer();
    }, 60000);

    // Procesar batch cada 5 segundos si hay logs pendientes
    this.batchProcessInterval = setInterval(() => {
      if (this.pendingBatch.length > 0) {
        this.processBatch();
      }
    }, 5000);
  }

  async initializeConnection() {
    try {
      if (this._isMongoConnected()) {
        this.isReady = true;
        this.errorCount = 0;
        this.reconnectAttempts = 0;
        console.log("✅ MongoDB Transport conectado y listo");

        // Procesar buffer de logs pendientes
        await this.processBuffer();
      } else {
        await this.handleReconnection();
      }
    } catch (error) {
      console.warn("⚠️ Error inicializando MongoDB transport:", error.message);
      await this.handleReconnection();
    }
  }

  async handleReconnection() {
    this.reconnectAttempts++;
    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      console.log(
        `🔄 Intento de reconexión ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
      );
      const delay = Math.min(
        3000 * Math.pow(1.5, this.reconnectAttempts - 1),
        15000
      );
      setTimeout(() => this.initializeConnection(), delay);
    } else {
      console.warn("⚠️ MongoDB Transport: máximo de reintentos alcanzado");
      this.isReady = false;
      // Persistir buffer en archivo
      this.persistBufferToFile();
    }
  }

  log(info, callback) {
    // Callback inmediato para no bloquear winston
    if (callback && typeof callback === "function") {
      setImmediate(() => {
        try {
          callback();
        } catch (error) {
          // Ignorar errores del callback
        }
      });
    }

    // No procesar durante shutdown
    if (this.isShuttingDown) {
      return;
    }

    // Verificar si debemos procesar este log
    if (this.silent || this.isInCooldown()) {
      this.addToBuffer(info);
      return;
    }

    // Si MongoDB está conectado, procesar inmediatamente
    if (this.isReady && this._isMongoConnected()) {
      this.addToBatch(info);
    } else {
      this.addToBuffer(info);
    }
  }

  addToBatch(info) {
    const cleanInfo = this.sanitizeLogInfo(info);
    this.pendingBatch.push(cleanInfo);

    // Procesar batch si está lleno
    if (this.pendingBatch.length >= this.batchSize) {
      this.processBatch();
    } else {
      // Programar procesamiento del batch
      this.scheduleBatchProcessing();
    }
  }

  scheduleBatchProcessing() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      if (this.pendingBatch.length > 0) {
        this.processBatch();
      }
    }, this.batchTimeout);
  }

  async processBatch() {
    if (this.pendingBatch.length === 0 || this.isShuttingDown) {
      return;
    }

    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await this.saveBatchSafe(batch);
      this.errorCount = Math.max(0, this.errorCount - 1);
    } catch (error) {
      console.warn("⚠️ Error procesando batch:", error.message);
      this.handleError(error);

      // Agregar logs fallidos al buffer
      batch.forEach((log) => this.addToBuffer(log));
    }
  }

  async saveBatchSafe(batch) {
    if (this.isShuttingDown || !this._isMongoConnected()) {
      throw new Error("MongoDB desconectado o cerrando");
    }

    try {
      const logs = batch.map((info) => ({
        level: info.level || "info",
        message: info.message || "",
        timestamp: info.timestamp || new Date(),
        source: info.source || "app",
        stack: info.stack,
        metadata: info.metadata,
        user: info.user,
        ip: info.ip,
        sessionId: info.sessionId,
        requestId: info.requestId,
      }));

      const timeout = this.isShuttingDown ? 3000 : 10000;

      const result = await Promise.race([
        Log.createBulkLogs(logs),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout guardando batch")),
            timeout
          )
        ),
      ]);

      if (result && result.length > 0) {
        console.log(`✅ Batch guardado: ${result.length} logs`);
        return result;
      } else {
        throw new Error("No se pudo guardar el batch");
      }
    } catch (error) {
      if (this.isConnectionError(error)) {
        throw new Error(`Conexión MongoDB: ${error.message}`);
      } else if (error.name === "ValidationError") {
        const validationErrors = Object.values(error.errors || {})
          .map((e) => e.message)
          .join(", ");
        throw new Error(`Validación: ${validationErrors}`);
      } else {
        throw new Error(`Batch creation: ${error.message}`);
      }
    }
  }

  async processBuffer() {
    if (this.isProcessingBuffer || this.logBuffer.length === 0) {
      return;
    }

    this.isProcessingBuffer = true;
    console.log(`📦 Procesando buffer: ${this.logBuffer.length} logs`);

    try {
      while (this.logBuffer.length > 0 && this._isMongoConnected()) {
        const batch = this.logBuffer.splice(0, this.batchSize);

        try {
          await this.saveBatchSafe(batch);
          // Pausa entre batches
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.warn("⚠️ Error procesando batch del buffer:", error.message);
          // Reintroducir logs fallidos al buffer
          this.logBuffer.unshift(...batch);
          break;
        }
      }
    } catch (error) {
      console.warn("⚠️ Error procesando buffer:", error.message);
    } finally {
      this.isProcessingBuffer = false;
    }
  }

  sanitizeLogInfo(info) {
    const { level, message, timestamp, source, stack, ...rest } = info;

    return {
      level: level || "info",
      message: message || "",
      timestamp: timestamp || new Date(),
      source: source || rest.source || "app",
      stack: stack || rest.stack,
      metadata: this.sanitizeMetadata(rest.metadata || rest),
      user: rest.user,
      ip: rest.ip,
      sessionId: rest.sessionId,
      requestId: rest.requestId,
    };
  }

  sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") {
      return undefined;
    }

    try {
      const cleanMetadata = {};

      for (const [key, value] of Object.entries(metadata)) {
        // Filtrar propiedades internas
        if (
          key.startsWith("Symbol(") ||
          ["level", "message", "timestamp", "source", "stack"].includes(key)
        ) {
          continue;
        }

        if (value !== undefined && value !== null) {
          if (typeof value === "string" && value.length > 1000) {
            cleanMetadata[key] = value.substring(0, 997) + "...";
          } else if (typeof value === "object") {
            try {
              const jsonStr = JSON.stringify(value);
              if (jsonStr.length > 2000) {
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
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.logBuffer.shift();
    }

    const cleanInfo = this.sanitizeLogInfo(info);
    this.logBuffer.push(cleanInfo);
  }

  persistBufferToFile() {
    try {
      if (this.logBuffer.length === 0) return;

      const bufferData = {
        timestamp: new Date().toISOString(),
        logs: this.logBuffer,
      };

      fs.writeFileSync(
        this.bufferPersistFile,
        JSON.stringify(bufferData, null, 2)
      );
      console.log(
        `💾 Buffer persistido en archivo: ${this.logBuffer.length} logs`
      );
    } catch (error) {
      console.error("Error persistiendo buffer:", error.message);
    }
  }

  restoreBufferFromFile() {
    try {
      if (fs.existsSync(this.bufferPersistFile)) {
        const bufferData = JSON.parse(
          fs.readFileSync(this.bufferPersistFile, "utf8")
        );
        this.logBuffer = bufferData.logs || [];
        console.log(
          `📁 Buffer restaurado desde archivo: ${this.logBuffer.length} logs`
        );

        // Eliminar archivo después de restaurar
        fs.unlinkSync(this.bufferPersistFile);
      }
    } catch (error) {
      console.error("Error restaurando buffer:", error.message);
    }
  }

  handleError(error) {
    if (this.isShuttingDown) return;

    this.errorCount++;
    this.lastError = Date.now();

    console.warn(
      `⚠️ MongoDB Transport Error (${this.errorCount}/${this.maxErrors}):`,
      error.message
    );

    if (this.errorCount >= this.maxErrors) {
      this.isReady = false;
      console.warn("⚠️ MongoDB Transport: entrando en cooldown...");

      // Persistir buffer
      this.persistBufferToFile();

      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.errorCount = 0;
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
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "MongoNetworkError",
    ];

    const message = (error.message || "").toLowerCase();
    return connectionErrors.some((term) => message.includes(term));
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
    const maxAge = 10 * 60 * 1000; // 10 minutos

    const originalLength = this.logBuffer.length;
    this.logBuffer = this.logBuffer.filter((log) => {
      if (!log.timestamp) return true;
      const logTime = new Date(log.timestamp).getTime();
      return now - logTime < maxAge;
    });

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
      pendingBatch: this.pendingBatch.length,
      isProcessingBuffer: this.isProcessingBuffer,
      lastError: this.lastError ? new Date(this.lastError).toISOString() : null,
      isInCooldown: this.isInCooldown(),
      reconnectAttempts: this.reconnectAttempts,
      mongoConnected: this._isMongoConnected(),
    };
  }

  close() {
    console.log("🔄 Cerrando MongoDB Transport...");
    this.isShuttingDown = true;
    this.isReady = false;

    // Limpiar intervalos
    if (this.bufferCleanupInterval) {
      clearInterval(this.bufferCleanupInterval);
    }
    if (this.batchProcessInterval) {
      clearInterval(this.batchProcessInterval);
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Procesar logs pendientes rápidamente
    const quickProcess = async () => {
      try {
        // Procesar batch pendiente
        if (this.pendingBatch.length > 0) {
          await this.saveBatchSafe(this.pendingBatch);
          this.pendingBatch = [];
        }

        // Procesar hasta 20 logs del buffer
        const urgentLogs = this.logBuffer.splice(0, 20);
        if (urgentLogs.length > 0) {
          await this.saveBatchSafe(urgentLogs);
        }
      } catch (error) {
        console.warn("⚠️ Error en procesamiento rápido:", error.message);
      }
    };

    // Ejecutar con timeout
    Promise.race([
      quickProcess(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]).finally(() => {
      // Persistir logs restantes
      this.persistBufferToFile();
      this.logBuffer = [];
      this.pendingBatch = [];
      console.log("✅ MongoDB Transport cerrado");
    });
  }
}

module.exports = MongoDBTransport;
