const logger = require("./logger");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const TransferTask = require("../models/transferTaskModel");

const UnifiedCancellationService = require("./UnifiedCancellationService");
const { sendProgress } = require("./progressSse");
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("./emailService");
const TaskTracker = require("./TaskTracker");
const RetryService = require("./RetryService");
const MemoryManager = require("./MemoryManager");
const Telemetry = require("./Telemetry");
const TaskExecution = require("../models/taskExecutionModel");
const LinkedTasksService = require("./LinkedTasksService");

/**
 * Clase que maneja la transferencia de datos entre servidores
 * MIGRADO: Usa DatabaseService centralizado, NO SqlService
 */
class TransferService {
  constructor() {
    this.retryService = new RetryService({
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 30000,
      logPrefix: "[Transfer] ",
    });

    // Cola de reintentos para tareas fallidas
    this.retryQueue = {
      tasks: [],
      isProcessing: false,
      lastProcessTime: null,
      maxRetries: 3,
      retryInterval: 5 * 60 * 1000, // 5 minutos entre reintentos
    };

    try {
      if (UnifiedCancellationService.initialize) {
        UnifiedCancellationService.initialize();
      }
    } catch (error) {
      logger.warn(
        `Error al inicializar servicio de cancelación: ${error.message}`
      );
    }
  }

