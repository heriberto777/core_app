// services/cronService.js
const cron = require("node-cron");
const logger = require("./logger");
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("./emailService");

let task;
let isRunning = false;
let isEnabled = true; // Nueva variable para controlar si el servicio está habilitado
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

  // Detener tarea existente si hay una
  if (task) {
    logger.info("Deteniendo trabajo cron existente...");
    task.stop();
    task = null;
  }

  // Si el planificador está deshabilitado, no crear nueva tarea
  if (!isEnabled) {
    logger.info(
      "La ejecución automática está deshabilitada. No se programará ningún trabajo cron."
    );
    return;
  }

  // Validar formato de hora
  if (!hour || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hour)) {
    logger.error(
      `Formato de hora inválido: ${hour}. Usando 02:00 por defecto.`
    );
    hour = "02:00";
  }

  const [hh, mm] = hour.split(":");
  const cronExpression = `${mm} ${hh} * * *`;

  // Validar expresión cron
  if (!cron.validate(cronExpression)) {
    logger.error(`Expresión cron inválida: ${cronExpression}`);
    return;
  }

  logger.info(
    `Programando tarea para ejecutarse a las ${hour} (${cronExpression})`
  );

  task = cron.schedule(cronExpression, async () => {
    // Verificar si el planificador sigue habilitado
    if (!isEnabled) {
      logger.info("El planificador fue deshabilitado. Omitiendo ejecución.");
      return;
    }

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
            result = await transferService.executeTransferWithRetry(task._id);
          } else if (task.transferType === "down") {
            result = await transferService.executeTransferDown(task._id);
          } else {
            result = await transferService.executeTransferWithRetry(task._id);
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

/**
 * Detiene el trabajo cron programado
 */
const stopCronJob = () => {
  if (task) {
    logger.info("Deteniendo planificador de tareas...");
    task.stop();
    task = null;
    logger.info("✅ Planificador de tareas detenido correctamente");
    return true;
  }
  logger.warn("No hay planificador de tareas activo para detener");
  return false;
};

/**
 * Habilita o deshabilita el planificador de tareas
 * @param {boolean} enabled - true para habilitar, false para deshabilitar
 * @param {string} hour - Hora a la que programar las tareas (si se habilita)
 */
const setSchedulerEnabled = (enabled, hour = "02:00") => {
  isEnabled = enabled;

  if (enabled) {
    logger.info(`Habilitando planificador de tareas para las ${hour}`);
    startCronJob(hour);
  } else {
    logger.info("Deshabilitando planificador de tareas");
    stopCronJob();
  }

  return {
    enabled: isEnabled,
    hour: hour,
    active: task !== null,
  };
};

/**
 * Retorna el estado actual del planificador
 */
const getSchedulerStatus = () => {
  return {
    enabled: isEnabled,
    active: task !== null,
    running: isRunning,
    nextExecution: task
      ? getNextExecutionTime(task.options?.cronTime?.source)
      : null,
  };
};

/**
 * Calcula la próxima fecha de ejecución a partir de una expresión cron
 * @param {string} cronExpression - Expresión cron (e.g. "30 2 * * *")
 * @returns {Date|null} - Fecha de la próxima ejecución
 */
const getNextExecutionTime = (cronExpression) => {
  try {
    if (!cronExpression) return null;

    const parts = cronExpression.split(" ");
    if (parts.length !== 5) return null;

    const [minute, hour] = parts;

    const now = new Date();
    const nextRun = new Date();

    nextRun.setHours(parseInt(hour, 10));
    nextRun.setMinutes(parseInt(minute, 10));
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);

    // Si la hora ya pasó hoy, programar para mañana
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun;
  } catch (error) {
    logger.error(`Error calculando próxima ejecución: ${error.message}`);
    return null;
  }
};

module.exports = {
  startCronJob,
  stopCronJob,
  setSchedulerEnabled,
  getSchedulerStatus,
};
