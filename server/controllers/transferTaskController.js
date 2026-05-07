const TransferTask = require("../models/transferTaskModel");
const TransferSummary = require("../models/transferSummaryModel");
const TaskExecution = require("../models/taskExecutionModel");
const {
  executeTransferManual,
  insertInBatchesSSE,
  upsertTransferTask: upsertTransferTaskService,
} = require("../services/transferService");
const Config = require("../models/configModel");
const { startCronJob } = require("../services/cronService");
const { executeDynamicSelect } = require("../services/dynamicQueryService");
const { formatDateToYYYYMMDD } = require("../utils/formatDate");
const { realizarTraspaso } = require("../services/traspasoService");
const { withConnection } = require("../utils/dbUtils");
const logger = require("../services/logger");
const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");
const TaskTracker = require("../services/TaskTracker");
const transferService = require("../services/transferService");
const ConnectionDiagnostic = require("../services/connectionDiagnostic");
const DBConfig = require("../models/dbConfigModel");
const mongoose = require("mongoose");
const DynamicTransferService = require("../services/DynamicTransferService");
const LinkedTasksService = require("../services/LinkedTasksService");
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("../services/emailService");
const ConsecutiveService = require("../services/ConsecutiveService");

/**
 * Obtener todas las tareas de transferencia
 */
const getTransferTasks = async (req, res) => {
  try {
    const tasks = await TransferTask.find().sort({ name: 1 }).lean();
    return res.status(200).json({
      success: true,
      message: "Tareas obtenidas correctamente",
      data: tasks,
    });
  } catch (error) {
    logger.error("Error en getTransferTasks:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener tareas",
      error: error.message,
    });
  }
};

/**
 * Obtener una tarea específica por nombre o ID
 */
const getTransferTask = async (req, res) => {
  try {
    // Intentar capturar el identificador de cualquier parámetro posible para evitar errores de ruta
    const identifier = req.params.id || req.params.name || req.params.identifier;
    
    if (!identifier) {
      return res.status(400).json({ success: false, message: "Se requiere el ID o nombre de la tarea" });
    }

    const task = mongoose.Types.ObjectId.isValid(identifier)
      ? await TransferTask.findById(identifier).lean()
      : await TransferTask.findOne({ name: identifier }).lean();

    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });

    // ⭐ DESHABILITAR CACHE PARA CONSULTAS DE ESTADO ⭐
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.status(200).json({ success: true, message: "Tarea obtenida correctamente", data: task });
  } catch (error) {
    logger.error(`Error en getTransferTask (${req.params.id || req.params.name}):`, error);
    return res.status(500).json({ success: false, message: "Error al obtener tarea", error: error.message });
  }
};

/**
 * Crear o actualizar una tarea de transferencia en MongoDB
 */
