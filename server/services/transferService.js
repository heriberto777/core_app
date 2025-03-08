// services/transferService.js - CORREGIDO
const retry = require("./retry");
const { connectToDB, closeConnection } = require("./dbService");
const { SqlService } = require("./tediousService");
const TransferTask = require("../models/transferTaks");
const logger = require("./logger");
const { sendProgress } = require("./progressSse");
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("./emailService");
const {
  registerTask,
  cancelTask,
  isTaskActive,
  completeTask,
} = require("../utils/taskTracker");

// Opciones mejoradas para reintentos de conexión
const CONNECTION_OPTIONS = {
  maxAttempts: 3, // Máximo de intentos de conexión
  retryDelay: 3000, // Delay inicial entre reintentos (3s)
  timeout: 60000, // Timeout por intento (60s)
  useBackoff: true, // Usar backoff exponencial
};

/**
 * Obtiene la clave primaria de la tabla desde validationRules.
 * @param {Object} validationRules - Reglas de validación definidas para la tarea
 * @returns {string} - Nombre del campo de clave primaria
 */
function getPrimaryKey(validationRules) {
  if (!validationRules || !validationRules.existenceCheck) {
    throw new Error("⚠️ Clave primaria no definida en validationRules.");
  }
  return validationRules.existenceCheck.key;
}

/**
 * Obtiene la longitud máxima permitida de una columna en SQL Server usando Tedious.
 * @param {string} tableName - Nombre de la tabla
 * @param {string} columnName - Nombre de la columna
 * @param {Object} connection - Conexión a SQL Server
 * @returns {Promise<number>} - Longitud máxima permitida
 */
async function getColumnMaxLength(tableName, columnName, connection) {
  const query = `
    SELECT CHARACTER_MAXIMUM_LENGTH 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = '${tableName}' 
      AND COLUMN_NAME = '${columnName}'
  `;

  const result = await SqlService.query(connection, query);
  return result.recordset[0]?.CHARACTER_MAXIMUM_LENGTH || 0;
}

/**
 * Función robusta para conectar a la base de datos con múltiples reintentos
 * @param {string} serverKey - Servidor al que conectar ("server1" o "server2")
 * @returns {Promise<Object>} - Conexión o error detallado
 */
