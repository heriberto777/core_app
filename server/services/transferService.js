const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferTask = require("../models/transferTaks");
const withCancellation = require("../decorators/withCancellation");
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

/**
 * Clase que maneja la transferencia de datos entre servidores
 */
class TransferService {
  constructor() {
    this.retryService = new RetryService.RetryService({
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
   * Obtiene todas las tareas activas desde MongoDB (type: auto o both).
   * ACTUALIZADO: Ahora considera tareas vinculadas para ejecución automática
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
        // 🔗 ACTUALIZADO: La función execute ahora maneja automáticamente las tareas vinculadas
        execute: (updateProgress) =>
          this.executeTaskWithLinkingLogic(task._id, updateProgress, "auto"),
      }));
    } catch (error) {
      logger.error("Error al obtener tareas de transferencia:", error);
      return [];
    }
  }

  /**
   * NUEVA FUNCIÓN: Ejecuta una tarea considerando si tiene vinculaciones
   * Esta función es llamada tanto para ejecuciones manuales como automáticas
   */
  async executeTaskWithLinkingLogic(
    taskId,
    updateProgress = null,
    executionType = "auto"
  ) {
    try {
      logger.info(
        `🔄 Iniciando ejecución de tarea ${taskId} (${executionType})`
      );

      // Verificar si debe ejecutarse como grupo o individualmente
      const executionStrategy = await LinkedTasksService.shouldExecuteAsGroup(
        taskId
      );

      if (executionStrategy.executeAsGroup) {
        logger.info(
          `🔗 Ejecutando como grupo vinculado (${executionType}): ${executionStrategy.reason}`
        );

        // Ejecutar todo el grupo
        const groupResult = await LinkedTasksService.executeLinkedGroup(
          taskId,
          executionType
        );

        // Enviar correos según el tipo de ejecución
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
            logger.info(`📧 Correo de grupo (${executionType}) enviado`);
          } catch (emailError) {
            logger.error(
              `❌ Error al enviar correo de grupo: ${emailError.message}`
            );
          }
        }

        return groupResult;
      } else {
        logger.info(
          `📌 Ejecutando individualmente (${executionType}): ${executionStrategy.reason}`
        );

        // Ejecutar individualmente
        const result = await this.executeTransferWithRetry(taskId);

        // Para ejecuciones automáticas, enviar correo individual
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
            logger.info(`📧 Correo automático enviado para ${task?.name}`);
          } catch (emailError) {
            logger.error(
              `❌ Error al enviar correo automático: ${emailError.message}`
            );
          }
        }

        return result;
      }
    } catch (error) {
      logger.error(`❌ Error en executeTaskWithLinkingLogic: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ejecuta una transferencia manualmente y envía resultados detallados por correo.
   * ACTUALIZADO: Ahora maneja tareas vinculadas automáticamente
   */
  async executeTransferManual(taskId) {
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

      // 2. 🔗 NUEVA LÓGICA: Verificar si debe ejecutarse como grupo o individualmente
      const executionStrategy = await LinkedTasksService.shouldExecuteAsGroup(
        taskId
      );

      if (executionStrategy.executeAsGroup) {
        logger.info(
          `🔗 Ejecutando como grupo vinculado: ${executionStrategy.reason}`
        );

        // Ejecutar todo el grupo usando LinkedTasksService
        const groupResult = await LinkedTasksService.executeLinkedGroup(
          taskId,
          "manual"
        );

        if (groupResult.success) {
          logger.info(
            `✅ Ejecución de grupo completada exitosamente desde ${transferName}`
          );

          // Enviar correo de grupo si es necesario
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
            logger.info(`📧 Correo de grupo enviado para ${transferName}`);
          } catch (emailError) {
            logger.error(
              `❌ Error al enviar correo de grupo: ${emailError.message}`
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
        logger.info(
          `📌 Ejecutando individualmente: ${executionStrategy.reason}`
        );

        // Ejecutar individualmente (lógica original)
        logger.info(
          `📌 Ejecutando transferencia para la tarea: ${transferName}`
        );
        Telemetry.trackTransfer("started");

        const result = await this.executeTransferWithRetry(taskId);
        Telemetry.trackTransfer(result.success ? "completed" : "failed");

        // Verificar que result sea un objeto válido para evitar errores
        if (!result) {
          logger.error(
            `❌ No se obtuvo un resultado válido para la tarea: ${transferName}`
          );
          return {
            success: false,
            message: "No se obtuvo un resultado válido",
          };
        }

        // 3. Preparar datos para el correo
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

          // Actualizar estadísticas de la tarea
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
      }
    } catch (error) {
      logger.error(
        `❌ Error en la ejecución manual de la transferencia ${transferName}: ${error.message}`
      );
      Telemetry.trackTransfer("failed");

      // Enviar correo de error crítico
      try {
        await sendCriticalErrorEmail(
          `Error crítico en transferencia manual: ${error.message}`,
          "manual",
          `ID de tarea: ${taskId}, Nombre: ${transferName}`
        );
        logger.info(`📧 Correo de error crítico enviado`);
      } catch (emailError) {
        logger.error(
          `❌ Error al enviar correo de error: ${emailError.message}`
        );
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
   * Crea o actualiza una tarea de transferencia en MongoDB (upsert).
   */
  async upsertTransferTask(taskData) {
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
   */
  async executeTransferWithRetry(taskId, maxRetries = 3) {
    // Crear un AbortController para poder cancelar la operación
    const abortController = new AbortController();
    const { signal } = abortController;

    // Registrar la tarea para poder cancelarla posteriormente
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
          // Verificar si la tarea fue cancelada
          if (signal.aborted) {
            throw new Error("Tarea cancelada por el usuario");
          }

          // Si es un reintento, verificar conexiones antes
          if (attempt > 0) {
            await this.verifyAndRefreshConnections(taskId);
            logger.info(
              `Reintentando transferencia ${taskId} (intento ${
                attempt + 1
              }/${maxRetries})...`
            );
          }

          // Ejecutar la transferencia
          return await this.executeTransfer(taskId, signal);
        } catch (error) {
          lastError = error;

          // Verificar si el error es por cancelación
          if (signal.aborted || error.message?.includes("cancelada")) {
            throw error; // Propagar error de cancelación inmediatamente
          }

          // Determinar si el error es recuperable
          const isRecoverable = this.isConnectionError(error);

          if (!isRecoverable || attempt >= maxRetries - 1) {
            throw error; // Propagar error no recuperable o último intento
          }

          // Esperar antes de reintentar con backoff exponencial
          const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
          logger.warn(
            `Error recuperable en transferencia ${taskId}, reintentando en ${
              delay / 1000
            } segundos...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));

          attempt++;
        }
      }

      // No debería llegar aquí, pero por seguridad
      throw lastError || new Error("Error desconocido en transferencia");
    } catch (error) {
      // Verificar si el error es por cancelación
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

      // Error no recuperable
      logger.error(`Error no recuperable en tarea ${taskId}:`, error);

      // Actualizar estado en la BD
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

      // Considerar agregar a cola de reintentos posterior si el error es de conexión
      if (this.isConnectionError(error)) {
        this.addTaskToRetryQueue(taskId, error.message || "Error de conexión");
      }

      throw error;
    }
  }

  /**
   * Implementación modular de la transferencia de datos
   */
  async executeTransfer(taskId, signal) {
    let server1Connection = null;
    let server2Connection = null;
    let executionId = null; // Para almacenar el ID de ejecución
    const startTime = Date.now();

    try {
      this.checkCancellation(signal);
      // 1. Preparar la transferencia (validar tarea y setup inicial)
      const taskInfo = await this.prepareTransfer(taskId, signal);

      // Crear un registro de ejecución para esta tarea
      const taskExecution = new TaskExecution({
        taskId: taskId,
        taskName: taskInfo.name,
        date: new Date(),
        status: "running",
      });

      // Guardar y obtener el ID
      await taskExecution.save();
      executionId = taskExecution._id;

      logger.info(`Creado registro de ejecución con ID: ${executionId}`);

      // Identificar el tipo de transferencia para el log
      const transferDirection =
        taskInfo.transferType === "down"
          ? "DOWN (Server2 → Server1)"
          : "UP (Server1 → Server2)";

      logger.info(
        `📡 Iniciando transferencia ${transferDirection} para tarea ${taskInfo.name}`
      );

      // 2. Establecer conexiones
      const connections = await this.establishConnections(taskInfo, signal);
      server1Connection = connections.server1;
      server2Connection = connections.server2;

      this.checkCancellation(signal);

      // 3. Obtener datos origen
      const { data, params } = await this.fetchSourceData(
        connections,
        taskInfo,
        signal
      );

      // 4. Verificar si hay datos para transferir
      if (data.length === 0) {
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "completed",
          progress: 100,
        });

        // Actualizar el registro de ejecución para indicar que no hubo datos
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
          executionId, // Incluir el ID de ejecución en la respuesta
        };
      }

      // 5. Preparar procesamiento (limpiar tabla destino si es necesario)
      const prepResult = await this.prepareDestination(
        connections,
        taskInfo,
        signal
      );

      // Obtener initialCount del resultado de prepareDestination
      const initialCount = prepResult.initialCount || 0;

      // 6. Procesar e insertar datos
      const result = await this.processAndInsertData(
        data,
        connections,
        taskInfo,
        signal,
        initialCount // Pasar initialCount como parámetro
      );

      this.checkCancellation(signal);

      // 7. Ejecutar operaciones post-transferencia si corresponde
      if (
        taskInfo.postUpdateQuery &&
        result.affectedRecords &&
        result.affectedRecords.length > 0
      ) {
        // Determinar la conexión correcta para post-transferencia
        const postUpdateConnection =
          taskInfo.transferType === "down"
            ? connections.server1 // Para DOWN, la post-transferencia va en server1
            : connections.server1; // Para otros, siempre en server1

        await this.executePostTransferOperations(
          postUpdateConnection,
          taskInfo,
          result.affectedRecords,
          signal
        );
      }

      // Al final, antes de retornar:
      const executionTime = Date.now() - startTime;

      // 8. Actualizar estado final
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

      // Actualizar el registro de ejecución con el tiempo y estado final
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
            initialCount: initialCount,
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
        executionId, // Incluir el ID de ejecución en la respuesta
      };
    } catch (error) {
      // Verificar si el error es por cancelación
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

      // Error durante la transferencia
      logger.error(`Error durante la transferencia ${taskId}:`, error);

      await TransferTask.findByIdAndUpdate(taskId, {
        status: "failed",
        progress: -1,
      });

      // Actualizar el registro de ejecución con información del error
      if (executionId) {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          executionTime: Date.now() - startTime,
          errorMessage: error.message || "Error desconocido",
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
    } finally {
      // Cerrar las conexiones
      try {
        if (server1Connection) {
          await ConnectionService.releaseConnection(server1Connection);
          server1Connection = null;
        }
      } catch (closeError) {
        logger.error(`Error al cerrar conexión server1:`, closeError);
      }

      try {
        if (server2Connection) {
          await ConnectionService.releaseConnection(server2Connection);
          server2Connection = null;
        }
      } catch (closeError) {
        logger.error(`Error al cerrar conexión server2:`, closeError);
      }
    }
  }

  /**
   * Prepara la transferencia verificando la tarea y estableciendo estado inicial
   */
  async prepareTransfer(taskId, signal) {
    // Verificar si la tarea fue cancelada desde el principio
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

    // Obtener la tarea
    const task = await TransferTask.findById(taskId);

    if (!task || !task.active) {
      logger.warn(`⚠️ La tarea ${task?.name || "desconocida"} está inactiva.`);
      throw new Error("Tarea inactiva o no encontrada");
    }

    logger.info(
      `🔍 Preparando transferencia para tarea '${task.name}' (ID: ${taskId})`
    );

    // Validar que existan reglas de validación
    if (!task.validationRules) {
      await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
      sendProgress(taskId, -1);
      throw new Error("No se han especificado reglas de validación");
    }

    // Actualizar estado a running y progress 0
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "running",
      progress: 0,
    });
    sendProgress(taskId, 0);

    // Registrar uso de memoria inicial
    MemoryManager.logMemoryUsage("Inicio de transferencia");

    return task;
  }

  /**
   * Establece conexiones a ambos servidores
   */
  async establishConnections(task, signal) {
    try {
      logger.info(`Estableciendo conexiones para tarea ${task.name}...`);

      // Verificar cancelación
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      // Conectar a server1 con conexión robusta
      logger.info(
        `Estableciendo conexión a server1 para tarea ${task.name}...`
      );
      const server1Result = await ConnectionService.enhancedRobustConnect(
        "server1"
      );

      if (!server1Result.success) {
        throw new Error(
          `No se pudo establecer conexión a server1: ${server1Result.error.message}`
        );
      }

      const server1Connection = server1Result.connection;
      logger.info(
        `✅ Conexión a server1 establecida exitosamente para tarea ${task.name}`
      );

      // Verificar cancelación después de primera conexión
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      // Conectar a server2 con conexión robusta
      logger.info(
        `Estableciendo conexión a server2 para tarea ${task.name}...`
      );
      const server2Result = await ConnectionService.enhancedRobustConnect(
        "server2"
      );

      if (!server2Result.success) {
        // Liberar conexión a server1 antes de lanzar error
        await ConnectionService.releaseConnection(server1Connection);
        throw new Error(
          `No se pudo establecer conexión a server2: ${server2Result.error.message}`
        );
      }

      const server2Connection = server2Result.connection;
      logger.info(
        `✅ Conexión a server2 establecida exitosamente para tarea ${task.name}`
      );

      // Obtener tipos de columnas para la tabla destino
      let columnTypes = {};
      try {
        // Determinar el servidor destino según el tipo de transferencia
        const targetServer =
          task.transferType === "down" ? server1Connection : server2Connection;
        const targetTableName =
          task.transferType === "down" && task.fieldMapping?.targetTable
            ? task.fieldMapping.targetTable
            : task.name;

        if (typeof SqlService.getColumnTypes === "function") {
          columnTypes = await SqlService.getColumnTypes(
            targetServer,
            targetTableName
          );
          logger.debug(
            `Tipos de columnas obtenidos correctamente para ${targetTableName}`
          );
        }
      } catch (typesError) {
        logger.warn(
          `No se pudieron obtener tipos de columnas: ${typesError.message}`
        );
      }

      return {
        server1: server1Connection,
        server2: server2Connection,
        columnTypes,
      };
    } catch (error) {
      // Verificar si es una cancelación
      if (signal.aborted) {
        logger.info(`Tarea cancelada durante establecimiento de conexiones`);
        throw new Error("Transferencia cancelada por el usuario");
      }

      logger.error(`Error al establecer conexiones:`, error);
      throw new Error(`Error al establecer conexiones: ${error.message}`);
    }
  }

  /**
   * Obtiene los datos origen desde el servidor correcto según el tipo de transferencia
   */
  async fetchSourceData(connections, task, signal) {
    try {
      // Verificar cancelación
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      const { name, query, parameters, transferType } = task;

      // IMPORTANTE: Determinar de qué servidor leer según el tipo de transferencia
      const sourceConnection =
        transferType === "down"
          ? connections.server2 // Para "down" leer de server2
          : connections.server1; // Para otros tipos leer de server1

      const sourceServer = transferType === "down" ? "server2" : "server1";

      // Construir consulta final con parámetros
      let finalQuery = query;
      const params = {};

      if (parameters?.length > 0) {
        const conditions = [];
        for (const param of parameters) {
          const { field, operator, value } = param;

          // Validar que tenemos los campos necesarios
          if (!field || !operator || value === undefined || value === null) {
            logger.warn(`Parámetro inválido omitido: ${JSON.stringify(param)}`);
            continue;
          }

          // Manejar diferentes tipos de operadores
          switch (operator.toUpperCase()) {
            case "BETWEEN":
              // Validar estructura del objeto para BETWEEN
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
              // Convertir string separado por comas a array si es necesario
              let inValues = value;
              if (typeof value === "string") {
                // Si es string, dividir por comas y limpiar espacios
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
              // Para LIKE, asegurar que el valor sea string
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
              // Estos operadores no necesitan valores
              conditions.push(`${field} ${operator}`);
              break;

            case "=":
            case "!=":
            case "<>":
            case ">":
            case "<":
            case ">=":
            case "<=":
              // Operadores de comparación estándar
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

        // Solo agregar WHERE si hay condiciones válidas
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
        `Ejecutando consulta en ${sourceServer} para ${
          task.name
        }: ${finalQuery.substring(0, 200)}...`
      );

      // Medir tiempo de consulta para métricas
      Telemetry.startTimer(`query_${task._id}`);

      // Sanitizar los parámetros antes de la consulta
      const sanitizedParams = SqlService.sanitizeParams(params);

      // MEJORA: Mostrar los parámetros que se están utilizando
      logger.info(
        `Parámetros de consulta para ${task.name}:`,
        JSON.stringify(sanitizedParams)
      );

      const result = await SqlService.query(
        sourceConnection, // Usar la conexión correcta según el tipo
        finalQuery,
        sanitizedParams,
        sourceServer // Pasar el servidor correcto para telemetría
      );

      // Registrar tiempo de consulta
      const queryTime = Telemetry.endTimer(`query_${task._id}`);
      logger.debug(`Consulta completada en ${queryTime}ms`);

      // Actualizar métricas
      Telemetry.updateAverage("avgQueryTime", queryTime);
      Telemetry.trackTransfer("recordsProcessed", result.recordset.length);

      // MEJORA: Agregar depuración detallada sobre los resultados
      logger.info(
        `🔍 DATOS OBTENIDOS DE ORIGEN (${sourceServer}): ${result.recordset.length} registros para la tarea ${task.name}`
      );

      if (result.recordset.length > 0) {
        logger.info(`📋 MUESTRA DE LOS PRIMEROS 3 REGISTROS:`);
        for (let i = 0; i < Math.min(3, result.recordset.length); i++) {
          logger.info(
            `Registro ${i + 1}:`,
            JSON.stringify(result.recordset[i])
          );
        }

        // Mostrar los nombres de campo en el primer registro
        if (result.recordset.length > 0) {
          logger.info(
            `📊 Campos disponibles en los registros: ${Object.keys(
              result.recordset[0]
            ).join(", ")}`
          );
        }
      } else {
        logger.warn(`⚠️ LA CONSULTA NO DEVOLVIÓ REGISTROS.`);
        logger.warn(`🔍 Consulta ejecutada: ${finalQuery}`);
        logger.warn(`🔍 Parámetros: ${JSON.stringify(sanitizedParams)}`);

        // Intenta una consulta simple para verificar la conexión
        try {
          const testQuery =
            transferType === "down" && task.fieldMapping?.sourceTable
              ? `SELECT TOP 5 * FROM ${task.fieldMapping.sourceTable}`
              : "SELECT TOP 5 * FROM INFORMATION_SCHEMA.TABLES";

          const testResult = await SqlService.query(
            sourceConnection,
            testQuery
          );
          logger.info(
            `✅ Prueba de conexión exitosa en ${sourceServer}. Número de registros de ejemplo: ${testResult.recordset.length}`
          );
        } catch (testError) {
          logger.error(
            `❌ Error al ejecutar consulta de prueba en ${sourceServer}: ${testError.message}`
          );
        }
      }

      logger.info(
        `Datos obtenidos correctamente de ${sourceServer} para ${task.name}: ${result.recordset.length} registros`
      );

      return {
        data: result.recordset,
        params: sanitizedParams,
      };
    } catch (error) {
      // Verificar cancelación
      if (signal.aborted) {
        logger.info(`Tarea cancelada durante consulta de datos`);
        throw new Error("Transferencia cancelada por el usuario");
      }

      // MEJORA: Depuración detallada del error
      logger.error(`❌ Error en la consulta: `, error);
      logger.error(`🔍 Consulta que causó el error: ${task.query}`);

      if (error.number) {
        logger.error(`📊 Código de error SQL: ${error.number}`);
        logger.error(`📊 Estado SQL: ${error.state || "N/A"}`);
      }

      const sourceServer = task.transferType === "down" ? "server2" : "server1";

      // Intentar una consulta de diagnóstico sencilla
      try {
        logger.info(
          `🔄 Intentando consulta de diagnóstico en ${sourceServer}...`
        );
        const diagConnection =
          task.transferType === "down"
            ? connections.server2
            : connections.server1;

        const diagResult = await SqlService.query(
          diagConnection,
          "SELECT 1 AS test"
        );
        logger.info(
          `✅ Consulta de diagnóstico exitosa en ${sourceServer}: ${JSON.stringify(
            diagResult.recordset[0]
          )}`
        );
      } catch (diagError) {
        logger.error(
          `❌ Error en consulta de diagnóstico en ${sourceServer}: ${diagError.message}`
        );
      }

      throw new Error(
        `Error en la consulta en ${sourceServer}: ${error.message}`
      );
    }
  }

  /**
   * Prepara la tabla destino según el tipo de transferencia
   */
  async prepareDestination(connections, task, signal) {
    // Verificar si la tarea fue cancelada
    if (signal?.aborted) {
      throw new Error("Tarea cancelada por el usuario");
    }

    // CORREGIDO: Determinar la conexión correcta para el destino
    const targetConnection =
      task.transferType === "down"
        ? connections.server1 // Para "down" la tabla destino está en server1
        : connections.server2; // Para otros tipos la tabla destino está en server2

    const targetServer = task.transferType === "down" ? "server1" : "server2";

    // CORREGIDO: Determinar nombre de tabla destino
    let targetTableName = `dbo.[${task.name}]`; // Predeterminado

    // Para transferencias DOWN, usar la tabla destino especificada en fieldMapping
    if (task.transferType === "down" && task.fieldMapping?.targetTable) {
      const tableNameFromMapping = task.fieldMapping.targetTable;

      // Asegurar formato correcto (añadir dbo. y corchetes si no están)
      if (!tableNameFromMapping.includes(".")) {
        targetTableName = `dbo.[${tableNameFromMapping}]`;
      } else if (!tableNameFromMapping.includes("[")) {
        // Si tiene esquema pero no corchetes, dividir y reformatear
        const [schema, table] = tableNameFromMapping.split(".");
        targetTableName = `${schema}.[${table}]`;
      } else {
        // Si ya tiene el formato completo, usar tal cual
        targetTableName = tableNameFromMapping;
      }

      logger.info(
        `Transferencia DOWN: Usando tabla destino "${targetTableName}" en ${targetServer}`
      );
    } else {
      logger.info(
        `Usando tabla destino predeterminada: "${targetTableName}" en ${targetServer}`
      );
    }

    // Inicializar variables
    let initialCount = 0;
    let deletedCount = 0;

    // Verificar si hay que borrar registros existentes
    if (task.clearBeforeInsert) {
      try {
        logger.info(
          `🧹 Borrando registros existentes de la tabla ${targetTableName} en ${targetServer} antes de insertar`
        );

        // Verificar cancelación
        if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

        // CORREGIDO: Usar la conexión correcta según el tipo
        deletedCount = await SqlService.clearTableData(
          targetConnection, // Usar la conexión correcta según el tipo
          targetTableName
        );

        logger.info(
          `✅ Se eliminaron ${deletedCount} registros de la tabla ${targetTableName}`
        );
      } catch (clearError) {
        // Verificar si el error fue por cancelación
        if (signal.aborted) {
          logger.info(`Tarea cancelada durante borrado de registros`);
          throw new Error("Transferencia cancelada por el usuario");
        }

        logger.error(
          `❌ Error al borrar registros de la tabla ${targetTableName}:`,
          clearError
        );

        // Si la tabla no existe, continuamos; de lo contrario, fallamos
        if (clearError.message && clearError.message.includes("no existe")) {
          logger.warn(`⚠️ La tabla no existe, continuando con la inserción...`);
        } else {
          throw new Error(
            `Error al borrar registros existentes: ${clearError.message}`
          );
        }
      }
    }

    // Obtener conteo inicial de registros
    try {
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      // CORREGIDO: Usar la conexión y tabla correctas
      const countResult = await SqlService.query(
        targetConnection, // Conexión correcta según tipo
        `SELECT COUNT(*) AS total FROM ${targetTableName} WITH (NOLOCK)`
      );

      initialCount = countResult.recordset[0].total;
      logger.info(
        `Conteo inicial en tabla ${targetTableName}: ${initialCount} registros`
      );
    } catch (countError) {
      // Si hay error en el conteo, continuamos con 0
      logger.warn(`No se pudo verificar conteo inicial: ${countError.message}`);
      initialCount = 0;
    }

    return {
      initialCount,
      deletedCount,
      success: true,
    };
  }

  /**
   * Procesa e inserta los datos en lotes
   */
  async processAndInsertData(
    data,
    connections,
    task,
    signal,
    initialCount = 0
  ) {
    // Configurar claves para identificar registros
    const { validationRules, name } = task;
    const primaryKeys = validationRules?.existenceCheck?.key
      ? [validationRules.existenceCheck.key]
      : [];
    const requiredFields = validationRules?.requiredFields || [];
    const mergeKeys = [...new Set([...primaryKeys, ...requiredFields])];

    if (mergeKeys.length === 0) {
      throw new Error("No se especificaron claves para identificar registros");
    }

    // CORREGIDO: Determinar la conexión correcta para el destino según el tipo
    const targetConnection =
      task.transferType === "down"
        ? connections.server1 // Para "down" el destino está en server1
        : connections.server2; // Para otros tipos el destino está en server2

    const targetServer = task.transferType === "down" ? "server1" : "server2";

    // CORREGIDO: Determinar el nombre correcto de la tabla destino según el tipo de transferencia
    let targetTableName = `dbo.[${name}]`; // Valor predeterminado

    // Para transferencias DOWN, usar la tabla destino especificada en fieldMapping
    if (
      task.transferType === "down" &&
      task.fieldMapping &&
      task.fieldMapping.targetTable
    ) {
      const tableNameFromMapping = task.fieldMapping.targetTable;

      // Asegurar formato correcto (añadir dbo. y corchetes si no están)
      if (!tableNameFromMapping.includes(".")) {
        targetTableName = `dbo.[${tableNameFromMapping}]`;
      } else if (!tableNameFromMapping.includes("[")) {
        // Si tiene esquema pero no corchetes, dividir y reformatear
        const [schema, table] = tableNameFromMapping.split(".");
        targetTableName = `${schema}.[${table}]`;
      } else {
        // Si ya tiene el formato completo, usar tal cual
        targetTableName = tableNameFromMapping;
      }

      logger.info(
        `Transferencia DOWN: Usando tabla destino "${targetTableName}" desde mapeo`
      );
    } else {
      logger.info(`Usando tabla destino predeterminada: "${targetTableName}"`);
    }

    // Cache para longitud de columnas
    const columnLengthCache = new Map();

    // Variables para tracking
    let totalInserted = 0;
    let duplicateCount = 0;
    let duplicatedRecords = [];
    let processedCount = 0;
    let lastReportedProgress = 0;
    let affectedRecords = [];

    // Conjunto para verificar duplicados
    let existingKeysSet = new Set();

    // Obtener claves existentes para optimizar verificación de duplicados
    if (mergeKeys.length > 0) {
      try {
        logger.debug(
          `Obteniendo claves existentes para verificar duplicados...`
        );

        // CORREGIDO: Usar targetTableName y targetConnection
        const keysQuery = `
        SELECT DISTINCT ${mergeKeys.map((k) => `[${k}]`).join(", ")} 
        FROM ${targetTableName} WITH (NOLOCK)
      `;

        // CORREGIDO: Usar conexión correcta según tipo de transferencia
        const keysResult = await SqlService.query(
          targetConnection, // Usar conexión correcta según tipo
          keysQuery
        );

        // Crear conjunto de claves
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

    // Procesar en lotes para mejor rendimiento y menor uso de memoria
    const batchSize = 500;

    // Medir tiempo total para métricas
    Telemetry.startTimer(`insert_${task._id}`);

    for (let i = 0; i < data.length; i += batchSize) {
      // Verificar cancelación al inicio de cada lote
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      const batch = data.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(data.length / batchSize);

      logger.debug(
        `Procesando lote ${batchNumber}/${totalBatches} (${batch.length} registros)...`
      );

      // Verificar conexión al inicio de cada lote
      try {
        // CORREGIDO: Verificar la conexión destino correcta según tipo
        await SqlService.query(targetConnection, "SELECT 1 AS test");
      } catch (connError) {
        // Reconectar si es necesario
        logger.warn(`Conexión perdida durante procesamiento, reconectando...`);

        // CORREGIDO: Reconectar al servidor correcto según tipo
        const reconnectResult = await ConnectionService.enhancedRobustConnect(
          targetServer // Servidor correcto según tipo
        );
        if (!reconnectResult.success) {
          throw new Error(
            `No se pudo restablecer la conexión: ${reconnectResult.error.message}`
          );
        }

        // CORREGIDO: Asignar la nueva conexión al servidor correcto
        if (targetServer === "server1") {
          connections.server1 = reconnectResult.connection;
        } else {
          connections.server2 = reconnectResult.connection;
        }
        logger.info(`✅ Reconexión exitosa durante procesamiento`);
      }

      // Procesar cada registro individualmente para mejor control de errores
      let batchInserted = 0;
      let batchSkipped = 0;

      // Usar tamaño de lote más pequeño para inserciones
      const insertBatchSize = 50;

      for (let j = 0; j < batch.length; j += insertBatchSize) {
        // Verificar cancelación frecuentemente
        if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

        const insertSubBatch = batch.slice(j, j + insertBatchSize);

        for (const record of insertSubBatch) {
          try {
            // Validar y sanitizar el registro
            const validatedRecord = SqlService.validateRecord(record);

            // Truncar strings según longitudes máximas
            for (const column in validatedRecord) {
              if (typeof validatedRecord[column] === "string") {
                // Obtener longitud máxima (usando cache)
                let maxLength;
                if (columnLengthCache.has(column)) {
                  maxLength = columnLengthCache.get(column);
                } else {
                  // CORREGIDO: Extraer solo el nombre de tabla sin esquema y corchetes para la consulta
                  const tableNameOnly = targetTableName.replace(
                    /^.*\.|\[|\]/g,
                    ""
                  );

                  // CORREGIDO: Usar conexión correcta
                  const lengthQuery = `
                  SELECT CHARACTER_MAXIMUM_LENGTH 
                  FROM INFORMATION_SCHEMA.COLUMNS 
                  WHERE TABLE_NAME = '${tableNameOnly}' 
                    AND COLUMN_NAME = '${column}'
                `;
                  const lengthResult = await SqlService.query(
                    targetConnection, // Conexión correcta según tipo
                    lengthQuery
                  );
                  maxLength =
                    lengthResult.recordset[0]?.CHARACTER_MAXIMUM_LENGTH || 0;
                  columnLengthCache.set(column, maxLength);
                }

                // Truncar si excede longitud máxima
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

            // Recolectar IDs para post-actualización
            if (task.postUpdateQuery && primaryKeys.length > 0) {
              const primaryKey = primaryKeys[0];
              if (
                validatedRecord[primaryKey] !== null &&
                validatedRecord[primaryKey] !== undefined
              ) {
                affectedRecords.push(validatedRecord[primaryKey]);
              }
            }

            // Verificar duplicados
            if (existingKeysSet.size > 0) {
              const recordKey = mergeKeys
                .map((k) => {
                  const value =
                    validatedRecord[k] === null ? "NULL" : validatedRecord[k];
                  return `${k}:${value}`;
                })
                .join("|");

              if (existingKeysSet.has(recordKey)) {
                // Es un duplicado
                duplicateCount++;
                batchSkipped++;

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
                continue;
              }
            }

            // Insertar el registro
            try {
              // CORREGIDO: Usar conexión y tabla correctas
              const insertResult = await SqlService.insertWithExplicitTypes(
                targetConnection, // Conexión correcta según tipo
                targetTableName, // Nombre de tabla correcto
                validatedRecord,
                connections.columnTypes
              );

              const rowsAffected = insertResult?.rowsAffected || 0;

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

                // Actualizar contador para telemetría
                Telemetry.trackTransfer("recordsInserted");
              }
            } catch (insertError) {
              // Verificar cancelación
              if (signal.aborted)
                throw new Error("Tarea cancelada por el usuario");

              // MEJORA: Manejo específico para AggregateError
              if (
                insertError.name === "AggregateError" ||
                (insertError.stack &&
                  insertError.stack.includes("AggregateError"))
              ) {
                logger.error(`Error de conexión o consulta SQL:`, insertError);

                // Intentar reconexión
                logger.warn(`Intentando reconexión por error de agregación...`);

                // CORREGIDO: Reconectar al servidor correcto
                const reconnectResult =
                  await ConnectionService.enhancedRobustConnect(targetServer);
                if (!reconnectResult.success) {
                  throw new Error(
                    `No se pudo restablecer la conexión tras error: ${
                      reconnectResult.error?.message || "Error desconocido"
                    }`
                  );
                }

                // CORREGIDO: Asignar la nueva conexión al servidor correcto
                if (targetServer === "server1") {
                  connections.server1 = reconnectResult.connection;
                } else {
                  connections.server2 = reconnectResult.connection;
                }
                logger.info(`✅ Reconexión exitosa tras AggregateError`);

                // Intentar inserción de nuevo
                logger.info(`Reintentando inserción...`);
                try {
                  // CORREGIDO: Usar conexión y tabla correctas
                  const retryResult = await SqlService.insertWithExplicitTypes(
                    targetServer === "server1"
                      ? connections.server1
                      : connections.server2,
                    targetTableName,
                    validatedRecord,
                    connections.columnTypes
                  );

                  const rowsAffected = retryResult?.rowsAffected || 0;
                  if (rowsAffected > 0) {
                    totalInserted += rowsAffected;
                    batchInserted += rowsAffected;
                    logger.info(`Inserción exitosa después de AggregateError`);
                  }
                } catch (retryError) {
                  // Si falla el reintento, lanzar el error original
                  throw new Error(
                    `Error durante inserción (reintento): ${
                      retryError.message || "Error desconocido"
                    }`
                  );
                }

                // Continuar con el siguiente registro
                continue;
              }

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

                // Guardar información del registro duplicado
                const duplicateRecord = {};
                mergeKeys.forEach((key) => {
                  duplicateRecord[key] = validatedRecord[key];
                });

                duplicateRecord._errorMessage =
                  insertError.message?.substring(0, 100) ||
                  "Error de clave duplicada";
                duplicatedRecords.push(duplicateRecord);

                Telemetry.trackTransfer("recordsDuplicated");
              }
              // Manejo específico de errores SQL comunes
              else if (insertError.number === 515) {
                logger.error(`Error de campo NOT NULL: ${insertError.message}`);
                // Identificar qué campo podría ser el problema
                for (const key in validatedRecord) {
                  if (validatedRecord[key] === null) {
                    logger.error(`Posible campo NOT NULL: ${key}`);
                  }
                }
                throw new Error(
                  `Error: campo obligatorio no puede ser NULL (${insertError.message})`
                );
              } else if (insertError.number === 8152) {
                logger.error(`Error de truncado: ${insertError.message}`);
                throw new Error(
                  `Error: valor demasiado largo para alguna columna (${insertError.message})`
                );
              } else if (insertError.number === 547) {
                logger.error(`Error de restricción: ${insertError.message}`);
                throw new Error(
                  `Error: violación de restricción CHECK o FOREIGN KEY (${insertError.message})`
                );
              } else if (
                insertError.message &&
                (insertError.message.includes("conexión") ||
                  insertError.message.includes("connection") ||
                  insertError.message.includes("timeout") ||
                  insertError.message.includes("Timeout") ||
                  insertError.message.includes("state"))
              ) {
                // Error de conexión - reconectar y reintentar
                logger.warn(
                  `Error de conexión durante inserción, reconectando...`
                );

                // CORREGIDO: Reconectar al servidor correcto
                const reconnectResult =
                  await ConnectionService.enhancedRobustConnect(targetServer);

                if (!reconnectResult.success) {
                  throw new Error(
                    `No se pudo restablecer la conexión para continuar inserciones: ${reconnectResult.error.message}`
                  );
                }

                // CORREGIDO: Asignar la nueva conexión al servidor correcto
                if (targetServer === "server1") {
                  connections.server1 = reconnectResult.connection;
                } else {
                  connections.server2 = reconnectResult.connection;
                }

                // Reintentar la inserción con la tabla y conexión correctas
                const retryResult = await SqlService.insertWithExplicitTypes(
                  targetServer === "server1"
                    ? connections.server1
                    : connections.server2,
                  targetTableName,
                  validatedRecord,
                  connections.columnTypes
                );

                const rowsAffected = retryResult?.rowsAffected || 0;

                if (rowsAffected > 0) {
                  totalInserted += rowsAffected;
                  batchInserted += rowsAffected;
                  logger.info(`Inserción exitosa después de reconexión`);
                }
              } else {
                throw new Error(
                  `Error al insertar registro: ${
                    insertError.message || "Error desconocido"
                  } (ver logs para más detalles)`
                );
              }
            }
          } catch (recordError) {
            // Verificar cancelación
            if (signal.aborted)
              throw new Error("Tarea cancelada por el usuario");

            // Errores no relacionados con duplicados
            if (
              recordError.number !== 2627 &&
              recordError.number !== 2601 &&
              !recordError.message?.includes("duplicate key")
            ) {
              throw recordError;
            }
          }

          // Monitoreo de memoria ocasional
          processedCount++;
          if (processedCount % 50 === 0) {
            MemoryManager.trackOperation();
          }
        }
      }

      logger.debug(
        `Lote ${batchNumber}/${totalBatches}: ${batchInserted} insertados, ${batchSkipped} duplicados`
      );

      // Actualizar progreso con throttling
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

    // Verificar conteo final
    let finalCount = 0;
    try {
      // CORREGIDO: Usar conexión y tabla correctas
      const countResult = await SqlService.query(
        targetConnection, // Conexión correcta
        `SELECT COUNT(*) AS total FROM ${targetTableName} WITH (NOLOCK)`
      );
      finalCount = countResult.recordset[0].total;
      logger.info(
        `Conteo final en tabla ${targetTableName}: ${finalCount} registros`
      );
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo final: ${countError.message}`);
    }

    // Registrar tiempo total en métricas
    const totalTime = Telemetry.endTimer(`insert_${task._id}`);
    Telemetry.updateAverage("avgTransferTime", totalTime);

    // Limitar número de duplicados reportados
    const maxDuplicatesToReport = 100;
    const reportedDuplicates = duplicatedRecords.slice(
      0,
      maxDuplicatesToReport
    );
    const hasMoreDuplicates = duplicatedRecords.length > maxDuplicatesToReport;

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

  /**
   * Ejecuta una transferencia manualmente y envía resultados detallados por correo.
   * ACTUALIZADO: Ahora maneja tareas vinculadas automáticamente
   */
  async executeTransferManual(taskId) {
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

      // 2. 🔗 NUEVA LÓGICA: Verificar si debe ejecutarse como grupo o individualmente
      const executionStrategy = await LinkedTasksService.shouldExecuteAsGroup(
        taskId
      );

      if (executionStrategy.executeAsGroup) {
        logger.info(
          `🔗 Ejecutando como grupo vinculado: ${executionStrategy.reason}`
        );

        // Ejecutar todo el grupo usando LinkedTasksService
        const groupResult = await LinkedTasksService.executeLinkedGroup(
          taskId,
          "manual"
        );

        if (groupResult.success) {
          logger.info(
            `✅ Ejecución de grupo completada exitosamente desde ${transferName}`
          );

          // Enviar correo de grupo si es necesario
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
            logger.info(`📧 Correo de grupo enviado para ${transferName}`);
          } catch (emailError) {
            logger.error(
              `❌ Error al enviar correo de grupo: ${emailError.message}`
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
        logger.info(
          `📌 Ejecutando individualmente: ${executionStrategy.reason}`
        );

        // Ejecutar individualmente (lógica original)
        logger.info(
          `📌 Ejecutando transferencia para la tarea: ${transferName}`
        );
        Telemetry.trackTransfer("started");

        const result = await this.executeTransferWithRetry(taskId);
        Telemetry.trackTransfer(result.success ? "completed" : "failed");

        // Verificar que result sea un objeto válido para evitar errores
        if (!result) {
          logger.error(
            `❌ No se obtuvo un resultado válido para la tarea: ${transferName}`
          );
          return {
            success: false,
            message: "No se obtuvo un resultado válido",
          };
        }

        // 3. Preparar datos para el correo
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

          // Actualizar estadísticas de la tarea
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
      }
    } catch (error) {
      logger.error(`❌ Error en executeTaskWithLinkingLogic: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ejecuta operaciones post-transferencia (actualizaciones adicionales)
   * ACTUALIZADO: Ahora verifica si la tarea está en un grupo vinculado antes de ejecutar post-update
   */
  async executePostTransferOperations(
    connection,
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
      // 🔗 NUEVA VERIFICACIÓN: Si la tarea es parte de un grupo vinculado,
      // el post-update debe ser manejado por el coordinador del grupo
      const linkingInfo = await LinkedTasksService.getTaskLinkingInfo(
        task._id.toString()
      );

      if (
        linkingInfo &&
        linkingInfo.hasLinkedTasks &&
        !linkingInfo.isCoordinator
      ) {
        logger.info(
          `⏸️ Tarea ${task.name} es parte de un grupo vinculado pero no es coordinadora. Post-update será manejado por el coordinador.`
        );
        return {
          success: true,
          message: "Post-update será manejado por el coordinador del grupo",
          deferred: true,
        };
      }

      // Si llegamos aquí, la tarea debe ejecutar su post-update normalmente
      // (ya sea porque no está vinculada o porque es la coordinadora)
      logger.info(
        `🔄 Ejecutando operaciones post-transferencia para ${affectedRecords.length} registros...`
      );

      // Verificar si la tarea fue cancelada
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      // Verificar la conexión
      try {
        await SqlService.query(connection, "SELECT 1 AS test");
      } catch (testError) {
        logger.warn(`Reconectando para post-actualización...`);

        const reconnectResult = await ConnectionService.enhancedRobustConnect(
          "server1"
        );
        if (!reconnectResult.success) {
          throw new Error(
            `No se pudo reconectar para post-actualización: ${reconnectResult.error.message}`
          );
        }

        connection = reconnectResult.connection;
      }

      // Procesar en lotes para evitar consultas demasiado grandes
      const batchSize = 500;
      let affectedTotal = 0;

      for (let i = 0; i < affectedRecords.length; i += batchSize) {
        // Verificar si la tarea fue cancelada
        if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

        const batch = affectedRecords.slice(i, i + batchSize);

        // Procesar claves - quitar prefijo CN si es necesario
        const processedKeys = batch.map((key) =>
          typeof key === "string" && key.startsWith("CN")
            ? key.replace(/^CN/, "")
            : key
        );

        // Construir parámetros para la consulta
        const params = {};
        processedKeys.forEach((key, index) => {
          params[`key${index}`] = key;
        });

        // Determinar clave primaria para consulta WHERE
        const primaryKeyField =
          task.postUpdateMapping?.tableKey ||
          task.validationRules?.existenceCheck?.key ||
          "ID";

        // Crear lista de parámetros
        const keyParams = processedKeys
          .map((_, index) => `@key${index}`)
          .join(", ");

        // Construir consulta dinámica
        const dynamicUpdateQuery = `${task.postUpdateQuery} WHERE ${primaryKeyField} IN (${keyParams})`;

        try {
          const sanitizedParams = SqlService.sanitizeParams(params);
          const updateResult = await SqlService.query(
            connection,
            dynamicUpdateQuery,
            sanitizedParams
          );

          affectedTotal += updateResult.rowsAffected || 0;
          logger.info(
            `Post-actualización ejecutada: ${updateResult.rowsAffected} filas afectadas`
          );
        } catch (updateError) {
          // Verificar si es error de conexión y reintentar
          if (
            updateError.message &&
            (updateError.message.includes("conexión") ||
              updateError.message.includes("connection") ||
              updateError.message.includes("timeout") ||
              updateError.message.includes("state"))
          ) {
            logger.info(
              `Reintentando post-actualización tras error de conexión`
            );

            const reconnectResult =
              await ConnectionService.enhancedRobustConnect("server1");
            if (!reconnectResult.success) {
              throw new Error(
                `No se pudo reconectar para reintentar post-actualización: ${reconnectResult.error.message}`
              );
            }

            connection = reconnectResult.connection;

            // Reintentar la actualización
            const sanitizedParams = SqlService.sanitizeParams(params);
            const retryResult = await SqlService.query(
              connection,
              dynamicUpdateQuery,
              sanitizedParams
            );

            affectedTotal += retryResult.rowsAffected || 0;
            logger.info(
              `Post-actualización (reintento) ejecutada: ${retryResult.rowsAffected} filas afectadas`
            );
          } else {
            throw updateError;
          }
        }
      }

      logger.info(
        `✅ Post-actualización completada: ${affectedTotal} registros actualizados en total`
      );
      return { success: true, updated: affectedTotal };
    } catch (error) {
      // Verificar si la tarea fue cancelada
      if (signal.aborted) {
        logger.info(`Tarea cancelada durante post-actualización`);
        throw new Error("Transferencia cancelada por el usuario");
      }

      logger.error(`❌ Error en operaciones post-transferencia:`, error);
      return {
        success: false,
        message: `Error en operaciones post-transferencia: ${error.message}`,
      };
    }
  }

  /**
   * Verifica y refresca conexiones antes de un reintento
   */
  async verifyAndRefreshConnections(taskId) {
    try {
      logger.info(
        `Verificando estado del sistema antes de reintento para tarea ${taskId}...`
      );

      // Verificar primero si está disponible el servicio de monitoreo de salud
      let healthMonitorService;
      try {
        healthMonitorService = require("./healthMonitorService");
      } catch (importError) {
        logger.debug(
          `Servicio de monitoreo de salud no disponible, usando verificación básica`
        );
      }

      if (healthMonitorService) {
        // Si existe el servicio, usar su funcionalidad
        await healthMonitorService.checkSystemHealth();
      } else {
        // Verificación básica si no existe el servicio
        const MongoDbService = require("./mongoDbService");

        // Verificar MongoDB
        if (!MongoDbService.isConnected()) {
          logger.warn(`MongoDB no conectado, intentando reconexión...`);
          await MongoDbService.connect();
        }

        // Reiniciar pools de conexión si es necesario
        logger.info(`Reiniciando pools de conexión...`);
        await ConnectionService.closePools();
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Esperar 2s
        await ConnectionService.initPool("server1");
        await ConnectionService.initPool("server2");
      }

      logger.info(`Verificación de conexiones completada para tarea ${taskId}`);
    } catch (error) {
      logger.error(
        `Error al verificar/refrescar conexiones para tarea ${taskId}:`,
        error
      );
      // No lanzar excepción, solo registrar el error
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
    ];

    return connectionErrorTerms.some((term) => errorMsg.includes(term));
  }

  /**
   * Añade una tarea fallida a la cola de reintentos
   */
  addTaskToRetryQueue(taskId, reason) {
    // Verificar si la tarea ya está en la cola
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

    // Programar procesamiento si no está en curso
    if (!this.retryQueue.isProcessing) {
      this.scheduleRetryQueueProcessing();
    }
  }

  /**
   * Programa el procesamiento de la cola de reintentos
   */
  scheduleRetryQueueProcessing() {
    // Si no hay tareas, no hacer nada
    if (this.retryQueue.tasks.length === 0) {
      return;
    }

    // Si ya estamos procesando, no hacer nada
    if (this.retryQueue.isProcessing) {
      return;
    }

    // Determinar tiempo de espera basado en último procesamiento
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
      `Programando procesamiento de cola de reintentos en ${
        waitTime / 1000
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
      // Verificar conexiones antes de procesar
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
          // Si el servicio de salud no está disponible, hacer verificación básica
          const MongoDbService = require("./mongoDbService");

          // Verificación básica de conexiones
          const mongoConnected = MongoDbService.isConnected();
          const poolStatus = ConnectionService.getConnectionStats();

          connectionsOk =
            mongoConnected &&
            Object.keys(poolStatus).length > 0 &&
            (poolStatus.server1?.available > 0 ||
              poolStatus.server2?.available > 0);
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

        // Programar nuevo intento
        setTimeout(
          () => this.processRetryQueue(),
          this.retryQueue.retryInterval
        );
        return;
      }

      // Procesar hasta 3 tareas a la vez
      const tasksToProcess = this.retryQueue.tasks.slice(0, 3);
      const remainingTasks = this.retryQueue.tasks.slice(3);
      this.retryQueue.tasks = remainingTasks;

      const results = await Promise.all(
        tasksToProcess.map(async (task) => {
          try {
            logger.info(
              `Reintentando tarea ${task.taskId} (intento ${
                task.retryCount + 1
              }/${this.retryQueue.maxRetries})...`
            );
            const result = await this.executeTransferWithRetry(task.taskId);
            logger.info(`Reintento exitoso para tarea ${task.taskId}`);
            return {
              taskId: task.taskId,
              success: true,
              ...(result || {}), // Garantizar que result nunca sea undefined
            };
          } catch (error) {
            logger.error(`Error en reintento de tarea ${task.taskId}:`, error);

            // Si aún no alcanzamos el máximo de reintentos, volver a la cola
            if (task.retryCount < this.retryQueue.maxRetries - 1) {
              task.retryCount++;
              task.lastFailTime = new Date().toISOString();
              task.lastFailReason = error.message || "Error desconocido";
              this.retryQueue.tasks.push(task);
            } else {
              logger.warn(
                `Tarea ${task.taskId} ha alcanzado el máximo de reintentos (${this.retryQueue.maxRetries})`
              );
              // Actualizar estado de la tarea en MongoDB
              try {
                await TransferTask.findByIdAndUpdate(task.taskId, {
                  status: "failed",
                  lastError: `Fallido después de ${
                    this.retryQueue.maxRetries
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
        `Procesamiento de cola completado: ${
          results.filter((r) => r.success).length
        } exitosas, ${results.filter((r) => !r.success).length} fallidas`
      );

      // Si aún quedan tareas, programar siguiente procesamiento
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
        `Procesando lote ${batchIndex + 1}/${batches.length} con ${
          batch.length
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
              ...(result || {}), // Garantizar que result nunca sea undefined
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
      `Procesamiento por lotes completado: ${
        results.filter((r) => r.success).length
      } exitosas, ${results.filter((r) => !r.success).length} fallidas`
    );
    return results;
  }

  /**
   * Función que inserta TODOS los datos en lotes, reportando progreso SSE y enviando correo al finalizar.
   * No verifica duplicados, simplemente inserta todos los registros.
   * Requiere que el frontend esté suscrito a /api/transfer/progress/:taskId
   * Versión adaptada con soporte para TaskTracker y cancelación.
   *
   * @param {String} taskId - ID de la tarea en MongoDB
   * @param {Array} data - Datos a insertar
   * @param {Number} batchSize - Tamaño de lote (default: 100)
   * @param {AbortSignal} signal - Señal para cancelación (opcional)
   * @returns {Object} - Resultado de la operación
   */
  async insertInBatchesSSE(taskId, data, batchSize = 100, signal = null) {
    let server2Connection = null;
    let lastReportedProgress = 0;
    let initialCount = 0;
    let taskName = "desconocida"; // Inicializar taskName por defecto
    let columnTypes = null;

    // Crear AbortController si no se proporcionó signal
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;

    // Crear ID único para TaskTracker
    const cancelTaskId = `batch_insert_${taskId}_${Date.now()}`;

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

      // Registrar la tarea en el TaskTracker
      TaskTracker.registerTask(
        cancelTaskId,
        localAbortController || { abort: () => {} },
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

      // Verificar cancelación temprana
      if (signal.aborted) {
        throw new Error("Tarea cancelada por el usuario");
      }

      // Si la tarea tiene habilitada la opción de borrar antes de insertar
      if (task.clearBeforeInsert) {
        sendProgress(taskId, 5); // Actualizar progreso: iniciando borrado

        try {
          logger.info(
            `🧹 Borrando registros existentes de la tabla ${task.name} antes de insertar en lotes`
          );

          // Usar conexión robusta para el borrado
          const connectionResult =
            await ConnectionService.enhancedRobustConnect("server2");
          if (!connectionResult.success) {
            throw new Error(
              `No se pudo establecer conexión a server2 para borrado: ${
                connectionResult.error?.message || "Error desconocido"
              }`
            );
          }

          server2Connection = connectionResult.connection;

          // Realizar el borrado
          const deletedCount = await SqlService.clearTableData(
            server2Connection,
            `dbo.[${task.name}]`
          );
          logger.info(
            `✅ Se eliminaron ${deletedCount} registros de la tabla ${task.name}`
          );

          sendProgress(taskId, 10); // Actualizar progreso: borrado completado
        } catch (clearError) {
          logger.error(
            `❌ Error al borrar registros de la tabla ${task.name}:`,
            clearError
          );

          // Decidir si continuar o abortar
          if (clearError.message && clearError.message.includes("no existe")) {
            logger.warn(
              `⚠️ La tabla no existe, continuando con la inserción...`
            );
          } else {
            logger.warn(
              `⚠️ Error al borrar registros pero continuando con la inserción...`
            );
          }

          // Si quieres abortar en caso de error:
          // await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          // sendProgress(taskId, -1);
          // TaskTracker.completeTask(cancelTaskId, "failed");
          // throw new Error(`Error al borrar registros existentes: ${clearError.message}`);
        }
      }

      // Verificar cancelación después del borrado
      if (signal.aborted) {
        throw new Error("Tarea cancelada por el usuario");
      }

      // 3) Conectarse a la DB de destino si aún no lo estamos
      if (!server2Connection) {
        sendProgress(taskId, 15); // Actualizar progreso: conectando a server2

        try {
          // Usar conexión robusta
          const connectionResult =
            await ConnectionService.enhancedRobustConnect("server2");
          if (!connectionResult.success) {
            throw new Error(
              `No se pudo establecer conexión a server2: ${
                connectionResult.error?.message || "Error desconocido"
              }`
            );
          }

          server2Connection = connectionResult.connection;
          logger.info(
            `Conexión establecida y verificada para inserción en lotes (taskId: ${taskId}, task: ${taskName})`
          );

          sendProgress(taskId, 20); // Actualizar progreso: conexión establecida
        } catch (connError) {
          logger.error(
            `Error al establecer conexión para inserción en lotes (taskId: ${taskId}, task: ${taskName}):`,
            connError
          );
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
          TaskTracker.completeTask(cancelTaskId, "failed");
          throw new Error(
            `Error al establecer conexión de base de datos: ${connError.message}`
          );
        }
      }

      // Obtener tipos de columnas para una inserción más segura
      try {
        logger.debug(`Obteniendo información de tabla ${taskName}...`);
        // Verificar si getColumnTypes existe
        if (typeof SqlService.getColumnTypes === "function") {
          columnTypes = await SqlService.getColumnTypes(
            server2Connection,
            taskName
          );
          logger.debug(
            `Tipos de columnas obtenidos correctamente para ${taskName}`
          );
        } else {
          logger.info(
            `La función getColumnTypes no está disponible en SqlService. Usando inferencia automática.`
          );
          columnTypes = {};
        }
      } catch (typesError) {
        logger.warn(
          `No se pudieron obtener los tipos de columnas para ${taskName}: ${typesError.message}. Se utilizará inferencia automática.`
        );
        columnTypes = {};
      }

      // Verificar cancelación después de obtener tipos
      if (signal.aborted) {
        throw new Error("Tarea cancelada por el usuario");
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
        logger.warn(
          `No se pudo verificar conteo inicial: ${countError.message}`
        );
        initialCount = 0;
      }

      // 5) Pre-cargar información de longitud de columnas
      const columnLengthCache = new Map();

      // 6) Contadores para tracking
      const total = data.length;
      let totalInserted = 0;
      let processedCount = 0;
      let errorCount = 0;

      sendProgress(taskId, 25); // Actualizar progreso: preparación completa, comenzando inserción

      // 7) Procesar data en lotes - SIN TRANSACCIONES PARA MAYOR ESTABILIDAD
      for (let i = 0; i < data.length; i += batchSize) {
        // Verificar cancelación al inicio de cada lote
        if (signal.aborted) {
          throw new Error("Tarea cancelada por el usuario");
        }

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
            await ConnectionService.releaseConnection(server2Connection);
          } catch (e) {}

          // Usar conexión robusta
          const reconnectResult = await ConnectionService.enhancedRobustConnect(
            "server2"
          );
          if (!reconnectResult.success) {
            throw new Error(
              `No se pudo restablecer la conexión: ${
                reconnectResult.error?.message || "Error desconocido"
              }`
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
          // Verificar cancelación durante el procesamiento de cada lote
          if (signal.aborted) {
            throw new Error("Tarea cancelada por el usuario");
          }

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
                validatedRecord,
                columnTypes
              );

              const rowsAffected = insertResult?.rowsAffected || 0;

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
                  insertError.message.includes("Timeout") ||
                  insertError.message.includes("state"))
              ) {
                // Intentar reconectar y reintentar
                logger.warn(
                  `Error de conexión durante inserción, reconectando...`
                );

                try {
                  await ConnectionService.releaseConnection(server2Connection);
                } catch (e) {}

                // Usar conexión robusta
                const reconnectResult =
                  await ConnectionService.enhancedRobustConnect("server2");
                if (!reconnectResult.success) {
                  throw new Error(
                    `No se pudo restablecer la conexión: ${
                      reconnectResult.error?.message || "Error desconocido"
                    }`
                  );
                }

                server2Connection = reconnectResult.connection;

                // Reintentar inserción
                const retryResult = await SqlService.insertWithExplicitTypes(
                  server2Connection,
                  `dbo.[${task.name}]`,
                  validatedRecord,
                  columnTypes
                );

                const rowsAffected = retryResult?.rowsAffected || 0;

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
        const progress = Math.min(
          Math.round((processedCount / total) * 100),
          99 // Máximo 99% hasta completar todo
        );

        if (progress > lastReportedProgress + 5 || progress >= 99) {
          lastReportedProgress = progress;
          await TransferTask.findByIdAndUpdate(taskId, { progress });
          sendProgress(taskId, progress);
          logger.debug(`Progreso actualizado: ${progress}%`);
        }

        // Monitoreo de memoria
        MemoryManager.trackOperation("batch_insert");
      }

      // 8. Actualizar estado a completado
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "completed",
        progress: 100,
        lastExecutionDate: new Date(),
        $inc: { executionCount: 1 },
        lastExecutionResult: {
          success: true,
          message: "Inserción en lotes completada exitosamente",
          recordCount: data.length,
          insertedCount: totalInserted,
          errorCount,
        },
      });
      sendProgress(taskId, 100);
      TaskTracker.completeTask(cancelTaskId, "completed");

      // 9. Verificar conteo final
      let finalCount = 0;
      try {
        const countResult = await SqlService.query(
          server2Connection,
          `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
        );
        finalCount = countResult.recordset[0].total || 0;
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
      // Verificar si fue cancelación
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

      // Manejo de errores generales
      logger.error(
        `Error en insertInBatchesSSE para ${taskName}: ${error.message}`,
        error
      );

      // Actualizar estado de la tarea
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
          await ConnectionService.releaseConnection(server2Connection);
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
   * Ejecuta una transferencia desde Server2 a Server1 (Down)
   * @param {String} taskId - ID de la tarea a ejecutar
   */
  async executeTransferDown(taskId) {
    let server1Connection = null;
    let server2Connection = null;

    try {
      // 1. Buscar la tarea en la base de datos
      const task = await TransferTask.findById(taskId);
      if (!task) {
        throw new Error(`No se encontró la tarea con ID: ${taskId}`);
      }

      const transferName = task.name;
      logger.info(
        `📌 Encontrada tarea de transferencia DOWN: ${transferName} (${taskId})`
      );

      if (!task.active) {
        logger.warn(`⚠️ La tarea ${transferName} está inactiva.`);
        return { success: false, message: "Tarea inactiva" };
      }

      // 2. Actualizar estado a running y progreso 0
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "running",
        progress: 0,
      });
      sendProgress(taskId, 0);

      // 3. Establecer conexiones a ambos servidores
      logger.info(`Conectando a Server2 (origen)...`);
      const server2Result = await ConnectionService.enhancedRobustConnect(
        "server2"
      );
      if (!server2Result.success) {
        throw new Error(
          `No se pudo conectar a Server2: ${
            server2Result.error?.message || "Error desconocido"
          }`
        );
      }
      server2Connection = server2Result.connection;
      logger.info(`Conexión establecida a Server2`);

      logger.info(`Conectando a Server1 (destino)...`);
      const server1Result = await ConnectionService.enhancedRobustConnect(
        "server1"
      );
      if (!server1Result.success) {
        throw new Error(
          `No se pudo conectar a Server1: ${
            server1Result.error?.message || "Error desconocido"
          }`
        );
      }
      server1Connection = server1Result.connection;
      logger.info(`Conexión establecida a Server1`);

      // 4. Obtener datos desde Server2
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
          } else if (param.operator === "IN" && Array.isArray(param.value)) {
            const placeholders = param.value.map((val, idx) => {
              const paramName = `${param.field}_${idx}`;
              params[paramName] = val;
              return `@${paramName}`;
            });
            conditions.push(`${param.field} IN (${placeholders.join(", ")})`);
          } else {
            conditions.push(`${param.field} ${param.operator} @${param.field}`);
          }
        }

        finalQuery += ` WHERE ${conditions.join(" AND ")}`;
      }

      logger.debug(`Consulta final: ${finalQuery}`);

      // Ejecutar consulta en Server2
      const sanitizedParams = SqlService.sanitizeParams(params);
      const sourceResult = await SqlService.query(
        server2Connection,
        finalQuery,
        sanitizedParams,
        "server2"
      );

      const sourceData = sourceResult.recordset;
      logger.info(`Obtenidos ${sourceData.length} registros desde Server2`);

      // Si no hay datos, retornar éxito pero sin registros
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

      // 5. Aplicar mapeo de campos si está definido
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

      // 6. Preparar tabla destino (limpiar si es necesario)
      if (task.clearBeforeInsert) {
        logger.info(
          `🧹 Limpiando tabla destino antes de insertar en Server1: ${task.name}`
        );
        const deleteResult = await SqlService.clearTableData(
          server1Connection,
          `dbo.[${task.name}]`
        );
        logger.info(
          `Se eliminaron ${deleteResult} registros de la tabla destino`
        );
      }

      // 7. Insertar datos en Server1
      logger.info(
        `Comenzando inserción de ${transformedData.length} registros en Server1...`
      );

      // Variables para seguimiento
      let insertedCount = 0;
      let errorCount = 0;
      let duplicateCount = 0;
      const batchSize = 100;

      // Actualizar progreso al 20%
      await TransferTask.findByIdAndUpdate(taskId, { progress: 20 });
      sendProgress(taskId, 20);

      // Procesar por lotes
      for (let i = 0; i < transformedData.length; i += batchSize) {
        // Verificar si la tarea fue cancelada
        const currentTask = await TransferTask.findById(taskId);
        if (currentTask.status === "pending") {
          logger.info(`Tarea ${taskId} cancelada durante procesamiento`);
          throw new Error("Tarea cancelada por el usuario");
        }

        const batch = transformedData.slice(i, i + batchSize);

        // Calcular progreso: 20% inicial + hasta 80% restante proporcional
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

        // Procesar registros del lote
        for (const record of batch) {
          try {
            // Insertar en tabla destino
            const insertResult = await SqlService.insertWithExplicitTypes(
              server1Connection,
              `dbo.[${task.name}]`,
              record
            );

            if (insertResult && insertResult.rowsAffected) {
              insertedCount += insertResult.rowsAffected;
            }
          } catch (insertError) {
            // Verificar si es error de duplicado
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
              // En caso de error crítico que no sea de duplicados, detener el proceso
              if (
                insertError.message &&
                (insertError.message.includes("conexión") ||
                  insertError.message.includes("connection") ||
                  insertError.message.includes("timeout"))
              ) {
                throw insertError;
              }
            }
          }
        }
      }

      // 8. Actualizar estado final
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
        `✅ Transferencia DOWN completada para ${task.name}: ${insertedCount} registros insertados, ${duplicateCount} duplicados, ${errorCount} errores`
      );

      // 9. Ejecutar tareas encadenadas si existen
      if (task.nextTasks && task.nextTasks.length > 0) {
        logger.info(
          `Iniciando ejecución de ${task.nextTasks.length} tareas encadenadas...`
        );

        const chainResults = [];

        // Ejecutar cada tarea encadenada en secuencia
        for (const nextTaskId of task.nextTasks) {
          try {
            // Verificar si la tarea está activa
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

            // Ejecutar la tarea encadenada según su tipo
            let chainResult;
            if (nextTask.transferType === "down") {
              chainResult = await this.executeTransferDown(nextTaskId);
            } else if (nextTask.transferType === "up") {
              chainResult = await this.executeTransferUp(nextTaskId);
            } else {
              chainResult = await this.executeTransfer(nextTaskId);
            }

            logger.info(
              `Tarea encadenada ${nextTask.name} completada: ${
                chainResult.success ? "Éxito" : "Error"
              }`
            );

            // Agregar resultado a la lista
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

            // Registrar el error
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

        // Incluir resultados de las tareas encadenadas en la respuesta
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

      // Respuesta sin tareas encadenadas
      return {
        success: true,
        message: "Transferencia DOWN completada con éxito",
        rows: sourceData.length,
        inserted: insertedCount,
        duplicates: duplicateCount,
        errors: errorCount,
      };
    } catch (error) {
      logger.error(`❌ Error en transferencia DOWN: ${error.message}`);

      // Actualizar estado a error
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
    } finally {
      // Liberar conexiones
      if (server1Connection) {
        try {
          await ConnectionService.releaseConnection(server1Connection);
        } catch (e) {
          logger.error(`Error al liberar conexión Server1: ${e.message}`);
        }
      }

      if (server2Connection) {
        try {
          await ConnectionService.releaseConnection(server2Connection);
        } catch (e) {
          logger.error(`Error al liberar conexión Server2: ${e.message}`);
        }
      }
    }
  }

  /**
   * Aplica el mapeo de campos configurado
   * @param {Array} sourceData - Datos originales de server2
   * @param {Object} fieldMapping - Configuración de mapeo
   * @returns {Array} - Datos transformados
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
}

// Exportar instancia singleton
module.exports = new TransferService();
