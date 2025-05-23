// services/cronService.js - Versión mejorada
const cron = require("node-cron");
const logger = require("./logger");
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("./emailService");

let task;
let isRunning = false;
let isEnabled = false;
let currentHour = "02:00";
let transferService;
let LinkedTasksService; // Nueva importación diferida

const startCronJob = (hour) => {
  // Importaciones diferidas para evitar dependencia circular
  if (!transferService) {
    transferService = require("./transferService");
  }
  if (!LinkedTasksService) {
    try {
      LinkedTasksService = require("./LinkedTasksService");
    } catch (error) {
      logger.warn("LinkedTasksService no disponible, usando modo compatible");
      LinkedTasksService = null;
    }
  }

  // Detener tarea existente si hay una
  if (task) {
    logger.info("Deteniendo trabajo cron existente...");
    task.stop();
    task = null;
  }

  if (!isEnabled) {
    logger.info("La ejecución automática está deshabilitada.");
    return { enabled: isEnabled, active: false, hour: hour || currentHour };
  }

  // Validar formato de hora
  if (!hour || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hour)) {
    logger.error(`Formato de hora inválido: ${hour}. Usando ${currentHour}`);
    hour = currentHour;
  }

  currentHour = hour;
  const [hh, mm] = hour.split(":");
  const cronExpression = `${mm} ${hh} * * *`;

  if (!cron.validate(cronExpression)) {
    logger.error(`Expresión cron inválida: ${cronExpression}`);
    return {
      enabled: isEnabled,
      active: false,
      hour: currentHour,
      error: "Expresión cron inválida",
    };
  }

  logger.info(
    `Programando tarea para ejecutarse a las ${hour} (${cronExpression})`
  );

  task = cron.schedule(cronExpression, async () => {
    if (!isEnabled) {
      logger.info("El planificador fue deshabilitado. Omitiendo ejecución.");
      return;
    }

    if (isRunning) {
      logger.warn("⚠️ El proceso de transferencia ya está en ejecución");
      return;
    }

    await executeAutomaticTransfers();
  });

  task.start();
  logger.info(`🕒 Transferencias programadas diariamente a las ${hour}`);

  return { enabled: isEnabled, active: true, hour: currentHour };
};

/**
 * Ejecuta transferencias automáticas con soporte para tareas vinculadas
 */
