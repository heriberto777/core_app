// services/emailService.js
const nodemailer = require("nodemailer");
const logger = require("./logger");
const EmailTemplateService = require("./emailTemplateService");
const EmailConfigService = require("./emailConfigService");
const { getRecipientEmails } = require("./emailRecipientService");

/**
 * Servicio de correo electrónico con configuración dinámica
 */
class EmailService {
  constructor() {
    this.transporters = new Map();
    this.defaultTransporter = null;
  }

  /**
   * Obtiene o crea un transporter basado en la configuración
   * @param {Object} config - Configuración de email
   * @returns {Object} Transporter de nodemailer
   */
  async getTransporter(config = null) {
    try {
      if (!config) {
        config = await EmailConfigService.getDefaultConfig();

        if (!config) {
          logger.error("No hay configuración de email disponible");
          return null;
        }
      }

      const configKey = config._id.toString();

      if (this.transporters.has(configKey)) {
        return this.transporters.get(configKey);
      }

      // CONFIGURACIÓN CORREGIDA PARA SSL/TLS
      const transporterConfig = {
        host: config.host,
        port: config.port,
        secure: config.secure, // true para 465, false para otros puertos
        auth: {
          user: config.auth.user,
          pass: config.auth.pass,
        },
        // Configuraciones adicionales para resolver problemas SSL/TLS
        tls: {
          // No fallar en certificados inválidos (para desarrollo/testing)
          rejectUnauthorized: false,
          // Forzar TLS version si es necesario
          minVersion: "TLSv1.2",
        },
      };

      // LÓGICA MEJORADA PARA DETECTAR CONFIGURACIÓN SSL/TLS
      if (config.port === 465) {
        // Puerto 465 requiere SSL directo
        transporterConfig.secure = true;
      } else if (config.port === 587 || config.port === 25) {
        // Puerto 587 y 25 usan STARTTLS
        transporterConfig.secure = false;
        transporterConfig.requireTLS = true; // Forzar STARTTLS
      }

      // Configuraciones específicas por proveedor
      if (config.host.includes("gmail.com")) {
        transporterConfig.service = "gmail";
        transporterConfig.secure = config.port === 465;
      } else if (
        config.host.includes("outlook.com") ||
        config.host.includes("hotmail.com")
      ) {
        transporterConfig.service = "hotmail";
        transporterConfig.secure = config.port === 465;
      } else if (config.host.includes("yahoo.com")) {
        transporterConfig.service = "yahoo";
        transporterConfig.secure = config.port === 465;
      }

      // Agregar opciones adicionales si existen
      if (config.options) {
        if (config.options.connectionTimeout) {
          transporterConfig.connectionTimeout =
            config.options.connectionTimeout;
        }
        if (config.options.greetingTimeout) {
          transporterConfig.greetingTimeout = config.options.greetingTimeout;
        }
        if (config.options.socketTimeout) {
          transporterConfig.socketTimeout = config.options.socketTimeout;
        }
        if (config.options.maxConnections) {
          transporterConfig.pool = true;
          transporterConfig.maxConnections = config.options.maxConnections;
        }
        if (config.options.rateDelta && config.options.rateLimit) {
          transporterConfig.rateDelta = config.options.rateDelta;
          transporterConfig.rateLimit = config.options.rateLimit;
        }
      }

      logger.info(`Creando transporter para: ${config.name}`);
      logger.debug(`Configuración del transporter:`, {
        host: transporterConfig.host,
        port: transporterConfig.port,
        secure: transporterConfig.secure,
        service: transporterConfig.service,
        user: transporterConfig.auth.user,
      });

      const transporter = nodemailer.createTransport(transporterConfig);

      // VERIFICACIÓN MEJORADA CON TIMEOUT Y RETRY
      try {
        logger.info(`Verificando conexión para configuración: ${config.name}`);
        await this.verifyTransporterConnection(transporter, config.name);
      } catch (verifyError) {
        logger.error(
          `Error en verificación inicial para ${config.name}:`,
          verifyError
        );

        // INTENTAR CONFIGURACIÓN ALTERNATIVA SI FALLA
        if (transporterConfig.secure && config.port !== 465) {
          logger.info(
            `Reintentando con configuración no segura para ${config.name}`
          );
          transporterConfig.secure = false;
          transporterConfig.requireTLS = true;

          const alternativeTransporter =
            nodemailer.createTransport(transporterConfig);
          await this.verifyTransporterConnection(
            alternativeTransporter,
            config.name
          );

          // Si funciona con la configuración alternativa, usar esa
          this.transporters.set(configKey, alternativeTransporter);
          logger.info(
            `Transporter alternativo creado y verificado para: ${config.name}`
          );
          return alternativeTransporter;
        }

        throw verifyError;
      }

      this.transporters.set(configKey, transporter);
      logger.info(
        `Transporter creado y verificado exitosamente para: ${config.name}`
      );
      return transporter;
    } catch (error) {
      logger.error(
        `Error al crear transporter para configuración ${
          config?.name || "desconocida"
        }:`,
        {
          error: error.message,
          code: error.code,
          command: error.command,
          stack: error.stack,
        }
      );
      return null;
    }
  }

