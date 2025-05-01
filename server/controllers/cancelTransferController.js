// controllers/cancelTransferController.js
const UnifiedCancellationService = require("../services/UnifiedCancellationService");
const TransferTask = require("../models/transferTaks");
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

      if (!taskId) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required",
        });
      }

      // Verificar si la tarea existe en la base de datos
      const task = await TransferTask.findById(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      // Intentar cancelar
      const result = await UnifiedCancellationService.cancelTask(taskId, {
        force: !!force,
        reason: reason || "Cancelled by user",
        timeout: 30000,
      });

      if (result.success) {
        // Actualizar base de datos
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "cancelling",
          progress: -1,
        });

        return res.status(200).json({
          success: true,
          message: "Task cancellation initiated",
          taskId,
          details: result.message,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to cancel task",
          details: result.message,
        });
      }
    } catch (error) {
      logger.error("Error cancelling task:", error);
      return res.status(500).json({
        success: false,
        message: "Error cancelling task",
        error: error.message,
      });
    }
  },

  /**
   * Obtiene el estado de cancelación de una tarea
   */
  async getTaskCancellationStatus(req, res) {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required",
        });
      }

      const status = UnifiedCancellationService.getTaskStatus(taskId);

      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error("Error getting cancellation status:", error);
      return res.status(500).json({
        success: false,
        message: "Error getting cancellation status",
        error: error.message,
      });
    }
  },

  /**
   * Obtiene todas las tareas activas que pueden ser canceladas
   */
  async getActiveCancelableTasks(req, res) {
    try {
      const activeTasks = UnifiedCancellationService.getActiveTasks();

      return res.status(200).json({
        success: true,
        data: activeTasks,
      });
    } catch (error) {
      logger.error("Error getting active tasks:", error);
      return res.status(500).json({
        success: false,
        message: "Error getting active tasks",
        error: error.message,
      });
    }
  },

  /**
   * Cancela todas las tareas activas
   */
  async cancelAllTasks(req, res) {
    try {
      const { force, reason } = req.body || {};

      const results = await UnifiedCancellationService.cancelAllTasks({
        force: !!force,
        reason: reason || "Mass cancellation requested",
        timeout: 30000,
      });

      return res.status(200).json({
        success: true,
        message: `Cancellation initiated for ${results.cancelled} tasks`,
        data: results,
      });
    } catch (error) {
      logger.error("Error cancelling all tasks:", error);
      return res.status(500).json({
        success: false,
        message: "Error cancelling all tasks",
        error: error.message,
      });
    }
  },
};

module.exports = cancelTransferController;