const executeAutomaticTransfers = async () => {
  isRunning = true;
  let results = [];
  let processedGroups = new Set();

  try {
    logger.info("🔄 Iniciando transferencias automáticas programadas...");

    const tasks = await transferService.getTransferTasks();
    logger.info(`📋 Se encontraron ${tasks.length} tareas automáticas`);

    if (!tasks.length) {
      logger.info("ℹ️ No hay transferencias definidas para ejecutar.");
      return;
    }

    // Si LinkedTasksService está disponible, usar lógica avanzada
    if (LinkedTasksService) {
      const tasksToExecute = [];
      const groupRepresentatives = new Map();

      // Agrupar tareas por vinculación
      for (const task of tasks) {
        if (!task.active) {
          logger.warn(`⚠️ La tarea ${task.name} está inactiva. Omitiendo.`);
          continue;
        }

        try {
          const linkingInfo = await LinkedTasksService.getTaskLinkingInfo(
            task._id
          );

          if (
            linkingInfo &&
            linkingInfo.hasLinkedTasks &&
            linkingInfo.linkedGroup
          ) {
            const groupName = linkingInfo.linkedGroup;

            if (!groupRepresentatives.has(groupName)) {
              groupRepresentatives.set(groupName, {
                taskId: task._id,
                taskName: task.name,
                groupName: groupName,
                isGroup: true,
                linkingInfo,
              });
              logger.info(
                `🔗 Grupo "${groupName}" representado por tarea "${task.name}"`
              );
            } else {
              logger.info(
                `⏭️ Tarea "${task.name}" omitida (grupo "${groupName}" ya representado)`
              );
            }
          } else {
            // Tarea individual
            tasksToExecute.push({
              taskId: task._id,
              taskName: task.name,
              isGroup: false,
              task,
            });
          }
        } catch (linkingError) {
          logger.warn(
            `⚠️ Error verificando vinculaciones de ${task.name}: ${linkingError.message}`
          );
          tasksToExecute.push({
            taskId: task._id,
            taskName: task.name,
            isGroup: false,
            task,
          });
        }
      }

      // Agregar representantes de grupos
      for (const groupInfo of groupRepresentatives.values()) {
        tasksToExecute.push(groupInfo);
      }

      logger.info(
        `🎯 Se ejecutarán ${tasksToExecute.length} elementos (individuales + grupos)`
      );

      // Ejecutar con límite de concurrencia
      const concurrencyLimit = 2;
      for (let i = 0; i < tasksToExecute.length; i += concurrencyLimit) {
        const batch = tasksToExecute.slice(i, i + concurrencyLimit);

        const batchPromises = batch.map(async (item) => {
          try {
            if (item.isGroup) {
              logger.info(
                `🔗 Ejecutando grupo "${item.groupName}" desde tarea "${item.taskName}"`
              );
              const groupResult = await LinkedTasksService.executeLinkedGroup(
                item.taskId,
                "auto"
              );

              if (groupResult.success && groupResult.linkedTasksResults) {
                groupResult.linkedTasksResults.forEach((taskResult) => {
                  results.push({
                    name: taskResult.taskName,
                    success: taskResult.success,
                    inserted: taskResult.inserted || 0,
                    updated: taskResult.updated || 0,
                    duplicates: taskResult.duplicates || 0,
                    rows: taskResult.rows || 0,
                    message:
                      taskResult.message ||
                      "Transferencia automática completada",
                    errorDetail: taskResult.error || "N/A",
                    isGroupMember: true,
                    groupName: item.groupName,
                  });
                });
                logger.info(
                  `✅ Grupo "${item.groupName}": ${groupResult.successfulTasks}/${groupResult.totalTasks} exitosas`
                );
              } else {
                results.push({
                  name: `Grupo: ${item.groupName}`,
                  success: false,
                  inserted: 0,
                  updated: 0,
                  duplicates: 0,
                  rows: 0,
                  message:
                    groupResult.message || "Error en la ejecución del grupo",
                  errorDetail: groupResult.error || "N/A",
                  groupName: item.groupName,
                });
                logger.error(
                  `❌ Error en grupo "${item.groupName}": ${groupResult.message}`
                );
              }
            } else {
              // Tarea individual
              logger.info(`📌 Ejecutando tarea individual: ${item.taskName}`);
              const result = await item.task.execute();

              results.push({
                name: item.taskName,
                success: result?.success || false,
                inserted: result?.inserted || 0,
                updated: result?.updated || 0,
                duplicates: result?.duplicates || 0,
                rows: result?.rows || 0,
                message:
                  result?.message || "Transferencia automática completada",
                errorDetail: result?.errorDetail || "N/A",
              });
              logger.info(
                `${result?.success ? "✅" : "❌"} Tarea "${item.taskName}": ${
                  result?.success ? "Éxito" : "Error"
                }`
              );
            }
          } catch (taskError) {
            logger.error(
              `❌ Error ejecutando ${item.isGroup ? "grupo" : "tarea"} "${
                item.taskName
              }": ${taskError.message}`
            );
            results.push({
              name: item.taskName,
              success: false,
              inserted: 0,
              updated: 0,
              duplicates: 0,
              rows: 0,
              message: "Error en la ejecución automática",
              errorDetail: taskError.message || "Error desconocido",
            });
          }
        });

        await Promise.all(batchPromises);

        // Pausa entre lotes
        if (i + concurrencyLimit < tasksToExecute.length) {
          logger.info("⏸️ Pausa de 30 segundos entre lotes...");
          await new Promise((resolve) => setTimeout(resolve, 30000));
        }
      }
    } else {
      // Lógica simple sin tareas vinculadas (modo compatible)
      for (const task of tasks) {
        if (!task.active) {
          logger.warn(`⚠️ La tarea ${task.name} está inactiva. Omitiendo.`);
          continue;
        }

        logger.info(`🚀 Ejecutando transferencia programada: ${task.name}`);

        let result;
        try {
          if (task.transferType === "down") {
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

        logger.info(`✅ Transferencia completada: ${task.name}`);
      }
    }

    // Generar resumen
    const successfulTasks = results.filter((r) => r.success).length;
    const failedTasks = results.filter((r) => !r.success).length;
    const totalRecords = results.reduce(
      (sum, r) => sum + (r.inserted || 0) + (r.updated || 0),
      0
    );

    logger.info(
      `📊 Resumen: ${successfulTasks} exitosas, ${failedTasks} fallidas, ${totalRecords} registros`
    );
    logger.info("✅ Todas las transferencias programadas completadas");

    // Enviar correo con resultados
    if (results.length > 0) {
      await sendTransferResultsEmail(results, currentHour);
      logger.info(
        `📧 Correo de resultados enviado para ${results.length} transferencias`
      );
    }
  } catch (error) {
    logger.error("❌ Error en las transferencias programadas:", error.message);

    try {
      const errorMessage = `Error crítico durante la ejecución: ${error.message}`;
      await sendCriticalErrorEmail(errorMessage, currentHour);
      logger.info(`📧 Correo de error crítico enviado`);
    } catch (emailError) {
      logger.error(
        `❌ Error al enviar correo de notificación: ${emailError.message}`
      );
    }
  } finally {
    isRunning = false;
  }
};

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

const setSchedulerEnabled = (enabled, hour = "02:00") => {
  isEnabled = enabled;
  if (hour && hour !== currentHour) {
    currentHour = hour;
  }

  if (enabled) {
    logger.info(`Habilitando planificador de tareas para las ${currentHour}`);
    return startCronJob(currentHour);
  } else {
    logger.info("Deshabilitando planificador de tareas");
    stopCronJob();
    return { enabled: false, active: false, hour: currentHour };
  }
};

const getSchedulerStatus = () => {
  return {
    enabled: isEnabled,
    active: task !== null,
    running: isRunning,
    hour: currentHour,
    nextExecution: task
      ? getNextExecutionTime(task.options?.cronTime?.source)
      : null,
  };
};

const syncWithConfig = (config) => {
  if (!config) {
    return getSchedulerStatus();
  }
  return setSchedulerEnabled(config.enabled, config.hour);
};

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
  syncWithConfig,
};