const upsertTransferTaskController = async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";
    const sanitizedBody = { ...req.body };

    // Sanitizar executeLinkedTasks
    if (sanitizedBody.executeLinkedTasks !== undefined && typeof sanitizedBody.executeLinkedTasks === "string") {
      sanitizedBody.executeLinkedTasks =
        sanitizedBody.executeLinkedTasks === "true" ||
        (sanitizedBody.executeLinkedTasks !== "" &&
          sanitizedBody.executeLinkedTasks !== "false" &&
          sanitizedBody.executeLinkedTasks !== "0");
    }

    // Sanitizar linkedGroup
    if (sanitizedBody.linkedGroup !== undefined && typeof sanitizedBody.linkedGroup !== "string") {
      sanitizedBody.linkedGroup = sanitizedBody.linkedGroup ? String(sanitizedBody.linkedGroup) : null;
    }

    // Sanitizar linkedExecutionOrder
    if (sanitizedBody.linkedExecutionOrder !== undefined) {
      sanitizedBody.linkedExecutionOrder = parseInt(sanitizedBody.linkedExecutionOrder, 10) || 0;
    }

    const {
      name, type, active, query, parameters, transferType, validationRules, executionMode,
      postUpdateQuery, postUpdateMapping, clearBeforeInsert, fieldMapping, nextTasks,
      targetTable, linkedTasks = [], linkedGroup, executeLinkedTasks = false,
      linkedExecutionOrder = 0, coordinationConfig, linkingMetadata, _id,
    } = sanitizedBody;

    if (!name || !query) return res.status(400).json({ success: false, message: "El nombre y la consulta SQL son obligatorios." });

    if (!/^[a-zA-Z0-9_\-\.]+$/.test(name)) {
      return res.status(400).json({ success: false, message: "El nombre de la tarea solo puede contener letras, números, guiones, puntos y guiones bajos." });
    }

    logger.info(`[TransferTask] Creando/editando tarea: ${name} por ${userId}`);

    // Normalizar vinculaciones
    let cleanLinkedTasks = [];
    let cleanLinkedGroup = null;

    if (Array.isArray(linkedTasks)) {
      cleanLinkedTasks = linkedTasks.filter(id => id && typeof id === "string" && id.trim() !== "" && mongoose.Types.ObjectId.isValid(id));
    }

    if (linkedGroup && typeof linkedGroup === "string" && linkedGroup.trim() !== "") {
      cleanLinkedGroup = linkedGroup.trim();
    }

    const cleanExecuteLinkedTasks = !!(cleanLinkedGroup || cleanLinkedTasks.length > 0);

    // Validaciones de vinculación
    if (cleanLinkedGroup && cleanLinkedTasks.length > 0) {
      return res.status(400).json({ success: false, message: "Una tarea no puede tener tanto grupo vinculado como tareas vinculadas directas." });
    }

    if (cleanLinkedGroup && postUpdateQuery && postUpdateQuery.trim() !== "") {
      const existingCoordinators = await TransferTask.find({
        linkedGroup: cleanLinkedGroup,
        postUpdateQuery: { $exists: true, $nin: [null, ""] },
        _id: { $ne: _id },
        active: true,
      }).lean();

      if (existingCoordinators.length > 0) {
        return res.status(400).json({ success: false, message: `Ya existe una tarea coordinadora en el grupo "${cleanLinkedGroup}": ${existingCoordinators[0].name}.` });
      }
    }

    if (cleanLinkedTasks.length > 0) {
      const linkedTasksExist = await TransferTask.find({ _id: { $in: cleanLinkedTasks }, active: true }).lean();
      if (linkedTasksExist.length !== cleanLinkedTasks.length) {
        return res.status(400).json({ success: false, message: "Algunas tareas vinculadas no existen o están inactivas." });
      }
      if (cleanLinkedTasks.includes(_id)) {
        return res.status(400).json({ success: false, message: "Una tarea no puede vincularse a sí misma." });
      }
    }

    const isCoordinator = !!(postUpdateQuery && postUpdateQuery.trim() !== "");
    if (isCoordinator && cleanLinkedGroup && (!postUpdateMapping?.viewKey || !postUpdateMapping?.tableKey)) {
      return res.status(400).json({ success: false, message: "Una tarea coordinadora debe tener 'viewKey' y 'tableKey' definidos." });
    }

    const taskData = {
      name,
      type: type || "both",
      active: active !== undefined ? Boolean(active) : true,
      query,
      parameters: parameters || [],
      transferType: transferType || "",
      validationRules: validationRules || { requiredFields: [], existenceCheck: { table: "", key: "" } },
      executionMode: executionMode || "normal",
      postUpdateQuery: postUpdateQuery || null,
      postUpdateMapping: postUpdateMapping || { viewKey: null, tableKey: null },
      clearBeforeInsert: Boolean(clearBeforeInsert || false),
      fieldMapping: fieldMapping || { sourceTable: "", targetTable: "", sourceFields: [], targetFields: [], defaultValues: [] },
      nextTasks: nextTasks || [],
      targetTable: targetTable || null,
      linkedTasks: cleanLinkedTasks,
      linkedGroup: cleanLinkedGroup,
      executeLinkedTasks: cleanExecuteLinkedTasks,
      linkedExecutionOrder: Number(linkedExecutionOrder || 0),
      coordinationConfig: coordinationConfig || {
        waitForLinkedTasks: !!cleanLinkedGroup,
        maxWaitTime: 300000,
        postUpdateStrategy: cleanLinkedGroup ? "coordinated" : "individual",
      },
      linkingMetadata: {
        isCoordinator: Boolean(isCoordinator),
        lastGroupExecution: linkingMetadata?.lastGroupExecution || null,
        lastGroupExecutionId: linkingMetadata?.lastGroupExecutionId || null,
      },
    };

    if (_id) taskData._id = _id;

    const result = await transferService.upsertTransferTask(taskData);

    if (!result.success) {
      logger.warn(`Error al guardar tarea ${name}: ${result.message}`);
      return res.status(500).json({ success: false, message: result.message || "Error al guardar la tarea" });
    }

    logger.info(`[TransferTask] Tarea ${name} guardada exitosamente.`);

    if (taskData.linkedGroup || taskData.linkedTasks.length > 0) {
      await TransferTask.findByIdAndUpdate(result.task._id, { executeLinkedTasks: true });
    }

    if (cleanLinkedTasks.length > 0) {
      try {
        await TransferTask.updateMany({ _id: { $in: cleanLinkedTasks } }, { $addToSet: { linkedTasks: result.task._id } });
      } catch (bidirectionalError) {
        logger.warn(`No se pudo establecer vinculación bidireccional para ${name}: ${bidirectionalError.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Tarea ${_id ? "actualizada" : "creada"} correctamente`,
      data: result.task,
    });
  } catch (error) {
    logger.error("Error en upsertTransferTaskController:", error);

    if (error.name === "CastError" && error.path === "executeLinkedTasks") {
      return res.status(400).json({ success: false, message: "Error de validación: executeLinkedTasks debe ser booleano." });
    }

    if (error.code === 11000) return res.status(400).json({ success: false, message: "Ya existe una tarea con ese nombre." });

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Error de validación de esquema",
        errors: Object.values(error.errors).map(e => e.message),
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === "development" ? error.message : "Error desconocido",
    });
  }
};