  /**
   * Sanitiza parámetros - MIGRADO desde SqlService
   */
  _sanitizeParams(params) {
    if (!params || typeof params !== "object") return {};

    const sanitized = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        sanitized[key] = null;
      } else if (typeof value === "string") {
        sanitized[key] = value.trim();
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Valida un registro - MIGRADO desde SqlService
   */
  _validateRecord(record) {
    if (!record || typeof record !== "object") {
      throw new Error("Record must be an object");
    }

    const validatedRecord = {};
    for (const [key, value] of Object.entries(record)) {
      // Limpiar nombres de campos
      const cleanKey = key.replace(/[^\w]/g, "");

      if (value === null || value === undefined) {
        validatedRecord[cleanKey] = null;
      } else if (typeof value === "string") {
        validatedRecord[cleanKey] = value.trim();
      } else {
        validatedRecord[cleanKey] = value;
      }
    }

    return validatedRecord;
  }

  /**
   * Limpia datos de una tabla - CORREGIDO
   */
  async _clearTableData(connection, tableName) {
    // Parsear esquema y nombre de tabla
    let schema = "dbo";
    let table = tableName;

    // Limpiar corchetes
    const cleanTableName = tableName.replace(/[\[\]]/g, "");

    // Si tiene esquema especificado (ej: dbo.IMPLT_Cluster_Base)
    if (cleanTableName.includes(".")) {
      const parts = cleanTableName.split(".");
      schema = parts[0];
      table = parts[1];
    } else {
      table = cleanTableName;
    }

    logger.debug(
      `Verificando existencia de tabla: schema='${schema}', table='${table}'`
    );

    // Verificar si la tabla existe - CORREGIDO para incluir schema
    const tableExistsQuery = `
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = @schema
      AND TABLE_NAME = @tableName
  `;

    const existsResult = await DatabaseServiceAdapter.query(
      connection,
      tableExistsQuery,
      {
        schema: schema,
        tableName: table,
      }
    );

    logger.debug(
      `Resultado verificación tabla: ${existsResult.recordset[0].count} tablas encontradas`
    );

    if (existsResult.recordset[0].count === 0) {
      // Intentar consulta alternativa para debug
      const debugQuery = `
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%${table}%'
    `;

      try {
        const debugResult = await DatabaseServiceAdapter.query(
          connection,
          debugQuery
        );
        logger.debug(`Tablas similares encontradas:`, debugResult.recordset);
      } catch (debugError) {
        logger.debug(`Error en consulta debug: ${debugError.message}`);
      }

      throw new Error(`La tabla ${schema}.${table} no existe`);
    }

    // Truncar tabla - usar nombre completo con esquema
    const fullTableName = `[${schema}].[${table}]`;
    const truncateQuery = `TRUNCATE TABLE ${fullTableName}`;

    logger.debug(`Ejecutando: ${truncateQuery}`);

    const result = await DatabaseServiceAdapter.query(
      connection,
      truncateQuery
    );

    return result.rowsAffected || 0;
  }

  /**
   * Obtiene todas las tareas activas desde MongoDB
   */
  async getTransferTasks() {
    try {
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
        execute: (updateProgress) =>
          this.executeTaskWithLinkingLogic(task._id, updateProgress, "auto"),
      }));
    } catch (error) {
      logger.error("Error al obtener tareas de transferencia:", error);
      return [];
    }
  }

  /**
   * Ejecuta una tarea considerando si tiene vinculaciones
   */
  async executeTaskWithLinkingLogic(
    taskId,
    updateProgress = null,
    executionType = "auto"
  ) {
    try {
      logger.info(`Iniciando ejecución de tarea ${taskId} (${executionType})`);

      // Verificar si debe ejecutarse como grupo o individualmente
      const executionStrategy = await LinkedTasksService.shouldExecuteAsGroup(
        taskId
      );

      if (executionStrategy.executeAsGroup) {
        logger.info(
          `Ejecutando como grupo vinculado (${executionType}): ${executionStrategy.reason}`
        );

        const groupResult = await LinkedTasksService.executeLinkedGroup(
          taskId,
          executionType
        );

        if (groupResult.success && groupResult.linkedTasksResults) {
          try {
            const emailResults = groupResult.linkedTasksResults.map((r) => ({
              name: r.taskName,
              success: r.success,
              inserted: r.inserted || 0,
              updated: r.updated || 0,
              duplicates: r.duplicates || 0,
              rows: r.rows || 0,
              message: r.message || "Transferencia completada",
              errorDetail: r.error || "N/A",
            }));

            const emailType =
              executionType === "auto"
                ? "auto_linked_group"
                : "manual_linked_group";
            await sendTransferResultsEmail(emailResults, emailType);
            logger.info(`Correo de grupo (${executionType}) enviado`);
          } catch (emailError) {
            logger.error(
              `Error al enviar correo de grupo: ${emailError.message}`
            );
          }
        }

        return groupResult;
      } else {
        logger.info(
          `Ejecutando individualmente (${executionType}): ${executionStrategy.reason}`
        );

        const result = await this.executeTransferWithRetry(taskId);

        if (executionType === "auto" && result) {
          try {
            const task = await TransferTask.findById(taskId);
            const formattedResult = {
              name: task?.name || "desconocida",
              success: result.success || false,
              inserted: result.inserted || 0,
              updated: result.updated || 0,
              duplicates: result.duplicates || 0,
              rows: result.rows || 0,
              message: result.message || "Transferencia completada",
              errorDetail: result.errorDetail || "N/A",
            };

            await sendTransferResultsEmail([formattedResult], "auto");
            logger.info(`Correo automático enviado para ${task?.name}`);
          } catch (emailError) {
            logger.error(
              `Error al enviar correo automático: ${emailError.message}`
            );
          }
        }

        return result;
      }
    } catch (error) {
      logger.error(`Error en executeTaskWithLinkingLogic: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ejecuta una transferencia manualmente
   */
  async executeTransferManual(taskId) {
    logger.info(`Ejecutando transferencia manual: ${taskId}`);
    let task = null;
    let transferName = "desconocida";

    try {
      task = await TransferTask.findById(taskId);
      if (!task) {
        logger.error(`No se encontró la tarea con ID: ${taskId}`);
        return { success: false, message: "Tarea no encontrada" };
      }

      transferName = task.name;
      logger.info(
        `Encontrada tarea de transferencia: ${transferName} (${taskId})`
      );

      if (!task.active) {
        logger.warn(`La tarea ${transferName} está inactiva.`);
        return { success: false, message: "Tarea inactiva" };
      }

      const executionStrategy = await LinkedTasksService.shouldExecuteAsGroup(
        taskId
      );

      if (executionStrategy.executeAsGroup) {
        logger.info(
          `Ejecutando como grupo vinculado: ${executionStrategy.reason}`
        );

        const groupResult = await LinkedTasksService.executeLinkedGroup(
          taskId,
          "manual"
        );

        if (groupResult.success) {
          logger.info(
            `Ejecución de grupo completada exitosamente desde ${transferName}`
          );

          try {
            const emailResults = groupResult.linkedTasksResults.map((r) => ({
              name: r.taskName,
              success: r.success,
              inserted: r.inserted || 0,
              updated: r.updated || 0,
              duplicates: r.duplicates || 0,
              rows: r.rows || 0,
              message: r.message || "Transferencia completada",
              errorDetail: r.error || "N/A",
            }));

            await sendTransferResultsEmail(emailResults, "manual_linked_group");
            logger.info(`Correo de grupo enviado para ${transferName}`);
          } catch (emailError) {
            logger.error(
              `Error al enviar correo de grupo: ${emailError.message}`
            );
          }

          return {
            success: true,
            message: groupResult.message,
            result: groupResult,
            emailSent: true,
            isLinkedGroup: true,
          };
        } else {
          return {
            success: false,
            message: groupResult.message,
            result: groupResult,
            emailSent: true,
            isLinkedGroup: true,
          };
        }
      } else {
        logger.info(`Ejecutando individualmente: ${executionStrategy.reason}`);

        logger.info(`Ejecutando transferencia para la tarea: ${transferName}`);
        Telemetry.trackTransfer("started");

        const result = await this.executeTransferWithRetry(taskId);
        Telemetry.trackTransfer(result.success ? "completed" : "failed");

        if (!result) {
          logger.error(
            `No se obtuvo un resultado válido para la tarea: ${transferName}`
          );
          return {
            success: false,
            message: "No se obtuvo un resultado válido",
          };
        }

        const formattedResult = {
          name: transferName,
          success: result.success || false,
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          duplicates: result.duplicates || 0,
          rows: result.rows || 0,
          message: result.message || "Transferencia completada",
          errorDetail: result.errorDetail || "N/A",
          initialCount: result.initialCount || 0,
          finalCount: result.finalCount || 0,
          duplicatedRecords: result.duplicatedRecords || [],
          hasMoreDuplicates: result.hasMoreDuplicates || false,
          totalDuplicates: result.totalDuplicates || 0,
        };

        try {
          await sendTransferResultsEmail([formattedResult], "manual");
          logger.info(
            `Correo de notificación enviado para la transferencia: ${transferName}`
          );
        } catch (emailError) {
          logger.error(
            `Error al enviar correo de notificación: ${emailError.message}`
          );
        }

        if (result.success) {
          logger.info(
            `Transferencia manual completada con éxito: ${transferName}`
          );

          await TransferTask.findByIdAndUpdate(taskId, {
            lastExecutionDate: new Date(),
            $inc: { executionCount: 1 },
            lastExecutionResult: {
              success: result.success,
              message: result.message || "Transferencia completada",
              affectedRecords: (result.inserted || 0) + (result.updated || 0),
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
            `Error en la transferencia manual: ${transferName}`,
            result
          );
          return {
            success: false,
            message: "Error en la ejecución de la transferencia manual",
            result,
            emailSent: true,
          };
        }
      }
    } catch (error) {
      logger.error(
        `Error en la ejecución manual de la transferencia ${transferName}: ${error.message}`
      );
      Telemetry.trackTransfer("failed");

      try {
        await sendCriticalErrorEmail(
          `Error crítico en transferencia manual: ${error.message}`,
          "manual",
          `ID de tarea: ${taskId}, Nombre: ${transferName}`
        );
        logger.info(`Correo de error crítico enviado`);
      } catch (emailError) {
        logger.error(`Error al enviar correo de error: ${emailError.message}`);
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
   * Crea o actualiza una tarea de transferencia en MongoDB
   */
  async upsertTransferTask(taskData) {
    console.log("taskData", taskData);

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
        error: error.message || "Error desconocido",
      };
    }
  }

  /**
   * Función wrapper para ejecutar la transferencia con reintentos controlados
   * @param {string} taskId - ID de la tarea
   * @param {number} maxRetries - Número máximo de reintentos
   * @param {Object} options - Opciones adicionales (skipPostUpdate)
   */
  async executeTransferWithRetry(taskId, maxRetries = 3, options = {}) {
    const abortController = new AbortController();
    const { signal } = abortController;
    const skipPostUpdate = options?.skipPostUpdate === true;

    TaskTracker.registerTask(taskId, abortController, {
      type: "transfer",
      metadata: {
        taskId,
        startTime: Date.now(),
      },
    });

    try {
      let attempt = 0;
      let lastError = null;

      while (attempt < maxRetries) {
        try {
          if (signal.aborted) {
            throw new Error("Tarea cancelada por el usuario");
          }

          if (attempt > 0) {
            await this.verifyAndRefreshConnections(taskId);
            logger.info(
              `Reintentando transferencia ${taskId} (intento ${attempt + 1
              }/${maxRetries})...`
            );
          }

          return await this.executeTransfer(taskId, signal, { skipPostUpdate });
        } catch (error) {
          lastError = error;

          if (signal.aborted || error.message?.includes("cancelada")) {
            throw error;
          }

          const isRecoverable = this.isConnectionError(error);

          if (!isRecoverable || attempt >= maxRetries - 1) {
            throw error;
          }

          const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
          logger.warn(
            `Error recuperable en transferencia ${taskId}, reintentando en ${delay / 1000
            } segundos...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));

          attempt++;
        }
      }

      throw lastError || new Error("Error desconocido en transferencia");
    } catch (error) {
      if (signal.aborted || error.message?.includes("cancelada")) {
        logger.info(`Tarea ${taskId} cancelada por el usuario`);
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "cancelled",
          progress: -1,
        });
        sendProgress(taskId, -1);
        TaskTracker.completeTask(taskId, "cancelled");
        return {
          success: false,
          message: "Transferencia cancelada por el usuario",
        };
      }

      logger.error(`Error no recuperable en tarea ${taskId}:`, error);

      try {
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "failed",
          lastExecutionDate: new Date(),
          lastExecutionResult: {
            success: false,
            message: error.message || "Error desconocido",
            error: error.stack || "No stack trace available",
          },
        });
      } catch (updateError) {
        logger.warn(
          `Error al actualizar estado de fallo para tarea ${taskId}:`,
          updateError
        );
      }

      TaskTracker.completeTask(taskId, "failed");

      if (this.isConnectionError(error)) {
        this.addTaskToRetryQueue(taskId, error.message || "Error de conexión");
      }

      throw error;
    }
  }

  /**
   * Implementación modular de la transferencia de datos
   * MIGRADO: Usa DatabaseServiceAdapter completamente
   * @param {string} taskId - ID de la tarea
   * @param {AbortSignal} signal - Signal para cancelación
   * @param {Object} options - Opciones adicionales (skipPostUpdate)
   */
  async executeTransfer(taskId, signal, options = {}) {
    const skipPostUpdate = options?.skipPostUpdate === true;
    let executionId = null;
    const startTime = Date.now();

    try {
      this.checkCancellation(signal);

      // 1. Preparar la transferencia
      const taskInfo = await this.prepareTransfer(taskId, signal);

      // ACTUALIZACIÓN FALTANTE: Establecer explicitamente status running y progress=0 en mongodb
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "running",
        progress: 0,
        lastExecutionDate: new Date(),
      });
      // Emitir primer checkpoint SSE
      sendProgress(taskId, 0, "running");

      // Crear registro de ejecución
      const taskExecution = new TaskExecution({
        taskId: taskId,
        taskName: taskInfo.name,
        date: new Date(),
        status: "running",
      });

      await taskExecution.save();
      executionId = taskExecution._id;

      logger.info(`Creado registro de ejecución con ID: ${executionId}`);

      const transferDirection =
        taskInfo.transferType === "down"
          ? "DOWN (Server2 → Server1)"
          : "UP (Server1 → Server2)";

      logger.info(
        `Iniciando transferencia ${transferDirection} para tarea ${taskInfo.name}`
      );

      // 2. Obtener datos origen usando transacciones
      const { data, params } = await this.fetchSourceDataWithNewSystem(
        taskInfo,
        signal
      );

      this.checkCancellation(signal);

      // 3. Verificar si hay datos para transferir
      if (data.length === 0) {
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "completed",
          progress: 100,
        });

        if (executionId) {
          await TaskExecution.findByIdAndUpdate(executionId, {
            status: "completed",
            executionTime: Date.now() - startTime,
            totalRecords: 0,
          });
        }

        sendProgress(taskId, 100);
        TaskTracker.completeTask(taskId, "completed");
        return {
          success: true,
          message: "No hay datos para transferir",
          rows: 0,
          executionId,
        };
      }

      // 4. Procesar e insertar datos usando transacciones
      const result = await this.processAndInsertDataWithNewSystem(
        data,
        taskInfo,
        signal
      );

      this.checkCancellation(signal);

      // 5. Ejecutar operaciones post-transferencia si corresponde
      // SkipPostUpdate evita que se ejecute durante ejecuciones de grupo vinculado
      if (
        !skipPostUpdate &&
        taskInfo.postUpdateQuery &&
        result.affectedRecords &&
        result.affectedRecords.length > 0
      ) {
        await this.executePostTransferOperationsWithNewSystem(
          taskInfo,
          result.affectedRecords,
          signal
        );
      } else if (skipPostUpdate && taskInfo.postUpdateQuery) {
        logger.info(`Post-Update omitido para tarea ${taskInfo.name} (skipPostUpdate=true)`);
      }

      const executionTime = Date.now() - startTime;

      // 6. Actualizar estado final
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "completed",
        progress: 100,
        lastExecutionDate: new Date(),
        $inc: { executionCount: 1 },
        lastExecutionResult: {
          success: true,
          message: "Transferencia completada",
          affectedRecords: (result.inserted || 0) + (result.updated || 0),
        },
      });

      if (executionId) {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "completed",
          executionTime,
          totalRecords: data.length,
          successfulRecords: (result.inserted || 0) + (result.updated || 0),
          failedRecords:
            data.length - ((result.inserted || 0) + (result.updated || 0)),
          details: {
            inserted: result.inserted || 0,
            updated: result.updated || 0,
            duplicates: result.duplicates || 0,
            initialCount: result.initialCount || 0,
            finalCount: result.finalCount || 0,
          },
        });
      }

      sendProgress(taskId, 100);
      TaskTracker.completeTask(taskId, "completed");

      return {
        success: true,
        message: "Transferencia completada",
        rows: data.length,
        inserted: result.inserted,
        updated: result.updated || 0,
        duplicates: result.duplicates,
        duplicatedRecords: result.duplicatedRecords,
        hasMoreDuplicates: result.hasMoreDuplicates,
        totalDuplicates: result.totalDuplicatesCount,
        initialCount: result.initialCount,
        finalCount: result.finalCount,
        affectedRecords: result.affectedRecords || [],  // Agregado para LinkedTasks
        executionId,
      };
    } catch (error) {
      if (this.isCancellationError(error) || signal?.aborted) {
        logger.info(`Tarea ${taskId} cancelada por el usuario`);

        await TransferTask.findByIdAndUpdate(taskId, {
          status: "cancelled",
          progress: -1,
        });

        if (executionId) {
          await TaskExecution.findByIdAndUpdate(executionId, {
            status: "cancelled",
            executionTime: Date.now() - startTime,
            errorMessage: "Transferencia cancelada por el usuario",
          });
        }

        sendProgress(taskId, -1);

        return {
          success: false,
          message: "Transferencia cancelada por el usuario",
          executionId,
        };
      }

      logger.error(`Error durante la transferencia ${taskId}:`, error);

      await TransferTask.findByIdAndUpdate(taskId, {
        status: "failed",
        progress: -1,
        lastExecutionDate: new Date(),
        $inc: { executionCount: 1 },
        lastExecutionResult: {
          success: false,
          message: error.message || "Error durante la transferencia",
          errorDetails: error.stack || error.message,
        },
      });

      if (executionId) {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          executionTime: Date.now() - startTime,
          errorMessage: error.message || "Error desconocido",
          errorDetails: error.stack,
        });
      }

      sendProgress(taskId, -1);
      TaskTracker.completeTask(taskId, "failed");

      return {
        success: false,
        message: error.message || "Error durante la transferencia",
        errorDetail: error.stack,
        executionId,
      };
    }
  }

  /**
   * Obtiene datos origen usando el nuevo sistema
   */
  async fetchSourceDataWithNewSystem(task, signal) {
    try {
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      const { name, query, parameters, transferType } = task;

      const sourceServerKey = transferType === "down" ? "server2" : "server1";

      let finalQuery = query;
      const params = {};

      if (parameters?.length > 0) {
        const conditions = [];
        for (const param of parameters) {
          const { field, operator, value } = param;

          if (!field || !operator || value === undefined || value === null) {
            logger.warn(`Parámetro inválido omitido: ${JSON.stringify(param)}`);
            continue;
          }

          switch (operator.toUpperCase()) {
            case "BETWEEN":
              if (
                typeof value === "object" &&
                value.from !== undefined &&
                value.to !== undefined
              ) {
                params[`${field}_from`] = value.from;
                params[`${field}_to`] = value.to;
                conditions.push(
                  `${field} BETWEEN @${field}_from AND @${field}_to`
                );
              } else {
                logger.warn(
                  `Valor inválido para BETWEEN en campo ${field}: ${JSON.stringify(
                    value
                  )}`
                );
              }
              break;

            case "IN":
              let inValues = value;
              if (typeof value === "string") {
                inValues = value
                  .split(",")
                  .map((v) => v.trim())
                  .filter((v) => v !== "");
                logger.info(
                  `Convertido string a array para IN: "${value}" → [${inValues.join(
                    ", "
                  )}]`
                );
              }

              if (Array.isArray(inValues) && inValues.length > 0) {
                const placeholders = inValues.map((val, idx) => {
                  const paramName = `${field}_${idx}`;
                  params[paramName] = val;
                  return `@${paramName}`;
                });
                conditions.push(`${field} IN (${placeholders.join(", ")})`);
              } else {
                logger.warn(
                  `Valor inválido para IN en campo ${field}: ${JSON.stringify(
                    value
                  )}`
                );
              }
              break;

            case "LIKE":
              if (typeof value === "string") {
                params[field] = value;
                conditions.push(`${field} LIKE @${field}`);
              } else {
                logger.warn(
                  `Valor inválido para LIKE en campo ${field}: ${JSON.stringify(
                    value
                  )}`
                );
              }
              break;

            case "IS NULL":
            case "IS NOT NULL":
              conditions.push(`${field} ${operator}`);
              break;

            case "=":
            case "!=":
            case "<>":
            case ">":
            case "<":
            case ">=":
            case "<=":
              params[field] = value;
              conditions.push(`${field} ${operator} @${field}`);
              break;

            default:
              logger.warn(
                `Operador no soportado: ${operator} para campo ${field}`
              );
              break;
          }
        }

        if (conditions.length > 0) {
          finalQuery += ` WHERE ${conditions.join(" AND ")}`;
          logger.info(`Condiciones aplicadas: ${conditions.join(" AND ")}`);
          logger.info(`Parámetros: ${JSON.stringify(params)}`);
        } else {
          logger.warn(
            "No se generaron condiciones válidas de los parámetros proporcionados"
          );
        }
      }

      logger.debug(
        `Ejecutando consulta en ${sourceServerKey} para ${task.name
        }: ${finalQuery.substring(0, 200)}...`
      );

      Telemetry.startTimer(`query_${task._id}`);

      const sanitizedParams = this._sanitizeParams(params);

      logger.info(
        `Parámetros de consulta para ${task.name}:`,
        JSON.stringify(sanitizedParams)
      );

      const result = await DatabaseServiceAdapter.query(
        sourceServerKey,
        finalQuery,
        sanitizedParams
      );

      const queryTime = Telemetry.endTimer(`query_${task._id}`);
      logger.debug(`Consulta completada en ${queryTime}ms`);

      Telemetry.updateAverage("avgQueryTime", queryTime);
      Telemetry.trackTransfer("recordsProcessed", result.recordset.length);

      logger.info(
        `DATOS OBTENIDOS DE ORIGEN (${sourceServerKey}): ${result.recordset.length} registros para la tarea ${task.name}`
      );

      if (result.recordset.length > 0) {
        logger.info(`MUESTRA DE LOS PRIMEROS 3 REGISTROS:`);
        for (let i = 0; i < Math.min(3, result.recordset.length); i++) {
          logger.info(
            `Registro ${i + 1}:`,
            JSON.stringify(result.recordset[i])
          );
        }

        if (result.recordset.length > 0) {
          logger.info(
            `Campos disponibles en los registros: ${Object.keys(
              result.recordset[0]
            ).join(", ")}`
          );
        }
      } else {
        logger.warn(`LA CONSULTA NO DEVOLVIÓ REGISTROS.`);
        logger.warn(`Consulta ejecutada: ${finalQuery}`);
        logger.warn(`Parámetros: ${JSON.stringify(sanitizedParams)}`);

        try {
          const testQuery =
            transferType === "down" && task.fieldMapping?.sourceTable
              ? `SELECT TOP 5 * FROM ${task.fieldMapping.sourceTable}`
              : "SELECT TOP 5 * FROM INFORMATION_SCHEMA.TABLES";

          const testResult = await DatabaseServiceAdapter.query(
            sourceServerKey,
            testQuery
          );
          logger.info(
            `Prueba de conexión exitosa en ${sourceServerKey}. Número de registros de ejemplo: ${testResult.recordset.length}`
          );
        } catch (testError) {
          logger.error(
            `Error al ejecutar consulta de prueba en ${sourceServerKey}: ${testError.message}`
          );
        }
      }

      logger.info(
        `Datos obtenidos correctamente de ${sourceServerKey} para ${task.name}: ${result.recordset.length} registros`
      );

      return {
        data: result.recordset,
        params: sanitizedParams,
      };
    } catch (error) {
      if (signal.aborted) {
        logger.info(`Tarea cancelada durante consulta de datos`);
        throw new Error("Transferencia cancelada por el usuario");
      }

      logger.error(`Error en la consulta: `, error);
      logger.error(`Consulta que causó el error: ${task.query}`);

      if (error.number) {
        logger.error(`Código de error SQL: ${error.number}`);
        logger.error(`Estado SQL: ${error.state || "N/A"}`);
      }

      const sourceServer = task.transferType === "down" ? "server2" : "server1";

      try {
        logger.info(`Intentando consulta de diagnóstico en ${sourceServer}...`);

        const diagResult = await DatabaseServiceAdapter.query(
          sourceServer,
          "SELECT 1 AS test"
        );
        logger.info(
          `Consulta de diagnóstico exitosa en ${sourceServer}: ${JSON.stringify(
            diagResult.recordset[0]
          )}`
        );
      } catch (diagError) {
        logger.error(
          `Error en consulta de diagnóstico en ${sourceServer}: ${diagError.message}`
        );
      }

      throw new Error(
        `Error en la consulta en ${sourceServer}: ${error.message}`
      );
    }
  }

  /**
   * Procesa e inserta datos usando transacciones
   */
  async processAndInsertDataWithNewSystem(data, task, signal) {
    const { validationRules, name } = task;
    const primaryKeys = validationRules?.existenceCheck?.key
      ? [validationRules.existenceCheck.key]
      : [];
    const requiredFields = validationRules?.requiredFields || [];
    const mergeKeys = [...new Set([...primaryKeys, ...requiredFields])];

    if (mergeKeys.length === 0) {
      throw new Error("No se especificaron claves para identificar registros");
    }

    const targetServerKey =
      task.transferType === "down" ? "server1" : "server2";

    let targetTableName = `dbo.[${name}]`;

    if (
      task.transferType === "down" &&
      task.fieldMapping &&
      task.fieldMapping.targetTable
    ) {
      const tableNameFromMapping = task.fieldMapping.targetTable;

      if (!tableNameFromMapping.includes(".")) {
        targetTableName = `dbo.[${tableNameFromMapping}]`;
      } else if (!tableNameFromMapping.includes("[")) {
        const [schema, table] = tableNameFromMapping.split(".");
        targetTableName = `${schema}.[${table}]`;
      } else {
        targetTableName = tableNameFromMapping;
      }

      logger.info(
        `Transferencia DOWN: Usando tabla destino "${targetTableName}" desde mapeo`
      );
    } else {
      logger.info(`Usando tabla destino predeterminada: "${targetTableName}"`);
    }

    let totalInserted = 0;
    let duplicateCount = 0;
    let duplicatedRecords = [];
    let processedCount = 0;
    let lastReportedProgress = 0;
    let affectedRecords = [];
    let initialCount = 0;
    let finalCount = 0;

    return await DatabaseServiceAdapter.withTransaction(
      targetServerKey,
      async (connection) => {
        if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

        // 1. Obtener conteo inicial
        try {
          const countResult = await DatabaseServiceAdapter.query(
            connection,
            `SELECT COUNT(*) AS total FROM ${targetTableName} WITH (NOLOCK)`
          );
          initialCount = countResult.recordset[0].total;
          logger.info(
            `Conteo inicial en tabla ${targetTableName}: ${initialCount} registros`
          );
        } catch (countError) {
          logger.warn(
            `No se pudo verificar conteo inicial: ${countError.message}`
          );
          initialCount = 0;
        }

        // 2. Preparar destino si es necesario
        if (task.clearBeforeInsert) {
          try {
            logger.info(
              `Borrando registros existentes de la tabla ${targetTableName} en ${targetServerKey} antes de insertar`
            );

            const deletedCount = await this._clearTableData(
              connection,
              targetTableName
            );

            logger.info(
              `Se eliminaron ${deletedCount} registros de la tabla ${targetTableName}`
            );
            initialCount = 0;
          } catch (clearError) {
            if (signal.aborted) {
              logger.info(`Tarea cancelada durante borrado de registros`);
              throw new Error("Transferencia cancelada por el usuario");
            }

            logger.error(
              `Error al borrar registros de la tabla ${targetTableName}:`,
              clearError
            );

            if (
              clearError.message &&
              clearError.message.includes("no existe")
            ) {
              logger.warn(
                `La tabla no existe, continuando con la inserción...`
              );
            } else {
              throw new Error(
                `Error al borrar registros existentes: ${clearError.message}`
              );
            }
          }
        }

        // 3. Obtener claves existentes
        let existingKeysSet = new Set();
        if (mergeKeys.length > 0) {
          try {
            logger.debug(
              `Obteniendo claves existentes para verificar duplicados...`
            );

            const keysQuery = `
            SELECT DISTINCT ${mergeKeys.map((k) => `[${k}]`).join(", ")}
            FROM ${targetTableName} WITH (NOLOCK)
          `;

            const keysResult = await DatabaseServiceAdapter.query(
              connection,
              keysQuery
            );

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
              `Se encontraron ${existingKeysSet.size} claves existentes para verificación de duplicados`
            );
          } catch (keysError) {
            logger.warn(
              `Error al obtener claves existentes: ${keysError.message}. Continuando sin verificación previa.`
            );
          }
        }

        // 4. Procesar en lotes
        const batchSize = 500;
        Telemetry.startTimer(`insert_${task._id}`);

        for (let i = 0; i < data.length; i += batchSize) {
          if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

          const batch = data.slice(i, i + batchSize);
          const batchNumber = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(data.length / batchSize);

          logger.debug(
            `Procesando lote ${batchNumber}/${totalBatches} (${batch.length} registros)...`
          );

          let batchInserted = 0;
          let batchSkipped = 0;

          for (const record of batch) {
            try {
              const validatedRecord = this._validateRecord(record);

              // Recopilar affectedRecords para post-update coordinar
              // Se hace independientemente de si tiene postUpdateQuery,
              // para que el grupo pueda ejecutar el post-update al final
              if (primaryKeys.length > 0) {
                const primaryKey = primaryKeys[0];
                if (
                  validatedRecord[primaryKey] !== null &&
                  validatedRecord[primaryKey] !== undefined
                ) {
                  affectedRecords.push(validatedRecord[primaryKey]);
                }
              }

              if (existingKeysSet.size > 0) {
                const recordKey = mergeKeys
                  .map((k) => {
                    const value =
                      validatedRecord[k] === null ? "NULL" : validatedRecord[k];
                    return `${k}:${value}`;
                  })
                  .join("|");

                if (existingKeysSet.has(recordKey)) {
                  duplicateCount++;
                  batchSkipped++;

                  const duplicateRecord = {};
                  mergeKeys.forEach((key) => {
                    duplicateRecord[key] = validatedRecord[key];
                  });

                  duplicatedRecords.push(duplicateRecord);
                  continue;
                }
              }

              try {
                const insertResult = await this._insertRecord(
                  connection,
                  targetTableName,
                  validatedRecord
                );

                const rowsAffected = insertResult?.rowsAffected || 0;

                if (rowsAffected > 0) {
                  totalInserted += rowsAffected;
                  batchInserted += rowsAffected;

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

                  Telemetry.trackTransfer("recordsInserted");
                }
              } catch (insertError) {
                if (signal.aborted)
                  throw new Error("Tarea cancelada por el usuario");

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

                  const duplicateRecord = {};
                  mergeKeys.forEach((key) => {
                    duplicateRecord[key] = validatedRecord[key];
                  });

                  duplicateRecord._errorMessage =
                    insertError.message?.substring(0, 100) ||
                    "Error de clave duplicada";
                  duplicatedRecords.push(duplicateRecord);

                  Telemetry.trackTransfer("recordsDuplicated");
                } else {
                  throw new Error(
                    `Error al insertar registro: ${insertError.message || "Error desconocido"
                    }`
                  );
                }
              }
            } catch (recordError) {
              if (signal.aborted)
                throw new Error("Tarea cancelada por el usuario");

              if (
                recordError.number !== 2627 &&
                recordError.number !== 2601 &&
                !recordError.message?.includes("duplicate key")
              ) {
                throw recordError;
              }
            }

            processedCount++;
            if (processedCount % 50 === 0) {
              MemoryManager.trackOperation();
            }
          }

          logger.debug(
            `Lote ${batchNumber}/${totalBatches}: ${batchInserted} insertados, ${batchSkipped} duplicados`
          );

          const progress = Math.min(
            Math.round(((i + batch.length) / data.length) * 100),
            99
          );

          if (progress > lastReportedProgress + 5 || progress >= 99) {
            lastReportedProgress = progress;
            await TransferTask.findByIdAndUpdate(task._id, { progress });
            sendProgress(task._id, progress);
            logger.debug(`Progreso actualizado: ${progress}%`);
          }
        }

        // 5. Verificar conteo final
        try {
          const countResult = await DatabaseServiceAdapter.query(
            connection,
            `SELECT COUNT(*) AS total FROM ${targetTableName} WITH (NOLOCK)`
          );
          finalCount = countResult.recordset[0].total;
          logger.info(
            `Conteo final en tabla ${targetTableName}: ${finalCount} registros`
          );
        } catch (countError) {
          logger.warn(
            `No se pudo verificar conteo final: ${countError.message}`
          );
        }

        const totalTime = Telemetry.endTimer(`insert_${task._id}`);
        Telemetry.updateAverage("avgTransferTime", totalTime);

        const maxDuplicatesToReport = 100;
        const reportedDuplicates = duplicatedRecords.slice(
          0,
          maxDuplicatesToReport
        );
        const hasMoreDuplicates =
          duplicatedRecords.length > maxDuplicatesToReport;

        return {
          inserted: totalInserted,
          duplicates: duplicateCount,
          duplicatedRecords: reportedDuplicates,
          hasMoreDuplicates,
          totalDuplicatesCount: duplicatedRecords.length,
          initialCount,
          finalCount,
          affectedRecords,
          processingTime: totalTime,
        };
      }
    );
  }

  /**
   * Inserta un registro - MIGRADO desde SqlService
   */
  async _insertRecord(connection, tableName, record) {
    const columns = Object.keys(record);
    const values = Object.values(record);

    const columnNames = columns.map((col) => `[${col}]`).join(", ");
    const parameterNames = columns.map((col) => `@${col}`).join(", ");

    const sql = `INSERT INTO ${tableName} (${columnNames}) VALUES (${parameterNames})`;

    const params = {};
    columns.forEach((col) => {
      params[col] = record[col];
    });

    return await DatabaseServiceAdapter.query(connection, sql, params);
  }

  /**
   * Ejecuta operaciones post-transferencia usando transacciones
   */
  async executePostTransferOperationsWithNewSystem(
    task,
    affectedRecords,
    signal
  ) {
    if (!task.postUpdateQuery || !affectedRecords.length) {
      return {
        success: true,
        message: "No hay operaciones post-transferencia",
      };
    }

    try {
      const linkingInfo = await LinkedTasksService.getTaskLinkingInfo(
        task._id.toString()
      );

      if (
        linkingInfo &&
        linkingInfo.hasLinkedTasks &&
        !linkingInfo.isCoordinator
      ) {
        logger.info(
          `Tarea ${task.name} es parte de un grupo vinculado pero no es coordinadora. Post-update será manejado por el coordinador.`
        );
        return {
          success: true,
          message: "Post-update será manejado por el coordinador del grupo",
          deferred: true,
        };
      }

      logger.info(
        `Ejecutando operaciones post-transferencia para ${affectedRecords.length} registros...`
      );

      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      return await DatabaseServiceAdapter.withTransaction(
        "server1",
        async (connection) => {
          const batchSize = 500;
          let affectedTotal = 0;

          for (let i = 0; i < affectedRecords.length; i += batchSize) {
            if (signal.aborted)
              throw new Error("Tarea cancelada por el usuario");

            const batch = affectedRecords.slice(i, i + batchSize);

            const processedKeys = batch.map((key) =>
              typeof key === "string" && key.startsWith("CN")
                ? key.replace(/^CN/, "")
                : key
            );

            const params = {};
            processedKeys.forEach((key, index) => {
              params[`key${index}`] = key;
            });

            const primaryKeyField =
              task.postUpdateMapping?.tableKey ||
              task.validationRules?.existenceCheck?.key ||
              "ID";

            const keyParams = processedKeys
              .map((_, index) => `@key${index}`)
              .join(", ");

            const dynamicUpdateQuery = `${task.postUpdateQuery} WHERE ${primaryKeyField} IN (${keyParams})`;

            const sanitizedParams = this._sanitizeParams(params);
            const updateResult = await DatabaseServiceAdapter.query(
              connection,
              dynamicUpdateQuery,
              sanitizedParams
            );

            affectedTotal += updateResult.rowsAffected || 0;
            logger.info(
              `Post-actualización ejecutada: ${updateResult.rowsAffected} filas afectadas`
            );
          }

          logger.info(
            `Post-actualización completada: ${affectedTotal} registros actualizados en total`
          );
          return { success: true, updated: affectedTotal };
        }
      );
    } catch (error) {
      if (signal.aborted) {
        logger.info(`Tarea cancelada durante post-actualización`);
        throw new Error("Transferencia cancelada por el usuario");
      }

      logger.error(`Error en operaciones post-transferencia:`, error);
      return {
        success: false,
        message: `Error en operaciones post-transferencia: ${error.message}`,
      };
    }
  }

  /**
   * Prepara la transferencia verificando la tarea
   */
  async prepareTransfer(taskId, signal) {
    if (signal.aborted) {
      logger.info(`Tarea ${taskId} cancelada por el usuario antes de iniciar`);
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "cancelled",
        progress: -1,
      });
      sendProgress(taskId, -1);
      TaskTracker.completeTask(taskId, "cancelled");
      throw new Error("Transferencia cancelada por el usuario");
    }

    const task = await TransferTask.findById(taskId);

    if (!task || !task.active) {
      logger.warn(`La tarea ${task?.name || "desconocida"} está inactiva.`);
      throw new Error("Tarea inactiva o no encontrada");
    }

    logger.info(
      `Preparando transferencia para tarea '${task.name}' (ID: ${taskId})`
    );

    if (!task.validationRules) {
      await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
      sendProgress(taskId, -1);
      throw new Error("No se han especificado reglas de validación");
    }

    await TransferTask.findByIdAndUpdate(taskId, {
      status: "running",
      progress: 0,
    });
    sendProgress(taskId, 0);

    MemoryManager.logMemoryUsage("Inicio de transferencia");

    return task;
  }

  /**
   * Verifica y refresca conexiones antes de un reintento
   */
  async verifyAndRefreshConnections(taskId) {
    try {
      logger.info(
        `Verificando estado del sistema antes de reintento para tarea ${taskId}...`
      );

      let healthMonitorService;
      try {
        healthMonitorService = require("./healthMonitorService");
      } catch (importError) {
        logger.debug(
          `Servicio de monitoreo de salud no disponible, usando verificación básica`
        );
      }

      if (healthMonitorService) {
        await healthMonitorService.checkSystemHealth();
      } else {
        const MongoDbService = require("./mongoDbService");

        if (!MongoDbService.isConnected()) {
          logger.warn(`MongoDB no conectado, intentando reconexión...`);
          await MongoDbService.connect();
        }

        logger.info(`Verificando estado de DatabaseService...`);
        const stats = DatabaseServiceAdapter.getConnectionStats();

        if (!stats.initialized) {
          logger.info(`Reinicializando DatabaseService...`);
          await DatabaseServiceAdapter.initialize();
        }
      }

      logger.info(`Verificación de conexiones completada para tarea ${taskId}`);
    } catch (error) {
      logger.error(
        `Error al verificar/refrescar conexiones para tarea ${taskId}:`,
        error
      );
    }
  }

  /**
   * Determina si un error está relacionado con problemas de conexión
   */
  isConnectionError(error) {
    if (!error) return false;

    const errorMsg = (error.message || "").toLowerCase();
    const connectionErrorTerms = [
      "conexión",
      "connection",
      "network",
      "timeout",
      "socket",
      "state",
      "loggedin state",
      "final state",
      "pool",
      "draining",
    ];

    return connectionErrorTerms.some((term) => errorMsg.includes(term));
  }

  /**
   * Verifica si hay cancelación
   */
  checkCancellation(signal) {
    if (signal && signal.aborted) {
      throw new Error("Operacion cancelada por el usuario.");
    }
  }

  /**
   * Verifica si un error es de cancelación
   */
  isCancellationError(error) {
    return (
      error.message?.includes("cancel") ||
      error.message?.includes("abort") ||
      (error.signal && error.signal.aborted)
    );
  }

  /**
   * Añade una tarea fallida a la cola de reintentos
   */
  addTaskToRetryQueue(taskId, reason) {
    const existingTask = this.retryQueue.tasks.find(
      (task) => task.taskId === taskId
    );

    if (existingTask) {
      existingTask.retryCount++;
      existingTask.lastFailReason = reason;
      existingTask.lastFailTime = new Date().toISOString();
      logger.info(
        `Tarea ${taskId} actualizada en cola de reintentos (intentos: ${existingTask.retryCount})`
      );
    } else {
      this.retryQueue.tasks.push({
        taskId,
        initialFailTime: new Date().toISOString(),
        lastFailTime: new Date().toISOString(),
        lastFailReason: reason,
        retryCount: 0,
      });
      logger.info(`Tarea ${taskId} añadida a cola de reintentos`);
    }

    if (!this.retryQueue.isProcessing) {
      this.scheduleRetryQueueProcessing();
    }
  }

  /**
   * Programa el procesamiento de la cola de reintentos
   */
  scheduleRetryQueueProcessing() {
    if (this.retryQueue.tasks.length === 0) {
      return;
    }

    if (this.retryQueue.isProcessing) {
      return;
    }

    let waitTime = this.retryQueue.retryInterval;

    if (this.retryQueue.lastProcessTime) {
      const timeSinceLastProcess =
        Date.now() - new Date(this.retryQueue.lastProcessTime).getTime();
      waitTime = Math.max(
        0,
        this.retryQueue.retryInterval - timeSinceLastProcess
      );
    }

    logger.info(
      `Programando procesamiento de cola de reintentos en ${waitTime / 1000
      } segundos`
    );

    setTimeout(() => this.processRetryQueue(), waitTime);
  }

  /**
   * Procesa la cola de reintentos
   */
  async processRetryQueue() {
    if (this.retryQueue.isProcessing || this.retryQueue.tasks.length === 0) {
      return;
    }

    this.retryQueue.isProcessing = true;
    this.retryQueue.lastProcessTime = new Date().toISOString();

    logger.info(
      `Procesando cola de reintentos (${this.retryQueue.tasks.length} tareas)...`
    );

    try {
      let connectionsOk = false;

      try {
        let healthMonitorService;
        try {
          healthMonitorService = require("./healthMonitorService");
          const healthCheck =
            await healthMonitorService.performFullDiagnostic();
          connectionsOk =
            healthCheck.mongodb?.connected &&
            healthCheck.server1?.connected &&
            healthCheck.server2?.connected;
        } catch (importError) {
          const MongoDbService = require("./mongoDbService");

          const mongoConnected = MongoDbService.isConnected();
          const poolStatus = DatabaseServiceAdapter.getConnectionStats();

          connectionsOk =
            mongoConnected &&
            poolStatus.initialized &&
            Object.keys(poolStatus.pools || {}).length > 0;
        }
      } catch (connCheckError) {
        logger.error(
          "Error al verificar conexiones antes de procesar cola:",
          connCheckError
        );
        connectionsOk = false;
      }

      if (!connectionsOk) {
        logger.warn(
          "No se puede procesar la cola de reintentos debido a problemas de conexión"
        );
        this.retryQueue.isProcessing = false;

        setTimeout(
          () => this.processRetryQueue(),
          this.retryQueue.retryInterval
        );
        return;
      }

      const tasksToProcess = this.retryQueue.tasks.slice(0, 3);
      const remainingTasks = this.retryQueue.tasks.slice(3);
      this.retryQueue.tasks = remainingTasks;

      const results = await Promise.all(
        tasksToProcess.map(async (task) => {
          try {
            logger.info(
              `Reintentando tarea ${task.taskId} (intento ${task.retryCount + 1
              }/${this.retryQueue.maxRetries})...`
            );
            const result = await this.executeTransferWithRetry(task.taskId);
            logger.info(`Reintento exitoso para tarea ${task.taskId}`);
            return {
              taskId: task.taskId,
              success: true,
              ...(result || {}),
            };
          } catch (error) {
            logger.error(`Error en reintento de tarea ${task.taskId}:`, error);

            if (task.retryCount < this.retryQueue.maxRetries - 1) {
              task.retryCount++;
              task.lastFailTime = new Date().toISOString();
              task.lastFailReason = error.message || "Error desconocido";
              this.retryQueue.tasks.push(task);
            } else {
              logger.warn(
                `Tarea ${task.taskId} ha alcanzado el máximo de reintentos (${this.retryQueue.maxRetries})`
              );
              try {
                await TransferTask.findByIdAndUpdate(task.taskId, {
                  status: "failed",
                  lastError: `Fallido después de ${this.retryQueue.maxRetries
                    } reintentos: ${error.message || "Error desconocido"}`,
                });
              } catch (dbError) {
                logger.error(
                  `Error al actualizar estado de tarea ${task.taskId}:`,
                  dbError
                );
              }
            }

            return {
              taskId: task.taskId,
              success: false,
              error: error.message || "Error desconocido",
            };
          }
        })
      );

      logger.info(
        `Procesamiento de cola completado: ${results.filter((r) => r.success).length
        } exitosas, ${results.filter((r) => !r.success).length} fallidas`
      );

      if (this.retryQueue.tasks.length > 0) {
        setTimeout(
          () => this.processRetryQueue(),
          this.retryQueue.retryInterval
        );
      }
    } catch (error) {
      logger.error(
        "Error general durante procesamiento de cola de reintentos:",
        error
      );
    } finally {
      this.retryQueue.isProcessing = false;
    }
  }

  /**
   * Obtiene el estado actual de la cola de reintentos
   */
  getRetryQueueStatus() {
    return {
      tasks: this.retryQueue.tasks.length,
      isProcessing: this.retryQueue.isProcessing,
      lastProcessTime: this.retryQueue.lastProcessTime,
      maxRetries: this.retryQueue.maxRetries,
    };
  }

  /**
   * Obtiene estadísticas de transferencias
   */
  async getTransferStats() {
    try {
      const totalTasks = await TransferTask.countDocuments();
      const activeTasks = await TransferTask.countDocuments({ active: true });
      const runningTasks = await TransferTask.countDocuments({
        status: "running",
      });

      const connectionStats = DatabaseServiceAdapter.getConnectionStats();
      const retryQueueStats = this.getRetryQueueStatus();

      return {
        tasks: {
          total: totalTasks,
          active: activeTasks,
          running: runningTasks,
        },
        connections: connectionStats,
        retryQueue: retryQueueStats,
        memoryUsage: MemoryManager.getMemoryStats(),
        telemetry: Telemetry.getAllMetrics(),
      };
    } catch (error) {
      logger.error("Error al obtener estadísticas de transferencias:", error);
      return {
        error: error.message,
        tasks: { total: 0, active: 0, running: 0 },
        connections: {},
        retryQueue: { tasks: 0, isProcessing: false },
      };
    }
  }

  /**
   * Limpia recursos y cierra conexiones
   */
  async shutdown() {
    try {
      logger.info("Iniciando shutdown de TransferService...");

      const runningTasks = await TransferTask.find({ status: "running" });
      for (const task of runningTasks) {
        try {
          await TransferTask.findByIdAndUpdate(task._id, {
            status: "cancelled",
            progress: -1,
          });
          TaskTracker.completeTask(task._id, "cancelled");
        } catch (updateError) {
          logger.warn(`Error al cancelar tarea ${task._id}:`, updateError);
        }
      }

      this.retryQueue.tasks = [];
      this.retryQueue.isProcessing = false;

      await DatabaseServiceAdapter.shutdown();

      logger.info("TransferService shutdown completado");
    } catch (error) {
      logger.error("Error durante shutdown de TransferService:", error);
    }
  }

  /**
   * Función que inserta TODOS los datos en lotes
   * MIGRADO: Usa DatabaseServiceAdapter y transacciones
   */
  async insertInBatchesSSE(taskId, data, batchSize = 100, signal = null) {
    let lastReportedProgress = 0;
    let initialCount = 0;
    let taskName = "desconocida";

    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;

    const cancelTaskId = `batch_insert_${taskId}_${Date.now()}`;

    try {
      // 1) Obtener la tarea
      const task = await TransferTask.findById(taskId);
      if (!task) {
        throw new Error(`No se encontró la tarea con ID: ${taskId}`);
      }
      if (!task.active) {
        throw new Error(`La tarea "${task.name}" está inactiva.`);
      }

      taskName = task.name;

      TaskTracker.registerTask(
        cancelTaskId,
        localAbortController || { abort: () => { } },
        {
          type: "batchInsert",
          taskName,
          totalRecords: data.length,
        }
      );

      // 2) Marcar status "running", progress=0
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "running",
        progress: 0,
      });
      sendProgress(taskId, 0);

      if (signal.aborted) {
        throw new Error("Tarea cancelada por el usuario");
      }

      // MIGRADO: Usar transacción del nuevo sistema
      const result = await DatabaseServiceAdapter.withTransaction(
        "server2",
        async (connection) => {
          sendProgress(taskId, 10);

          // Si la tarea tiene habilitada la opción de borrar antes de insertar
          if (task.clearBeforeInsert) {
            sendProgress(taskId, 15);

            try {
              logger.info(
                `Borrando registros existentes de la tabla ${task.name} antes de insertar en lotes`
              );

              const deletedCount = await this._clearTableData(
                connection,
                `dbo.[${task.name}]`
              );
              logger.info(
                `Se eliminaron ${deletedCount} registros de la tabla ${task.name}`
              );

              sendProgress(taskId, 20);
            } catch (clearError) {
              logger.error(
                `Error al borrar registros de la tabla ${task.name}:`,
                clearError
              );

              if (
                clearError.message &&
                clearError.message.includes("no existe")
              ) {
                logger.warn(
                  `La tabla no existe, continuando con la inserción...`
                );
              } else {
                logger.warn(
                  `Error al borrar registros pero continuando con la inserción...`
                );
              }
            }
          } else {
            sendProgress(taskId, 20);
          }

          if (signal.aborted) {
            throw new Error("Tarea cancelada por el usuario");
          }

          // 5) Verificar conteo inicial de registros
          try {
            const countResult = await DatabaseServiceAdapter.query(
              connection,
              `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
            );
            initialCount = countResult.recordset[0].total;
            logger.info(
              `Conteo inicial en tabla ${task.name}: ${initialCount} registros`
            );
          } catch (countError) {
            logger.warn(
              `No se pudo verificar conteo inicial: ${countError.message}`
            );
            initialCount = 0;
          }

          const columnLengthCache = new Map();

          const total = data.length;
          let totalInserted = 0;
          let processedCount = 0;
          let errorCount = 0;

          sendProgress(taskId, 25);

          // 8) Procesar data en lotes
          for (let i = 0; i < data.length; i += batchSize) {
            if (signal.aborted) {
              throw new Error("Tarea cancelada por el usuario");
            }

            const batch = data.slice(i, i + batchSize);
            const currentBatchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(data.length / batchSize);

            logger.debug(
              `Procesando lote ${currentBatchNumber}/${totalBatches} (${batch.length} registros) para ${taskName}...`
            );

            let batchInserted = 0;
            let batchErrored = 0;

            for (const record of batch) {
              if (signal.aborted) {
                throw new Error("Tarea cancelada por el usuario");
              }

              try {
                const validatedRecord = this._validateRecord(record);

                // Truncar strings según las longitudes máximas
                for (const column in validatedRecord) {
                  if (typeof validatedRecord[column] === "string") {
                    let maxLength;
                    if (columnLengthCache.has(column)) {
                      maxLength = columnLengthCache.get(column);
                    } else {
                      const lengthQuery = `
                    SELECT CHARACTER_MAXIMUM_LENGTH
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = '${task.name}'
                      AND COLUMN_NAME = '${column}'
                  `;
                      const lengthResult = await DatabaseServiceAdapter.query(
                        connection,
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

                try {
                  const insertResult = await this._insertRecord(
                    connection,
                    `dbo.[${task.name}]`,
                    validatedRecord
                  );

                  const rowsAffected = insertResult?.rowsAffected || 0;

                  if (rowsAffected > 0) {
                    totalInserted += rowsAffected;
                    batchInserted += rowsAffected;
                  }
                } catch (insertError) {
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
              } catch (recordError) {
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

            processedCount += batch.length;
            const progress = Math.min(
              Math.round((processedCount / total) * 75) + 25,
              99
            );

            if (progress > lastReportedProgress + 5 || progress >= 99) {
              lastReportedProgress = progress;
              await TransferTask.findByIdAndUpdate(taskId, { progress });
              sendProgress(taskId, progress);
              logger.debug(`Progreso actualizado: ${progress}%`);
            }

            MemoryManager.trackOperation("batch_insert");
          }

          // 10. Verificar conteo final
          let finalCount = 0;
          try {
            const countResult = await DatabaseServiceAdapter.query(
              connection,
              `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
            );
            finalCount = countResult.recordset[0].total || 0;
            logger.info(
              `Conteo final en tabla ${task.name}: ${finalCount} registros (${finalCount - initialCount
              } nuevos)`
            );
          } catch (countError) {
            logger.warn(
              `No se pudo verificar conteo final: ${countError.message}`
            );
          }

          return {
            success: true,
            message: "Transferencia completada",
            rows: data.length,
            inserted: totalInserted,
            errors: errorCount,
            initialCount,
            finalCount,
          };
        }
      );

      // Actualizar estado a completado
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "completed",
        progress: 100,
        lastExecutionDate: new Date(),
        $inc: { executionCount: 1 },
        lastExecutionResult: {
          success: true,
          message: "Inserción en lotes completada exitosamente",
          recordCount: data.length,
          insertedCount: result.inserted,
          errorCount: result.errors,
        },
      });
      sendProgress(taskId, 100);
      TaskTracker.completeTask(cancelTaskId, "completed");

      // Enviar correo con el resultado
      try {
        const formattedResult = {
          name: task.name,
          success: result.success,
          inserted: result.inserted || 0,
          rows: result.rows || 0,
          message: result.message || "Transferencia completada",
          errorDetail: result.errorDetail || "N/A",
          initialCount: result.initialCount || 0,
          finalCount: result.finalCount || 0,
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
      if (signal.aborted || error.message?.includes("cancelada")) {
        logger.info(`Tarea ${taskName} cancelada por el usuario`);

        await TransferTask.findByIdAndUpdate(taskId, {
          status: "cancelled",
          progress: -1,
          lastExecutionDate: new Date(),
          lastExecutionResult: {
            success: false,
            message: "Cancelada por el usuario",
          },
        });

        sendProgress(taskId, -1);
        TaskTracker.completeTask(cancelTaskId, "cancelled");

        throw new Error("Transferencia cancelada por el usuario");
      }

      logger.error(
        `Error en insertInBatchesSSE para ${taskName}: ${error.message}`,
        error
      );

      await TransferTask.findByIdAndUpdate(taskId, {
        status: "failed",
        progress: -1,
        lastExecutionDate: new Date(),
        lastExecutionResult: {
          success: false,
          message: error.message || "Error desconocido",
          error: error.stack || "No stack trace disponible",
        },
      });
      sendProgress(taskId, -1);
      TaskTracker.completeTask(cancelTaskId, "failed");

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
    }
  }

  /**
   * Ejecuta una transferencia desde Server2 a Server1 (Down)
   * MIGRADO: Usa DatabaseServiceAdapter y transacciones
   */
  async executeTransferDown(taskId) {
    try {
      const task = await TransferTask.findById(taskId);
      if (!task) {
        throw new Error(`No se encontró la tarea con ID: ${taskId}`);
      }

      const transferName = task.name;
      logger.info(
        `Encontrada tarea de transferencia DOWN: ${transferName} (${taskId})`
      );

      if (!task.active) {
        logger.warn(`La tarea ${transferName} está inactiva.`);
        return { success: false, message: "Tarea inactiva" };
      }

      await TransferTask.findByIdAndUpdate(taskId, {
        status: "running",
        progress: 0,
      });
      sendProgress(taskId, 0);

      // MIGRADO: Usar sistema de conexiones múltiples
      return await DatabaseServiceAdapter.withConnections(
        { sourceServer: "server2", targetServer: "server1" },
        async ({ source: server2Connection, target: server1Connection }) => {
          logger.info(
            `Obteniendo datos desde Server2 usando la consulta configurada...`
          );

          // Construir consulta final con parámetros
          let finalQuery = task.query;
          const params = {};

          if (task.parameters?.length > 0) {
            const conditions = [];
            for (const param of task.parameters) {
              params[param.field] = param.value;

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

          logger.debug(`Consulta final: ${finalQuery}`);

          const sanitizedParams = this._sanitizeParams(params);
          const sourceResult = await DatabaseServiceAdapter.query(
            server2Connection,
            finalQuery,
            sanitizedParams
          );

          const sourceData = sourceResult.recordset;
          logger.info(`Obtenidos ${sourceData.length} registros desde Server2`);

          if (sourceData.length === 0) {
            await TransferTask.findByIdAndUpdate(taskId, {
              status: "completed",
              progress: 100,
              lastExecutionDate: new Date(),
            });
            sendProgress(taskId, 100);
            return {
              success: true,
              message: "No hay datos para transferir",
              rows: 0,
            };
          }

          // Aplicar mapeo de campos si está definido
          let transformedData = sourceData;
          if (
            task.fieldMapping &&
            task.fieldMapping.sourceFields &&
            task.fieldMapping.targetFields
          ) {
            logger.info(`Aplicando mapeo de campos para transferencia DOWN...`);
            transformedData = this.mapFields(sourceData, task.fieldMapping);
            logger.info(
              `Datos transformados según mapeo: ${transformedData.length} registros`
            );
          } else {
            logger.warn(
              `No se encontró configuración de mapeo para transferencia DOWN. Se usarán los datos sin transformar.`
            );
          }

          // Preparar tabla destino (limpiar si es necesario)
          if (task.clearBeforeInsert) {
            logger.info(
              `Limpiando tabla destino antes de insertar en Server1: ${task.name}`
            );
            const deleteResult = await this._clearTableData(
              server1Connection,
              `dbo.[${task.name}]`
            );
            logger.info(
              `Se eliminaron ${deleteResult} registros de la tabla destino`
            );
          }

          // Insertar datos en Server1
          logger.info(
            `Comenzando inserción de ${transformedData.length} registros en Server1...`
          );

          let insertedCount = 0;
          let errorCount = 0;
          let duplicateCount = 0;
          const batchSize = 100;

          await TransferTask.findByIdAndUpdate(taskId, { progress: 20 });
          sendProgress(taskId, 20);

          // Procesar por lotes
          for (let i = 0; i < transformedData.length; i += batchSize) {
            const currentTask = await TransferTask.findById(taskId);
            if (currentTask.status === "pending") {
              logger.info(`Tarea ${taskId} cancelada durante procesamiento`);
              throw new Error("Tarea cancelada por el usuario");
            }

            const batch = transformedData.slice(i, i + batchSize);

            const progress = Math.min(
              20 + Math.round((i / transformedData.length) * 80),
              99
            );
            await TransferTask.findByIdAndUpdate(taskId, { progress });
            sendProgress(taskId, progress);

            logger.info(
              `Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(
                transformedData.length / batchSize
              )} (${batch.length} registros)`
            );

            for (const record of batch) {
              try {
                const insertResult = await this._insertRecord(
                  server1Connection,
                  `dbo.[${task.name}]`,
                  record
                );

                if (insertResult && insertResult.rowsAffected) {
                  insertedCount += insertResult.rowsAffected;
                }
              } catch (insertError) {
                if (
                  insertError.number === 2627 ||
                  insertError.number === 2601 ||
                  (insertError.message &&
                    (insertError.message.includes("PRIMARY KEY") ||
                      insertError.message.includes("UNIQUE KEY") ||
                      insertError.message.includes("duplicate key")))
                ) {
                  duplicateCount++;
                  logger.debug(`Registro duplicado: ${JSON.stringify(record)}`);
                } else {
                  errorCount++;
                  logger.error(
                    `Error al insertar registro: ${insertError.message}`
                  );
                }
              }
            }
          }

          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
            lastExecutionDate: new Date(),
            $inc: { executionCount: 1 },
            lastExecutionResult: {
              success: true,
              message: "Transferencia DOWN completada",
              affectedRecords: insertedCount,
            },
          });
          sendProgress(taskId, 100);

          logger.info(
            `Transferencia DOWN completada para ${task.name}: ${insertedCount} registros insertados, ${duplicateCount} duplicados, ${errorCount} errores`
          );

          // Ejecutar tareas encadenadas si existen
          if (task.nextTasks && task.nextTasks.length > 0) {
            logger.info(
              `Iniciando ejecución de ${task.nextTasks.length} tareas encadenadas...`
            );

            const chainResults = [];

            for (const nextTaskId of task.nextTasks) {
              try {
                const nextTask = await TransferTask.findById(nextTaskId);
                if (!nextTask) {
                  logger.warn(
                    `La tarea encadenada con ID ${nextTaskId} no existe. Omitiendo.`
                  );
                  chainResults.push({
                    taskId: nextTaskId,
                    success: false,
                    message: "La tarea no existe",
                  });
                  continue;
                }

                if (!nextTask.active) {
                  logger.warn(
                    `La tarea encadenada ${nextTask.name} (${nextTaskId}) no está activa. Omitiendo.`
                  );
                  chainResults.push({
                    taskId: nextTaskId,
                    taskName: nextTask.name,
                    success: false,
                    message: "La tarea no está activa",
                  });
                  continue;
                }

                logger.info(
                  `Ejecutando tarea encadenada: ${nextTask.name} (${nextTaskId})`
                );

                let chainResult;
                if (nextTask.transferType === "down") {
                  chainResult = await this.executeTransferDown(nextTaskId);
                } else if (nextTask.transferType === "up") {
                  chainResult = await this.executeTransferUp(nextTaskId);
                } else {
                  chainResult = await this.executeTransfer(nextTaskId);
                }

                logger.info(
                  `Tarea encadenada ${nextTask.name} completada: ${chainResult.success ? "Éxito" : "Error"
                  }`
                );

                chainResults.push({
                  taskId: nextTaskId,
                  taskName: nextTask.name,
                  success: chainResult.success,
                  message: chainResult.message,
                  rows: chainResult.rows || 0,
                  inserted: chainResult.inserted || 0,
                });
              } catch (chainError) {
                logger.error(
                  `Error al ejecutar tarea encadenada ${nextTaskId}: ${chainError.message}`
                );

                chainResults.push({
                  taskId: nextTaskId,
                  success: false,
                  error: chainError.message,
                });
              }
            }

            logger.info(
              `Ejecución de tareas encadenadas completada para ${task.name}`
            );

            return {
              success: true,
              message: "Transferencia DOWN y tareas encadenadas completadas",
              rows: sourceData.length,
              inserted: insertedCount,
              duplicates: duplicateCount,
              errors: errorCount,
              chainResults: chainResults,
            };
          }

          return {
            success: true,
            message: "Transferencia DOWN completada con éxito",
            rows: sourceData.length,
            inserted: insertedCount,
            duplicates: duplicateCount,
            errors: errorCount,
          };
        }
      );
    } catch (error) {
      logger.error(`Error en transferencia DOWN: ${error.message}`);

      await TransferTask.findByIdAndUpdate(taskId, {
        status: "error",
        progress: -1,
        lastExecutionResult: {
          success: false,
          message: error.message || "Error desconocido",
        },
      });
      sendProgress(taskId, -1);

      return {
        success: false,
        message: error.message || "Error en la transferencia DOWN",
        errorDetail: error.stack,
      };
    }
  }

  /**
   * Ejecuta una transferencia UP (Server1 -> Server2)
   * MIGRADO: Usa DatabaseServiceAdapter
   */
  async executeTransferUp(taskId) {
    try {
      const task = await TransferTask.findById(taskId);
      if (!task) {
        throw new Error(`No se encontró la tarea con ID: ${taskId}`);
      }

      const transferName = task.name;
      logger.info(
        `Encontrada tarea de transferencia UP: ${transferName} (${taskId})`
      );

      if (!task.active) {
        logger.warn(`La tarea ${transferName} está inactiva.`);
        return { success: false, message: "Tarea inactiva" };
      }

      await TransferTask.findByIdAndUpdate(taskId, {
        status: "running",
        progress: 0,
      });
      sendProgress(taskId, 0);

      return await DatabaseServiceAdapter.withConnections(
        { sourceServer: "server1", targetServer: "server2" },
        async ({ source: server1Connection, target: server2Connection }) => {
          logger.info(
            `Obteniendo datos desde Server1 usando la consulta configurada...`
          );

          let finalQuery = task.query;
          const params = {};

          if (task.parameters?.length > 0) {
            const conditions = [];
            for (const param of task.parameters) {
              params[param.field] = param.value;

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

          logger.debug(`Consulta final: ${finalQuery}`);

          const sanitizedParams = this._sanitizeParams(params);
          const sourceResult = await DatabaseServiceAdapter.query(
            server1Connection,
            finalQuery,
            sanitizedParams
          );

          const sourceData = sourceResult.recordset;
          logger.info(`Obtenidos ${sourceData.length} registros desde Server1`);

          if (sourceData.length === 0) {
            await TransferTask.findByIdAndUpdate(taskId, {
              status: "completed",
              progress: 100,
              lastExecutionDate: new Date(),
            });
            sendProgress(taskId, 100);
            return {
              success: true,
              message: "No hay datos para transferir",
              rows: 0,
            };
          }

          if (task.clearBeforeInsert) {
            logger.info(
              `Limpiando tabla destino antes de insertar en Server2: ${task.name}`
            );
            const deleteResult = await this._clearTableData(
              server2Connection,
              `dbo.[${task.name}]`
            );
            logger.info(
              `Se eliminaron ${deleteResult} registros de la tabla destino`
            );
          }

          logger.info(
            `Comenzando inserción de ${sourceData.length} registros en Server2...`
          );

          let insertedCount = 0;
          let errorCount = 0;
          let duplicateCount = 0;
          const batchSize = 100;

          await TransferTask.findByIdAndUpdate(taskId, { progress: 20 });
          sendProgress(taskId, 20);

          for (let i = 0; i < sourceData.length; i += batchSize) {
            const currentTask = await TransferTask.findById(taskId);
            if (currentTask.status === "pending") {
              logger.info(`Tarea ${taskId} cancelada durante procesamiento`);
              throw new Error("Tarea cancelada por el usuario");
            }

            const batch = sourceData.slice(i, i + batchSize);

            const progress = Math.min(
              20 + Math.round((i / sourceData.length) * 80),
              99
            );
            await TransferTask.findByIdAndUpdate(taskId, { progress });
            sendProgress(taskId, progress);

            logger.info(
              `Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(
                sourceData.length / batchSize
              )} (${batch.length} registros)`
            );

            for (const record of batch) {
              try {
                const insertResult = await this._insertRecord(
                  server2Connection,
                  `dbo.[${task.name}]`,
                  record
                );

                if (insertResult && insertResult.rowsAffected) {
                  insertedCount += insertResult.rowsAffected;
                }
              } catch (insertError) {
                if (
                  insertError.number === 2627 ||
                  insertError.number === 2601 ||
                  (insertError.message &&
                    (insertError.message.includes("PRIMARY KEY") ||
                      insertError.message.includes("UNIQUE KEY") ||
                      insertError.message.includes("duplicate key")))
                ) {
                  duplicateCount++;
                  logger.debug(`Registro duplicado: ${JSON.stringify(record)}`);
                } else {
                  errorCount++;
                  logger.error(
                    `Error al insertar registro: ${insertError.message}`
                  );
                }
              }
            }
          }

          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
            lastExecutionDate: new Date(),
            $inc: { executionCount: 1 },
            lastExecutionResult: {
              success: true,
              message: "Transferencia UP completada",
              affectedRecords: insertedCount,
            },
          });
          sendProgress(taskId, 100);

          logger.info(
            `Transferencia UP completada para ${task.name}: ${insertedCount} registros insertados, ${duplicateCount} duplicados, ${errorCount} errores`
          );

          return {
            success: true,
            message: "Transferencia UP completada con éxito",
            rows: sourceData.length,
            inserted: insertedCount,
            duplicates: duplicateCount,
            errors: errorCount,
          };
        }
      );
    } catch (error) {
      logger.error(`Error en transferencia UP: ${error.message}`);

      await TransferTask.findByIdAndUpdate(taskId, {
        status: "error",
        progress: -1,
        lastExecutionResult: {
          success: false,
          message: error.message || "Error desconocido",
        },
      });
      sendProgress(taskId, -1);

      return {
        success: false,
        message: error.message || "Error en la transferencia UP",
        errorDetail: error.stack,
      };
    }
  }

  /**
   * Ejecuta transferencias en lotes, limitando la cantidad de tareas concurrentes
   */
  async executeTransferBatch(taskIds, concurrency = 3) {
    const results = [];
    const batches = [];

    // Dividir las tareas en lotes
    for (let i = 0; i < taskIds.length; i += concurrency) {
      batches.push(taskIds.slice(i, i + concurrency));
    }

    logger.info(
      `Ejecutando ${taskIds.length} tareas en ${batches.length} lotes (concurrencia: ${concurrency})`
    );

    // Procesar cada lote secuencialmente, pero con tareas concurrentes dentro de cada lote
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.info(
        `Procesando lote ${batchIndex + 1}/${batches.length} con ${batch.length
        } tareas`
      );

      // Ejecutar tareas del lote concurrentemente
      const batchPromises = batch.map((taskId) => {
        return this.executeTransferWithRetry(taskId)
          .then((result) => {
            logger.info(`Tarea ${taskId} completada con éxito`);
            return {
              taskId,
              success: true,
              ...(result || {}),
            };
          })
          .catch((error) => {
            logger.error(`Error en tarea ${taskId}:`, error);

            // Añadir a cola de reintentos si es apropiado
            if (this.isConnectionError(error)) {
              this.addTaskToRetryQueue(
                taskId,
                error.message || "Error de conexión"
              );
            }

            return {
              taskId,
              success: false,
              error: error.message || "Error desconocido",
            };
          });
      });

      // Esperar a que todas las tareas del lote actual terminen
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Pausa entre lotes para permitir que el sistema se recupere
      if (batchIndex < batches.length - 1) {
        logger.info(`Pausa de 10 segundos entre lotes...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // Comprobar estado del sistema y renovar pools si es necesario
        await this.verifyAndRefreshConnections("batch-processing");
      }
    }

    logger.info(
      `Procesamiento por lotes completado: ${results.filter((r) => r.success).length
      } exitosas, ${results.filter((r) => !r.success).length} fallidas`
    );
    return results;
  }

  /**
   * Aplica el mapeo de campos configurado
   */
  mapFields(sourceData, fieldMapping) {
    const { sourceFields, targetFields, defaultValues = [] } = fieldMapping;

    // Verificar que ambos arrays tienen la misma longitud
    if (
      !Array.isArray(sourceFields) ||
      !Array.isArray(targetFields) ||
      sourceFields.length !== targetFields.length
    ) {
      throw new Error(
        "Configuración de mapeo inválida: los arrays de campos origen y destino deben tener la misma longitud"
      );
    }

    // Crear una tabla de correspondencia para fácil acceso
    const fieldMap = {};
    for (let i = 0; i < sourceFields.length; i++) {
      fieldMap[sourceFields[i]] = targetFields[i];
    }

    // Crear un mapa para valores predeterminados
    const defaultsMap = {};
    for (const def of defaultValues) {
      defaultsMap[def.field] = def.value;
    }

    return sourceData.map((record) => {
      // Crear objeto transformado
      const transformedRecord = {};

      // Aplicar mapeo simple de campos
      for (const sourceField in fieldMap) {
        const targetField = fieldMap[sourceField];

        // Si el campo existe en el registro origen, copiarlo
        if (sourceField in record) {
          transformedRecord[targetField] = record[sourceField];
        }
      }

      // Aplicar valores por defecto
      for (const field in defaultsMap) {
        // Aplicar el valor por defecto solo si el campo no tiene valor
        if (
          !(field in transformedRecord) ||
          transformedRecord[field] === null ||
          transformedRecord[field] === undefined
        ) {
          transformedRecord[field] = defaultsMap[field];
        }
      }

      return transformedRecord;
    });
  }
}

// Exportar instancia singleton
module.exports = new TransferService();
