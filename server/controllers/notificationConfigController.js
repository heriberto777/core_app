const NotificationConfig = require("../models/notificationConfigModel");
const { sendTestWebhook } = require("../services/webhookNotificationService");
const logger = require("../services/logger");

/**
 * Obtiene la configuración de notificaciones (documento único, se crea con
 * valores por defecto si todavía no existe — mismo patrón que /config del scheduler).
 */
const getConfig = async (req, res) => {
  try {
    let config = await NotificationConfig.findOne().lean();
    if (!config) {
      config = { webhookUrl: "", webhookEnabled: false, notifyOnAutomatic: true, notifyOnManual: true };
    }
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    logger.error("Error en getConfig (notificaciones):", error);
    return res.status(500).json({ success: false, message: "Error al obtener configuración de notificaciones", error: error.message });
  }
};

/**
 * Actualiza (o crea) la configuración de notificaciones.
 */
const updateConfig = async (req, res) => {
  try {
    const { webhookUrl, webhookEnabled, notifyOnAutomatic, notifyOnManual } = req.body;

    if (webhookEnabled && !webhookUrl) {
      return res.status(400).json({ success: false, message: "Debes proporcionar una URL de webhook para habilitarlo" });
    }

    const config = await NotificationConfig.findOneAndUpdate(
      {},
      {
        webhookUrl: webhookUrl ?? "",
        webhookEnabled: !!webhookEnabled,
        notifyOnAutomatic: notifyOnAutomatic !== undefined ? !!notifyOnAutomatic : true,
        notifyOnManual: notifyOnManual !== undefined ? !!notifyOnManual : true,
        lastModified: new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    );

    logger.info(`Configuración de notificaciones actualizada por ${req.user?._id}`);
    return res.status(200).json({ success: true, message: "Configuración actualizada correctamente", data: config });
  } catch (error) {
    logger.error("Error en updateConfig (notificaciones):", error);
    return res.status(500).json({ success: false, message: "Error al actualizar configuración de notificaciones", error: error.message });
  }
};

/**
 * Envía un webhook de prueba a la URL indicada (sin necesidad de haberla guardado antes).
 */
const testWebhook = async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl) {
      return res.status(400).json({ success: false, message: "Debes proporcionar una URL de webhook" });
    }

    const ok = await sendTestWebhook(webhookUrl);
    if (!ok) {
      return res.status(400).json({ success: false, message: "No se pudo conectar con la URL indicada. Verifica que sea correcta y esté accesible." });
    }

    return res.status(200).json({ success: true, message: "Webhook de prueba enviado correctamente" });
  } catch (error) {
    logger.error("Error en testWebhook:", error);
    return res.status(500).json({ success: false, message: "Error al probar el webhook", error: error.message });
  }
};

module.exports = {
  getConfig,
  updateConfig,
  testWebhook,
};