/**
 * Ejecuta una tarea de transferencia manualmente
 */
const executeTransferTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    logger.info(`🔄 [executeTransferTask] Iniciando - TaskID: ${taskId} por ${userId}`);

    if (!taskId) return res.status(400).json({ success: false, message: "Se requiere el ID de la tarea" });

    const task = await TransferTask.findById(taskId);
    if (!task) {
      logger.error(`❌ [executeTransferTask] Tarea no encontrada: ${taskId}`);
      return res.status(404).json({ success: false, message: "Tarea no encontrada." });
    }

    logger.info(`📋 [executeTransferTask] Tarea encontrada: ${task.name} (${task.type})`);

    if (!task.active) {
      logger.warn(`⚠️ [executeTransferTask] Tarea inactiva: ${task.name}`);
      return res.status(400).json({ success: false, message: "La tarea está inactiva y no puede ejecutarse." });
    }

    if (task.type !== "manual" && task.type !== "both") {
      logger.warn(`⚠️ [executeTransferTask] Tipo no válido: ${task.type}`);
      return res.status(400).json({ success: false, message: "Solo se pueden ejecutar manualmente las tareas de tipo 'manual' o 'both'." });
    }

    const taskInProgress = await TransferTask.findOne({ status: "running", type: { $in: ["auto", "both"] } }).lean();
    if (taskInProgress) {
      logger.warn(`⚠️ [executeTransferTask] Tarea en progreso: ${taskInProgress.name}`);
      return res.status(400).json({ success: false, message: "No se puede ejecutar esta tarea en este momento. Hay otra tarea en curso." });
    }

    logger.info(`🚀 [executeTransferTask] Iniciando ejecución de: ${task.name}`);
    let result = null;
    let isLinkedGroup = false;

    try {
      if (LinkedTasksService && typeof LinkedTasksService.executeLinkedGroup === "function") {
        logger.info("🔗 [executeTransferTask] Usando LinkedTasksService");
        result = await LinkedTasksService.executeLinkedGroup(taskId, "manual");
        isLinkedGroup = result.isLinkedGroup || false;
      } else {
        logger.info("📝 [executeTransferTask] Usando transferService");
        result = await transferService.executeTransferWithRetry(taskId);
      }
    } catch (executionError) {
      logger.error(`❌ [executeTransferTask] Error en ejecución: ${executionError.message}`);
      logger.info("🔄 [executeTransferTask] Intentando fallback");
      result = await transferService.executeTransferWithRetry(taskId);
      isLinkedGroup = false;
    }

    if (!result) return res.status(500).json({ success: false, message: "Error: No se obtuvo resultado de la ejecución" });

    if (result.success) {
      setImmediate(async () => {
        try {
          if (isLinkedGroup && result.linkedTasksResults) {
            const emailData = result.linkedTasksResults.map(r => ({
              name: r.taskName || "Tarea desconocida",
              success: r.success || false,
              inserted: r.inserted || 0,
              updated: r.updated || 0,
              duplicates: r.duplicates || 0,
              rows: r.rows || 0,
              message: r.message || "Completado",
              errorDetail: r.error || "N/A",
            }));
            await sendTransferResultsEmail(emailData, "manual_linked_group");
          } else {
            const emailData = [{
              name: task.name,
              success: result.success,
              inserted: result.inserted || 0,
              updated: result.updated || 0,
              duplicates: result.duplicates || 0,
              rows: result.rows || 0,
              message: result.message || "Completado",
              errorDetail: result.errorDetail || "N/A",
            }];
            await sendTransferResultsEmail(emailData, "manual");
          }
        } catch (emailError) {
          logger.error(`Error enviando correo de transferencia: ${emailError.message}`);
        }
      });
    }

    return res.status(200).json({
      success: result.success || false,
      message: isLinkedGroup
        ? `Grupo ejecutado: ${result.successfulTasks || 0}/${result.totalTasks || 1} exitosas`
        : result.message || "Tarea ejecutada",
      data: { ...result, isLinkedGroup, taskName: task.name, taskId: taskId },
    });
  } catch (error) {
    logger.error(`❌ [executeTransferTask] Error crítico: ${error.message}`);
    return res.status(500).json({ success: false, message: "Error interno del servidor", error: error.message });
  }
};

