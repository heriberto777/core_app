const mongoose = require("mongoose");

const configSchema = new mongoose.Schema({
  interval: { type: Number, required: true }, // Intervalo en minutos
});

const Config = mongoose.model("Config", configSchema);

module.exports = Config;
