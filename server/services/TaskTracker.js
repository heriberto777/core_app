// services/TaskTracker.js - Versión actualizada
const UnifiedCancellationService = require("./UnifiedCancellationService");

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

  completeTask(taskId, status) {
    return this.cancellationService.confirmCancellation(taskId, { status });
  }

  isTaskActive(taskId) {
    const status = this.cancellationService.getTaskStatus(taskId);
    return status.exists && status.status === "running";
  }
}

module.exports = new TaskTracker();