/**
 * Obtener información de vinculación
 */
const getTaskLinkingInfo = async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!taskId) return res.status(400).json({ success: false, message: "ID requerido" });

    const linkingInfo = await LinkedTasksService.getTaskLinkingInfo(taskId);
    if (!linkingInfo) return res.status(404).json({ success: false, message: "Información de vinculación no encontrada" });

    return res.status(200).json({ success: true, message: "Información de vinculación obtenida", data: linkingInfo });
  } catch (error) {
    logger.error("Error en getTaskLinkingInfo:", error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Ejecutar solo un grupo vinculado
 */
const executeLinkedGroup = async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!taskId) return res.status(400).json({ success: false, message: "ID requerido" });

    const result = await LinkedTasksService.executeLinkedGroup(taskId, "manual");
    return res.status(200).json({
      success: true,
      message: `Grupo ejecutado: ${result.successfulTasks}/${result.totalTasks} exitosas`,
      data: result,
    });
  } catch (error) {
    logger.error("Error en executeLinkedGroup:", error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Eliminar una tarea de transferencia
 */
const deleteTransferTask = async (req, res) => {
  try {
    const identifier = req.params.id || req.params.name;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";
    if (!identifier) return res.status(400).json({ success: false, message: "Se requiere el nombre o ID de la tarea" });

    const result = mongoose.Types.ObjectId.isValid(identifier)
      ? await TransferTask.findByIdAndDelete(identifier)
      : await TransferTask.findOneAndDelete({ name: identifier });

    if (!result) return res.status(404).json({ success: false, message: "Tarea no encontrada" });

    logger.info(`[TransferTask] Tarea eliminada: ${name} por ${userId}`);
    return res.status(200).json({ success: true, message: "Tarea eliminada correctamente" });
  } catch (error) {
    logger.error(`Error en deleteTransferTask (${req.params.name}):`, error);
    return res.status(500).json({ success: false, message: "Error al eliminar tarea", error: error.message });
  }
};

/**
 * Obtener la configuración de hora para tareas automáticas
 */
const getConfigurarHora = async (req, res) => {
  try {
    const config = await Config.findOne().lean();
    const data = config || { hour: "02:00", enabled: true };
    return res.status(200).json({ success: true, message: "Configuración obtenida correctamente", data });
  } catch (error) {
    logger.error("Error en getConfigurarHora:", error);
    return res.status(500).json({ success: false, message: "Error al obtener configuración", error: error.message });
  }
};

/**
 * Actualizar la configuración de hora para tareas automáticas
 */
const updateConfig = async (req, res) => {
  try {
    const { hour, enabled } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (hour && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hour)) {
      return res.status(400).json({ success: false, message: "Formato de hora inválido (HH:MM)" });
    }

    const config = await Config.findOneAndUpdate(
      {},
      { hour, enabled: enabled !== undefined ? enabled : true, lastModified: new Date() },
      { upsert: true, new: true }
    );

    logger.info(`Configuración de cron actualizada: ${config.hour} (Enabled: ${config.enabled}) por ${userId}`);

    if (config.enabled !== false) startCronJob(config.hour);

    return res.status(200).json({ success: true, message: "Configuración actualizada correctamente", data: config });
  } catch (error) {
    logger.error("Error en updateConfig:", error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Obtener estado actual de las tareas
 */
const getTaskStatus = async (req, res) => {
  try {
    const tasks = await TransferTask.find({}, "name status progress").lean();
    return res.status(200).json({ success: true, message: "Estado de tareas obtenido", data: tasks });
  } catch (error) {
    logger.error("Error en getTaskStatus:", error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Ejecuta una tarea con parámetros específicos
 */
async function runTask(req, res) {
  const executionId = Date.now().toString();
  try {
    const { taskName } = req.params;
    const { parametros } = req.body || {};
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!taskName) return res.status(400).json({ success: false, message: "Se requiere el nombre de la tarea" });

    const { date, vendors } = parametros || {};
    if (!date || !vendors) return res.status(400).json({ success: false, message: "Fecha y vendedores son obligatorios." });

    const task = await TransferTask.findOne({ name: taskName }).lean();
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });

    const formattedDate = formatDateToYYYYMMDD(date);
    const vendorsArray = String(vendors).split(",").map(v => v.trim());
    const overrideParams = { Order_Date: formattedDate, Code_Seller: vendorsArray };

    logger.info(`Ejecutando tarea ${taskName} con parámetros: ${JSON.stringify(overrideParams)} por ${userId}`);

    const abortController = new AbortController();
    const cancelTaskId = `runTask_${taskName}_${executionId}`;

    TaskTracker.registerTask(cancelTaskId, abortController, {
      type: "runTask",
      taskName,
      params: overrideParams,
    });

    return await withConnection("server1", async (connection) => {
      try {
        const result = await executeDynamicSelect(taskName, overrideParams, connection, abortController.signal);
        TaskTracker.safeCompleteTask(cancelTaskId, "completed");
        return res.status(200).json({
          success: true,
          message: "Tarea ejecutada exitosamente",
          data: { taskId: cancelTaskId, result },
        });
      } catch (error) {
        if (error.message && error.message.includes("cancelada")) {
          logger.info(`Tarea ${taskName} cancelada por el usuario`);
          TaskTracker.safeCompleteTask(cancelTaskId, "cancelled");
          return res.status(499).json({ success: false, message: "Operación cancelada por el usuario" });
        }
        logger.error(`Error al ejecutar tarea ${taskName}:`, error);
        TaskTracker.safeCompleteTask(cancelTaskId, "failed");
        return res.status(500).json({ success: false, message: error.message || "Error al ejecutar la tarea" });
      }
    });
  } catch (error) {
    logger.error(`Error crítico en runTask:`, error);
    return res.status(500).json({ success: false, message: error.message || "Error interno en runTask" });
  }
}

/**
 * Inserta órdenes en base a datos recibidos
 */
async function insertOrders(req, res) {
  try {
    const { salesData } = req.body;
    if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({ success: false, message: "No hay datos para insertar." });
    }

    const validSalesData = salesData.map(item => {
      const validItem = {};
      Object.keys(item).forEach(key => {
        validItem[key] = item[key] === undefined ? null : item[key];
      });
      return validItem;
    });

    const task = await TransferTask.findOne({ name: "IMPLT_Orders" }).lean();
    if (!task) return res.status(404).json({ success: false, message: "Tarea IMPLT_Orders no encontrada." });

    const result = await insertInBatchesSSE(task._id, validSalesData, 100);
    return res.status(200).json({
      success: true,
      message: "Datos insertados correctamente en IMPLT_Orders",
      data: result,
    });
  } catch (error) {
    logger.error("Error en insertOrders:", error);
    return res.status(500).json({ success: false, message: error.message || "Error al insertar órdenes" });
  }
}

/**
 * Inserta detalle de cargas
 */
async function insertLoadsDetail(req, res) {
  try {
    const { route, loadId, salesData, bodega } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!route || !loadId || !salesData || !Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({ success: false, message: "Datos incompletos para loads_detail." });
    }

    const task = await TransferTask.findOne({ name: "IMPLT_loads_detail" }).lean();
    if (!task) return res.status(404).json({ success: false, message: "Tarea IMPLT_loads_detail no encontrada." });

    const modifiedData = salesData.map((record, index) => ({
      Code: loadId,
      Num_Line: index + 1,
      Lot_Group: "9999999999",
      Code_Product: record.Code_Product,
      Date_Load: record.Order_Date,
      Quantity: record.Quantity.toString(),
      Unit_Type: record.Unit_Measure,
      Code_Warehouse_Sou: bodega,
      Code_Route: route,
      Source_Create: 0,
      Transfer_status: "1",
      Status_SAP: null,
      Code_Unit_Org: "CATELLI",
      Code_Sales_Org: "CATELLI",
    }));

    logger.info(`Insertando ${modifiedData.length} registros en loads_detail por ${userId}`);
    const result = await insertInBatchesSSE(task._id, modifiedData, 100);

    // Actualizar el valor actual en el nuevo sistema si es necesario (opcional)
    // El ConsecutiveService ya maneja el incremento automáticamente en getNextConsecutiveValue

    return res.status(200).json({
      success: true,
      message: "Datos insertados correctamente en IMPLT_loads_detail",
      data: result,
    });
  } catch (error) {
    logger.error("Error en insertLoadsDetail:", error);
    return res.status(500).json({ success: false, message: error.message || "Error al insertar detalle de carga" });
  }
}

/**
 * Ejecuta traspaso de bodega
 */
async function insertLoadsTrapaso(req, res) {
  try {
    const { route, salesData, bodega_destino } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!route || !salesData || !Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({ success: false, message: "Datos incompletos para traspaso." });
    }

    const validSalesData = salesData.filter(item => item?.Code_Product && Number(item.Quantity) > 0);
    if (validSalesData.length === 0) return res.status(400).json({ success: false, message: "No hay productos válidos para traspasar." });

    logger.info(`Iniciando traspaso para ruta ${route} con ${validSalesData.length} productos por ${userId}`);

    const result = await realizarTraspaso({ route, salesData: validSalesData, bodega_destino });

    return res.status(200).json({
      success: true,
      message: "Traspaso ejecutado correctamente",
      data: result,
    });
  } catch (error) {
    logger.error("Error en insertLoadsTrapaso:", error);
    return res.status(500).json({ success: false, message: error.message || "Error al ejecutar traspaso" });
  }
}

/**
 * Obtiene consecutivo de carga usando el nuevo ConsecutiveService
 */
async function getLoadConsecutiveMongo(req, res) {
  try {
    const loadId = await ConsecutiveService.getNextConsecutiveValue("LOAD");

    return res.status(200).json({
      success: true,
      message: "Consecutivo de carga obtenido",
      data: { loadId },
    });
  } catch (error) {
    logger.error("Error en getLoadConsecutiveMongo:", error);
    return res.status(500).json({ success: false, message: "Error al obtener loadId", error: error.message });
  }
}

/**
 * Obtiene historial de ejecución
 */
const getTaskExecutionHistory = async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!taskId) return res.status(400).json({ success: false, message: "ID requerido" });

    const task = await TransferTask.findById(taskId).lean();
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });

    // Obtener desde TaskExecution (donde realmente se guardan los datos)
    const executions = await TaskExecution.find({ taskId: taskId })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    const enrichedHistory = executions.map(exec => ({
      _id: exec._id,
      date: exec.date,
      status: exec.status,
      totalRecords: exec.totalRecords || 0,
      successfulRecords: exec.successfulRecords || 0,
      failedRecords: exec.failedRecords || 0,
      inserted: exec.details?.inserted || exec.successfulRecords || 0,
      updated: exec.details?.updated || 0,
      duplicates: exec.details?.duplicates || 0,
      message: exec.errorMessage || exec.details?.message || "Completado",
      errorDetails: exec.errorDetails || exec.errorMessage || null,
      errorDetail: exec.errorDetails || exec.errorMessage || null,
      executionTime: exec.executionTime || 0,
    }));

    return res.status(200).json({
      success: true,
      message: "Historial de ejecución obtenido",
      data: {
        task: {
          name: task.name,
          lastExecutionDate: task.lastExecutionDate,
          executionCount: task.executionCount,
          lastExecutionResult: task.lastExecutionResult || null,
          status: task.status,
          progress: task.progress,
        },
        history: enrichedHistory,
      },
    });
  } catch (error) {
    logger.error("Error en getTaskExecutionHistory:", error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Cancela una tarea
 */
const cancelTransferTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!taskId) return res.status(400).json({ success: false, message: "Se requiere el ID de la tarea" });

    const task = await TransferTask.findById(taskId).lean();
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });

    // Verificar si la tarea está en ejecución usando la base de datos
    // No依赖 solo del TaskTracker porque puede usar IDs diferentes
    const isRunningInDB = task.status === "running" || task.status === "cancelling";
    const isActiveInTracker = TaskTracker.isTaskActive(taskId);
    
    if (!isRunningInDB && !isActiveInTracker) {
      return res.status(400).json({ success: false, message: "La tarea no está en ejecución actualmente" });
    }

    const cancelled = TaskTracker.cancelTask(taskId);
    if (!cancelled) {
      // Si no se pudo cancelar a través del tracker, aún intentar actualizar la DB
      logger.warn(`No se pudo cancelar a través del TaskTracker, actualizando estado en DB`);
    }

    await TransferTask.findByIdAndUpdate(taskId, { status: "cancelled", progress: -1 });
    logger.info(`Tarea ${task.name} (${taskId}) cancelada por ${userId}`);

    return res.status(200).json({
      success: true,
      message: "Tarea cancelada correctamente",
    });
  } catch (error) {
    logger.error("Error en cancelTransferTask:", error);
    return res.status(500).json({ success: false, message: "Error al cancelar la tarea", error: error.message });
  }
};

