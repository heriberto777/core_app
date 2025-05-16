// services/UnifiedCancellationService.js - Versión refactorizada
const logger = require("./logger");
const RetryService = require("./RetryService");

/**
 * Servicio unificado de cancelación que centraliza toda la gestión de cancelación
 */
class UnifiedCancellationService {
  constructor() {
    this.tasks = new Map();
    this.observers = new Map();
    this.cleanupInterval = null;
    this.maxTaskAge = 3600000; // 1 hora
    this.isInitialized = false;
  }

  /**
   * Inicializa el servicio
   */
  initialize() {
    if (this.isInitialized) {
      logger.warn("El servicio de cancelación ya está inicializado");
      return;
    }

    try {
      // Limpiar tareas antiguas cada 5 minutos
      this.cleanupInterval = setInterval(() => {
        this.cleanupStaleTasks();
      }, 300000);

      this.isInitialized = true;
      logger.info("✅ Servicio de cancelación inicializado");
    } catch (error) {
      logger.error("Error al inicializar servicio de cancelación:", error);
    }
  }

  /**
   * Registra una nueva tarea para seguimiento
   */
  registerTask(taskId, controller, metadata = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const task = {
      id: taskId,
      controller,
      status: "running",
      metadata: {
        type: metadata.type || "unknown",
        component: metadata.component || "unknown",
        ...metadata,
      },
      registeredAt: Date.now(),
      lastUpdate: Date.now(),
    };

    this.tasks.set(taskId, task);
    this.notifyObservers(taskId, "registered", task);

    // Actualizar en base de datos de forma asíncrona
    this.updateTaskInDatabaseAsync(taskId, {
      status: "running",
      startTime: task.registeredAt,
      metadata: task.metadata,
    });

    logger.debug(`Task ${taskId} registered for cancellation tracking`);
    return true;
  }

