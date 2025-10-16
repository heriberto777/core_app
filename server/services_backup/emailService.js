// services/emailService.js
const nodemailer = require("nodemailer");
const logger = require("./logger");
const EmailTemplateService = require("./emailTemplateService");
const { getRecipientEmails } = require("./emailRecipientService");

// Configurar el transporter una vez al inicio
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST, // Ejemplo: smtp.gmail.com
  port: process.env.EMAIL_PORT || 587, // Puerto SMTP (587 para TLS)
  secure: process.env.EMAIL_SECURE === "true", // true para 465, false para otros puertos
  auth: {
    user: process.env.EMAIL_USER, // Tu correo
    pass: process.env.EMAIL_PASS, // Contraseña o App Password
  },
});

/**
 * Envía un correo electrónico
 * @param {string|Array} to - Destinatario(s) del correo
 * @param {string} subject - Asunto del correo
 * @param {string} text - Texto plano del correo
 * @param {string} html - HTML del correo (opcional)
 * @param {Array} attachments - Archivos adjuntos (opcional)
 * @returns {Promise<boolean>} - Verdadero si el correo se envió correctamente
 */
const sendEmail = async (to, subject, text, html, attachments = []) => {
  // Si no hay destinatarios, no enviamos correo
  if (!to || (Array.isArray(to) && to.length === 0)) {
    logger.warn(`No se pudo enviar correo: No hay destinatarios válidos`);
    return false;
  }

  const mailOptions = {
    from:
      process.env.EMAIL_FROM ||
      '"Sistema de Transferencia" <noreply@example.com>',
    to: Array.isArray(to) ? to.join(",") : to,
    subject,
    text, // Texto plano
    html, // HTML opcional
    attachments, // Archivos adjuntos
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Correo enviado a ${to} con ID: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error(`Error enviando correo a ${to}:`, error);
    return false;
  }
};

/**
 * Envía un correo usando plantillas
 * @param {string|Array} to - Destinatario(s) del correo
 * @param {string} subject - Asunto del correo
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} templateData - Datos para la plantilla
 * @param {Array} attachments - Archivos adjuntos (opcional)
 * @returns {Promise<boolean>} - Verdadero si el correo se envió correctamente
 */
const sendTemplatedEmail = async (
  to,
  subject,
  templateName,
  templateData,
  attachments = []
) => {
  try {
    // Renderizar la plantilla HTML
    const html = EmailTemplateService.renderTemplate(
      templateName,
      templateData
    );

    // Generar texto plano para clientes de correo sin soporte HTML
    const text = EmailTemplateService.generatePlainText(templateData);

    // Enviar el correo
    return await sendEmail(to, subject, text, html, attachments);
  } catch (error) {
    logger.error(
      `Error al enviar correo con plantilla ${templateName}:`,
      error
    );

    // Intentar enviar un correo simple en caso de error con la plantilla
    try {
      const simpleHtml = `<h1>${subject}</h1><p>Se produjo un error al renderizar la plantilla, pero aquí están los datos:</p><pre>${JSON.stringify(
        templateData,
        null,
        2
      )}</pre>`;
      const simpleText = `${subject}\n\nSe produjo un error al renderizar la plantilla, pero aquí están los datos:\n\n${JSON.stringify(
        templateData,
        null,
        2
      )}`;

      return await sendEmail(
        to,
        `${subject} (Error de plantilla)`,
        simpleText,
        simpleHtml,
        attachments
      );
    } catch (fallbackError) {
      logger.error("Error en el envío de correo de fallback:", fallbackError);
      return false;
    }
  }
};

/**
 * Envía un correo de traspaso de bodega con los datos proporcionados
 * Obtiene los destinatarios de la base de datos
 * @param {Object} traspasoData - Datos del traspaso
 * @param {string} pdfPath - Ruta del PDF adjunto (opcional)
 * @returns {Promise<boolean>} - Verdadero si el correo se envió correctamente
 */
const sendTraspasoEmail = async (traspasoData, pdfPath = null) => {
  try {
    // Obtener destinatarios de la base de datos para el tipo "traspaso"
    const recipients = await getRecipientEmails("traspaso");

    // Verificar si hay destinatarios
    if (!recipients || recipients.length === 0) {
      logger.warn(
        "No hay destinatarios configurados para recibir notificaciones de traspaso"
      );
      return false;
    }

    // Preparar asunto basado en el resultado
    const subject = traspasoData.success
      ? `✅ Traspaso de Bodega Completado: ${traspasoData.documento_inv || ""}`
      : `⚠️ Error en Traspaso de Bodega: ${
          traspasoData.documento_inv || "N/A"
        }`;

    // Preparar adjuntos si existe el PDF
    const attachments = [];
    if (pdfPath) {
      attachments.push({
        filename: `traspaso_${traspasoData.documento_inv || "documento"}.pdf`,
        path: pdfPath,
        contentType: "application/pdf",
      });
    }

    // Añadir timestamp si no existe
    if (!traspasoData.timestamp) {
      traspasoData.timestamp = new Date().toLocaleString();
    }

    // Enviar correo con la plantilla de traspaso
    return await sendTemplatedEmail(
      recipients,
      subject,
      "traspaso",
      traspasoData,
      attachments
    );
  } catch (error) {
    logger.error("Error al enviar correo de traspaso:", error);
    return false;
  }
};

