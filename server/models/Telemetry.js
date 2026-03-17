const mongoose = require("mongoose");

const telemetrySchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    period: { type: String, enum: ["hourly", "daily"], default: "hourly" },

    // Métricas de DB
    db: {
        connections: {
            acquired: Number,
            released: Number,
            errors: Number,
            reconnects: Number,
        },
        queries: {
            total: Number,
            errors: Number,
            server1: Number,
            server2: Number,
        },
    },

    // Métricas de transferencias
    transfers: {
        started: Number,
        completed: Number,
        failed: Number,
        retried: Number,
        cancelled: Number,
        recordsProcessed: Number,
        recordsInserted: Number,
        recordsDuplicated: Number,
    },

    // Métricas de rendimiento (Promedios en el periodo)
    performance: {
        avgTransferTime: Number,
        avgQueryTime: Number,
        avgBatchSize: Number,
        maxTransferTime: Number,
        minTransferTime: Number,
    },

    // Metadatos adicionales
    system: {
        uptime: Number,
        memoryUsage: {
            rss: Number,
            heapTotal: Number,
            heapUsed: Number,
        },
    }
});

// Índice para búsquedas por tiempo
telemetrySchema.index({ timestamp: -1 });

module.exports = mongoose.model("Telemetry", telemetrySchema);
