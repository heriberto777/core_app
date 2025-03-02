const mongoose = require("mongoose");

const configSchema = new mongoose.Schema({
  hour: { type: String, required: true }, // Intervalo en minutos
});

const Config = mongoose.model("Config", configSchema);

module.exports = Config;
