const express = require("express");
const cancelTransferController = require("../controllers/cancelTransferController");
const logger = require("../services/logger");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");
const { validate } = require("../middlewares/validator");
const { cancelTaskSchema } = require("../validators/transferValidator");

/**
 * Middleware para manejo de errores específico para estas rutas
 */
const errorHandler = (controllerFn) => async (req, res, next) => {
  try {
    await controllerFn(req, res, next);
  } catch (error) {
    logger.error(`Error no controlado en ruta de cancelación: ${error.message}`, error);
    res.status(500).json({ success: false, message: error.message || "Error interno del servidor" });
  }
};

const router = express.Router();

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);
router.post("/tasks/:taskId/cancel", checkPermission("loads", "manage"), cancelTaskSchema, validate, errorHandler(cancelTransferController.cancelTransferTask));
router.get("/tasks/:taskId/status", checkPermission("loads", "read"), errorHandler(cancelTransferController.getTaskCancellationStatus));

// Rutas para tareas activas y cancelación masiva
router.get("/active", checkPermission("loads", "read"), errorHandler(cancelTransferController.getActiveCancelableTasks));
router.post("/cancel-all", checkPermission("loads", "manage"), errorHandler(cancelTransferController.cancelAllTasks));

// Ruta de retrocompatibilidad
router.post("/transfer/:taskId", checkPermission("loads", "manage"), cancelTaskSchema, validate, errorHandler(cancelTransferController.cancelTransferTask));

module.exports = router;
