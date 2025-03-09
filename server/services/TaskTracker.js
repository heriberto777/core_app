// services/TaskTracker.js
const logger = require("./logger");

/**
 * Servicio para rastrear y gestionar tareas en ejecución
 */
class TaskTracker {
  constructor() {
    // Mapa para rastrear tareas activas: taskId -> { controller, status, startTime, etc }
    this.activeTasks = new Map();

    // Estadísticas
    this.stats = {
      started: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    // Límites
    this.maxConcurrentTasks = 10;
  }

  /**
   * Registra una nueva tarea
   * @param {string} taskId - ID de la tarea
   * @param {AbortController} controller - Controlador para cancelar la tarea
   * @param {Object} metadata - Metadatos adicionales de la tarea
   * @returns {boolean} - true si se registró correctamente
   */
  registerTask(taskId, controller, metadata = {}) {
    if (!taskId || !controller) {
      logger.error(
        "TaskTracker: Se intentó registrar una tarea sin ID o controlador válido"
      );
      return false;
    }

    // Si ya existe, actualizar controller y timestamp
    if (this.activeTasks.has(taskId)) {
      const existingTask = this.activeTasks.get(taskId);
      existingTask.controller = controller;
      existingTask.updatedAt = Date.now();
      logger.debug(`Tarea ${taskId} actualizada en el tracker`);
      return true;
    }

    // Si no existe, crear nueva entrada
    this.activeTasks.set(taskId, {
      id: taskId,
      controller,
      status: "running",
      startTime: Date.now(),
      updatedAt: Date.now(),
      metadata,
    });

    this.stats.started++;
    logger.debug(`Tarea ${taskId} registrada en el tracker`);

    return true;
  }

  /**
   * Cancela una tarea en ejecución
   * @param {string} taskId - ID de la tarea a cancelar
   * @returns {boolean} - true si se canceló correctamente
   */
  cancelTask(taskId) {
    if (!this.activeTasks.has(taskId)) {
      logger.warn(`Intento de cancelar tarea ${taskId} que no está registrada`);
      return false;
    }

    const task = this.activeTasks.get(taskId);

    try {
      // Abortar la operación
      task.controller.abort();
      task.status = "cancelling";
      task.updatedAt = Date.now();

      logger.info(`Tarea ${taskId} marcada para cancelación`);
      return true;
    } catch (error) {
      logger.error(`Error al cancelar tarea ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Marca una tarea como completada
   * @param {string} taskId - ID de la tarea
   * @param {string} status - Estado final ('completed', 'failed', 'cancelled')
   * @returns {boolean} - true si se completó correctamente
   */
  completeTask(taskId, status = "completed") {
    if (!this.activeTasks.has(taskId)) {
      logger.warn(
        `Intento de completar tarea ${taskId} que no está registrada`
      );
      return false;
    }

    const task = this.activeTasks.get(taskId);
    task.status = status;
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;

    // Actualizar estadísticas
    if (status === "completed") {
      this.stats.completed++;
    } else if (status === "failed") {
      this.stats.failed++;
    } else if (status === "cancelled") {
      this.stats.cancelled++;
    }

    // Mantener la tarea en el mapa por un tiempo para consultas
    setTimeout(() => {
      this.activeTasks.delete(taskId);
      logger.debug(`Tarea ${taskId} eliminada del tracker`);
    }, 60000); // Eliminar después de 1 minuto

    logger.info(
      `Tarea ${taskId} marcada como ${status} (duración: ${task.duration}ms)`
    );
    return true;
  }

  /**
   * Verifica si una tarea está activa
   * @param {string} taskId - ID de la tarea
   * @returns {boolean} - true si la tarea está activa
   */
  isTaskActive(taskId) {
    if (!this.activeTasks.has(taskId)) {
      return false;
    }

    const task = this.activeTasks.get(taskId);
    return task.status === "running" || task.status === "paused";
  }

  /**
   * Obtiene información detallada de una tarea
   * @param {string} taskId - ID de la tarea
   * @returns {Object|null} - Información de la tarea o null si no existe
   */
  getTaskInfo(taskId) {
    if (!this.activeTasks.has(taskId)) {
      return null;
    }

    const task = this.activeTasks.get(taskId);

    // Clonar para evitar modificaciones externas
    return {
      id: task.id,
      status: task.status,
      startTime: task.startTime,
      updatedAt: task.updatedAt,
      duration: Date.now() - task.startTime,
      metadata: task.metadata,
    };
  }

  /**
   * Obtiene lista de todas las tareas activas
   * @returns {Array} - Lista de tareas activas
   */
  getAllActiveTasks() {
    const tasks = [];

    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.status === "running" || task.status === "paused") {
        tasks.push({
          id: taskId,
          status: task.status,
          startTime: task.startTime,
          duration: Date.now() - task.startTime,
          metadata: task.metadata,
        });
      }
    }

    return tasks;
  }

  /**
   * Cancela todas las tareas activas
   * @returns {number} - Número de tareas canceladas
   */
  cancelAllTasks() {
    let cancelledCount = 0;

    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.status === "running" || task.status === "paused") {
        try {
          task.controller.abort();
          task.status = "cancelling";
          task.updatedAt = Date.now();
          cancelledCount++;
        } catch (error) {
          logger.error(`Error al cancelar tarea ${taskId}:`, error);
        }
      }
    }

    logger.info(`Se cancelaron ${cancelledCount} tareas activas`);
    return cancelledCount;
  }

  /**
   * Limpia tareas antiguas o huérfanas
   * @param {number} maxAgeMs - Edad máxima en ms (por defecto 1 hora)
   * @returns {number} - Número de tareas limpiadas
   */
  cleanupStaleTasks(maxAgeMs = 3600000) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, task] of this.activeTasks.entries()) {
      const taskAge = now - task.updatedAt;

      if (taskAge > maxAgeMs) {
        // Intentar cancelar si aún está en ejecución
        if (task.status === "running" || task.status === "paused") {
          try {
            task.controller.abort();
          } catch (e) {}
        }

        this.activeTasks.delete(taskId);
        cleanedCount++;
        logger.debug(`Tarea antigua ${taskId} eliminada (edad: ${taskAge}ms)`);
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Se limpiaron ${cleanedCount} tareas antiguas`);
    }

    return cleanedCount;
  }

  /**
   * Obtiene estadísticas de tareas
   * @returns {Object} - Estadísticas
   */
  getStats() {
    const active = this.getAllActiveTasks().length;

    return {
      ...this.stats,
      active,
      total: this.stats.started,
      completionRate:
        this.stats.started > 0
          ? ((this.stats.completed / this.stats.started) * 100).toFixed(2) + "%"
          : "0%",
      failureRate:
        this.stats.started > 0
          ? ((this.stats.failed / this.stats.started) * 100).toFixed(2) + "%"
          : "0%",
      cancellationRate:
        this.stats.started > 0
          ? ((this.stats.cancelled / this.stats.started) * 100).toFixed(2) + "%"
          : "0%",
      timestamp: new Date().toISOString(),
    };
  }
}

// Exportar instancia singleton
module.exports = new TaskTracker();
