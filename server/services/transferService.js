// services/TransferService.js
const logger = require("./logger");
const ConnectionManager = require("./ConnectionManager");
const { SqlService } = require("./SqlService");
const TransferTask = require("../models/transferTaks");
const { sendProgress } = require("./progressSse");
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("./emailService");
const TaskTracker = require("./TaskTracker");
const RetryService = require("./RetryService");
const MemoryManager = require("./MemoryManager");
const Telemetry = require("./Telemetry");

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
  }

  /**
   * Obtiene todas las tareas activas desde MongoDB (type: auto o both).
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
          this.executeTransferWithRetry(task._id, updateProgress),
      }));
    } catch (error) {
      logger.error("Error al obtener tareas de transferencia:", error);
      return [];
    }
  }

  /**
   * Ejecuta una transferencia manualmente y envía resultados detallados por correo.
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

      // 2. Ejecutar la transferencia
      logger.info(`📌 Ejecutando transferencia para la tarea: ${transferName}`);
      Telemetry.trackTransfer("started");

      const result = await this.executeTransferWithRetry(taskId);
      Telemetry.trackTransfer(result.success ? "completed" : "failed");

      // Verificar que result sea un objeto válido para evitar errores
      if (!result) {
        logger.error(
          `❌ No se obtuvo un resultado válido para la tarea: ${transferName}`
        );
        return { success: false, message: "No se obtuvo un resultado válido" };
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
        // Al final de la ejecución exitosa de una tarea:
        await TransferTask.findByIdAndUpdate(taskId, {
          lastExecutionDate: new Date(),
          $inc: { executionCount: 1 },
          lastExecutionResult: {
            success: result.success,
            message: result.message || "Transferencia completada",
            affectedRecords: (result.inserted || 0) + (result.updated || 0), // Evitar NaN
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
    TaskTracker.registerTask(taskId, abortController);

    try {
      // Usar RetryService para reintentos con backoff exponencial
      return await this.retryService.execute(
        async (attempt) => {
          // Si es un reintento, verificar conexiones antes
          if (attempt > 0) {
            await this.verifyAndRefreshConnections(taskId);
          }

          // Ejecutar la transferencia
          return await this.executeTransfer(taskId, signal);
        },
        {
          name: `transferencia ${taskId}`,
          signal,
        }
      );
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
   * Implementación modular de la transferencia de datos (Server1 -> Server2)
   */
  async executeTransfer(taskId, signal) {
    let server1Connection = null;
    let server2Connection = null;

    try {
      // 1. Preparar la transferencia (validar tarea y setup inicial)
      const taskInfo = await this.prepareTransfer(taskId, signal);

      // 2. Establecer conexiones
      const connections = await this.establishConnections(taskInfo, signal);
      server1Connection = connections.server1;
      server2Connection = connections.server2;

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
        sendProgress(taskId, 100);
        TaskTracker.completeTask(taskId, "completed");
        return {
          success: true,
          message: "No hay datos para transferir",
          rows: 0,
        };
      }

      // 5. Preparar procesamiento (limpiar tabla destino si es necesario)
      const prepResult = await this.prepareDestination(
        connections.server2,
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

      // 7. Ejecutar operaciones post-transferencia si corresponde
      if (taskInfo.postUpdateQuery && result.affectedRecords.length > 0) {
        await this.executePostTransferOperations(
          connections.server1,
          taskInfo,
          result.affectedRecords,
          signal
        );
      }

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
      };
    } catch (error) {
      // Verificar si el error es por cancelación
      if (signal.aborted || error.message?.includes("cancelada")) {
        logger.info(
          `Tarea ${taskId} cancelada por el usuario durante procesamiento`
        );
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

      // Error durante la transferencia
      logger.error(`Error durante la transferencia ${taskId}:`, error);

      await TransferTask.findByIdAndUpdate(taskId, {
        status: "failed",
        progress: -1,
      });
      sendProgress(taskId, -1);
      TaskTracker.completeTask(taskId, "failed");

      return {
        success: false,
        message: error.message || "Error durante la transferencia",
        errorDetail: error.stack,
      };
    } finally {
      // Cerrar las conexiones
      try {
        if (server1Connection) {
          await ConnectionManager.releaseConnection(server1Connection);
          server1Connection = null;
        }
      } catch (closeError) {
        logger.error(`Error al cerrar conexión server1:`, closeError);
      }

      try {
        if (server2Connection) {
          await ConnectionManager.releaseConnection(server2Connection);
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
      const server1Result = await ConnectionManager.enhancedRobustConnect(
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
      const server2Result = await ConnectionManager.enhancedRobustConnect(
        "server2"
      );

      if (!server2Result.success) {
        // Liberar conexión a server1 antes de lanzar error
        await ConnectionManager.releaseConnection(server1Connection);
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
        if (typeof SqlService.getColumnTypes === "function") {
          columnTypes = await SqlService.getColumnTypes(
            server2Connection,
            task.name
          );
          logger.debug(
            `Tipos de columnas obtenidos correctamente para ${task.name}`
          );
        }
      } catch (typesError) {
        logger.warn(
          `No se pudieron obtener tipos de columnas para ${task.name}: ${typesError.message}`
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
   * Obtiene los datos origen desde server1
   */
  async fetchSourceData(connections, task, signal) {
    try {
      // Verificar cancelación
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      const { name, query, parameters } = task;

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

      logger.debug(
        `Ejecutando consulta en Server1 para ${
          task.name
        }: ${finalQuery.substring(0, 200)}...`
      );

      // Medir tiempo de consulta para métricas
      Telemetry.startTimer(`query_${task._id}`);

      // Sanitizar los parámetros antes de la consulta
      const sanitizedParams = SqlService.sanitizeParams(params);
      const result = await SqlService.query(
        connections.server1,
        finalQuery,
        sanitizedParams,
        "server1"
      );

      // Registrar tiempo de consulta
      const queryTime = Telemetry.endTimer(`query_${task._id}`);
      logger.debug(`Consulta completada en ${queryTime}ms`);

      // Actualizar métricas
      Telemetry.updateAverage("avgQueryTime", queryTime);
      Telemetry.trackTransfer("recordsProcessed", result.recordset.length);

      logger.info(
        `Datos obtenidos correctamente para ${task.name}: ${result.recordset.length} registros`
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

      logger.error(`Error en la consulta en Server1:`, error);
      throw new Error(`Error en la consulta en Server1: ${error.message}`);
    }
  }

  /**
   * Prepara la tabla destino (limpieza si es necesario)
   */
  async prepareDestination(connection, task, signal) {
    // Verificar si la tarea fue cancelada
    if (signal?.aborted) {
      throw new Error("Tarea cancelada por el usuario");
    }

    // Validar que connection es un objeto de conexión válido
    if (!connection) {
      logger.error("La conexión es nula en prepareDestination");
      return {
        initialCount: 0,
        success: false,
        message: "Conexión inválida: es nula",
      };
    }

    // Verificar que no estamos recibiendo el objeto connections completo por error
    if (connection.server1 || connection.server2) {
      logger.error(
        "Se pasó un objeto connections completo en lugar de una conexión individual"
      );
      return {
        initialCount: 0,
        success: false,
        message: "Error de parámetro: se pasó el objeto connections completo",
      };
    }

    if (typeof connection.execSql !== "function") {
      logger.error(
        `La conexión no tiene la función execSql. Tipo: ${typeof connection}, propiedades: ${Object.keys(
          connection
        ).join(", ")}`
      );
      return {
        initialCount: 0,
        success: false,
        message: "Conexión inválida: no tiene método execSql",
      };
    }

    // Inicializar variables
    let initialCount = 0;
    let deletedCount = 0;

    // Verificar si hay que borrar registros existentes
    if (task.clearBeforeInsert) {
      try {
        logger.info(
          `🧹 Borrando registros existentes de la tabla ${task.name} antes de insertar`
        );

        // Verificar cancelación
        if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

        deletedCount = await SqlService.clearTableData(
          connection,
          `dbo.[${task.name}]`
        );

        logger.info(
          `✅ Se eliminaron ${deletedCount} registros de la tabla ${task.name}`
        );
      } catch (clearError) {
        // Verificar si el error fue por cancelación
        if (signal.aborted) {
          logger.info(`Tarea cancelada durante borrado de registros`);
          throw new Error("Transferencia cancelada por el usuario");
        }

        logger.error(
          `❌ Error al borrar registros de la tabla ${task.name}:`,
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

      const countResult = await SqlService.query(
        connection,
        `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
      );

      initialCount = countResult.recordset[0].total;
      logger.info(
        `Conteo inicial en tabla ${task.name}: ${initialCount} registros`
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

        const keysQuery = `
          SELECT DISTINCT ${mergeKeys.map((k) => `[${k}]`).join(", ")} 
          FROM dbo.[${name}] WITH (NOLOCK)
        `;

        const keysResult = await SqlService.query(
          connections.server2,
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
        await SqlService.query(connections.server2, "SELECT 1 AS test");
      } catch (connError) {
        // Reconectar si es necesario
        logger.warn(`Conexión perdida durante procesamiento, reconectando...`);

        const reconnectResult = await ConnectionManager.enhancedRobustConnect(
          "server2"
        );
        if (!reconnectResult.success) {
          throw new Error(
            `No se pudo restablecer la conexión: ${reconnectResult.error.message}`
          );
        }

        connections.server2 = reconnectResult.connection;
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
                  const lengthQuery = `
                    SELECT CHARACTER_MAXIMUM_LENGTH 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = '${name}' 
                      AND COLUMN_NAME = '${column}'
                  `;
                  const lengthResult = await SqlService.query(
                    connections.server2,
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

            // // Manejo especial para Credit_Limit
            // if ("Credit_Limit" in validatedRecord) {
            //   try {
            //     if (
            //       validatedRecord.Credit_Limit === undefined ||
            //       validatedRecord.Credit_Limit === null
            //     ) {
            //       validatedRecord.Credit_Limit = null;
            //     } else if (typeof validatedRecord.Credit_Limit === "string") {
            //       const cleaned = validatedRecord.Credit_Limit.trim().replace(
            //         /,/g,
            //         ""
            //       );
            //       if (cleaned === "" || cleaned.toLowerCase() === "null") {
            //         validatedRecord.Credit_Limit = null;
            //       } else {
            //         const number = parseFloat(cleaned);
            //         validatedRecord.Credit_Limit = !isNaN(number)
            //           ? number
            //           : null;
            //       }
            //     }
            //   } catch (creditLimitError) {
            //     logger.warn(
            //       `Error al procesar Credit_Limit: ${creditLimitError.message}. Estableciendo como null.`
            //     );
            //     validatedRecord.Credit_Limit = null;
            //   }
            // }

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
              const insertResult = await SqlService.insertWithExplicitTypes(
                connections.server2,
                `dbo.[${name}]`,
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

                const reconnectResult =
                  await ConnectionManager.enhancedRobustConnect("server2");

                if (!reconnectResult.success) {
                  throw new Error(
                    `No se pudo restablecer la conexión para continuar inserciones: ${reconnectResult.error.message}`
                  );
                }

                connections.server2 = reconnectResult.connection;

                // Reintentar la inserción
                const retryResult = await SqlService.insertWithExplicitTypes(
                  connections.server2,
                  `dbo.[${name}]`,
                  validatedRecord
                );

                const rowsAffected = retryResult?.rowsAffected || 0;

                if (rowsAffected > 0) {
                  totalInserted += rowsAffected;
                  batchInserted += rowsAffected;
                  logger.info(`Inserción exitosa después de reconexión`);
                }
              } else {
                // Otros errores
                logger.error(`Error al insertar registro:`, insertError);
                throw new Error(
                  `Error al insertar registro: ${insertError.message}`
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
        99 // Máximo 99% hasta completar todo
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
      const countResult = await SqlService.query(
        connections.server2,
        `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
      );
      finalCount = countResult.recordset[0].total;
      logger.info(`Conteo final en tabla ${name}: ${finalCount} registros`);
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
   * Ejecuta operaciones post-transferencia (actualizaciones adicionales)
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
      logger.info(
        `Ejecutando operaciones post-transferencia para ${affectedRecords.length} registros...`
      );

      // Verificar si la tarea fue cancelada
      if (signal.aborted) throw new Error("Tarea cancelada por el usuario");

      // Verificar la conexión
      try {
        await SqlService.query(connection, "SELECT 1 AS test");
      } catch (testError) {
        logger.warn(`Reconectando para post-actualización...`);

        const reconnectResult = await ConnectionManager.enhancedRobustConnect(
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
              await ConnectionManager.enhancedRobustConnect("server1");
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
        await ConnectionManager.closePools();
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Esperar 2s
        await ConnectionManager.initPool("server1");
        await ConnectionManager.initPool("server2");
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
          const poolStatus = ConnectionManager.getPoolsStatus();

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
}

// Exportar instancia singleton
module.exports = new TransferService();
