// controllers/transferTaskController.js
const TransferTask = require("../models/transferTaks");
const TransferSummary = require("../models/transferSummaryModel");
const Consecutivo = require("../models/consecutivoModej");
const {
  executeTransferManual,
  insertInBatchesSSE,
  upsertTransferTask: upsertTransferTaskService,
} = require("../services/transferService");
const Config = require("../models/configModel");
const { startCronJob } = require("../services/cronService");
const { executeDynamicSelect } = require("../services/dynamicQueryService");
const { formatDateToYYYYMMDD } = require("../utils/formatDate");
const obtenerConsecutivo = require("../utils/obtenerConsecutivo");
const { realizarTraspaso } = require("../services/traspasoService");
const { withConnection } = require("../utils/dbUtils");
const logger = require("../services/logger");

/**
 * Obtener todas las tareas de transferencia
 */
const getTransferTasks = async (req, res) => {
  try {
    const tasks = await TransferTask.find().sort({ name: 1 });
    res.json(tasks);
  } catch (error) {
    logger.error("Error al obtener tareas de transferencia:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener tareas",
      error: error.message,
    });
  }
};

/**
 * Obtener una tarea específica por nombre
 */
const getTransferTask = async (req, res) => {
  const { name } = req.params;
  try {
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el nombre de la tarea",
      });
    }

    const task = await TransferTask.findOne({ name });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    res.json({ success: true, task });
  } catch (error) {
    logger.error(`Error al obtener tarea ${name}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al obtener tarea",
      error: error.message,
    });
  }
};

/**
 * Crear o actualizar una tarea de transferencia en MongoDB
 */
const upsertTransferTaskController = async (req, res) => {
  try {
    // Asegurarse de que req.body contiene los datos esperados
    const {
      name,
      type,
      active,
      query,
      parameters,
      transferType,
      validationRules,
      executionMode,
      postUpdateQuery,
      postUpdateMapping,
      clearBeforeInsert,
    } = req.body;

    if (!name || !query) {
      return res.status(400).json({
        success: false,
        message: "El nombre y la consulta SQL son obligatorios.",
      });
    }

    const taskData = {
      name,
      type,
      active,
      query,
      parameters: parameters || [],
      transferType,
      validationRules: validationRules || {},
      executionMode: executionMode || "normal",
      postUpdateQuery: postUpdateQuery || null,
      postUpdateMapping: postUpdateMapping || {},
      clearBeforeInsert: clearBeforeInsert || false,
    };

    // Llamar al servicio
    const result = await upsertTransferTaskService(taskData);

    if (result.success) {
      return res.json({ success: true, task: result.task });
    } else {
      return res.status(500).json({ success: false, message: result.message });
    }
  } catch (error) {
    logger.error("Error en upsertTransferTaskController:", error);
    return res.status(500).json({
      success: false,
      message: "Error al guardar la tarea",
      error: error.message,
    });
  }
};

/**
 * Ejecuta una tarea de transferencia manualmente
 */
const executeTransferTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la tarea",
      });
    }

    const task = await TransferTask.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada.",
      });
    }

    if (!task.active) {
      return res.status(400).json({
        success: false,
        message: "La tarea está inactiva y no puede ejecutarse.",
      });
    }

    if (task.type !== "manual" && task.type !== "both") {
      return res.status(400).json({
        success: false,
        message:
          "Solo se pueden ejecutar manualmente las tareas de tipo 'manual' o 'both'.",
      });
    }

    // Verificar si hay una tarea automática en progreso
    const taskInProgress = await TransferTask.findOne({
      status: "running",
      type: { $in: ["auto", "both"] },
    });

    if (taskInProgress) {
      return res.status(400).json({
        success: false,
        message:
          "No se puede ejecutar esta tarea en este momento. Hay otra tarea automática en curso.",
      });
    }

    // Ejecutar la transferencia manual
    logger.info(`Iniciando ejecución manual para la tarea: ${taskId}`);
    const result = await executeTransferManual(taskId);

    if (result && result.success) {
      return res.json({
        success: true,
        message: "Tarea ejecutada con éxito",
        result,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Error en la ejecución de la tarea.",
        result,
      });
    }
  } catch (error) {
    logger.error("Error en la ejecución de la tarea:", error);
    return res.status(500).json({
      success: false,
      message: "Error en la ejecución",
      error: error.message,
    });
  }
};

/**
 * Eliminar una tarea de transferencia
 */
const deleteTransferTask = async (req, res) => {
  const { name } = req.params;
  try {
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el nombre de la tarea",
      });
    }

    const result = await TransferTask.deleteOne({ name });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    res.json({
      success: true,
      message: "Tarea eliminada correctamente",
    });
  } catch (error) {
    logger.error(`Error al eliminar tarea ${name}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar tarea",
      error: error.message,
    });
  }
};

