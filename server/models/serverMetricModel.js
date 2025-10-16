const mongoose = require("mongoose");

const serverMetricSchema = new mongoose.Schema({
  server: {
    type: String,
    required: true,
    enum: ["server1", "server2", "mongodb"],
  },
  status: {
    type: String,
    required: true,
    enum: ["online", "offline", "warning"],
  },
  responseTime: {
    type: Number,
    default: null,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  details: {
    type: Object,
    default: {},
  },
});

// Índices para consultas eficientes
serverMetricSchema.index({ server: 1, timestamp: 1 });
serverMetricSchema.index({ timestamp: 1 });

module.exports = mongoose.model("ServerMetric", serverMetricSchema);
