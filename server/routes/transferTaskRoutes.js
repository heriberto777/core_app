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

const router = express.Router();

// ===== MIDDLEWARE DE LOGGING PARA DEBUG =====
router.use((req, res, next) => {
  console.log(
    `[TransferTaskRoutes] ${req.method} ${req.path} - Body:`,
    Object.keys(req.body || {})
  );
  next();
});

// ===== RUTAS ESPECÍFICAS PRIMERO (ORDEN CRÍTICO) =====

/**
 * Rutas de configuración
 */
// GET /api/v1/tasks/config/horas
router.get("/config/horas", getConfigurarHora);

// POST /api/v1/tasks/config/horas
router.post("/config/horas", updateConfig);

// GET /api/v1/tasks/config/task-status
router.get("/config/task-status", getTaskStatus);

/**
 * Rutas de transferencia y manipulación de datos
 */
// POST /api/v1/tasks/transfer/insertOrders
router.post("/transfer/insertOrders", insertOrders);

// POST /api/v1/tasks/transfer/insertLoads
router.post("/transfer/insertLoads", insertLoadsDetail);

// POST /api/v1/tasks/transfer/insertTrapaso
router.post("/transfer/insertTrapaso", insertLoadsTrapaso);

// GET /api/v1/tasks/transfer/vendedores
router.get("/transfer/vendedores", getVendedores);

/**
 * Rutas de historial y monitoreo
 */
// GET /api/v1/tasks/history/logs
router.get("/history/logs", getTransferHistory);

// GET /api/v1/tasks/server-status/server
router.get("/server-status/server", checkServerStatus);

// GET /api/v1/tasks/task-summaries/recent
router.get("/task-summaries/recent", getTransferSummaries);

/**
 * Rutas de consecutivos y carga
 */
// GET /api/v1/tasks/load/lastLoad
router.get("/load/lastLoad", getLoadConsecutiveMongo);

/**
 * Rutas de mapping y datos de origen
 */
// GET /api/v1/tasks/source-data/:mappingId/:documentId
router.get("/source-data/:mappingId/:documentId", getSourceDataByMapping);

// POST /api/v1/tasks/update-entity-data
router.post("/update-entity-data", updateEntityData);

/**
 * Rutas de vinculación de tareas (antes de las rutas con :taskId)
 */
// GET /api/v1/tasks/linking-info/:taskId
router.get("/linking-info/:taskId", getTaskLinkingInfo);

// POST /api/v1/tasks/execute-linked-group/:taskId
router.post("/execute-linked-group/:taskId", executeLinkedGroup);

/**
 * Rutas de ejecución y control de tareas (CRÍTICAS - ANTES DE RUTAS GENÉRICAS)
 */
// POST /api/v1/tasks/execute/:taskId
router.post(
  "/execute/:taskId",
  (req, res, next) => {
    console.log(`[EXECUTE] Ejecutando tarea con ID: ${req.params.taskId}`);
    console.log(`[EXECUTE] Headers:`, req.headers);
    console.log(`[EXECUTE] Body:`, req.body);
    next();
  },
  executeTransferTask
);

// POST /api/v1/tasks/cancel/:taskId
router.post(
  "/cancel/:taskId",
  (req, res, next) => {
    console.log(`[CANCEL] Cancelando tarea con ID: ${req.params.taskId}`);
    next();
  },
  cancelTransferTask
);

// GET /api/v1/tasks/task-history/:taskId
router.get(
  "/task-history/:taskId",
  (req, res, next) => {
    console.log(
      `[HISTORY] Obteniendo historial de tarea: ${req.params.taskId}`
    );
    next();
  },
  getTaskExecutionHistory
);

/**
 * Rutas de run-loads (específicas con parámetro de nombre)
 */
// POST /api/v1/tasks/run-loads/:taskName
router.post(
  "/run-loads/:taskName",
  (req, res, next) => {
    console.log(
      `[RUN-LOADS] Ejecutando run-loads para: ${req.params.taskName}`
    );
    next();
  },
  runTask
);

/**
 * Rutas de administración de tareas
 */
// POST /api/v1/tasks/addEdit
router.post(
  "/accion/addEdit",
  (req, res, next) => {
    console.log(
      `[ADD-EDIT] Creando/editando tarea:`,
      req.body.name || "Sin nombre"
    );
    next();
  },
  upsertTransferTaskController
);

// ===== RUTAS GENERALES (DEBEN IR AL FINAL) =====

/**
 * Rutas de consulta general
 */
// GET /api/v1/tasks/
router.get(
  "/accion",
  (req, res, next) => {
    console.log(`[GET-ALL] Obteniendo todas las tareas`);
    next();
  },
  getTransferTasks
);

/**
 * Rutas con parámetros genéricos (SIEMPRE AL FINAL)
 * Estas rutas capturan cualquier cosa, por eso van al final
 */
// GET /api/v1/tasks/:name
router.get(
  "/accion/:name",
  (req, res, next) => {
    console.log(
      `[GET-BY-NAME] Obteniendo tarea por nombre: ${req.params.name}`
    );
    next();
  },
  getTransferTask
);

// DELETE /api/v1/tasks/:name
router.delete(
  "/accion/:name",
  (req, res, next) => {
    console.log(`[DELETE] Eliminando tarea: ${req.params.name}`);
    next();
  },
  deleteTransferTask
);

// ===== MIDDLEWARE DE MANEJO DE ERRORES =====
router.use((err, req, res, next) => {
  console.error(
    `[TransferTaskRoutes ERROR] ${req.method} ${req.path}:`,
    err.message
  );
  console.error(`[TransferTaskRoutes ERROR] Stack:`, err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Error interno en rutas de tareas",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// ===== MIDDLEWARE PARA RUTAS NO ENCONTRADAS =====
router.use("*", (req, res) => {
  console.log(
    `[TransferTaskRoutes 404] Ruta no encontrada: ${req.method} ${req.originalUrl}`
  );

  res.status(404).json({
    success: false,
    message: "Ruta no encontrada en transfer tasks",
    path: req.originalUrl,
    method: req.method,
    availableRoutes: {
      tasks: "GET /",
      execute: "POST /execute/:taskId",
      cancel: "POST /cancel/:taskId",
      config: "GET /config/horas",
      history: "GET /task-history/:taskId",
    },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