/**
 * Obtener la configuración de hora para tareas automáticas
 */
const getConfigurarHora = async (req, res) => {
  try {
    const config = await Config.findOne();
    if (!config) {
      return res.json({ hour: "02:00" }); // Hora por defecto: 02:00 AM
    }
    res.json(config);
  } catch (error) {
    logger.error("Error al obtener configuración de hora:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener la configuración",
      error: error.message,
    });
  }
};

/**
 * Actualizar la configuración de hora para tareas automáticas
 */
const updateConfig = async (req, res) => {
  const { hour } = req.body;

  if (!hour) {
    return res.status(400).json({
      success: false,
      message: "Se requiere la hora de ejecución",
    });
  }

  try {
    // Validar formato de hora (HH:MM)
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(hour)) {
      return res.status(400).json({
        success: false,
        message: "Formato de hora inválido. Use formato HH:MM (24 horas)",
      });
    }

    const config = await Config.findOneAndUpdate(
      {},
      { hour },
      { upsert: true, new: true }
    );

    // Actualizar la tarea programada con la nueva hora
    startCronJob(config.hour);

    res.json({
      success: true,
      message: "Configuración actualizada correctamente",
      config,
    });
  } catch (error) {
    logger.error("Error al actualizar configuración de hora:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar la configuración",
      error: error.message,
    });
  }
};

/**
 * Obtener estado actual de las tareas
 */
const getTaskStatus = async (req, res) => {
  try {
    const tasks = await TransferTask.find({}, "name status progress");
    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    logger.error("Error al obtener estado de tareas:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo estado de tareas",
      error: error.message,
    });
  }
};

/**
 * Ejecutar una tarea con parámetros específicos
 */