/**
 * Obtiene la lista de vendedores activos
 */
const getVendedores = async (req, res) => {
  try {
    return await withConnection("server1", async (connection) => {
      const query = `
        SELECT VENDEDOR, NOMBRE, U_BODEGA
        FROM CATELLI.VENDEDOR
        WHERE ACTIVO = 'S' and U_ESVENDEDOR = 'Re'
        ORDER BY VENDEDOR
      `;

      const result = await DatabaseServiceAdapter.query(connection, query);
      if (!result?.recordset || result.recordset.length === 0) {
        return res.status(404).json({ success: false, message: "No se encontraron vendedores" });
      }

      return res.status(200).json({ success: true, message: "Vendedores obtenidos correctamente", data: result.recordset });
    });
  } catch (error) {
    logger.error("Error en getVendedores:", error);
    return res.status(500).json({ success: false, message: "Error al obtener vendedores", error: error.message });
  }
};

/**
 * Obtiene historial de transferencias con filtros y estadísticas
 */
const getTransferHistory = async (req, res) => {
  try {
    const { dateFrom, dateTo, status, taskName, page = 1, limit = 20 } = req.query;
    const query = {};

    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }

    if (status) query.status = status;
    if (taskName) query.taskName = taskName;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const history = await TransferSummary.find(query).sort({ date: -1 }).skip(skip).limit(parseInt(limit, 10)).lean();
    const total = await TransferSummary.countDocuments(query);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [completedToday, failedToday] = await Promise.all([
      TransferSummary.countDocuments({ date: { $gte: today }, status: "completed" }),
      TransferSummary.countDocuments({ date: { $gte: today }, status: "failed" }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Historial obtenido correctamente",
      data: {
        history,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / parseInt(limit, 10)) },
        stats: { completedToday, failedToday },
      },
    });
  } catch (error) {
    logger.error("Error en getTransferHistory:", error);
    return res.status(500).json({ success: false, message: "Error al obtener historial", error: error.message });
  }
};

