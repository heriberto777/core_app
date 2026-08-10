// Updated configModel.js
const mongoose = require("mongoose");

const configSchema = new mongoose.Schema({
  // Este modelo es un singleton (un solo documento para todo el sistema).
  // findOneAndUpdate({}, ..., {upsert:true}) no garantiza atomicidad frente a
  // upserts concurrentes sobre una colección vacía; este campo fijo + índice
  // único convierte el filtro en algo que Mongo puede deduplicar de verdad.
  // OJO: mongoDbService.js usa mongoose.set("autoIndex", false) en producción,
  // así que "unique: true" aquí NO crea el índice real por sí solo — hay que
  // correr `npm run ensure-config-index` una vez por entorno (scripts/ensureConfigSingletonIndex.js).
  singleton: { type: String, default: "singleton", unique: true },
  hour: { type: String, required: true }, // Hora formato HH:MM
  enabled: { type: Boolean, default: true }, // Nuevo campo para habilitar/deshabilitar
  // Zona horaria IANA en la que se interpreta `hour` (ej. "America/Santo_Domingo").
  // Antes estaba hardcodeada en cronService.js — quedaba fija sin poder
  // ajustarla desde el frontend, y el cálculo de "próxima ejecución" no la
  // tenía en cuenta en absoluto (usaba la hora del contenedor, típicamente UTC).
  timezone: { type: String, default: "America/Santo_Domingo" },
  lastModified: { type: Date, default: Date.now },
});

const Config = mongoose.model("Config", configSchema);

module.exports = Config;