async function runTask(req, res) {
  try {
    const { taskName } = req.params;
    const { parametros } = req.body || {};

    if (!taskName) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el nombre de la tarea",
      });
    }

    const { date, vendors } = parametros || {};

    if (!date || !vendors) {
      return res.status(400).json({
        success: false,
        message: "Fecha y vendedores son obligatorios.",
      });
    }

    // Buscar la tarea en MongoDB
    const task = await TransferTask.findOne({ name: taskName });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    const formattedDate = formatDateToYYYYMMDD(date);
    const vendorsArray = vendors.split(",").map((v) => v.trim());

    // Preparar parámetros
    const overrideParams = {
      Order_Date: formattedDate,
      Code_Seller: vendorsArray,
    };

    logger.info(`Ejecutando tarea ${taskName} con parámetros:`, overrideParams);

    // Ejecutar consulta dinámica con withConnection
    return await withConnection("server1", async (connection) => {
      const result = await executeDynamicSelect(
        taskName,
        overrideParams,
        "server1"
      );

      return res.json({
        success: true,
        result,
      });
    });
  } catch (error) {
    logger.error(`Error al ejecutar tarea:`, error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Inserta en IMPLT_Orders los datos recibidos.
 */
async function insertOrders(req, res) {
  try {
    const { salesData } = req.body;
    if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay ventas para insertar.",
      });
    }

    // Validar cada elemento de salesData
    const validSalesData = salesData.map((item) => {
      // Crear un nuevo objeto con propiedades validadas
      const validItem = {};

      // Asegurarse de que cada propiedad esté bien definida o sea null
      Object.keys(item).forEach((key) => {
        validItem[key] = item[key] === undefined ? null : item[key];
      });

      return validItem;
    });

    // Buscar la tarea que representa la carga a IMPLT_Orders
    const task = await TransferTask.findOne({ name: "IMPLT_Orders" });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea IMPLT_Orders no encontrada.",
      });
    }

    // Ejecutar la inserción en lotes con SSE
    const result = await insertInBatchesSSE(task._id, validSalesData, 100);
    return res.json({
      success: true,
      message: "Datos insertados correctamente",
      result,
    });
  } catch (error) {
    logger.error("Error en insertOrders:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Inserta los datos en IMPLT_loads_detail.
 */
async function insertLoadsDetail(req, res) {
  try {
    const { route, loadId, salesData } = req.body;

    if (
      !route ||
      !loadId ||
      !salesData ||
      !Array.isArray(salesData) ||
      salesData.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos para insertar en loads_detail.",
      });
    }

    // Buscar la tarea para IMPLT_loads_detail
    const task = await TransferTask.findOne({ name: "IMPLT_loads_detail" });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea IMPLT_loads_detail no encontrada.",
      });
    }

    // Convertir cada registro al formato requerido
    const modifiedData = salesData.map((record, index) => ({
      Code: loadId,
      Num_Line: index + 1,
      Lot_Group: "9999999999",
      Code_Product: record.Code_Product,
      Date_Load: record.Order_Date,
      Quantity: record.Quantity,
      Unit_Type: record.Unit_Measure,
      Code_Warehouse_Sou: "01",
      Code_Route: route,
      Source_Create: null,
      Transfer_status: "1",
      Status_SAP: null,
      Code_Unit_Org: "CATELLI",
      Code_Sales_Org: "CATELLI",
    }));

    // Ejecutar la inserción en lotes con SSE
    const result = await insertInBatchesSSE(task._id, modifiedData, 100);

    // Actualizar el consecutivo
    await Consecutivo.findOneAndUpdate({}, { valor: loadId }, { upsert: true });

    return res.json({
      success: true,
      message: "Datos insertados correctamente en loads_detail",
      result,
    });
  } catch (error) {
    logger.error("Error en insertLoadsDetail:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Ejecuta el traspaso de bodega basado en los datos recibidos
 */
async function insertLoadsTrapaso(req, res) {
  try {
    const { route, loadId, salesData } = req.body;
    logger.info("Datos recibidos para traspaso:", {
      route,
      salesData: salesData ? `${salesData.length} registros` : "no data",
    });

    // Validación básica
    if (!route) {
      return res.status(400).json({
        success: false,
        message: "Parámetro 'route' es requerido",
      });
    }

    if (!salesData || !Array.isArray(salesData)) {
      return res.status(400).json({
        success: false,
        message: "Parámetro 'salesData' debe ser un array",
      });
    }

    if (salesData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay datos de ventas para procesar",
      });
    }

    // Filtrar datos inválidos
    const validSalesData = salesData.filter(
      (item) =>
        item &&
        item.Code_Product &&
        typeof item.Quantity !== "undefined" &&
        item.Quantity !== null &&
        Number(item.Quantity) > 0
    );

    if (validSalesData.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No hay productos válidos para traspasar. Cada producto debe tener Code_Product y Quantity > 0",
      });
    }

    logger.info(
      `Procesando traspaso con ${validSalesData.length} productos válidos`
    );

    // Usar realizarTraspaso con manejo mejorado de errores
    try {
      const result = await realizarTraspaso({
        route,
        salesData: validSalesData,
      });

      return res.json({
        success: true,
        message: "Traspaso ejecutado correctamente",
        ...result,
      });
    } catch (error) {
      logger.error("Error en realizarTraspaso:", error);
      return res.status(500).json({
        success: false,
        message: `Error al realizar el traspaso: ${error.message}`,
      });
    }
  } catch (error) {
    logger.error("Error en insertLoadsTrapaso:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Obtiene el último consecutivo de carga desde MongoDB
 */
async function getLoadConsecutiveMongo(req, res) {
  try {
    const loadId = await obtenerConsecutivo({
      modelo: Consecutivo,
      campoFiltro: "nombre",
      valorFiltro: "LOAD",
      campoConsecutivo: "valor",
      longitudConsecutivo: 7,
      prefijoBase: "LC",
      valorInicial: "0".padStart(7, "0"),
    });

    res.json({
      success: true,
      loadId,
    });
  } catch (error) {
    logger.error("Error al obtener consecutivo:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener loadId",
      error: error.message,
    });
  }
}

/**
 * Obtiene el historial de ejecución de una tarea
 */
const getTaskExecutionHistory = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la tarea",
      });
    }

    // Obtener la tarea para tener información básica
    const task = await TransferTask.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    // Obtener historial de TransferSummary relacionado con esta tarea
    const summaries = await TransferSummary.find({
      taskName: task.name,
    })
      .sort({ date: -1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      task: {
        name: task.name,
        lastExecutionDate: task.lastExecutionDate,
        executionCount: task.executionCount,
        lastExecutionResult: task.lastExecutionResult,
      },
      history: summaries,
    });
  } catch (error) {
    logger.error("Error al obtener historial de ejecución:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener historial",
      error: error.message,
    });
  }
};

/**
 * Cancela una tarea en ejecución
 */
const cancelTransferTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la tarea",
      });
    }

    // Verificar si la tarea existe
    const task = await TransferTask.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    // Verificar si está en ejecución usando el módulo TaskTracker
    const TaskTracker = require("../services/TaskTracker");

    if (!TaskTracker.isTaskActive(taskId)) {
      return res.status(400).json({
        success: false,
        message: "La tarea no está en ejecución actualmente",
      });
    }

    // Cancelar la tarea
    const cancelled = TaskTracker.cancelTask(taskId);

    if (cancelled) {
      // Actualizar el estado en la base de datos
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "cancelled",
        progress: -1,
      });

      return res.status(200).json({
        success: true,
        message: "Tarea cancelada correctamente",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "No se pudo cancelar la tarea",
      });
    }
  } catch (error) {
    logger.error("Error al cancelar tarea:", error);
    return res.status(500).json({
      success: false,
      message: "Error al cancelar la tarea",
      error: error.message,
    });
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
};
