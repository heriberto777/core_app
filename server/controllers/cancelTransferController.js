const UnifiedCancellationService = require("../services/UnifiedCancellationService");
const TransferTask = require("../models/transferTaskModel");
const logger = require("../services/logger");

/**
 * Controlador para gestionar la cancelación de tareas
 */
const cancelTransferController = {
  /**
   * Cancela una tarea en ejecución
   */
  async cancelTransferTask(req, res) {
    try {
      const { taskId } = req.params;
      const { force, reason } = req.body || {};
      const userId = req.user?.user_id || req.user?._id || "SYSTEM";

      if (!taskId) return res.status(400).json({ success: false, message: "ID de tarea requerido" });

      const task = await TransferTask.findById(taskId).lean();
      if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });

      const result = await UnifiedCancellationService.cancelTask(taskId, {
        force: !!force,
        reason: reason || "Cancelado por el usuario",
        timeout: 30000,
      });

      if (!result.success) {
        logger.warn(`Fallo al cancelar tarea ${taskId} por ${userId}: ${result.message}`);
        return res.status(500).json({ success: false, message: "Error al cancelar tarea", details: result.message });
      }

      await TransferTask.findByIdAndUpdate(taskId, { status: "cancelling", progress: -1 });
      logger.info(`Cancelación iniciada para tarea ${taskId} por ${userId}`);

      return res.status(200).json({
        success: true,
        message: "Cancelación de tarea iniciada",
        data: { taskId, details: result.message },
      });
    } catch (error) {
      logger.error(`Error en cancelTransferTask (${req.params.taskId}):`, error);
      return res.status(500).json({ success: false, message: "Error interno al cancelar", error: error.message });
    }
  },

  /**
   * Obtiene el estado de cancelación de una tarea
   */
  async getTaskCancellationStatus(req, res) {
    try {
      const { taskId } = req.params;
      if (!taskId) return res.status(400).json({ success: false, message: "ID de tarea requerido" });

      const status = UnifiedCancellationService.getTaskStatus(taskId);
      return res.status(200).json({ success: true, message: "Estado de cancelación obtenido", data: status });
    } catch (error) {
      logger.error(`Error en getTaskCancellationStatus (${req.params.taskId}):`, error);
      return res.status(500).json({ success: false, message: "Error al obtener estado", error: error.message });
    }
  },

  /**
   * Obtiene todas las tareas activas cancelables
   */
  async getActiveCancelableTasks(req, res) {
    try {
      const activeTasks = UnifiedCancellationService.getActiveTasks();
      return res.status(200).json({ success: true, message: "Tareas activas obtenidas", data: activeTasks });
    } catch (error) {
      logger.error("Error en getActiveCancelableTasks:", error);
      return res.status(500).json({ success: false, message: "Error al obtener tareas activas", error: error.message });
    }
  },

  /**
   * Cancela todas las tareas activas
   */
  async cancelAllTasks(req, res) {
    try {
      const { force, reason } = req.body || {};
      const userId = req.user?.user_id || req.user?._id || "SYSTEM";

      const results = await UnifiedCancellationService.cancelAllTasks({
        force: !!force,
        reason: reason || "Cancelación masiva solicitada",
        timeout: 30000,
      });

      logger.info(`Cancelación masiva ejecutada por ${userId}: ${results.cancelled} tareas iniciadas.`);
      return res.status(200).json({
        success: true,
        message: `Cancelación iniciada para ${results.cancelled} tareas`,
        data: results,
      });
    } catch (error) {
      logger.error("Error en cancelAllTasks:", error);
      return res.status(500).json({ success: false, message: "Error en cancelación masiva", error: error.message });
    }
  },
};

module.exports = cancelTransferController;