/**
 * Verifica el estado de los servidores y base de datos
 */
const checkServerStatus = async (req, res) => {
  try {
    const serverStatus = {
      server1: { status: "checking" },
      server2: { status: "checking" },
      mongodb: { status: mongoose.connection.readyState === 1 ? "online" : "offline" },
    };

    const checkServer = async (serverName) => {
      try {
        const startTime = Date.now();
        const config = await DBConfig.findOne({ serverName }).lean();
        const info = await ConnectionDiagnostic.testDirectConnection(config);
        return { status: "online", responseTime: Date.now() - startTime, info };
      } catch (err) {
        return { status: "offline", error: err.message };
      }
    };

    const [status1, status2] = await Promise.all([checkServer("server1"), checkServer("server2")]);
    serverStatus.server1 = status1;
    serverStatus.server2 = status2;

    return res.status(200).json({ success: true, message: "Estado de servidores verificado", data: serverStatus });
  } catch (error) {
    logger.error("Error en checkServerStatus:", error);
    return res.status(500).json({ success: false, message: "Error al verificar estado", error: error.message });
  }
};

/**
 * Obtiene resúmenes de transferencias para el dashboard
 */
const getTransferSummaries = async (req, res) => {
  try {
    const TaskExecution = require("../models/taskExecutionModel");
    const summaries = await TaskExecution.find().sort({ date: -1 }).limit(20).lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [completedToday, failedToday] = await Promise.all([
      TaskExecution.countDocuments({ date: { $gte: today, $lt: tomorrow }, status: "completed" }),
      TaskExecution.countDocuments({ date: { $gte: today, $lt: tomorrow }, status: { $in: ["failed", "cancelled"] } }),
    ]);

    const history = summaries.map(s => ({
      taskName: s.taskName,
      date: s.date,
      status: s.status,
      totalRecords: s.totalRecords || 0,
      successfulRecords: s.successfulRecords || 0,
      failedRecords: s.failedRecords || 0,
      executionTime: s.executionTime || 0,
    }));

    return res.status(200).json({ success: true, message: "Resúmenes obtenidos correctamente", data: { history, stats: { completedToday, failedToday } } });
  } catch (error) {
    logger.error("Error en getTransferSummaries:", error);
    return res.status(500).json({ success: false, message: "Error al obtener resúmenes", error: error.message });
  }
};

