// routes/transferRoutes.js

const express = require("express");
const {
  getTransferTasks,
  getTransferTask,
  deleteTransferTask,
  executeTransferTask,
  getConfigurarHora,
  updateConfig,
  getTaskStatus,
  upsertTransferTaskController,
  runTask,
  insertOrders,
  insertLoadsDetail,
  getLoadConsecutiveMongo,
  insertLoadsTrapaso,
  getTaskExecutionHistory,
  cancelTransferTask,
} = require("../controllers/transferTaskController");

const router = express.Router();

/**
 *  Rutas para tareas
 */
// Obtener todas las tareas
router.get("/", getTransferTasks);

// Obtener una tarea por nombre
router.get("/:name", getTransferTask);

// Crear o actualizar una tarea
router.post("/addEdit", upsertTransferTaskController);

// Eliminar una tarea por nombre
router.delete("/:name", deleteTransferTask);

// Ejecutar una tarea manualmente (por ID)
router.post("/execute/:taskId", executeTransferTask);

/**
 *  Rutas de configuración
 */
router.get("/config/horas", getConfigurarHora); // Obtener hora
router.post("/config/horas", updateConfig); // Actualizar hora

// Obtener estado de las tareas
router.get("/config/task-status", getTaskStatus);

/**
 *  Rutas para "run-loads"
 */
// Ejecutar una lógica de "carga" según el nombre de la tarea
router.post("/run-loads/:taskName", runTask);

/**
 *  Rutas para insertar datos (Orders, LoadsDetail, etc.)
 */
// Insertar Orders
router.post("/transfer/insertOrders", insertOrders);

// Insertar LoadsDetail
router.post("/transfer/insertLoads", insertLoadsDetail);

// Insertar Trapaso
router.post("/transfer/insertTrapaso", insertLoadsTrapaso);

/**
 *  Ruta para obtener el consecutivo de Load
 */
router.get("/load/lastLoad", getLoadConsecutiveMongo); //task-history

router.get("/task-history/:taskId", getTaskExecutionHistory); //task-history
// En routes/transferRoutes.js
router.post("/cancel/:taskId", cancelTransferTask);

module.exports = router;
