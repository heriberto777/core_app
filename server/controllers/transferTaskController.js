const TransferTask = require("../models/transferTaks");
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
const { traspasoBodega } = require("../services/traspasoService");

/**
 * Obtener todas las tareas de transferencia
 */
const getTransferTasks = async (req, res) => {
  try {
    const tasks = await TransferTask.find();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener tareas", error });
  }
};

/**
 * Obtener una tarea específica por nombre
 */
const getTransferTask = async (req, res) => {
  console.log("Llegaria aqui?");
  const { name } = req.params;
  try {
    const task = await TransferTask.findOne({ name });
    if (!task) return res.status(404).json({ message: "Tarea no encontrada" });
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener tarea", error });
  }
};

/**
 * 📌 Crear o actualizar una tarea de transferencia en MongoDB
 */
const upsertTransferTaskController = async (req, res) => {
  console.log("Recibido -->", req.body);
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
      postUpdateMapping, // Nuevo campo agregado
    } = req.body;

    if (!name || !query) {
      return res
        .status(400)
        .json({ message: "El nombre y la consulta SQL son obligatorios." });
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
      postUpdateMapping: postUpdateMapping || {}, // Guardar el mapeo de claves
    };

    // Llamas al servicio
    const result = await upsertTransferTaskService(taskData);

    if (result.success) {
      return res.json({ success: true, task: result.task });
    } else {
      return res.status(500).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error("Error en upsertTransferTaskController:", error);
    return res
      .status(500)
      .json({ message: "Error al guardar la tarea", error: error.message });
  }
};

const executeTransferTask = async (req, res) => {
  console.log("Ejecutando tarea manual...");
  try {
    const { taskId } = req.params;
    const task = await TransferTask.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Tarea no encontrada." });
    }

    if (!task.active) {
      return res
        .status(400)
        .json({ message: "La tarea está inactiva y no puede ejecutarse." });
    }

    if (task.type !== "manual" && task.type !== "both") {
      return res.status(400).json({
        message:
          "Solo se pueden ejecutar manualmente las tareas de tipo 'manual' o 'both'.",
      });
    }

    // 🚨 Verificar si hay una tarea automática en progreso
    const taskInProgress = await TransferTask.findOne({
      status: "running",
      type: { $in: ["auto", "both"] },
    });

    if (taskInProgress) {
      return res.status(400).json({
        message:
          "No se puede ejecutar esta tarea en este momento. Hay otra tarea automática en curso.",
      });
    }

    // 🚀 Ejecutar la transferencia manual
    console.log("📌 Iniciando ejecución manual para la tarea:", taskId);
    const result = await executeTransferManual(taskId);

    console.log("📌 Resultado de ejecución:", result);

    if (result && result.success) {
      return res.json({ message: "Tarea ejecutada con éxito", result });
    } else {
      return res
        .status(400)
        .json({ message: "Error en la ejecución de la tarea.", result });
    }
  } catch (error) {
    console.error("❌ Error en la ejecución:", error);
    return res
      .status(500)
      .json({ message: "Error en la ejecución", error: error.message });
  }
};

/**
 * Eliminar una tarea de transferencia
 */
