// models/Log.js
const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  level: { type: String, required: true }, // Ejemplo: "info", "error"
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: Object }, // Datos adicionales opcionales
});

module.exports = mongoose.model("Log", logSchema);
