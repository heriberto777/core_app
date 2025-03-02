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
} = require("../controllers/transferTaskController");

const router = express.Router();

/**
 *  Rutas para tareas
 */
// Obtener todas las tareas
router.get("/tasks", getTransferTasks);

// Obtener una tarea por nombre
router.get("/task/:name", getTransferTask);

// Crear o actualizar una tarea
router.post("/task/addEdit", upsertTransferTaskController);

// Eliminar una tarea por nombre
router.delete("/task/:name", deleteTransferTask);

// Ejecutar una tarea manualmente (por ID)
router.post("/task/execute/:taskId", executeTransferTask);

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
router.post("/task/run-loads/:taskName", runTask);

/**
 *  Rutas para insertar datos (Orders, LoadsDetail, etc.)
 */
// Insertar Orders
router.post("/task/transfer/insertOrders", insertOrders);

// Insertar LoadsDetail
router.post("/task/transfer/insertLoads", insertLoadsDetail);

// Insertar Trapaso
router.post("/task/transfer/insertTrapaso", insertLoadsTrapaso);

/**
 *  Ruta para obtener el consecutivo de Load
 */
router.get("/task/load/lastLoad", getLoadConsecutiveMongo);

module.exports = router;