/**
 * Obtiene estadísticas diarias de ejecuciones
 */
const getDailyStats = async (req, res) => {
  try {
    const TaskExecution = require("../models/taskExecutionModel");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const executions = await TaskExecution.find({ date: { $gte: today, $lt: tomorrow } }).sort({ date: -1 }).lean();

    const stats = {
      total: executions.length,
      completed: executions.filter(e => e.status === "completed").length,
      failed: executions.filter(e => ["failed", "cancelled"].includes(e.status)).length,
    };

    return res.status(200).json({
      success: true,
      message: "Estadísticas diarias obtenidas",
      data: {
        date: today.toISOString().split("T")[0],
        executions: executions.map(e => ({
          taskId: e.taskId,
          taskName: e.taskName,
          date: e.date,
          status: e.status,
          totalRecords: e.totalRecords || 0,
          executionTime: e.executionTime || 0,
        })),
        stats,
      },
    });
  } catch (error) {
    logger.error("Error en getDailyStats:", error);
    return res.status(500).json({ success: false, message: "Error al obtener estadísticas", error: error.message });
  }
};

/**
 * Obtiene datos de origen por mapping
 */
const getSourceDataByMapping = async (req, res) => {
  let connection = null;
  try {
    const { mappingId, documentId } = req.params;
    if (!mappingId || !documentId) return res.status(400).json({ success: false, message: "IDs requeridos" });

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) return res.status(404).json({ success: false, message: "Mapping no encontrado" });

    const connectionResult = await DatabaseServiceAdapter.getConnection(mapping.sourceServer);
    if (!connectionResult) throw new Error(`Conexión fallida a ${mapping.sourceServer}`);

    connection = connectionResult;
    const mainTable = mapping.tableConfigs.find(tc => !tc.isDetailTable);
    if (!mainTable) throw new Error("Configuración de tabla principal faltante");

    const query = `SELECT * FROM ${mainTable.sourceTable} WHERE ${mainTable.primaryKey} = @documentId`;
    const result = await DatabaseServiceAdapter.query(connection, query, { documentId });

    if (!result.recordset?.length) return res.status(404).json({ success: false, message: "Datos no encontrados" });

    return res.status(200).json({
      success: true,
      message: "Datos de origen obtenidos",
      data: { sourceData: result.recordset[0], mappingConfig: { sourceTable: mainTable.sourceTable, primaryKey: mainTable.primaryKey } },
    });
  } catch (error) {
    logger.error("Error en getSourceDataByMapping:", error);
    return res.status(500).json({ success: false, message: error.message || "Error al obtener datos de origen" });
  } finally {
    if (connection) await DatabaseServiceAdapter.releaseConnection(connection);
  }
};

