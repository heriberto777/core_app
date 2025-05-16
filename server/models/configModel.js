// Updated configModel.js
const mongoose = require("mongoose");

const configSchema = new mongoose.Schema({
  hour: { type: String, required: true }, // Hora formato HH:MM
  enabled: { type: Boolean, default: true }, // Nuevo campo para habilitar/deshabilitar
  lastModified: { type: Date, default: Date.now },
});

const Config = mongoose.model("Config", configSchema);

module.exports = Config;
