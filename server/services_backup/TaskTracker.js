// services/TaskTracker.js - Versión corregida
const UnifiedCancellationService = require("./UnifiedCancellationService");
const TransferTask = require("../models/transferTaks");
const logger = require("./logger");
const { sendProgress } = require("./progressSse");

class TaskTracker {
  constructor() {
    // Delegar al servicio unificado
    this.cancellationService = UnifiedCancellationService;
  }

  registerTask(taskId, controller, metadata = {}) {
    return this.cancellationService.registerTask(taskId, controller, metadata);
  }

  cancelTask(taskId) {
    return this.cancellationService.cancelTask(taskId);
  }

  async completeTask(taskId, status = "completed") {
    try {
      // Eliminar la tarea del servicio de cancelación
      this.cancellationService.removeTask(taskId);

      // IMPORTANTE: Solo actualizar la base de datos si es necesario
      // y con el estado correcto según el parámetro status

      // Si la tarea se completó normalmente, actualizar con estado "completed"
      if (status === "completed") {
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "completed",
          progress: 100,
        });

        // Enviar progreso final vía SSE si está disponible
        if (typeof sendProgress === "function") {
          sendProgress(taskId, 100, "completed");
        }
      }
      // Si la tarea se canceló, actualizar con estado "cancelled"
      else if (status === "cancelled") {
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "cancelled",
          progress: -1,
        });

        // Enviar progreso final vía SSE
        if (typeof sendProgress === "function") {
          sendProgress(taskId, -1, "cancelled");
        }

        // Confirmar la cancelación en el servicio unificado
        this.cancellationService.confirmCancellation(taskId, { status });
      }
      // Si la tarea falló, actualizar con estado "error"
      else if (status === "failed") {
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "error",
          progress: -1,
        });

        // Enviar progreso final vía SSE
        if (typeof sendProgress === "function") {
          sendProgress(taskId, -1, "error");
        }
      }

      logger.info(`Tarea ${taskId} completada con estado: ${status}`);
      return true;
    } catch (error) {
      logger.error(`Error al completar la tarea ${taskId}:`, error);
      return false;
    }
  }

  isTaskActive(taskId) {
    const status = this.cancellationService.getTaskStatus(taskId);
    return status.exists && status.isActiveProcess;
  }
}

module.exports = new TaskTracker();
