// services/cronService.js - Versión COMPLETAMENTE corregida
const cron = require("node-cron");
const logger = require("./logger");

// IMPORTACIÓN CORREGIDA - Usar destructuring
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("./emailService");

let task;
let isRunning = false;
let isEnabled = false;
let currentHour = "02:00";
let transferService;
let LinkedTasksService;

const startCronJob = (hour) => {
  // Importaciones diferidas
  if (!transferService) {
    transferService = require("./transferService");
  }
  if (!LinkedTasksService) {
    try {
      LinkedTasksService = require("./LinkedTasksService");
    } catch (error) {
      logger.warn("LinkedTasksService no disponible");
      LinkedTasksService = null;
    }
  }

  // Detener tarea existente
  if (task) {
    logger.info("🛑 Deteniendo trabajo cron existente...");
    task.stop();
    task = null;
  }

  if (!isEnabled) {
    logger.info("⚠️ La ejecución automática está deshabilitada.");
    return { enabled: isEnabled, active: false, hour: hour || currentHour };
  }

  // Validar formato de hora
  if (!hour || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hour)) {
    logger.error(`❌ Formato de hora inválido: ${hour}. Usando ${currentHour}`);
    hour = currentHour;
  }

  currentHour = hour;
  const [hh, mm] = hour.split(":");
  const cronExpression = `${mm} ${hh} * * *`;

  if (!cron.validate(cronExpression)) {
    logger.error(`❌ Expresión cron inválida: ${cronExpression}`);
    return {
      enabled: isEnabled,
      active: false,
      hour: currentHour,
      error: "Expresión cron inválida",
    };
  }

  logger.info(`⏰ Programando tarea para las ${hour} (${cronExpression})`);

  try {
    task = cron.schedule(
      cronExpression,
      async () => {
        if (!isEnabled) {
          logger.info("⚠️ Planificador deshabilitado. Omitiendo ejecución.");
          return;
        }

        if (isRunning) {
          logger.warn("⚠️ Proceso ya en ejecución. Omitiendo.");
          return;
        }

        logger.info("🚀 === INICIANDO EJECUCIÓN AUTOMÁTICA PROGRAMADA ===");
        await executeAutomaticTransfers();
      },
      {
        scheduled: true,
        timezone: "America/Santo_Domingo",
      }
    );

    task.start();
    logger.info(`✅ Cron job iniciado para las ${hour}`);

    return { enabled: isEnabled, active: true, hour: currentHour };
  } catch (cronError) {
    logger.error("❌ Error al crear cron job:", cronError);
    return {
      enabled: isEnabled,
      active: false,
      hour: currentHour,
      error: cronError.message,
    };
  }
};

/**
 * FUNCIÓN PRINCIPAL - Ejecuta transferencias automáticas
 */
