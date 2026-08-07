// models/notificationConfigModel.js
const mongoose = require("mongoose");

/**
 * Configuración singleton (un solo documento) del webhook de notificaciones
 * (ej. un flujo de n8n conectado a Telegram/WhatsApp). Sigue el mismo patrón
 * de documento único que configModel.js (hora del scheduler).
 */
const notificationConfigSchema = new mongoose.Schema(
  {
    webhookUrl: { type: String, trim: true, default: "" },
    webhookEnabled: { type: Boolean, default: false },
    // Si notificar el resumen de las corridas automáticas (cron) del batch completo
    notifyOnAutomatic: { type: Boolean, default: true },
    // Si notificar el resumen de una ejecución manual individual (éxito o error)
    notifyOnManual: { type: Boolean, default: true },
    lastModified: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const NotificationConfig = mongoose.model(
  "NotificationConfig",
  notificationConfigSchema
);

module.exports = NotificationConfig;