/**
 * Actualiza datos de entidad
 */
const updateEntityData = async (req, res) => {
  let sourceConnection = null;
  try {
    const { mappingId, documentId, sourceData, _dynamicFields } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!mappingId || !documentId || !sourceData) return res.status(400).json({ success: false, message: "Datos insuficientes" });

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) return res.status(404).json({ success: false, message: "Mapping no encontrado" });

    const sourceConnResult = await DatabaseServiceAdapter.getConnection(mapping.sourceServer);
    if (!sourceConnResult) throw new Error("Conexión origen fallida");
    sourceConnection = sourceConnResult;

    const mainTable = mapping.tableConfigs.find(tc => !tc.isDetailTable);
    const setClause = Object.entries(sourceData).map(([field]) => `${field} = @${field}`).join(", ");
    const updateQuery = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${mainTable.primaryKey} = @documentId`;

    await DatabaseServiceAdapter.query(sourceConnection, updateQuery, { ...sourceData, documentId });
    logger.info(`Entidad ${documentId} actualizada en origen por ${userId}`);

    return res.status(200).json({ success: true, message: "Entidad actualizada correctamente" });
  } catch (error) {
    logger.error("Error en updateEntityData:", error);
    return res.status(500).json({ success: false, message: error.message || "Error al actualizar entidad" });
  } finally {
    if (sourceConnection) await DatabaseServiceAdapter.releaseConnection(sourceConnection);
  }
};

/**
 * Obtiene estadísticas de grupos vinculados
 */
const getLinkedGroupStats = async (req, res) => {
  try {
    const stats = LinkedTasksService.getGroupExecutionStats();
    const linkedGroups = await TransferTask.aggregate([
      { $match: { linkedGroup: { $exists: true, $nin: [null, ""] }, active: true } },
      {
        $group: {
          _id: "$linkedGroup",
          tasks: { $push: { id: "$_id", name: "$name", executionOrder: "$linkedExecutionOrder" } },
          count: { $sum: 1 },
        },
      },
    ]).exec();

    return res.status(200).json({
      success: true,
      message: "Estadísticas de grupos vinculados obtenidas",
      data: {
        activeExecutions: stats,
        linkedGroups: linkedGroups.map(g => ({
          groupName: g._id,
          taskCount: g.count,
          tasks: g.tasks.sort((a, b) => a.executionOrder - b.executionOrder),
        })),
      },
    });
  } catch (error) {
    logger.error("Error en getLinkedGroupStats:", error);
    return res.status(500).json({ success: false, message: "Error al obtener estadísticas", error: error.message });
  }
};

module.exports = {
  getTransferTasks,
  getTransferTask,
  upsertTransferTaskController,
  deleteTransferTask,
  executeTransferTask,
  getConfigurarHora,
  updateConfig,
  runTask,
  getTaskStatus,
  insertOrders,
  insertLoadsDetail,
  getLoadConsecutiveMongo,
  insertLoadsTrapaso,
  getTaskExecutionHistory,
  cancelTransferTask,
  getVendedores,
  getTransferHistory,
  checkServerStatus,
  getTransferSummaries,
  getDailyStats,
  getSourceDataByMapping,
  updateEntityData,
  getTaskLinkingInfo,
  executeLinkedGroup,
  getLinkedGroupStats,
};
