// services/notificationDispatcher.js
// Punto único desde el que las tareas automáticas (cron) y manuales notifican
// sus resultados — hoy por correo, y opcionalmente por un webhook externo
// (ej. un flujo de n8n que reenvía a Telegram/WhatsApp). Agregar un canal
// nuevo en el futuro solo implica sumarlo aquí, sin tocar cronService.js ni
// transferTaskController.js.
const logger = require("./logger");
const { sendTransferResultsEmail, sendCriticalErrorEmail } = require("./emailService");
const { getConfig: getNotificationConfig, postToWebhook } = require("./webhookNotificationService");

function formatDuration(ms) {
  if (!ms || ms < 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Construye el resumen de errores consolidado (nombre + mensaje) a partir de
 * los resultados individuales — antes cada correo solo mostraba el error por
 * fila en la tabla de detalle, sin un bloque corto y fácil de leer.
 */
function buildErrorSummary(results) {
  return results
    .filter((r) => !r.success)
    .map((r) => ({ name: r.name, message: r.errorDetail || r.message || "Error desconocido" }));
}

function buildMeta(startTime, endTime) {
  const durationMs = endTime - startTime;
  return {
    startTime: new Date(startTime).toLocaleString(),
    endTime: new Date(endTime).toLocaleString(),
    durationMs,
    durationLabel: formatDuration(durationMs),
  };
}

/**
 * Notifica el resultado de una corrida (automática o manual) por todos los
 * canales habilitados. `results` es el mismo array que ya arma cronService.js/
 * transferTaskController.js: [{ name, success, rows, inserted, duplicates,
 * message, errorDetail }].
 */
async function notifyTransferResults(results, options = {}) {
  const {
    runType = "automatic", // "automatic" | "manual"
    scheduledHour = null,
    startTime = Date.now(),
    endTime = Date.now(),
    configName = null,
  } = options;

  const meta = buildMeta(startTime, endTime);
  const errors = buildErrorSummary(results);
  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.length - successCount;

  // Correo (siempre se intenta enviar — ya lo hacía antes)
  try {
    await sendTransferResultsEmail(results, scheduledHour, configName, meta);
  } catch (error) {
    logger.error(`Error enviando correo de resultados (${runType}): ${error.message}`);
  }

  // Webhook (n8n u otro), solo si está configurado y habilitado para este tipo de corrida
  try {
    const config = await getNotificationConfig();
    const enabledForThisRunType =
      runType === "automatic" ? config?.notifyOnAutomatic !== false : config?.notifyOnManual !== false;

    if (config?.webhookEnabled && enabledForThisRunType) {
      await postToWebhook({
        event: "transfer_results",
        runType,
        scheduledHour,
        ...meta,
        successCount,
        failedCount,
        totalCount: results.length,
        errors,
        tasks: results.map((r) => ({
          name: r.name,
          success: r.success,
          rows: r.rows || 0,
          inserted: r.inserted || 0,
          updated: r.updated || 0,
          duplicates: r.duplicates || 0,
          message: r.message,
          errorDetail: r.success ? undefined : r.errorDetail,
        })),
      });
    }
  } catch (error) {
    logger.error(`Error enviando webhook de resultados (${runType}): ${error.message}`);
  }
}

async function notifyCriticalError(errorMessage, options = {}) {
  const { scheduledHour = null, additionalInfo = null, configName = null } = options;

  try {
    await sendCriticalErrorEmail(errorMessage, scheduledHour, additionalInfo, configName);
  } catch (error) {
    logger.error(`Error enviando correo de error crítico: ${error.message}`);
  }

  try {
    const config = await getNotificationConfig();
    if (config?.webhookEnabled) {
      await postToWebhook({
        event: "critical_error",
        errorMessage,
        scheduledHour,
        additionalInfo,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error(`Error enviando webhook de error crítico: ${error.message}`);
  }
}

module.exports = {
  notifyTransferResults,
  notifyCriticalError,
  formatDuration,
};
