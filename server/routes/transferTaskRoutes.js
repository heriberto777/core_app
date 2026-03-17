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
  getVendedores,
  getTransferHistory,
  checkServerStatus,
  getTransferSummaries,
  getSourceDataByMapping,
  updateEntityData,
  getTaskLinkingInfo,
  executeLinkedGroup,
} = require("../controllers/transferTaskController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");
const { validate } = require("../middlewares/validator");
const {
  upsertTransferTaskSchema,
  executeTransferTaskSchema,
  runTaskSchema,
  insertOrdersSchema,
  insertLoadsSchema,
  insertTrapasoSchema,
  updateConfigSchema,
  getTransferHistorySchema,
  updateEntityDataSchema,
} = require("../validators/transferValidator");

const router = express.Router();

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

/**
 * Rutas de configuración
 */
router.get("/config/horas", checkPermission("loads", "read"), getConfigurarHora);
router.post("/config/horas", checkPermission("loads", "manage"), updateConfigSchema, validate, updateConfig);
router.get("/config/task-status", checkPermission("loads", "read"), getTaskStatus);

/**
 * Rutas de transferencia y manipulación de datos
 */
router.post("/transfer/insertOrders", checkPermission("loads", "create"), insertOrdersSchema, validate, insertOrders);
router.post("/transfer/insertLoads", checkPermission("loads", "create"), insertLoadsSchema, validate, insertLoadsDetail);
router.post("/transfer/insertTrapaso", checkPermission("loads", "create"), insertTrapasoSchema, validate, insertLoadsTrapaso);
router.get("/transfer/vendedores", checkPermission("loads", "read"), getVendedores);

/**
 * Rutas de historial y monitoreo
 */
router.get("/history/logs", checkPermission("loads", "read"), getTransferHistorySchema, validate, getTransferHistory);
router.get("/server-status/server", checkPermission("loads", "read"), checkServerStatus);
router.get("/task-summaries/recent", checkPermission("loads", "read"), getTransferSummaries);

/**
 * Rutas de consecutivos y carga
 */
router.get("/load/lastLoad", checkPermission("loads", "read"), getLoadConsecutiveMongo);

/**
 * Rutas de mapping y datos de origen
 */
router.get("/source-data/:mappingId/:documentId", checkPermission("loads", "read"), getSourceDataByMapping);
router.post("/update-entity-data", checkPermission("loads", "update"), updateEntityDataSchema, validate, updateEntityData);

/**
 * Rutas de vinculación de tareas
 */
router.get("/linking-info/:taskId", checkPermission("loads", "read"), getTaskLinkingInfo);
router.post("/execute-linked-group/:taskId", checkPermission("loads", "create"), executeLinkedGroup);

/**
 * Rutas de ejecución y control de tareas
 */
router.post("/execute/:taskId", checkPermission("loads", "create"), executeTransferTaskSchema, validate, executeTransferTask);
router.post("/cancel/:taskId", checkPermission("loads", "manage"), cancelTransferTask);
router.get("/task-history/:taskId", checkPermission("loads", "read"), getTaskExecutionHistory);

/**
 * Rutas de ejecución por nombre
 */
router.post("/run-loads/:taskName", checkPermission("loads", "create"), runTaskSchema, validate, runTask);

/**
 * Rutas de administración de tareas
 */
router.post("/accion/addEdit", checkPermission("loads", "manage"), upsertTransferTaskSchema, validate, upsertTransferTaskController);

/**
 * Rutas de consulta general
 */
router.get("/accion", checkPermission("loads", "read"), getTransferTasks);

/**
 * Rutas con parámetros genéricos (AL FINAL)
 */
router.get("/accion/:name", checkPermission("loads", "read"), getTransferTask);
router.delete("/accion/:name", checkPermission("loads", "delete"), deleteTransferTask);

module.exports = router;
