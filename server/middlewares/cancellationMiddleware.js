// middleware/cancellationMiddleware.js
const UnifiedCancellationService = require("../services/UnifiedCancellationService");
const logger = require("../services/logger");

/**
 * Middleware para verificar cancelación en las rutas
 */
const cancellationMiddleware = (req, res, next) => {
  const taskId = req.params.taskId || req.body.taskId || req.query.taskId;

  if (!taskId) {
    return next();
  }

  // Verificar si la tarea está cancelada
  if (UnifiedCancellationService.isCancelled(taskId)) {
    logger.warn(`Attempted to access cancelled task ${taskId}`);
    return res.status(400).json({
      success: false,
      message: "Task already cancelled",
      code: "TASK_CANCELLED",
    });
  }

  // Adjuntar el servicio de cancelación al request
  req.cancellationService = UnifiedCancellationService;

  next();
};

module.exports = cancellationMiddleware;
