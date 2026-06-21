const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LogSchema = new Schema(
  {
    level: {
      type: String,
      required: true,
      enum: ["error", "warn", "info", "debug", "verbose"],
      default: "info",
      index: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 10000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      default: "app",
      index: true,
    },
    stack: {
      type: String,
      maxlength: 10000,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    user: {
      type: String,
      index: true,
    },
    ip: {
      type: String,
    },
    sessionId: String,
    requestId: String,
    processId: {
      type: String,
      default: () => process.pid.toString(),
    },
    environment: {
      type: String,
      default: process.env.NODE_ENV || "development",
    },
    // === CAMPOS OPERACIONALES (nuevos) ===
    operationType: {
      type: String,
      enum: ["TRANSFER", "LOAD", "DELETE", "UPDATE", "CREATE", "QUERY", "EXECUTE", "OTHER"],
      default: "OTHER",
      index: true,
    },
    entityType: {
      type: String,
      enum: ["PEDIDO", "CLIENTE", "CARGA", "ARTICULO", "VENDEDOR", "TRASPASO", "TAREA", "USUARIO", "OTHER"],
      default: "OTHER",
      index: true,
    },
    entityId: String,
    affectedRecords: {
      type: Number,
      default: 0,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    // === CAMPOS ADICIONALES (nuevos) ===
    serverSource: {
      type: String,
      enum: ["server1", "server2", "mongodb", "unknown"],
      default: "unknown",
    },
    query: {
      type: String,
      maxlength: 5000,
    },
    // === CONTEXTO HTTP (nuevos) ===
    httpMethod: {
      type: String,
      enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    },
    httpPath: String,
    httpStatusCode: Number,
    // === CAMPOS DE ERROR MEJORADOS (nuevos) ===
    errorCode: String,
    errorDetails: {
      type: Schema.Types.Mixed,
    },
    // === CAMPOS DE TRANSACCIÓN (nuevos) ===
    transactionId: String,
    loadId: String,
    taskId: String,
    // === CAMPOS DE MAPPING (nuevos) ===
    mappingId: { type: String, index: true },
    mappingName: String,
    fieldName: String,
    failedValue: Schema.Types.Mixed,
    tableSource: String,
    tableTarget: String,
    documentId: String,
    stepName: String,
    originalStack: {
      type: String,
      maxlength: 10000,
    },
  },
  {
    timestamps: true,
    collection: "logs",
  }
);

// Índices compuestos para mejor rendimiento
LogSchema.index({ level: 1, timestamp: -1 });
LogSchema.index({ source: 1, timestamp: -1 });
LogSchema.index({ timestamp: -1, level: 1 });
LogSchema.index({ level: 1, mappingId: 1, timestamp: -1 });
LogSchema.index({ mappingId: 1, timestamp: -1 });
LogSchema.index({ transactionId: 1, timestamp: -1 });

// TTL para logs antiguos (opcional - 30 días)
LogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Método estático mejorado para crear logs
LogSchema.statics.createLog = async function (level, message, options = {}) {
  try {
    const logData = {
      level: level || "info",
      message: message || "",
      timestamp: new Date(),
      source: options.source || "app",
      stack: options.stack,
      metadata: options.metadata,
      user: options.user,
      ip: options.ip,
      sessionId: options.sessionId,
      requestId: options.requestId,
      operationType: options.operationType || "OTHER",
      entityType: options.entityType || "OTHER",
      entityId: options.entityId,
      affectedRecords: options.affectedRecords || 0,
      durationMs: options.durationMs || 0,
      serverSource: options.serverSource || "unknown",
      query: options.query,
      httpMethod: options.httpMethod,
      httpPath: options.httpPath,
      httpStatusCode: options.httpStatusCode,
      errorCode: options.errorCode,
      errorDetails: options.errorDetails,
      transactionId: options.transactionId,
      loadId: options.loadId,
      taskId: options.taskId,
      mappingId: options.mappingId,
      mappingName: options.mappingName,
      fieldName: options.fieldName,
      failedValue: options.failedValue,
      tableSource: options.tableSource,
      tableTarget: options.tableTarget,
      documentId: options.documentId,
      stepName: options.stepName,
      originalStack: options.originalStack,
    };

    // Limpiar campos undefined
    Object.keys(logData).forEach((key) => {
      if (logData[key] === undefined) {
        delete logData[key];
      }
    });

    const log = new this(logData);
    return await log.save();
  } catch (error) {
    console.error("Error creando log:", error.message);
    throw error;
  }
};

// Método para bulk insert (más eficiente)
LogSchema.statics.createBulkLogs = async function (logs) {
  try {
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return [];
    }

    const cleanLogs = logs.map((log) => ({
      level: log.level || "info",
      message: log.message || "",
      timestamp: log.timestamp || new Date(),
      source: log.source || "app",
      stack: log.stack,
      metadata: log.metadata,
      user: log.user,
      ip: log.ip,
      sessionId: log.sessionId,
      requestId: log.requestId,
      operationType: log.operationType || "OTHER",
      entityType: log.entityType || "OTHER",
      entityId: log.entityId,
      affectedRecords: log.affectedRecords || 0,
      durationMs: log.durationMs || 0,
      serverSource: log.serverSource || "unknown",
      query: log.query,
      httpMethod: log.httpMethod,
      httpPath: log.httpPath,
      httpStatusCode: log.httpStatusCode,
      errorCode: log.errorCode,
      errorDetails: log.errorDetails,
      transactionId: log.transactionId,
      loadId: log.loadId,
      taskId: log.taskId,
      mappingId: log.mappingId,
      mappingName: log.mappingName,
      fieldName: log.fieldName,
      failedValue: log.failedValue,
      tableSource: log.tableSource,
      tableTarget: log.tableTarget,
      documentId: log.documentId,
      stepName: log.stepName,
      originalStack: log.originalStack,
    }));

    return await this.insertMany(cleanLogs, { ordered: false });
  } catch (error) {
    console.error("Error en bulk insert:", error.message);
    throw error;
  }
};

// Método para limpiar logs antiguos
LogSchema.statics.cleanOldLogs = async function (daysToKeep = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    return result.deletedCount;
  } catch (error) {
    console.error("Error limpiando logs antiguos:", error.message);
    throw error;
  }
};

module.exports = mongoose.model("Log", LogSchema);