const executeAutomaticTransfers = async () => {
  const startTime = Date.now();
  isRunning = true;
  let results = [];
  let processedGroups = new Set(); // ← IMPORTANTE: Evitar duplicados

  try {
    logger.info("🔄 === INICIANDO TRANSFERENCIAS AUTOMÁTICAS ===");

    const tasks = await transferService.getTransferTasks();
    logger.info(`📋 Se encontraron ${tasks.length} tareas automáticas`);

    if (!tasks.length) {
      logger.info("ℹ️ No hay transferencias definidas para ejecutar.");

      // Enviar correo informativo
      try {
        await sendTransferResultsEmail([], currentHour, null);
        logger.info("📧 Correo informativo enviado (sin tareas)");
      } catch (emailError) {
        logger.error("📧 Error enviando correo informativo:", emailError);
      }
      return;
    }

    // **LÓGICA MEJORADA: Manejar grupos y tareas individuales**
    const tasksToExecute = [];
    const groupRepresentatives = new Map();

    // Primer paso: Identificar grupos y tareas individuales
    for (const task of tasks) {
      if (!task.active) {
        logger.warn(`⚠️ La tarea ${task.name} está inactiva. Omitiendo.`);
        continue;
      }

      try {
        // Verificar si es parte de un grupo vinculado
        const linkingInfo = await LinkedTasksService.getTaskLinkingInfo(
          task._id
        );

        if (
          linkingInfo &&
          linkingInfo.hasLinkedTasks &&
          linkingInfo.linkedGroup
        ) {
          const groupName = linkingInfo.linkedGroup;

          // Solo agregar el primer representante del grupo
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
            originalTask: task,
          });
        }
      } catch (linkingError) {
        logger.warn(
          `⚠️ Error verificando vinculaciones de ${task.name}: ${linkingError.message}`
        );
        // Tratarla como individual si hay error
        tasksToExecute.push({
          taskId: task._id,
          taskName: task.name,
          isGroup: false,
          originalTask: task,
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

    // **Segundo paso: Ejecutar con límite de concurrencia**
    const concurrencyLimit = 2; // Máximo 2 a la vez
    for (let i = 0; i < tasksToExecute.length; i += concurrencyLimit) {
      const batch = tasksToExecute.slice(i, i + concurrencyLimit);

      const batchPromises = batch.map(async (item) => {
        try {
          if (item.isGroup) {
            logger.info(
              `🔗 Ejecutando grupo "${item.groupName}" desde tarea "${item.taskName}"`
            );

            // EJECUTAR GRUPO COMPLETO
            const groupResult = await LinkedTasksService.executeLinkedGroup(
              item.taskId,
              "auto"
            );

            if (groupResult.success && groupResult.linkedTasksResults) {
              // Agregar resultados de cada tarea del grupo
              groupResult.linkedTasksResults.forEach((taskResult) => {
                results.push({
                  name: taskResult.taskName,
                  success: taskResult.success,
                  inserted: taskResult.inserted || 0,
                  updated: taskResult.updated || 0,
                  duplicates: taskResult.duplicates || 0,
                  rows: taskResult.rows || 0,
                  message:
                    taskResult.message || "Transferencia automática completada",
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
            // EJECUTAR TAREA INDIVIDUAL
            logger.info(`📌 Ejecutando tarea individual: ${item.taskName}`);

            // USAR DIRECTAMENTE transferService en lugar del wrapper task.execute()
            let result;
            try {
              // Obtener la tarea desde MongoDB para ejecutar correctamente
              const TransferTask = require("../models/transferTaskModel");
              const taskDoc = await TransferTask.findById(item.taskId);

              if (!taskDoc) {
                throw new Error("Tarea no encontrada en base de datos");
              }

              // Ejecutar según el tipo de transferencia
              if (taskDoc.transferType === "down") {
                result = await transferService.executeTransferDown(item.taskId);
              } else {
                result = await transferService.executeTransferWithRetry(
                  item.taskId
                );
              }
            } catch (execError) {
              logger.error(
                `Error ejecutando tarea individual ${item.taskName}:`,
                execError
              );
              result = {
                success: false,
                message: "Error en la ejecución",
                errorDetail: execError.message || "Error desconocido",
              };
            }

            results.push({
              name: item.taskName,
              success: result?.success || false,
              inserted: result?.inserted || 0,
              updated: result?.updated || 0,
              duplicates: result?.duplicates || 0,
              rows: result?.rows || 0,
              message: result?.message || "Transferencia automática completada",
              errorDetail: result?.errorDetail || "N/A",
            });
            logger.info(
              `${result?.success ? "✅" : "❌"} Tarea "${item.taskName}": ${result?.success ? "Éxito" : "Error"
              }`
            );
          }
        } catch (itemError) {
          logger.error(
            `❌ Error ejecutando ${item.isGroup ? "grupo" : "tarea"} "${item.taskName
            }": ${itemError.message}`
          );
          results.push({
            name: item.taskName,
            success: false,
            inserted: 0,
            updated: 0,
            duplicates: 0,
            rows: 0,
            message: "Error en la ejecución automática",
            errorDetail: itemError.message || "Error desconocido",
          });
        }
      });

      // Esperar a que termine el lote actual
      await Promise.all(batchPromises);

      // Pausa entre lotes
      if (i + concurrencyLimit < tasksToExecute.length) {
        logger.info("⏸️ Pausa de 30 segundos entre lotes...");
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    }

    // **Generar resumen final**
    const successfulTasks = results.filter((r) => r.success).length;
    const failedTasks = results.filter((r) => !r.success).length;
    const totalRecords = results.reduce(
      (sum, r) => sum + (r.inserted || 0) + (r.updated || 0),
      0
    );

    logger.info("📊 === RESUMEN FINAL DE EJECUCIÓN AUTOMÁTICA ===");
    logger.info(`✅ Exitosas: ${successfulTasks}`);
    logger.info(`❌ Fallidas: ${failedTasks}`);
    logger.info(`📦 Total registros: ${totalRecords}`);
    logger.info("===============================================");

    // **ENVÍO DE CORREO - CRÍTICO**
    try {
      if (results.length > 0) {
        await sendTransferResultsEmail(results, currentHour, null);
        logger.info(
          `📧 ✅ Correo de resultados enviado para ${results.length} transferencias`
        );
      }
    } catch (emailError) {
      logger.error(`📧 ❌ ERROR enviando correo:`, emailError);

      // Fallback a correo de error crítico
      try {
        await sendCriticalErrorEmail(
          `Error enviando correo de resultados: ${emailError.message}`,
          currentHour,
          `Resultados disponibles: ${successfulTasks} exitosas, ${failedTasks} fallidas`
        );
        logger.info(`📧 Correo de error crítico enviado como fallback`);
      } catch (criticalError) {
        logger.error(
          `📧 ❌ Error total enviando correo crítico:`,
          criticalError
        );
      }
    }
  } catch (error) {
    logger.error(
      "❌ ERROR CRÍTICO en transferencias programadas:",
      error.message
    );

    try {
      const errorMessage = `Error crítico durante la ejecución: ${error.message}`;
      await sendCriticalErrorEmail(errorMessage, currentHour, error.stack);
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

// Resto de funciones
const stopCronJob = () => {
  if (task) {
    logger.info("🛑 Deteniendo planificador...");
    task.stop();
    // task.destroy();
    task = null;
    logger.info("✅ Planificador detenido");
    return true;
  }
  logger.warn("⚠️ No hay planificador activo");
  return false;
};

const setSchedulerEnabled = (enabled, hour = "02:00") => {
  isEnabled = enabled;
  if (hour && hour !== currentHour) {
    currentHour = hour;
  }

  logger.info(
    `🔧 Configurando planificador: ${enabled ? "HABILITADO" : "DESHABILITADO"
    } a las ${currentHour}`
  );

  if (enabled) {
    return startCronJob(currentHour);
  } else {
    stopCronJob();
    return { enabled: false, active: false, hour: currentHour };
  }
};

const getSchedulerStatus = () => {
  const status = {
    enabled: isEnabled,
    active: task !== null,
    running: isRunning,
    hour: currentHour,
    nextExecution: task
      ? getNextExecutionTime(
        `${currentHour.split(":")[1]} ${currentHour.split(":")[0]} * * *`
      )
      : null,
  };

  logger.debug("📊 Estado del planificador:", status);
  return status;
};

const syncWithConfig = (config) => {
  if (!config) {
    return getSchedulerStatus();
  }
  logger.info("🔄 Sincronizando con configuración:", config);
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
    logger.error(`❌ Error calculando próxima ejecución: ${error.message}`);
    return null;
  }
};

// FUNCIÓN DE TESTING
const testAutomaticExecution = async () => {
  logger.info("🧪 === INICIANDO PRUEBA MANUAL ===");
  await executeAutomaticTransfers();
  logger.info("🧪 === PRUEBA COMPLETADA ===");
};

const getCronDiagnostics = () => {
  return {
    isEnabled,
    isRunning,
    currentHour,
    taskExists: task !== null,
    taskActive: task ? !task.destroyed : false,
    nextExecution: task
      ? getNextExecutionTime(
        `${currentHour.split(":")[1]} ${currentHour.split(":")[0]} * * *`
      )
      : null,
    transferServiceLoaded: !!transferService,
    linkedTasksServiceLoaded: !!LinkedTasksService,
    emailFunctionsLoaded: !!(
      sendTransferResultsEmail && sendCriticalErrorEmail
    ),
  };
};

module.exports = {
  startCronJob,
  stopCronJob,
  setSchedulerEnabled,
  getSchedulerStatus,
  syncWithConfig,
  testAutomaticExecution, // Para testing manual
  getCronDiagnostics,
};