/**
 * Envía un correo con el resultado de las transferencias automáticas
 * Obtiene los destinatarios de la base de datos
 * @param {Array} results - Resultados de las transferencias
 * @param {string} scheduledHour - Hora programada
 * @returns {Promise<boolean>} - Verdadero si el correo se envió correctamente
 */
const sendTransferResultsEmail = async (results, scheduledHour) => {
  try {
    // Obtener destinatarios de la base de datos para el tipo "transferencias"
    const recipients = await getRecipientEmails("transferencias");

    // Verificar si hay destinatarios
    if (!recipients || recipients.length === 0) {
      logger.warn(
        "No hay destinatarios configurados para recibir notificaciones de transferencias"
      );
      return false;
    }

    // Procesar resultados
    const successResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    // Preparar asunto basado en los resultados
    const subject =
      failedResults.length === 0
        ? "✅ Transferencias Automáticas Completadas con Éxito"
        : `⚠️ Transferencias Automáticas: ${failedResults.length} errores`;

    // Identificar resultados con duplicados
    const resultsWithDuplicates = results.filter(
      (result) =>
        result.duplicates > 0 &&
        result.duplicatedRecords &&
        result.duplicatedRecords.length > 0
    );

    // Preparar datos para la plantilla
    const templateData = {
      title: subject,
      subtitle: `Resumen: ${successResults.length} exitosas, ${failedResults.length} fallidas`,
      successCount: successResults.length,
      failedCount: failedResults.length,
      scheduledHour,
      results,
      resultsWithDuplicates,
      timestamp: new Date().toLocaleString(),
    };

    // Configurar columnas para cada resultado con duplicados
    if (resultsWithDuplicates.length > 0) {
      for (const result of resultsWithDuplicates) {
        if (result.duplicatedRecords && result.duplicatedRecords.length > 0) {
          // Obtener los nombres de columnas del primer registro
          result.columns = Object.keys(result.duplicatedRecords[0]).filter(
            (key) => !key.startsWith("_")
          );
        }
      }
    }

    // Enviar correo con la plantilla de transferencias
    return await sendTemplatedEmail(
      recipients,
      subject,
      "transferenciasAutomaticas",
      templateData
    );
  } catch (error) {
    logger.error(
      "Error al enviar correo de resultados de transferencias:",
      error
    );
    return false;
  }
};

/**
 * Envía un correo de error crítico
 * Obtiene los destinatarios de la base de datos
 * @param {string} errorMessage - Mensaje de error
 * @param {string} scheduledHour - Hora programada (opcional)
 * @param {string} additionalInfo - Información adicional (opcional)
 * @returns {Promise<boolean>} - Verdadero si el correo se envió correctamente
 */
const sendCriticalErrorEmail = async (
  errorMessage,
  scheduledHour = null,
  additionalInfo = null
) => {
  try {
    // Obtener destinatarios de la base de datos para el tipo "erroresCriticos"
    const recipients = await getRecipientEmails("erroresCriticos");

    // Verificar si hay destinatarios
    if (!recipients || recipients.length === 0) {
      logger.warn(
        "No hay destinatarios configurados para recibir notificaciones de errores críticos"
      );
      return false;
    }

    // Preparar asunto
    const subject = "🚨 Error Crítico en Sistema de Transferencias";

    // Preparar datos para la plantilla
    const templateData = {
      title: "Error en Sistema de Transferencias",
      errorMessage,
      scheduledHour,
      additionalInfo,
      timestamp: new Date().toLocaleString(),
    };

    // Enviar correo con la plantilla de error crítico
    return await sendTemplatedEmail(
      recipients,
      subject,
      "errorCritico",
      templateData
    );
  } catch (error) {
    logger.error("Error al enviar correo de error crítico:", error);
    // Último recurso: intentar enviar un correo simple
    try {
      const simpleText = `ERROR CRÍTICO: ${errorMessage}\n\nFecha y hora: ${new Date().toLocaleString()}`;
      return await sendEmail(
        recipients,
        subject,
        simpleText,
        `<p>${simpleText.replace("\n", "<br>")}</p>`
      );
    } catch (fallbackError) {
      logger.error(
        "Error en el envío de correo de fallback para error crítico:",
        fallbackError
      );
      return false;
    }
  }
};

module.exports = {
  sendEmail,
  sendTemplatedEmail,
  sendTraspasoEmail,
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
};
