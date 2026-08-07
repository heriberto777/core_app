// services/webhookNotificationService.js
const logger = require("./logger");
const NotificationConfig = require("../models/notificationConfigModel");

const WEBHOOK_TIMEOUT_MS = 10000;

/**
 * Obtiene la configuración de notificaciones (documento único). No falla si
 * no existe todavía — simplemente significa que el webhook no está configurado.
 */
async function getConfig() {
  return NotificationConfig.findOne().lean();
}

/**
 * Envía un payload arbitrario al webhook configurado (ej. un flujo de n8n).
 * No lanza errores hacia el caller: una falla de notificación nunca debe
 * interrumpir un flujo de transferencia real. Devuelve true/false.
 */
async function postToWebhook(payload) {
  const config = await getConfig();

  if (!config?.webhookEnabled || !config?.webhookUrl) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(
        `Webhook de notificaciones respondió con estado ${response.status} (${config.webhookUrl})`
      );
      return false;
    }

    logger.info(`Webhook de notificaciones enviado correctamente: ${payload.event || "evento"}`);
    return true;
  } catch (error) {
    logger.error(`Error enviando webhook de notificaciones: ${error.message}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Envía un webhook de prueba con un payload mínimo, usado desde la pantalla
 * de configuración para validar la URL antes de guardarla.
 */
async function sendTestWebhook(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "test",
        message: "Prueba de configuración de webhook de notificaciones",
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    return response.ok;
  } catch (error) {
    logger.error(`Error en prueba de webhook: ${error.message}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getConfig,
  postToWebhook,
  sendTestWebhook,
};