async function robustConnect(serverKey) {
  let connection = null;
  let lastError = null;
  let attempt = 0;
  let delay = CONNECTION_OPTIONS.retryDelay;

  // Registrar intento de conexión inicial
  logger.info(`🔄 Intentando conectar robustamente a ${serverKey}...`);

  while (attempt < CONNECTION_OPTIONS.maxAttempts) {
    attempt++;

    try {
      if (attempt > 1) {
        logger.info(
          `Intento ${attempt}/${CONNECTION_OPTIONS.maxAttempts} para conectar a ${serverKey}...`
        );
      }

      connection = await connectToDB(serverKey, CONNECTION_OPTIONS.timeout);

      if (!connection) {
        throw new Error(
          `No se pudo obtener una conexión a ${serverKey} (devolvió null)`
        );
      }

      // Verificar la conexión con una consulta simple
      try {
        const testResult = await SqlService.query(
          connection,
          "SELECT @@SERVERNAME AS ServerName, @@VERSION AS Version"
        );

        // Registrar información del servidor para diagnóstico
        const serverInfo = testResult.recordset[0];
        logger.info(
          `✅ Conexión a ${serverKey} establecida y verificada correctamente.`
        );
        logger.debug(
          `Información del servidor ${serverKey}: ${JSON.stringify(serverInfo)}`
        );

        return { success: true, connection };
      } catch (testError) {
        logger.warn(
          `⚠️ La conexión a ${serverKey} se estableció pero falló la consulta de prueba: ${testError.message}`
        );

        // Intentar cerrar esta conexión fallida
        try {
          await closeConnection(connection);
        } catch (closeError) {}

        // Guardar el error para devolverlo si todos los intentos fallan
        lastError = new Error(
          `Conexión establecida pero falló la consulta de prueba: ${testError.message}`
        );
      }
    } catch (error) {
      lastError = error;
      logger.warn(
        `⚠️ Error al conectar a ${serverKey} (intento ${attempt}/${CONNECTION_OPTIONS.maxAttempts}): ${error.message}`
      );

      // Verificar si es un error que podemos intentar de nuevo
      const isRetryableError =
        error.message.includes("timeout") ||
        error.message.includes("conexión") ||
        error.message.includes("network") ||
        error.message.includes("connect");

      if (!isRetryableError) {
        logger.error(
          `Error no recuperable al conectar a ${serverKey}: ${error.message}`
        );
        break; // Salir del bucle para errores no recuperables
      }
    }

    // Si no es el último intento, esperar antes de reintentar
    if (attempt < CONNECTION_OPTIONS.maxAttempts) {
      logger.debug(
        `Esperando ${delay}ms antes de reintentar conexión a ${serverKey}...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Aumentar el delay si estamos usando backoff exponencial
      if (CONNECTION_OPTIONS.useBackoff) {
        delay = Math.min(delay * 1.5, 30000); // Máximo 30 segundos
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  logger.error(
    `❌ No se pudo establecer conexión a ${serverKey} después de ${CONNECTION_OPTIONS.maxAttempts} intentos.`
  );

  // Añadir información para diagnóstico
  const errorDetail = {
    serverKey,
    attempts: attempt,
    lastErrorMessage: lastError?.message || "Error desconocido",
    lastErrorStack: lastError?.stack,
  };

  return {
    success: false,
    error: new Error(
      `No se pudo establecer conexión a ${serverKey} después de ${attempt} intentos: ${lastError?.message}`
    ),
    details: errorDetail,
  };
}

/**
 * Obtiene todas las tareas activas desde MongoDB (type: auto o both).
 */
async function getTransferTasks() {
  const tasks = await TransferTask.find({
    active: true,
    type: { $in: ["auto", "both"] },
  });

  return tasks.map((task) => ({
    name: task.name,
    status: task.status,
    progress: task.progress,
    active: task.active,
    _id: task._id,
    transferType: task.transferType || "standard",
    execute: (updateProgress) => executeTransfer(task._id, updateProgress),
  }));
}

/**
 * Ejecuta una transferencia manualmente y envía resultados detallados por correo.
 * Versión mejorada con manejo de errores robustos y diagnóstico detallado.
 */
async function executeTransferManual(taskId) {
  logger.info(`🔄 Ejecutando transferencia manual: ${taskId}`);
  let task = null;
  let transferName = "desconocida";

  try {
    // 1. Buscar la tarea en la base de datos
    task = await TransferTask.findById(taskId);
    if (!task) {
      logger.error(`❌ No se encontró la tarea con ID: ${taskId}`);
      return { success: false, message: "Tarea no encontrada" };
    }

    transferName = task.name;
    logger.info(
      `📌 Encontrada tarea de transferencia: ${transferName} (${taskId})`
    );

    if (!task.active) {
      logger.warn(`⚠️ La tarea ${transferName} está inactiva.`);
      return { success: false, message: "Tarea inactiva" };
    }

    // 2. Ejecutar la transferencia
    logger.info(`📌 Ejecutando transferencia para la tarea: ${transferName}`);
    const result = await executeTransfer(taskId);

    // 3. Preparar datos para el correo
    const formattedResult = {
      name: transferName,
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
    };

    // 4. Enviar correo con el resultado
    try {
      await sendTransferResultsEmail([formattedResult], "manual");
      logger.info(
        `📧 Correo de notificación enviado para la transferencia: ${transferName}`
      );
    } catch (emailError) {
      logger.error(
        `❌ Error al enviar correo de notificación: ${emailError.message}`
      );
    }

    // 5. Devolver el resultado
    if (result.success) {
      logger.info(
        `✅ Transferencia manual completada con éxito: ${transferName}`
      );
      // Al final de la ejecución exitosa de una tarea:
      await TransferTask.findByIdAndUpdate(taskId, {
        lastExecutionDate: new Date(),
        $inc: { executionCount: 1 },
        lastExecutionResult: {
          success: result.success,
          message: result.message || "Transferencia completada",
          affectedRecords: result.inserted + result.updated || 0,
        },
      });

      return {
        success: true,
        message: "Transferencia manual ejecutada con éxito",
        result,
        emailSent: true,
      };
    } else {
      logger.error(
        `❌ Error en la transferencia manual: ${transferName}`,
        result
      );
      return {
        success: false,
        message: "Error en la ejecución de la transferencia manual",
        result,
        emailSent: true,
      };
    }
  } catch (error) {
    logger.error(
      `❌ Error en la ejecución manual de la transferencia ${transferName}: ${error.message}`
    );
    console.log(error);

    // Enviar correo de error crítico
    try {
      await sendCriticalErrorEmail(
        `Error crítico en transferencia manual: ${error.message}`,
        "manual",
        `ID de tarea: ${taskId}, Nombre: ${transferName}`
      );
      logger.info(`📧 Correo de error crítico enviado`);
    } catch (emailError) {
      logger.error(`❌ Error al enviar correo de error: ${emailError.message}`);
    }

    return {
      success: false,
      message: "Error en la ejecución manual",
      error: error.message,
      emailSent: true,
    };
  }
}

/**
 * Ejecuta una transferencia de datos (Server1 -> Server2).
 * Implementación mejorada con mejor manejo de errores y diagnóstico.
 */
const executeTransfer = async (taskId) => {
  let server1Connection = null;
  let server2Connection = null;
  let lastReportedProgress = 0;
  let initialCount = 0;
  let duplicateCount = 0;
  let duplicatedRecords = [];
  let columnTypes = null;

  // Crear un AbortController para poder cancelar la operación
  const abortController = new AbortController();
  const { signal } = abortController;

  // Registrar la tarea para poder cancelarla posteriormente
  registerTask(taskId, abortController);

  // Registrar uso de memoria inicial
  const memoryUsage = process.memoryUsage();
  logger.info(`Uso de memoria al inicio de transferencia:`, {
    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
  });

  // Variables para monitoreo de memoria
  let processedCount = 0;
  const memoryCheckInterval = 50;

  return await retry(
    async () => {
      try {
        // Verificar si la tarea fue cancelada desde el principio
        if (signal.aborted) {
          logger.info(
            `Tarea ${taskId} cancelada por el usuario antes de iniciar`
          );
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "cancelled",
            progress: -1,
          });
          sendProgress(taskId, -1);
          completeTask(taskId, "cancelled");
          return {
            success: false,
            message: "Transferencia cancelada por el usuario",
          };
        }

        // 1. Obtener la tarea
        const task = await TransferTask.findById(taskId);
        if (!task || !task.active) {
          logger.warn(
            `⚠️ La tarea ${task?.name || "desconocida"} está inactiva.`
          );
          return { success: false, message: "Tarea inactiva" };
        }

        logger.info(`🔍 Ejecutando tarea '${task.name}' (ID: ${taskId})`);

        // Comprobar periódicamente si la tarea ha sido cancelada
        signal.addEventListener("abort", async () => {
          logger.info(
            `Tarea ${taskId} (${task.name}) cancelada durante la ejecución`
          );

          // Liberar recursos
          if (server1Connection) {
            try {
              await closeConnection(server1Connection);
              server1Connection = null;
            } catch (error) {
              logger.error(
                `Error al cerrar conexión server1 tras cancelación: ${error.message}`
              );
            }
          }

          if (server2Connection) {
            try {
              await closeConnection(server2Connection);
              server2Connection = null;
            } catch (error) {
              logger.error(
                `Error al cerrar conexión server2 tras cancelación: ${error.message}`
              );
            }
          }

          // Actualizar estado en la BD
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "cancelled",
            progress: -1,
          });
          sendProgress(taskId, -1);
        });

        // 2. Actualizar estado
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "running",
          progress: 0,
        });
        sendProgress(taskId, 0);
        lastReportedProgress = 0;

        const {
          name,
          query,
          parameters,
          validationRules,
          postUpdateQuery,
          postUpdateMapping,
        } = task;

        // 3. Verificar validationRules
        if (!validationRules) {
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
          return {
            success: false,
            message: "No se han especificado reglas de validación",
          };
        }

        // 4. Establecer conexiones con manejo mejorado
        try {
          // 4.1 Conectar a server1 con conexión robusta
          logger.info(
            `Estableciendo conexión a server1 para tarea ${task.name}...`
          );

          const server1Result = await robustConnect("server1");

          if (!server1Result.success) {
            throw new Error(
              `No se pudo establecer conexión a server1: ${server1Result.error.message}`
            );
          }

          server1Connection = server1Result.connection;
          logger.info(
            `✅ Conexión a server1 establecida exitosamente para tarea ${task.name}`
          );

          // Verificar cancelación después de primera conexión
          if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

          // 4.2 Conectar a server2 con conexión robusta
          logger.info(
            `Estableciendo conexión a server2 para tarea ${task.name}...`
          );

          const server2Result = await robustConnect("server2");

          if (!server2Result.success) {
            // Cerrar la conexión a server1 antes de lanzar el error
            if (server1Connection) {
              await closeConnection(server1Connection);
              server1Connection = null;
            }

            throw new Error(
              `No se pudo establecer conexión a server2: ${server2Result.error.message}`
            );
          }

          server2Connection = server2Result.connection;
          logger.info(
            `✅ Conexión a server2 establecida exitosamente para tarea ${task.name}`
          );

          // Verificar cancelación después de segunda conexión
          if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

          // 4.3 Obtener los tipos de columnas de la tabla destino
          try {
            logger.debug(`Obteniendo tipos de columnas para tabla ${name}...`);
            columnTypes = await SqlService.getColumnTypes(
              server2Connection,
              name
            );
            logger.debug(
              `Tipos de columnas obtenidos correctamente para ${name}`
            );
          } catch (typesError) {
            logger.warn(
              `No se pudieron obtener los tipos de columnas para ${name}: ${typesError.message}. Se utilizará inferencia automática.`
            );
            columnTypes = {};
          }
        } catch (connError) {
          // Verificar si el error fue por cancelación
          if (signal.aborted) {
            logger.info(
              `Tarea ${taskId} cancelada durante establecimiento de conexiones`
            );
            completeTask(taskId, "cancelled");
            return {
              success: false,
              message: "Transferencia cancelada por el usuario",
            };
          }

          logger.error(
            `Error al establecer conexiones para tarea ${task.name}:`,
            connError
          );

          // Registrar detalles adicionales para diagnóstico
          logger.error(
            `Detalles de error de conexión: ${JSON.stringify({
              message: connError.message,
              stack: connError.stack,
              details: connError.details || "No details available",
            })}`
          );

          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);

          return {
            success: false,
            message: "Error al establecer conexiones de base de datos",
            errorDetail: connError.message,
          };
        }

        // 5. Verificar conteo inicial de registros
        try {
          if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

          const countResult = await SqlService.query(
            server2Connection,
            `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
          );
          initialCount = countResult.recordset[0].total;
          logger.info(
            `Conteo inicial en tabla ${name}: ${initialCount} registros`
          );
        } catch (countError) {
          // Verificar si el error fue por cancelación
          if (signal.aborted) {
            logger.info(
              `Tarea ${taskId} cancelada durante verificación de conteo inicial`
            );
            completeTask(taskId, "cancelled");
            return {
              success: false,
              message: "Transferencia cancelada por el usuario",
            };
          }

          logger.warn(
            `No se pudo verificar conteo inicial: ${countError.message}`
          );
          initialCount = 0;
        }

        // 6. Obtener datos del servidor 1
        let data = [];
        try {
          // Verificar cancelación
          if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

          // Construir consulta final con parámetros
          let finalQuery = query;
          const params = {};

          if (parameters?.length > 0) {
            const conditions = [];
            for (const param of parameters) {
              params[param.field] = param.value;

              // Manejar diferentes tipos de operadores
              if (
                param.operator === "BETWEEN" &&
                param.value &&
                typeof param.value === "object"
              ) {
                params[`${param.field}_from`] = param.value.from;
                params[`${param.field}_to`] = param.value.to;
                conditions.push(
                  `${param.field} BETWEEN @${param.field}_from AND @${param.field}_to`
                );
              } else if (
                param.operator === "IN" &&
                Array.isArray(param.value)
              ) {
                const placeholders = param.value.map((val, idx) => {
                  const paramName = `${param.field}_${idx}`;
                  params[paramName] = val;
                  return `@${paramName}`;
                });
                conditions.push(
                  `${param.field} IN (${placeholders.join(", ")})`
                );
              } else {
                conditions.push(
                  `${param.field} ${param.operator} @${param.field}`
                );
              }
            }

            finalQuery += ` WHERE ${conditions.join(" AND ")}`;
          }

          logger.debug(
            `Ejecutando consulta en Server1 para ${
              task.name
            }: ${finalQuery.substring(0, 200)}...`
          );

          // Sanitizar los parámetros antes de la consulta
          const sanitizedParams = SqlService.sanitizeParams(params);
          const result = await SqlService.query(
            server1Connection,
            finalQuery,
            sanitizedParams
          );

          data = result.recordset;
          logger.info(
            `Datos obtenidos correctamente para ${task.name}: ${data.length} registros`
          );
        } catch (queryError) {
          // Verificar si el error fue por cancelación
          if (signal.aborted) {
            logger.info(`Tarea ${taskId} cancelada durante consulta de datos`);
            completeTask(taskId, "cancelled");
            return {
              success: false,
              message: "Transferencia cancelada por el usuario",
            };
          }

          logger.error(
            `Error en la consulta en Server1 para ${task.name}:`,
            queryError
          );
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
          return {
            success: false,
            message: "Error en la consulta en Server1",
            errorDetail: queryError.message,
          };
        }

        // 7. Verificar si hay datos para transferir
        if (data.length === 0) {
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
          });
          sendProgress(taskId, 100);
          return {
            success: true,
            message: "No hay datos para transferir",
            rows: 0,
          };
        }

        // Verificar cancelación antes de continuar con el procesamiento principal
        if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

        // 8. Verificar si hay que borrar registros existentes
        if (task.clearBeforeInsert) {
          try {
            logger.info(
              `🧹 Borrando registros existentes de la tabla ${name} antes de insertar`
            );
            const deletedCount = await SqlService.clearTableData(
              server2Connection,
              `dbo.[${name}]`
            );
            logger.info(
              `✅ Se eliminaron ${deletedCount} registros de la tabla ${name}`
            );
          } catch (clearError) {
            // Verificar si el error fue por cancelación
            if (signal.aborted) {
              logger.info(
                `Tarea ${taskId} cancelada durante borrado de registros`
              );
              completeTask(taskId, "cancelled");
              return {
                success: false,
                message: "Transferencia cancelada por el usuario",
              };
            }
            logger.error(
              `❌ Error al borrar registros de la tabla ${name}:`,
              clearError
            );

            if (
              clearError.message &&
              clearError.message.includes("no existe")
            ) {
              logger.warn(
                `⚠️ La tabla no existe, continuando con la inserción...`
              );
            } else {
              logger.warn(
                `⚠️ Error al borrar registros pero continuando con la inserción...`
              );
              await TransferTask.findByIdAndUpdate(taskId, {
                status: "failed",
              });
              sendProgress(taskId, -1);
              completeTask(taskId, "failed");
              return {
                success: false,
                message: "Error al borrar registros existentes",
                errorDetail: clearError.message,
              };
            }
          }
        }

        // Verificar cancelación antes de continuar
        if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

        // 9. Configurar claves para identificar registros
        const primaryKeys = validationRules?.existenceCheck?.key
          ? [validationRules.existenceCheck.key]
          : [];
        const requiredFields = validationRules?.requiredFields || [];

        const mergeKeys = [...new Set([...primaryKeys, ...requiredFields])];
        if (mergeKeys.length === 0) {
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
          return {
            success: false,
            message: "No se especificaron claves para identificar registros",
          };
        }

        // 10. Pre-cargar información de longitud de columnas
        const columnLengthCache = new Map();

        // 11. Preparar variables para tracking
        let affectedRecords = [];
        let totalInserted = 0;
        const batchSize = 500;

        // 12. Procesar por lotes para inserción
        try {
          if (signal.aborted) throw new Error("Tarea cancelada por el usuario");
          // 12.1 Obtener listado de registros existentes para verificar duplicados
          let existingKeysSet = new Set();

          if (initialCount > 0 && mergeKeys.length > 0) {
            logger.debug(
              `Obteniendo claves existentes para verificar duplicados...`
            );

            try {
              const keysQuery = `
                SELECT DISTINCT ${mergeKeys.map((k) => `[${k}]`).join(", ")} 
                FROM dbo.[${name}] WITH (NOLOCK)
              `;

              const keysResult = await SqlService.query(
                server2Connection,
                keysQuery
              );

              // Crear un conjunto de claves para verificación rápida de duplicados
              for (const record of keysResult.recordset) {
                const key = mergeKeys
                  .map((k) => {
                    const value = record[k] === null ? "NULL" : record[k];
                    return `${k}:${value}`;
                  })
                  .join("|");

                existingKeysSet.add(key);
              }

              logger.debug(
                `Se encontraron ${existingKeysSet.size} claves existentes en la tabla destino para ${task.name}`
              );
            } catch (keysError) {
              logger.warn(
                `Error al obtener claves existentes para ${task.name}: ${keysError.message}. Se intentará inserción sin verificación previa.`
              );
            }
          }

          // 12.2 Procesar datos en lotes
          for (let i = 0; i < data.length; i += batchSize) {
            // Verificar cancelación al principio de cada lote
            if (signal.aborted)
              throw new Error("Tarea cancelada por el usuario");

            const batch = data.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(data.length / batchSize);

            logger.debug(
              `Procesando lote ${batchNumber}/${totalBatches} (${batch.length} registros) para ${task.name}...`
            );

            // Verificar si la conexión sigue activa
            try {
              await SqlService.query(server2Connection, "SELECT 1 AS test");
            } catch (connError) {
              // Verificar si el error fue por cancelación
              if (signal.aborted) {
                logger.info(
                  `Tarea ${taskId} cancelada durante obtención de claves existentes`
                );
                completeTask(taskId, "cancelled");
                return {
                  success: false,
                  message: "Transferencia cancelada por el usuario",
                };
              }
              logger.warn(
                `Conexión perdida durante procesamiento de ${task.name}, intentando reconectar...`
              );

              try {
                await closeConnection(server2Connection);
              } catch (e) {}

              // Usar robustConnect para mejorar la reconexión
              const reconnectResult = await robustConnect("server2");

              if (!reconnectResult.success) {
                throw new Error(
                  `No se pudo restablecer la conexión durante el procesamiento: ${reconnectResult.error.message}`
                );
              }

              server2Connection = reconnectResult.connection;
              logger.info(
                `✅ Reconexión exitosa a server2 durante procesamiento de ${task.name}`
              );
            }

            // Procesar cada registro individualmente
            let batchInserted = 0;
            let batchSkipped = 0;
            const insertBatchSize = 50;

            for (let j = 0; j < batch.length; j += insertBatchSize) {
              // Verificar cancelación al principio de cada lote
              if (signal.aborted)
                throw new Error("Tarea cancelada por el usuario");
              const insertSubBatch = batch.slice(j, j + insertBatchSize);

              for (const record of insertSubBatch) {
                try {
                  // Validar y sanitizar el registro
                  const validatedRecord = SqlService.validateRecord(record);

                  // Truncar strings según las longitudes máximas
                  for (const column in validatedRecord) {
                    if (typeof validatedRecord[column] === "string") {
                      // Obtener la longitud máxima (usando cache)
                      let maxLength;
                      if (columnLengthCache.has(column)) {
                        maxLength = columnLengthCache.get(column);
                      } else {
                        // Consultar longitud máxima de la columna
                        const lengthQuery = `
                          SELECT CHARACTER_MAXIMUM_LENGTH 
                          FROM INFORMATION_SCHEMA.COLUMNS 
                          WHERE TABLE_NAME = '${name}' 
                            AND COLUMN_NAME = '${column}'
                        `;
                        const lengthResult = await SqlService.query(
                          server2Connection,
                          lengthQuery
                        );
                        maxLength =
                          lengthResult.recordset[0]?.CHARACTER_MAXIMUM_LENGTH ||
                          0;
                        columnLengthCache.set(column, maxLength);
                      }

                      if (
                        maxLength > 0 &&
                        validatedRecord[column]?.length > maxLength
                      ) {
                        validatedRecord[column] = validatedRecord[
                          column
                        ].substring(0, maxLength);
                      }
                    }
                  }

                  // Recolectar IDs para post-actualización
                  if (postUpdateQuery && primaryKeys.length > 0) {
                    const primaryKey = primaryKeys[0];
                    if (
                      validatedRecord[primaryKey] !== null &&
                      validatedRecord[primaryKey] !== undefined
                    ) {
                      affectedRecords.push(validatedRecord[primaryKey]);
                    }
                  }

                  // Verificar si es un duplicado usando el conjunto de claves
                  if (existingKeysSet.size > 0) {
                    const recordKey = mergeKeys
                      .map((k) => {
                        const value =
                          validatedRecord[k] === null
                            ? "NULL"
                            : validatedRecord[k];
                        return `${k}:${value}`;
                      })
                      .join("|");

                    if (existingKeysSet.has(recordKey)) {
                      // Es un duplicado, registrar y continuar
                      duplicateCount++;
                      batchSkipped++;

                      // Información para identificar el registro duplicado
                      const duplicateInfo = mergeKeys
                        .map((k) => `${k}=${validatedRecord[k]}`)
                        .join(", ");

                      // Guardar información del registro duplicado
                      const duplicateRecord = {};
                      mergeKeys.forEach((key) => {
                        duplicateRecord[key] = validatedRecord[key];
                      });

                      // Añadir campos adicionales
                      const additionalFields = Object.keys(validatedRecord)
                        .filter((k) => !mergeKeys.includes(k))
                        .slice(0, 5);

                      additionalFields.forEach((key) => {
                        duplicateRecord[key] = validatedRecord[key];
                      });

                      duplicatedRecords.push(duplicateRecord);
                      logger.debug(
                        `⚠️ Registro duplicado omitido en ${task.name}: ${duplicateInfo}`
                      );
                      continue;
                    }
                  }

                  // Intentar insertar el registro
                  try {
                    const insertResult =
                      await SqlService.insertWithExplicitTypes(
                        server2Connection,
                        `dbo.[${name}]`,
                        validatedRecord
                      );

                    const rowsAffected = insertResult.rowsAffected;

                    if (rowsAffected > 0) {
                      totalInserted += rowsAffected;
                      batchInserted += rowsAffected;

                      // Añadir clave al conjunto para evitar duplicados en el mismo lote
                      if (existingKeysSet.size > 0) {
                        const newKey = mergeKeys
                          .map((k) => {
                            const value =
                              validatedRecord[k] === null
                                ? "NULL"
                                : validatedRecord[k];
                            return `${k}:${value}`;
                          })
                          .join("|");

                        existingKeysSet.add(newKey);
                      }
                    }
                  } catch (insertError) {
                    // Verificar si el error fue por cancelación
                    if (signal.aborted)
                      throw new Error("Tarea cancelada por el usuario");
                    // Manejar error por clave duplicada
                    if (
                      insertError.number === 2627 ||
                      insertError.number === 2601 ||
                      (insertError.message &&
                        (insertError.message.includes("PRIMARY KEY") ||
                          insertError.message.includes("UNIQUE KEY") ||
                          insertError.message.includes("duplicate key")))
                    ) {
                      duplicateCount++;
                      batchSkipped++;

                      // Información para identificar el registro duplicado
                      const duplicateInfo = mergeKeys
                        .map((k) => `${k}=${validatedRecord[k]}`)
                        .join(", ");

                      // Guardar información del registro duplicado
                      const duplicateRecord = {};
                      mergeKeys.forEach((key) => {
                        duplicateRecord[key] = validatedRecord[key];
                      });

                      duplicateRecord._errorMessage =
                        insertError.message.substring(0, 100);
                      duplicatedRecords.push(duplicateRecord);

                      logger.debug(
                        `⚠️ Error de inserción por duplicado en ${task.name}: ${duplicateInfo}`
                      );
                    } else if (
                      insertError.message &&
                      (insertError.message.includes("conexión") ||
                        insertError.message.includes("connection") ||
                        insertError.message.includes("timeout") ||
                        insertError.message.includes("Timeout"))
                    ) {
                      // Error de conexión - reconectar y reintentar
                      logger.warn(
                        `Error de conexión durante inserción en ${task.name}, reconectando...`
                      );

                      try {
                        await closeConnection(server2Connection);
                      } catch (e) {}

                      // Usar robustConnect para mejorar la reconexión
                      const reconnectResult = await robustConnect("server2");

                      if (!reconnectResult.success) {
                        throw new Error(
                          `No se pudo restablecer la conexión para continuar inserciones: ${reconnectResult.error.message}`
                        );
                      }

                      server2Connection = reconnectResult.connection;

                      // Reintentar la inserción
                      const retryResult =
                        await SqlService.insertWithExplicitTypes(
                          server2Connection,
                          `dbo.[${name}]`,
                          validatedRecord
                        );

                      const rowsAffected = retryResult.rowsAffected;

                      if (rowsAffected > 0) {
                        totalInserted += rowsAffected;
                        batchInserted += rowsAffected;
                        logger.info(
                          `Inserción exitosa después de reconexión en ${task.name}`
                        );
                      }
                    } else {
                      // Otros errores
                      logger.error(
                        `Error al insertar registro en ${task.name}:`,
                        insertError
                      );
                      throw new Error(
                        `Error al insertar registro: ${insertError.message}`
                      );
                    }
                  }
                } catch (recordError) {
                  // Verificar si el error fue por cancelación
                  if (signal.aborted)
                    throw new Error("Tarea cancelada por el usuario");

                  // Errores no relacionados con duplicados
                  if (
                    recordError.number !== 2627 &&
                    recordError.number !== 2601 &&
                    !recordError.message.includes("duplicate key")
                  ) {
                    throw recordError;
                  }
                }

                // Monitoreo de memoria ocasional
                processedCount++;
                if (processedCount % memoryCheckInterval === 0) {
                  if (global.gc) {
                    global.gc();
                  }

                  const currentMemory = process.memoryUsage();
                  logger.debug(
                    `Uso de memoria (${processedCount} registros):`,
                    {
                      rss: `${Math.round(currentMemory.rss / 1024 / 1024)} MB`,
                      heapUsed: `${Math.round(
                        currentMemory.heapUsed / 1024 / 1024
                      )} MB`,
                    }
                  );
                }
              }
            }

            logger.debug(
              `Lote ${batchNumber}/${totalBatches} para ${task.name}: ${batchInserted} registros insertados, ${batchSkipped} omitidos por duplicados`
            );

            // Actualizar progreso con throttling
            const progress = Math.round(
              ((i + batch.length) / data.length) * 100
            );
            if (progress > lastReportedProgress + 5 || progress >= 100) {
              lastReportedProgress = progress;
              await TransferTask.findByIdAndUpdate(taskId, { progress });
              sendProgress(taskId, progress);
              logger.debug(
                `Progreso actualizado para ${task.name}: ${progress}%`
              );
            }
          }

          // Verificar si la tarea fue cancelada antes de finalizar
          if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

          // 13. Actualizar estado a completado
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
          });
          sendProgress(taskId, 100);

          // 14. Verificar conteo final
          let finalCount = 0;
          try {
            const countResult = await SqlService.query(
              server2Connection,
              `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
            );
            finalCount = countResult.recordset[0].total;
            logger.info(
              `Conteo final en tabla ${name}: ${finalCount} registros (${
                finalCount - initialCount
              } nuevos, ${duplicateCount} duplicados omitidos)`
            );
          } catch (countError) {
            logger.warn(
              `No se pudo verificar conteo final para ${task.name}: ${countError.message}`
            );
          }

          // 15. Ejecutar consulta post-actualización si corresponde
          if (postUpdateQuery && affectedRecords.length > 0) {
            try {
              // Verificar si la tarea fue cancelada antes de finalizar
              if (signal.aborted)
                throw new Error("Tarea cancelada por el usuario");
              // Verificar si la conexión a server1 sigue activa
              try {
                await SqlService.query(server1Connection, "SELECT 1 AS test");
              } catch (testError) {
                logger.warn(
                  `Reconectando a server1 para post-actualización de ${task.name}`
                );

                try {
                  await closeConnection(server1Connection);
                } catch (e) {}

                // Usar robustConnect para la reconexión
                const reconnectResult = await robustConnect("server1");

                if (!reconnectResult.success) {
                  throw new Error(
                    `No se pudo reconectar a server1 para post-actualización: ${reconnectResult.error.message}`
                  );
                }

                server1Connection = reconnectResult.connection;
              }

              // Procesar en lotes para la actualización
              const postUpdateBatchSize = 500;

              for (
                let i = 0;
                i < affectedRecords.length;
                i += postUpdateBatchSize
              ) {
                const keyBatch = affectedRecords.slice(
                  i,
                  i + postUpdateBatchSize
                );

                // Procesar claves - quitar prefijo CN si es necesario
                const processedKeys = keyBatch.map((key) =>
                  typeof key === "string" && key.startsWith("CN")
                    ? key.replace(/^CN/, "")
                    : key
                );

                // Construir consulta con parámetros
                const params = {};
                processedKeys.forEach((key, index) => {
                  params[`key${index}`] = key;
                });

                // Obtener la clave correcta para la consulta WHERE
                const primaryKeyField =
                  postUpdateMapping?.tableKey || primaryKeys[0];

                // Crear lista de parámetros
                const keyParams = processedKeys
                  .map((_, index) => `@key${index}`)
                  .join(", ");

                // Construir consulta dinámica
                const dynamicUpdateQuery = `${postUpdateQuery} WHERE ${primaryKeyField} IN (${keyParams})`;

                try {
                  const sanitizedParams = SqlService.sanitizeParams(params);
                  const updateResult = await SqlService.query(
                    server1Connection,
                    dynamicUpdateQuery,
                    sanitizedParams
                  );
                  logger.info(
                    `Post-actualización para ${task.name}: ${updateResult.rowsAffected} filas afectadas`
                  );
                } catch (updateError) {
                  // Verificar si el error fue por cancelación
                  if (signal.aborted)
                    throw new Error("Tarea cancelada por el usuario");
                  logger.error(
                    `Error en consulta post-actualización para ${task.name}:`,
                    updateError
                  );

                  // Reconectar si es un error de conexión
                  if (
                    updateError.message &&
                    (updateError.message.includes("conexión") ||
                      updateError.message.includes("connection") ||
                      updateError.message.includes("timeout"))
                  ) {
                    logger.info(
                      `Reintentando post-actualización de ${task.name} tras error de conexión`
                    );

                    try {
                      await closeConnection(server1Connection);
                    } catch (e) {}

                    // Usar robustConnect para la reconexión
                    const reconnectResult = await robustConnect("server1");

                    if (!reconnectResult.success) {
                      throw new Error(
                        `No se pudo reconectar para reintentar post-actualización: ${reconnectResult.error.message}`
                      );
                    }

                    server1Connection = reconnectResult.connection;

                    // Reintentar la actualización
                    const sanitizedParams = SqlService.sanitizeParams(params);
                    const retryResult = await SqlService.query(
                      server1Connection,
                      dynamicUpdateQuery,
                      sanitizedParams
                    );
                    logger.info(
                      `Post-actualización de ${task.name} (reintento): ${retryResult.rowsAffected} filas afectadas`
                    );
                  }
                }
              }

              logger.info(
                `✅ Consulta post-transferencia ejecutada correctamente para ${task.name}`
              );
            } catch (postUpdateError) {
              if (signal.aborted) {
                logger.info(
                  `Tarea ${taskId} cancelada durante post-actualización`
                );
                completeTask(taskId, "cancelled");
                return {
                  success: false,
                  message: "Transferencia cancelada por el usuario",
                };
              }

              logger.error(
                `❌ Error en consulta post-transferencia para ${task.name}:`,
                postUpdateError
              );
              // No fallamos toda la operación por un error en post-actualización
            }
          }

          // 16. Preparar resultado final
          const maxDuplicatesToReport = 100;
          const reportedDuplicates = duplicatedRecords.slice(
            0,
            maxDuplicatesToReport
          );
          const hasMoreDuplicates =
            duplicatedRecords.length > maxDuplicatesToReport;

          // Crear una variable result en lugar de retornar directamente
          const result = {
            success: true,
            message: "Transferencia completada",
            rows: data.length,
            inserted: totalInserted,
            duplicates: duplicateCount,
            duplicatedRecords: reportedDuplicates,
            hasMoreDuplicates,
            totalDuplicates: duplicatedRecords.length,
            initialCount,
            finalCount,
          };

          // Al final de la ejecución exitosa de una tarea:
          await TransferTask.findByIdAndUpdate(taskId, {
            lastExecutionDate: new Date(),
            $inc: { executionCount: 1 },
            lastExecutionResult: {
              success: result.success,
              message: result.message || "Transferencia completada",
              affectedRecords: result.inserted + result.updated || 0,
            },
          });

          return result;
        } catch (processingError) {
          // Verificar si el error fue por cancelación
          if (
            signal.aborted ||
            processingError.message.includes("cancelada por el usuario")
          ) {
            logger.info(
              `Tarea ${taskId} cancelada por el usuario durante procesamiento`
            );
            await TransferTask.findByIdAndUpdate(taskId, {
              status: "cancelled",
              progress: -1,
            });
            sendProgress(taskId, -1);
            completeTask(taskId, "cancelled");
            return {
              success: false,
              message: "Transferencia cancelada por el usuario",
            };
          }

          logger.error(
            `Error durante el procesamiento de datos para ${task.name}:`,
            processingError
          );
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
          return {
            success: false,
            message: "Error durante el procesamiento de datos",
            errorDetail: processingError.message,
          };
        }
      } catch (outerError) {
        // Verificar si el error fue por cancelación
        if (
          signal.aborted ||
          outerError.message.includes("cancelada por el usuario")
        ) {
          logger.info(`Tarea ${taskId} cancelada por el usuario`);
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "cancelled",
            progress: -1,
          });
          sendProgress(taskId, -1);
          completeTask(taskId, "cancelled");
          return {
            success: false,
            message: "Transferencia cancelada por el usuario",
          };
        }

        // Manejo de errores generales
        logger.error(
          `Error general en la transferencia de ${taskId}:`,
          outerError
        );
        await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
        sendProgress(taskId, -1);
        return {
          success: false,
          message: "Error general en la transferencia",
          errorDetail: outerError.message,
        };
      } finally {
        // Cerrar las conexiones
        try {
          if (server1Connection) {
            await closeConnection(server1Connection);
            logger.debug(`Conexión server1 cerrada correctamente`);
          }
        } catch (closeError) {
          logger.error(`Error al cerrar conexión server1:`, closeError);
        }

        try {
          if (server2Connection) {
            await closeConnection(server2Connection);
            logger.debug(`Conexión server2 cerrada correctamente`);
          }
        } catch (closeError) {
          logger.error(`Error al cerrar conexión server2:`, closeError);
        }
      }
    },
    3, // Número máximo de reintentos
    5000, // Tiempo inicial entre reintentos
    `Ejecutar Transferencia para tarea ${taskId}`
  );
};

/**
 * Función que inserta TODOS los datos en lotes, reportando progreso SSE y enviando correo al finalizar.
 * No verifica duplicados, simplemente inserta todos los registros.
 * Requiere que el frontend esté suscrito a /api/transfer/progress/:taskId
 * Adaptada para Tedious.
 */
async function insertInBatchesSSE(taskId, data, batchSize = 100) {
  let server2Connection = null;
  let lastReportedProgress = 0;
  let initialCount = 0;
  let taskName = "desconocida"; // Inicializar taskName por defecto
  let columnTypes = null;

  try {
    // 1) Obtener la tarea - Inicializar 'task' antes de usarla
    const task = await TransferTask.findById(taskId);
    if (!task) {
      throw new Error(`No se encontró la tarea con ID: ${taskId}`);
    }
    if (!task.active) {
      throw new Error(`La tarea "${task.name}" está inactiva.`);
    }

    // Guardar el nombre de la tarea para usarlo en logs y mensajes
    taskName = task.name;

    // 2) Marcar status "running", progress=0
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "running",
      progress: 0,
    });
    sendProgress(taskId, 0);

    // Si la tarea tiene habilitada la opción de borrar antes de insertar
    if (task.clearBeforeInsert) {
      try {
        logger.info(
          `🧹 Borrando registros existentes de la tabla ${task.name} antes de insertar en lotes`
        );

        // Conectar a server2 solo para el borrado si aún no estamos conectados
        let tempConnection = null;
        let shouldCloseConnection = false;

        if (!server2Connection) {
          logger.debug(
            `Conectando temporalmente a server2 para borrado en ${task.name}...`
          );
          tempConnection = await connectToDB("server2", 30000);
          shouldCloseConnection = true;
        }

        const connectionToUse = server2Connection || tempConnection;

        // Realizar el borrado
        const deletedCount = await SqlService.clearTableData(
          connectionToUse,
          `dbo.[${task.name}]`
        );
        logger.info(
          `✅ Se eliminaron ${deletedCount} registros de la tabla ${task.name}`
        );

        // Cerrar conexión temporal si fue creada
        if (shouldCloseConnection && tempConnection) {
          await closeConnection(tempConnection);
          logger.debug(
            `Conexión temporal cerrada después del borrado en ${task.name}`
          );
        }
      } catch (clearError) {
        logger.error(
          `❌ Error al borrar registros de la tabla ${task.name}:`,
          clearError
        );

        // Decidir si continuar o abortar
        if (clearError.message && clearError.message.includes("no existe")) {
          logger.warn(`⚠️ La tabla no existe, continuando con la inserción...`);
        } else {
          logger.warn(
            `⚠️ Error al borrar registros pero continuando con la inserción...`
          );

          // Si quieres abortar en caso de error:
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
          throw new Error(
            `Error al borrar registros existentes: ${clearError.message}`
          );
        }
      }
    }

    // 3) Conectarse a la DB de destino con manejo mejorado de conexiones
    try {
      // Usar conexión robusta
      const connectionResult = await robustConnect("server2");
      if (!connectionResult.success) {
        throw new Error(
          `No se pudo establecer conexión a server2: ${connectionResult.error.message}`
        );
      }

      server2Connection = connectionResult.connection;
      logger.info(
        `Conexión establecida y verificada para inserción en lotes (taskId: ${taskId}, task: ${taskName})`
      );

      // Obtener tipos de columnas para una inserción más segura
      try {
        logger.debug(`Obteniendo tipos de columnas para tabla ${taskName}...`);
        columnTypes = await SqlService.getColumnTypes(
          server2Connection,
          taskName
        );
        logger.debug(
          `Tipos de columnas obtenidos correctamente para ${taskName}`
        );
      } catch (typesError) {
        logger.warn(
          `No se pudieron obtener los tipos de columnas para ${taskName}: ${typesError.message}. Se utilizará inferencia automática.`
        );
        columnTypes = {};
      }
    } catch (connError) {
      logger.error(
        `Error al establecer conexión para inserción en lotes (taskId: ${taskId}, task: ${taskName}):`,
        connError
      );
      await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
      sendProgress(taskId, -1);
      throw new Error(
        `Error al establecer conexión de base de datos: ${connError.message}`
      );
    }

    // 4) Verificar conteo inicial de registros
    try {
      const countResult = await SqlService.query(
        server2Connection,
        `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
      );
      initialCount = countResult.recordset[0].total;
      logger.info(
        `Conteo inicial en tabla ${task.name}: ${initialCount} registros`
      );
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo inicial: ${countError.message}`);
      initialCount = 0;
    }

    // 5) Pre-cargar información de longitud de columnas
    const columnLengthCache = new Map();

    // 6) Contadores para tracking
    const total = data.length;
    let totalInserted = 0;
    let processedCount = 0;
    let errorCount = 0;

    // 7) Procesar data en lotes - SIN TRANSACCIONES PARA MAYOR ESTABILIDAD
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const currentBatchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(data.length / batchSize);

      logger.debug(
        `Procesando lote ${currentBatchNumber}/${totalBatches} (${batch.length} registros) para ${taskName}...`
      );

      // Verificar si la conexión sigue activa y reconectar si es necesario
      try {
        await SqlService.query(server2Connection, "SELECT 1 AS test");
      } catch (connError) {
        logger.warn(
          `Conexión perdida con server2 durante procesamiento, intentando reconectar...`
        );

        try {
          await closeConnection(server2Connection);
        } catch (e) {}

        // Usar conexión robusta
        const reconnectResult = await robustConnect("server2");
        if (!reconnectResult.success) {
          throw new Error(
            `No se pudo restablecer la conexión: ${reconnectResult.error.message}`
          );
        }

        server2Connection = reconnectResult.connection;
        logger.info(
          `Reconexión exitosa a server2 para lote ${currentBatchNumber}`
        );
      }

      // Procesar cada registro del lote de forma independiente
      let batchInserted = 0;
      let batchErrored = 0;

      for (const record of batch) {
        try {
          // Validar y sanitizar el registro
          const validatedRecord = SqlService.validateRecord(record);

          // Truncar strings según las longitudes máximas
          for (const column in validatedRecord) {
            if (typeof validatedRecord[column] === "string") {
              // Obtener la longitud máxima (usando cache)
              let maxLength;
              if (columnLengthCache.has(column)) {
                maxLength = columnLengthCache.get(column);
              } else {
                // Consultar longitud máxima de la columna
                const lengthQuery = `
                  SELECT CHARACTER_MAXIMUM_LENGTH 
                  FROM INFORMATION_SCHEMA.COLUMNS 
                  WHERE TABLE_NAME = '${task.name}' 
                    AND COLUMN_NAME = '${column}'
                `;
                const lengthResult = await SqlService.query(
                  server2Connection,
                  lengthQuery
                );
                maxLength =
                  lengthResult.recordset[0]?.CHARACTER_MAXIMUM_LENGTH || 0;
                columnLengthCache.set(column, maxLength);
              }

              if (
                maxLength > 0 &&
                validatedRecord[column]?.length > maxLength
              ) {
                validatedRecord[column] = validatedRecord[column].substring(
                  0,
                  maxLength
                );
              }
            }
          }

          // Usar el método mejorado para inserción con tipos explícitos
          try {
            const insertResult = await SqlService.insertWithExplicitTypes(
              server2Connection,
              `dbo.[${task.name}]`,
              validatedRecord
            );

            const rowsAffected = insertResult.rowsAffected || 0;

            if (rowsAffected > 0) {
              totalInserted += rowsAffected;
              batchInserted += rowsAffected;
            }
          } catch (insertError) {
            // Verificar si es error de conexión
            if (
              insertError.message &&
              (insertError.message.includes("conexión") ||
                insertError.message.includes("connection") ||
                insertError.message.includes("timeout") ||
                insertError.message.includes("Timeout"))
            ) {
              // Intentar reconectar y reintentar
              logger.warn(
                `Error de conexión durante inserción, reconectando...`
              );

              try {
                await closeConnection(server2Connection);
              } catch (e) {}

              // Usar conexión robusta
              const reconnectResult = await robustConnect("server2");
              if (!reconnectResult.success) {
                throw new Error(
                  `No se pudo restablecer la conexión: ${reconnectResult.error.message}`
                );
              }

              server2Connection = reconnectResult.connection;

              // Reintentar inserción
              const retryResult = await SqlService.insertWithExplicitTypes(
                server2Connection,
                `dbo.[${task.name}]`,
                validatedRecord
              );

              const rowsAffected = retryResult.rowsAffected || 0;

              if (rowsAffected > 0) {
                totalInserted += rowsAffected;
                batchInserted += rowsAffected;
                logger.info(`Inserción exitosa después de reconexión`);
              } else {
                throw new Error(
                  "La inserción no afectó ninguna fila después de reconexión"
                );
              }
            } else {
              // Otros errores, registrar y continuar
              logger.error(
                `Error específico al insertar registro: ${JSON.stringify(
                  validatedRecord,
                  null,
                  2
                )}`
              );
              logger.error(`Detalles del error: ${insertError.message}`);
              throw insertError;
            }
          }
        } catch (recordError) {
          // Registrar el error pero continuar con el siguiente registro
          errorCount++;
          batchErrored++;
          logger.error(
            `Error al insertar registro en lote ${currentBatchNumber}:`,
            recordError
          );
          logger.debug(
            `Registro problemático: ${JSON.stringify(record, null, 2)}`
          );
        }
      }

      logger.info(
        `Lote ${currentBatchNumber}/${totalBatches}: ${batchInserted} registros insertados, ${batchErrored} errores`
      );

      // Actualizar progreso después de cada lote
      processedCount += batch.length;
      const progress = Math.round((processedCount / total) * 100);

      if (progress > lastReportedProgress + 5 || progress >= 100) {
        lastReportedProgress = progress;
        await TransferTask.findByIdAndUpdate(taskId, { progress });
        sendProgress(taskId, progress);
        logger.debug(`Progreso actualizado: ${progress}%`);
      }
    }

    // 8. Actualizar estado a completado
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "completed",
      progress: 100,
    });
    sendProgress(taskId, 100);

    // 9. Verificar conteo final
    let finalCount = 0;
    try {
      const countResult = await SqlService.query(
        server2Connection,
        `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
      );
      finalCount = countResult.recordset[0].total;
      logger.info(
        `Conteo final en tabla ${task.name}: ${finalCount} registros (${
          finalCount - initialCount
        } nuevos)`
      );
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo final: ${countError.message}`);
    }

    // 10. Preparar resultado
    const result = {
      success: true,
      message: "Transferencia completada",
      rows: data.length,
      inserted: totalInserted,
      errors: errorCount,
      initialCount,
      finalCount,
    };

    // 11. Enviar correo con el resultado
    try {
      const formattedResult = {
        name: task.name,
        success: result.success,
        inserted: result.inserted || 0,
        rows: result.rows || 0,
        message: result.message || "Transferencia completada",
        errorDetail: result.errorDetail || "N/A",
        initialCount: result.initialCount,
        finalCount: result.finalCount,
      };

      await sendTransferResultsEmail([formattedResult], "batch");
      logger.info(`Correo de notificación enviado para ${taskName}`);
    } catch (emailError) {
      logger.error(
        `Error al enviar correo de notificación: ${emailError.message}`
      );
    }

    return result;
  } catch (error) {
    // Manejo de errores generales
    logger.error(
      `Error en insertInBatchesSSE para ${taskName}: ${error.message}`,
      error
    );

    // Actualizar estado de la tarea
    await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
    sendProgress(taskId, -1);

    // Enviar correo de error
    try {
      const errorMessage = `Error en inserción en lotes para ${taskName}: ${error.message}`;
      await sendCriticalErrorEmail(
        errorMessage,
        "batch",
        `ID de tarea: ${taskId}`
      );
      logger.info(`Correo de error enviado para ${taskName}`);
    } catch (emailError) {
      logger.error(
        `Error al enviar correo de error para ${taskName}: ${emailError.message}`
      );
    }

    throw error;
  } finally {
    // Cerrar conexión
    try {
      if (server2Connection) {
        await closeConnection(server2Connection);
        logger.debug(
          `Conexión server2 cerrada correctamente para inserción en lotes de ${taskName} (taskId: ${taskId})`
        );
      }
    } catch (closeError) {
      logger.error(
        `Error al cerrar conexión server2 para inserción en lotes de ${taskName} (taskId: ${taskId}):`,
        closeError
      );
    }
  }
}

/**
 * Crea o actualiza una tarea de transferencia en MongoDB (upsert).
 */
async function upsertTransferTask(taskData) {
  try {
    let task = await TransferTask.findOne({ name: taskData.name });
    if (task) {
      task = await TransferTask.findByIdAndUpdate(task._id, taskData, {
        new: true,
      });
    } else {
      task = await TransferTask.create(taskData);
    }
    return { success: true, task };
  } catch (error) {
    logger.error("Error en upsertTransferTask:", error);
    return {
      success: false,
      message: "Error al guardar la tarea",
      error: error.message,
    };
  }
}

// Exportar todas las funciones
module.exports = {
  getPrimaryKey,
  getColumnMaxLength,
  getTransferTasks,
  executeTransferManual,
  executeTransfer,
  insertInBatchesSSE,
  upsertTransferTask,
  // Exportar nueva función para diagnóstico
  robustConnect,
};