const deleteTransferTask = async (req, res) => {
  const { name } = req.params;
  try {
    await TransferTask.deleteOne({ name });
    res.json({ message: "Tarea eliminada" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar tarea", error });
  }
};

const getConfigurarHora = async (req, res) => {
  // console.log("Llegue a donde queria llegar?");
  try {
    const config = await Config.findOne();
    if (!config) {
      return res.json({ hour: "02:00" }); // Hora por defecto: 02:00 AM
    }
    res.json(config);
    // console.log(config);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al obtener la configuración", error });
  }
};

const updateConfig = async (req, res) => {
  const { hour } = req.body;

  console.log(hour);

  try {
    const config = await Config.findOneAndUpdate(
      {},
      { hour },
      { upsert: true, new: true }
    );

    // Actualiza la tarea programada con la nueva hora
    startCronJob(config.hour);

    res.json({ message: "Configuración actualizada", config });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al actualizar la configuración", error });
  }
};

const getTaskStatus = async (req, res) => {
  try {
    const tasks = await TransferTask.find({}, "name status progress");
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo estado de tareas" });
  }
};

// Ejemplo: /api/transfer/runTask/LoadSales
async function runTask(req, res) {
  try {
    const { taskName } = req.params; // "LoadSales"
    const { parametros } = req.body || {}; // { Fecha: "...", Vendedor: "..." }
    const { date, vendors } = parametros;

    // 1) Buscar la tarea en Mongo
    const task = await TransferTask.findOne({ name: taskName });
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Tarea no encontrada" });
    }

    if (!date || !vendors) {
      return res
        .status(400)
        .json({ message: "Fecha y vendedores son obligatorios." });
    }

    // Convertir vendedores a arrrau
    console.log(formatDateToYYYYMMDD(date));
    const overrideParams = {
      Order_Date: formatDateToYYYYMMDD(date),
      Code_Seller: vendors.split(",").map((v) => v.trim()),
    };

    // 2) Combinar sus parámetros con overrideParams
    //    (ejemplo: si la tarea tiene parameters con field="Fecha", operator="=", value="2023-01-01",
    //     y en overrideParams viene Fecha="2023-02-10", sobreescribes con 2023-02-10)

    // Lógica de "dynamicQueryService" o "transferService" (dependiendo de tu setup)
    const result = await executeDynamicSelect(
      taskName,
      overrideParams,
      "server1"
    );

    return res.json({ success: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Inserta en IMPLT_Orders los datos recibidos.
 * Se espera en el body: { salesData: [ ... ] }
 */
async function insertOrders(req, res) {
  try {
    const { salesData } = req.body;
    if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({ message: "No hay ventas para insertar." });
    }
    // Buscar la tarea que representa la carga a IMPLT_Orders
    const task = await TransferTask.findOne({ name: "IMPLT_Orders" });
    if (!task) {
      return res
        .status(404)
        .json({ message: "Tarea IMPLT_Orders no encontrada." });
    }

    // Ejecutar la inserción en lotes con SSE (por ejemplo, con batchSize = 100)
    const result = await insertInBatchesSSE(task._id, salesData, 100);
    return res.json(result);
  } catch (error) {
    console.error("Error en insertOrders:", error);
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Inserta los datos en IMPLT_loads_detail.
 * Se espera en el body: { route: "RUTA01", loadId: "load# 0000002", salesData: [ ... ] }
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
      return res
        .status(400)
        .json({ message: "Faltan datos para insertar en loads_detail." });
    }

    // 1) Buscar la tarea para IMPLT_loads_detail
    const task = await TransferTask.findOne({ name: "IMPLT_loads_detail" });
    if (!task) {
      return res
        .status(404)
        .json({ message: "Tarea IMPLT_loads_detail no encontrada." });
    }

    // 2) Convertir cada registro de salesData al formato IMPLT_loads_detail
    // Campos requeridos:
    //  Code               = loadId (o record.Code_load, según tu caso)
    //  Num_Line           = (un contador o algo)
    //  Lot_Group          = '9999999999'
    //  Code_Product       = record.Code_Product
    //  Date_Load          = record.Order_Date
    //  Quantity           = record.Quantity
    //  Unit_Type          = record.Unit_Measure
    //  Code_Warehouse_Sou = '01'
    //  Code_Route         = route
    //  Source_Create      = null (o "")
    //  Transfer_status    = '1'
    //  Status_SAP         = null (o "")
    //  Code_Unit_Org      = 'CATELLI'
    //  Code_Sales_Org     = 'CATELLI'
    //
    // Ajusta los nombres de campo si en 'salesData' se llaman distinto.

    const modifiedData = salesData.map((record, index) => ({
      Code: loadId,
      Num_Line: index + 1, // Ejemplo: numeración 1,2,3... record.Num_line,
      Lot_Group: "9999999999",
      Code_Product: record.Code_Product, // Asumiendo que en salesData se llama Code_Product
      Date_Load: record.Order_Date, // Si en salesData es record.Order_Date
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

    // 3) Llamar a insertInBatchesSSE con el batchSize deseado
    const result = await insertInBatchesSSE(task._id, modifiedData, 100);

    await Consecutivo.findOneAndUpdate({}, { valor: loadId }, { upsert: true });

    return res.json(result);
  } catch (error) {
    console.error("Error en insertLoadsDetail:", error);
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Controlador para ejecutar el traspaso de bodega.
 * Se espera que el body de la petición tenga:
 *   {
 *     route: <Número de bodega destino>,
 *     loadId: <(opcional) valor que se ignora en este proceso>,
 *     salesData: [ { Code_Product: string, Quantity: number, ... }, ... ]
 *   }
 *
 * La función de traspaso se encarga de:
 *  - Agrupar las ventas por producto.
 *  - Obtener y actualizar el consecutivo en Consecutivo_Ci.
 *  - Insertar el encabezado en DOCUMENTO_INV.
 *  - Insertar las líneas en LINEA_DOC_INV en lotes.
 *
 * @param {Request} req
 * @param {Response} res
 */
async function insertLoadsTrapaso(req, res) {
  try {
    const { route, loadId, salesData } = req.body;
    console.log(req.body);
    // Validación básica
    if (
      !route ||
      !salesData ||
      !Array.isArray(salesData) ||
      salesData.length === 0
    ) {
      return res.status(400).json({
        message: "Parámetros faltantes: route y salesData son requeridos.",
      });
    }

    // El parámetro loadId se ignora, ya que la lógica de traspaso genera un nuevo consecutivo.
    const result = await traspasoBodega({ route, salesData });

    return res.json(result);
  } catch (error) {
    console.error("Error en insertLoads controller:", error);
    return res.status(500).json({ message: error.message });
  }
}

/* Obtenemos el ultimo consecutivo */
async function getLoadConsecutiveMongo(req, res) {
  try {
    const loadId = await obtenerConsecutivo({
      modelo: Consecutivo,
      campoFiltro: "nombre",
      valorFiltro: "LOAD", // doc con nombre="LOAD"
      campoConsecutivo: "valor",
      longitudConsecutivo: 7,
      prefijoBase: "LC", // p.ej. "LOADC"
      valorInicial: "0".padStart(7, "0"), // "0000000"
    });

    // loadId podría ser algo como "LOADC0000001"
    res.json({ success: true, loadId });
  } catch (error) {
    console.error("Error al obtener consecutivo:", error);
    res.status(500).json({ message: "Error al obtener loadId", error });
  }
}

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
};
