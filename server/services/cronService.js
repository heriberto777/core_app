// services/cronService.js
const cron = require("node-cron");
const logger = require("./logger");
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("./emailService");

let task;
let isRunning = false;
let transferService; // Se inicializará con importación diferida

/**
 * Inicia el trabajo programado para ejecutar transferencias
 * @param {string} hour - Hora de ejecución en formato "HH:MM"
 */
const startCronJob = (hour) => {
  // Importación diferida para evitar dependencia circular
  if (!transferService) {
    transferService = require("./transferService");
  }

  if (task) {
    task.stop();
  }

  const [hh, mm] = hour.split(":");

  task = cron.schedule(`${mm} ${hh} * * *`, async () => {
    if (isRunning) {
      logger.warn("⚠️ El proceso de transferencia ya está en ejecución");
      return;
    }

    isRunning = true;
    let results = [];

    try {
      logger.info("🔄 Iniciando transferencias programadas...");

      const tasks = await transferService.getTransferTasks();
      logger.debug(
        "Tareas activas para el cronservices -> ",
        tasks.map((t) => t.name)
      );

      if (!tasks.length) {
        throw new Error("❌ No hay transferencias definidas para ejecutar.");
      }

      // 🔄 **Ejecución SECUENCIAL de las transferencias**
      for (const task of tasks) {
        if (!task.active) {
          logger.warn(`⚠️ La tarea ${task.name} está inactiva. Omitiendo.`);
          continue;
        }

        logger.info(`🚀 Ejecutando transferencia programada: ${task.name}`);

        let result;
        try {
          if (task.transferType === "up") {
            result = await transferService.executeTransferUp(task._id);
          } else if (task.transferType === "down") {
            result = await transferService.executeTransferDown(task._id);
          } else {
            // result = await transferService.executeTransfer(task._id);
            const result = await executeTransferWithRetry(task._id);
          }
        } catch (error) {
          logger.error(`❌ Error en la transferencia ${task.name}:`, error);
          result = {
            success: false,
            message: "Error en la ejecución de la transferencia",
            errorDetail: error.message || String(error),
          };
        }

        // Formato unificado para resultados
        results.push({
          name: task.name,
          success: result.success,
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          duplicates: result.duplicates || 0,
          rows: result.rows || 0,
          message: result.message || "Transferencia completada",
          errorDetail: result.errorDetail || "N/A",
          initialCount: result.initialCount,
          finalCount: result.finalCount,
          duplicatedRecords: result.duplicatedRecords || [],
          hasMoreDuplicates: result.hasMoreDuplicates || false,
          totalDuplicates: result.totalDuplicates || 0,
        });

        logger.info(`✅ Transferencia completada: ${task.name}`, result);
      }

      logger.info("✅ Todas las transferencias programadas completadas");

      // 📩 Notificar resultado por correo usando el nuevo servicio que obtiene destinatarios de la BD
      await sendTransferResultsEmail(results, hour);
      logger.info(
        `📧 Correo de resultados enviado para ${results.length} transferencias automáticas`
      );
    } catch (error) {
      logger.error("❌ Error en las transferencias programadas:", {
        message: error.message,
      });

      // 📩 Enviar correo de error crítico usando el nuevo servicio
      try {
        const errorMessage = `Se produjo un error crítico durante la ejecución: ${error.message}`;
        await sendCriticalErrorEmail(errorMessage, hour);
        logger.info(`📧 Correo de error crítico enviado`);
      } catch (emailError) {
        logger.error(
          `❌ Error al enviar correo de notificación: ${emailError.message}`
        );
      }
    } finally {
      isRunning = false;
    }
  });

  task.start();
  logger.info(`🕒 Transferencias programadas diariamente a las ${hour}`);
};

module.exports = { startCronJob };
