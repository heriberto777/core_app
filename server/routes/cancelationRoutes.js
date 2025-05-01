const express = require("express");
const router = express.Router();
const cancelTransferController = require("../controllers/cancelTransferController");
const logger = require("../services/logger");

// Middleware para manejo de errores específico para estas rutas
const errorHandler = (controllerFn) => async (req, res, next) => {
  try {
    await controllerFn(req, res, next);
  } catch (error) {
    logger.error(
      `Error no controlado en ruta de cancelación: ${error.message}`,
      error
    );

    // Asegurarse de que siempre envíe una respuesta JSON
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

// Rutas para cancelación de tareas individuales
router.post(
  "/tasks/:taskId/cancel",
  errorHandler(cancelTransferController.cancelTransferTask)
);

router.get(
  "/tasks/:taskId/status",
  errorHandler(cancelTransferController.getTaskCancellationStatus)
);

// Rutas para tareas activas y cancelación masiva
router.get(
  "/active",
  errorHandler(cancelTransferController.getActiveCancelableTasks)
);

router.post(
  "/cancel-all",
  errorHandler(cancelTransferController.cancelAllTasks)
);

// Ruta de retrocompatibilidad - Para mantener compatibilidad con el código existente
router.post(
  "/transfer/:taskId",
  errorHandler(cancelTransferController.cancelTransferTask)
);

module.exports = router;
