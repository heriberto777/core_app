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
      maxlength: 2000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    source: {
      type: String,
      default: "app",
      index: true,
    },
    stack: {
      type: String,
      maxlength: 5000,
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
      index: true,
    },
    // Nuevos campos para mejor tracking
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