  /**
   * Verifica la conexión del transporter con timeout
   * @param {Object} transporter - Transporter a verificar
   * @param {string} configName - Nombre de la configuración
   */
  async verifyTransporterConnection(transporter, configName) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout al verificar conexión para ${configName}`));
      }, 10000); // 10 segundos de timeout

      transporter.verify((error, success) => {
        clearTimeout(timeout);

        if (error) {
          logger.error(`Error en verificación de ${configName}:`, error);
          reject(error);
        } else {
          logger.info(`Verificación exitosa para ${configName}`);
          resolve(success);
        }
      });
    });
  }

  /**
   * Limpia el cache de transporters
   */
  clearTransporterCache() {
    for (const [key, transporter] of this.transporters) {
      try {
        if (transporter && typeof transporter.close === "function") {
          transporter.close();
        }
      } catch (error) {
        logger.warn(`Error al cerrar transporter ${key}:`, error);
      }
    }

    this.transporters.clear();
    logger.debug("Cache de transporters limpiado");
  }

  /**
   * Prueba una configuración de email con reintentos
   * @param {Object} config - Configuración a probar
   * @param {string} testEmail - Email donde enviar la prueba
   * @returns {Promise<boolean>} - true si la prueba fue exitosa
   */
  async testEmailConfig(config, testEmail) {
    try {
      logger.info(`Iniciando prueba de configuración: ${config.name}`);
      logger.debug(`Detalles de configuración a probar:`, {
        name: config.name,
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.auth.user,
      });

      const transporter = await this.getTransporter(config);

      if (!transporter) {
        logger.error("No se pudo crear transporter para la prueba");
        return false;
      }

      const testMailOptions = {
        from: config.from,
        to: testEmail,
        subject: `Prueba de Configuración: ${config.name}`,
        text: `Esta es una prueba de la configuración de email: ${
          config.name
        }\n\nFecha: ${new Date().toLocaleString()}\n\nSi recibes este correo, la configuración está funcionando correctamente.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50;">✅ Prueba de Configuración de Email</h2>
            <p>Esta es una prueba de la configuración: <strong>${
              config.name
            }</strong></p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Detalles de la configuración:</h3>
              <ul>
                <li><strong>Servidor:</strong> ${config.host}</li>
                <li><strong>Puerto:</strong> ${config.port}</li>
                <li><strong>SSL:</strong> ${config.secure ? "Sí" : "No"}</li>
                <li><strong>Usuario:</strong> ${config.auth.user}</li>
              </ul>
            </div>
            <p><strong>Fecha y hora:</strong> ${new Date().toLocaleString()}</p>
            <div style="background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 10px; border-radius: 5px; margin: 20px 0;">
              <strong>✅ ¡Configuración funcionando correctamente!</strong><br>
              Si recibes este correo, la configuración de email está operativa.
            </div>
            <hr style="margin: 30px 0;">
            <p style="color: #6c757d; font-size: 12px;">Este es un correo de prueba automático generado por el sistema de transferencias.</p>
          </div>
        `,
      };

      logger.info(`Enviando correo de prueba a: ${testEmail}`);
      const info = await transporter.sendMail(testMailOptions);

      logger.info(
        `✅ Correo de prueba enviado exitosamente para ${config.name}. Message ID: ${info.messageId}`
      );
      return true;
    } catch (error) {
      logger.error(
        `❌ Error al enviar correo de prueba con configuración ${config.name}:`,
        {
          error: error.message,
          code: error.code,
          command: error.command,
        }
      );
      return false;
    }
  }

  // Resto de métodos permanecen igual...
  async sendEmail(
    to,
    subject,
    text,
    html,
    attachments = [],
    configName = null
  ) {
    if (!to || (Array.isArray(to) && to.length === 0)) {
      logger.warn(`No se pudo enviar correo: No hay destinatarios válidos`);
      return false;
    }

    try {
      let config = null;

      if (configName) {
        config = await EmailConfigService.getConfigByName(configName);
        if (!config) {
          logger.warn(
            `Configuración '${configName}' no encontrada, usando configuración por defecto`
          );
        }
      }

      const transporter = await this.getTransporter(config);

      if (!transporter) {
        logger.error("No se pudo obtener transporter para envío de correo");
        return false;
      }

      if (!config) {
        config = await EmailConfigService.getDefaultConfig();
      }

      const mailOptions = {
        from: config.from,
        to: Array.isArray(to) ? to.join(",") : to,
        subject,
        text,
        html,
        attachments,
      };

      const info = await transporter.sendMail(mailOptions);
      logger.info(
        `Correo enviado a ${to} con ID: ${info.messageId} usando configuración: ${config.name}`
      );
      return true;
    } catch (error) {
      logger.error(`Error enviando correo a ${to}:`, error);
      return false;
    }
  }

  async sendTemplatedEmail(
    to,
    subject,
    templateName,
    templateData,
    attachments = [],
    configName = null
  ) {
    try {
      const html = EmailTemplateService.renderTemplate(
        templateName,
        templateData
      );
      const text = EmailTemplateService.generatePlainText(templateData);
      return await this.sendEmail(
        to,
        subject,
        text,
        html,
        attachments,
        configName
      );
    } catch (error) {
      logger.error(
        `Error al enviar correo con plantilla ${templateName}:`,
        error
      );

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

        return await this.sendEmail(
          to,
          `${subject} (Error de plantilla)`,
          simpleText,
          simpleHtml,
          attachments,
          configName
        );
      } catch (fallbackError) {
        logger.error("Error en el envío de correo de fallback:", fallbackError);
        return false;
      }
    }
  }

  // Resto de métodos de la clase...
  async sendTraspasoEmail(traspasoData, pdfPath = null, configName = null) {
    try {
      const recipients = await getRecipientEmails("traspaso");

      if (!recipients || recipients.length === 0) {
        logger.warn(
          "No hay destinatarios configurados para recibir notificaciones de traspaso"
        );
        return false;
      }

      const subject = traspasoData.success
        ? `✅ Traspaso de Bodega Completado: ${
            traspasoData.documento_inv || ""
          }`
        : `⚠️ Error en Traspaso de Bodega: ${
            traspasoData.documento_inv || "N/A"
          }`;

      const attachments = [];
      if (pdfPath) {
        attachments.push({
          filename: `traspaso_${traspasoData.documento_inv || "documento"}.pdf`,
          path: pdfPath,
          contentType: "application/pdf",
        });
      }

      if (!traspasoData.timestamp) {
        traspasoData.timestamp = new Date().toLocaleString();
      }

      return await this.sendTemplatedEmail(
        recipients,
        subject,
        "traspaso",
        traspasoData,
        attachments,
        configName
      );
    } catch (error) {
      logger.error("Error al enviar correo de traspaso:", error);
      return false;
    }
  }

  async sendTransferResultsEmail(results, scheduledHour, configName = null, meta = null) {
    try {
      const recipients = await getRecipientEmails("transferencias");

      if (!recipients || recipients.length === 0) {
        logger.warn(
          "No hay destinatarios configurados para recibir notificaciones de transferencias"
        );
        return false;
      }

      const successResults = results.filter((r) => r.success);
      const failedResults = results.filter((r) => !r.success);
      const isManualRun = scheduledHour === "manual" || scheduledHour === "manual_linked_group";

      const subject =
        failedResults.length === 0
          ? isManualRun
            ? "✅ Tarea Ejecutada con Éxito"
            : "✅ Transferencias Automáticas Completadas con Éxito"
          : isManualRun
            ? `⚠️ Tarea Ejecutada con Errores`
            : `⚠️ Transferencias Automáticas: ${failedResults.length} errores`;

      const resultsWithDuplicates = results.filter(
        (result) =>
          result.duplicates > 0 &&
          result.duplicatedRecords &&
          result.duplicatedRecords.length > 0
      );

      // Resumen de errores consolidado: antes solo se veía el error por fila
      // en la tabla de detalle, sin un bloque corto y fácil de leer de un vistazo.
      const errorSummary = failedResults.map((r) => ({
        name: r.name,
        message: r.errorDetail || r.message || "Error desconocido",
      }));

      const templateData = {
        title: subject,
        subtitle: `Resumen: ${successResults.length} exitosas, ${failedResults.length} fallidas`,
        successCount: successResults.length,
        failedCount: failedResults.length,
        scheduledHour,
        isManualRun,
        results,
        resultsWithDuplicates,
        errorSummary,
        // startTime/endTime/durationLabel: antes este correo nunca decía
        // cuándo realmente arrancó/terminó el proceso, solo la hora
        // *programada* del cron (que no es lo mismo).
        startTime: meta?.startTime || null,
        endTime: meta?.endTime || null,
        durationLabel: meta?.durationLabel || null,
        timestamp: new Date().toLocaleString(),
      };

      if (resultsWithDuplicates.length > 0) {
        for (const result of resultsWithDuplicates) {
          if (result.duplicatedRecords && result.duplicatedRecords.length > 0) {
            result.columns = Object.keys(result.duplicatedRecords[0]).filter(
              (key) => !key.startsWith("_")
            );
          }
        }
      }

      return await this.sendTemplatedEmail(
        recipients,
        subject,
        "transferenciasAutomaticas",
        templateData,
        [],
        configName
      );
    } catch (error) {
      logger.error(
        "Error al enviar correo de resultados de transferencias:",
        error
      );
      return false;
    }
  }

  async sendCriticalErrorEmail(
    errorMessage,
    scheduledHour = null,
    additionalInfo = null,
    configName = null
  ) {
    try {
      const recipients = await getRecipientEmails("erroresCriticos");

      if (!recipients || recipients.length === 0) {
        logger.warn(
          "No hay destinatarios configurados para recibir notificaciones de errores críticos"
        );
        return false;
      }

      const subject = "🚨 Error Crítico en Sistema de Transferencias";

      const templateData = {
        title: "Error en Sistema de Transferencias",
        errorMessage,
        scheduledHour,
        additionalInfo,
        timestamp: new Date().toLocaleString(),
      };

      return await this.sendTemplatedEmail(
        recipients,
        subject,
        "errorCritico",
        templateData,
        [],
        configName
      );
    } catch (error) {
      logger.error("Error al enviar correo de error crítico:", error);

      try {
        const recipients = await getRecipientEmails("erroresCriticos");
        const simpleText = `ERROR CRÍTICO: ${errorMessage}\n\nFecha y hora: ${new Date().toLocaleString()}`;
        return await this.sendEmail(
          recipients,
          subject,
          simpleText,
          `<p>${simpleText.replace("\n", "<br>")}</p>`,
          [],
          configName
        );
      } catch (fallbackError) {
        logger.error(
          "Error en el envío de correo de fallback para error crítico:",
          fallbackError
        );
        return false;
      }
    }
  }
}

// Crear instancia singleton
const emailServiceInstance = new EmailService();

module.exports = {
  sendEmail: emailServiceInstance.sendEmail.bind(emailServiceInstance),
  sendTemplatedEmail:
    emailServiceInstance.sendTemplatedEmail.bind(emailServiceInstance),
  sendTraspasoEmail:
    emailServiceInstance.sendTraspasoEmail.bind(emailServiceInstance),
  sendTransferResultsEmail:
    emailServiceInstance.sendTransferResultsEmail.bind(emailServiceInstance),
  sendCriticalErrorEmail:
    emailServiceInstance.sendCriticalErrorEmail.bind(emailServiceInstance),
  testEmailConfig:
    emailServiceInstance.testEmailConfig.bind(emailServiceInstance),
  clearTransporterCache:
    emailServiceInstance.clearTransporterCache.bind(emailServiceInstance),
};