  /**
   * Cancela una tarea
   */
  async cancelTask(taskId, options = {}) {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`Attempted to cancel non-existent task ${taskId}`); 
      return { success: false, message: "Task not found" };
    }

    if (task.status === "cancelled" || task.status === "completed") {
      return { success: true, message: "Task already completed" };
    }

    try {
      // Actualizar estado
      task.status = "cancelling";
      task.lastUpdate = Date.now();
      task.cancelReason = options.reason || "User cancelled";

      // Notificar observadores
      this.notifyObservers(taskId, "cancelling", task);

      // Abortar el controlador
      task.controller.abort();

      // Actualizar base de datos de forma asíncrona
      this.updateTaskInDatabaseAsync(taskId, {
        status: "cancelling",
        cancelReason: task.cancelReason,
        cancelTime: Date.now(),
      });

      // Configurar timeout para confirmación
      setTimeout(() => {
        if (
          this.tasks.has(taskId) &&
          this.tasks.get(taskId).status === "cancelling"
        ) {
          this.confirmCancellation(taskId);
        }
      }, options.timeout || 30000);

      logger.info(`Task ${taskId} cancellation initiated`);
      return { success: true, message: "Cancellation initiated" };
    } catch (error) {
      logger.error(`Error cancelling task ${taskId}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Confirma que una tarea ha sido cancelada
   */
  confirmCancellation(taskId, result = {}) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "cancelled";
    task.lastUpdate = Date.now();
    task.result = result;

    // Notificar observadores
    this.notifyObservers(taskId, "cancelled", task);

    // Actualizar en base de datos de forma asíncrona
    this.updateTaskInDatabaseAsync(taskId, {
      status: "cancelled",
      endTime: Date.now(),
      result: result,
      completionStatus: result.success
        ? "completed"
        : result.cancelled
        ? "cancelled"
        : "failed",
    });

    // Eliminar después de un tiempo
    setTimeout(() => {
      this.tasks.delete(taskId);
      this.observers.delete(taskId);
    }, 60000); // Mantener por 1 minuto

    logger.info(`Task ${taskId} cancellation confirmed`);
  }

  /**
   * Actualiza el estado de una tarea en la base de datos (asíncrono)
   */
  updateTaskInDatabaseAsync(taskId, updates) {
    // Cargar módulos solo cuando sea necesario para evitar dependencias circulares
    const TransferTask = require("../models/transferTaks");
    const TaskExecution = require("../models/taskExecutionModel");

    // Verificar si es un ID válido de MongoDB
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(taskId);

    if (!isValidObjectId) {
      logger.debug(`ID ${taskId} no es un ObjectId válido de MongoDB`);
      return;
    }

    // Ejecutar actualización en background sin esperar
    Promise.resolve()
      .then(async () => {
        // Verificar si MongoDB está conectado
        const MongoDbService = require("./mongoDbService");
        if (!MongoDbService.isConnected()) {
          logger.debug(
            "MongoDB no conectado, saltando actualización de base de datos"
          );
          return;
        }

        // Actualizar TransferTask
        await TransferTask.findByIdAndUpdate(
          taskId,
          {
            status: updates.status,
            progress:
              updates.status === "running"
                ? 0
                : updates.status === "cancelling"
                ? -1
                : updates.status === "cancelled"
                ? -1
                : 100,
            lastExecutionDate: updates.endTime
              ? new Date(updates.endTime)
              : undefined,
            lastExecutionResult: updates.result
              ? {
                  success: updates.result.success === true,
                  message: updates.result.message || updates.cancelReason || "",
                  affectedRecords: updates.result.affectedRecords || 0,
                  errorDetails: updates.result.error || "",
                }
              : undefined,
          },
          { new: true }
        );

        // Si hay registro de ejecución, actualizarlo también
        if (updates.metadata?.executionId) {
          await TaskExecution.findByIdAndUpdate(
            updates.metadata.executionId,
            {
              status: updates.status,
              endTime: updates.endTime ? new Date(updates.endTime) : undefined,
              executionTime: updates.endTime
                ? updates.endTime - updates.startTime
                : undefined,
              errorMessage: updates.cancelReason || updates.result?.error || "",
            },
            { new: true }
          );
        }
      })
      .catch((error) => {
        logger.error(`Error actualizando tarea ${taskId} en MongoDB:`, error);
      });
  }

  /**
   * Obtiene el estado de una tarea
   */
  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { exists: false };
    }

    return {
      exists: true,
      status: task.status,
      metadata: task.metadata,
      registeredAt: task.registeredAt,
      lastUpdate: task.lastUpdate,
      runningTime: Date.now() - task.registeredAt,
    };
  }

  /**
   * Obtiene todas las tareas activas
   */
  getActiveTasks() {
    return Array.from(this.tasks.values()).map((task) => ({
      id: task.id,
      status: task.status,
      metadata: task.metadata,
      registeredAt: task.registeredAt,
      runningTime: Date.now() - task.registeredAt,
    }));
  }

  /**
   * Cancela todas las tareas activas
   */
  async cancelAllTasks(options = {}) {
    const tasks = this.getActiveTasks();
    const results = [];

    for (const task of tasks) {
      if (task.status === "running") {
        const result = await this.cancelTask(task.id, options);
        results.push({ id: task.id, ...result });
      }
    }

    return {
      total: tasks.length,
      cancelled: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      details: results,
    };
  }

  /**
   * Suscribe un observador a un evento de tarea
   */
  subscribe(taskId, callback) {
    if (!this.observers.has(taskId)) {
      this.observers.set(taskId, []);
    }
    this.observers.get(taskId).push(callback);
  }

  /**
   * Notifica a los observadores
   */
  notifyObservers(taskId, event, data = {}) {
    const callbacks = this.observers.get(taskId) || [];
    callbacks.forEach((callback) => {
      try {
        callback(event, data);
      } catch (error) {
        logger.error(`Error in observer callback for task ${taskId}:`, error);
      }
    });
  }

  /**
   * Limpia tareas antiguas
   */
  cleanupStaleTasks() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const age = now - task.registeredAt;

      if (age > this.maxTaskAge) {
        if (task.status === "running") {
          // Intentar cancelar tareas que llevan mucho tiempo
          this.cancelTask(taskId, { reason: "Stale task cleanup" });
        } else {
          // Eliminar tareas completadas o canceladas
          this.tasks.delete(taskId);
          this.observers.delete(taskId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} stale tasks`);
    }
  }

  /**
   * Verifica si una tarea fue cancelada
   */
  isCancelled(taskId) {
    const task = this.tasks.get(taskId);
    return task
      ? task.status === "cancelled" || task.status === "cancelling"
      : false;
  }

  /**
   * Verifica si una señal está cancelada
   */
  isSignalCancelled(signal) {
    return signal && signal.aborted;
  }

  /**
   * Detiene el servicio
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isInitialized = false;
    logger.info("Servicio de cancelación detenido");
  }
}

// Exportar instancia singleton
module.exports = new UnifiedCancellationService();
