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

      // CORRECCIÓN: Verificar si taskId es un ObjectId válido de MongoDB
      const mongoose = require("mongoose");
      const isValidObjectId =
        mongoose.Types.ObjectId.isValid(taskId) &&
        taskId.length === 24 &&
        /^[0-9a-fA-F]{24}$/.test(taskId);

      if (isValidObjectId) {
        // Solo actualizar la base de datos si es un ObjectId válido de MongoDB
        if (status === "completed") {
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
          });
          logger.debug(
            `Estado actualizado en BD para tarea ${taskId}: completed`
          );
        } else if (status === "cancelled") {
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "cancelled",
            progress: -1,
          });
          logger.debug(
            `Estado actualizado en BD para tarea ${taskId}: cancelled`
          );
        } else if (status === "failed") {
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "error",
            progress: -1,
          });
          logger.debug(`Estado actualizado en BD para tarea ${taskId}: failed`);
        }
      } else {
        // Para IDs compuestos como "runTask_...", solo hacer logging
        logger.info(
          `Tarea con ID compuesto ${taskId} completada con estado: ${status} (no se actualiza BD)`
        );

        // Si el ID compuesto contiene un ObjectId real, intentar extraerlo
        const extractedId = this.extractObjectIdFromCompositeId(taskId);
        if (extractedId) {
          logger.info(
            `Intentando actualizar tarea real ${extractedId} extraída de ${taskId}`
          );
          try {
            if (status === "completed") {
              await TransferTask.findByIdAndUpdate(extractedId, {
                status: "completed",
                progress: 100,
              });
            } else if (status === "cancelled") {
              await TransferTask.findByIdAndUpdate(extractedId, {
                status: "cancelled",
                progress: -1,
              });
            } else if (status === "failed") {
              await TransferTask.findByIdAndUpdate(extractedId, {
                status: "error",
                progress: -1,
              });
            }
          } catch (extractError) {
            logger.warn(
              `No se pudo actualizar la tarea extraída ${extractedId}: ${extractError.message}`
            );
          }
        }
      }

      // Enviar progreso final vía SSE si está disponible (funciona con cualquier tipo de ID)
      if (typeof sendProgress === "function") {
        if (status === "completed") {
          sendProgress(taskId, 100, "completed");
        } else if (status === "cancelled") {
          sendProgress(taskId, -1, "cancelled");
        } else if (status === "failed") {
          sendProgress(taskId, -1, "error");
        }
      }

      // Confirmar la cancelación en el servicio unificado si fue cancelada
      if (status === "cancelled") {
        this.cancellationService.confirmCancellation(taskId, { status });
      }

      logger.info(`Tarea ${taskId} completada con estado: ${status}`);
      return true;
    } catch (error) {
      logger.error(`Error al completar la tarea ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Intenta extraer un ObjectId válido de un ID compuesto
   * @param {string} compositeId - ID compuesto como "runTask_IMPLT_Carga_Pedidos_1748318836078"
   * @returns {string|null} - ObjectId extraído o null si no se encuentra
   */
  extractObjectIdFromCompositeId(compositeId) {
    try {
      const mongoose = require("mongoose");

      // Buscar patrones que podrían ser ObjectIds en el ID compuesto
      const parts = compositeId.split("_");

      for (const part of parts) {
        if (
          mongoose.Types.ObjectId.isValid(part) &&
          part.length === 24 &&
          /^[0-9a-fA-F]{24}$/.test(part)
        ) {
          return part;
        }
      }

      // Si no encontramos un ObjectId en las partes, intentar buscar la tarea por nombre
      // Extraer el nombre de la tarea del ID compuesto
      const taskNameMatch = compositeId.match(/runTask_(.+)_\d+$/);
      if (taskNameMatch) {
        const taskName = taskNameMatch[1];
        logger.debug(`Intentando buscar tarea por nombre: ${taskName}`);

        // Esta búsqueda debe ser síncrona para el contexto actual
        // En su lugar, devolvemos null y dejamos que el llamador maneje la búsqueda
        return null;
      }

      return null;
    } catch (error) {
      logger.debug(
        `Error al extraer ObjectId de ${compositeId}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Busca una tarea por nombre y actualiza su estado
   * @param {string} taskName - Nombre de la tarea
   * @param {string} status - Estado a actualizar
   */
  async updateTaskByName(taskName, status) {
    try {
      const updateData = {};

      if (status === "completed") {
        updateData.status = "completed";
        updateData.progress = 100;
      } else if (status === "cancelled") {
        updateData.status = "cancelled";
        updateData.progress = -1;
      } else if (status === "failed") {
        updateData.status = "error";
        updateData.progress = -1;
      }

      const result = await TransferTask.findOneAndUpdate(
        { name: taskName },
        updateData,
        { new: true }
      );

      if (result) {
        logger.info(
          `Tarea ${taskName} actualizada por nombre con estado: ${status}`
        );
        return result._id.toString();
      } else {
        logger.warn(`No se encontró tarea con nombre: ${taskName}`);
        return null;
      }
    } catch (error) {
      logger.error(`Error al actualizar tarea por nombre ${taskName}:`, error);
      return null;
    }
  }

  isTaskActive(taskId) {
    const status = this.cancellationService.getTaskStatus(taskId);
    return status.exists && status.isActiveProcess;
  }

  /**
   * Método mejorado para completar tareas que maneja tanto ObjectIds como IDs compuestos
   */
  async safeCompleteTask(taskId, status = "completed") {
    try {
      // Primero intentar el método normal
      return await this.completeTask(taskId, status);
    } catch (error) {
      if (error.name === "CastError" && error.path === "_id") {
        // Si es un error de casting de ObjectId, intentar extraer información útil
        logger.info(
          `Error de casting para ${taskId}, intentando métodos alternativos`
        );

        // Intentar extraer el nombre de la tarea del ID compuesto
        const taskNameMatch = taskId.match(/runTask_(.+)_\d+$/);
        if (taskNameMatch) {
          const taskName = taskNameMatch[1];
          const realTaskId = await this.updateTaskByName(taskName, status);

          if (realTaskId) {
            // Enviar progreso con el ID real
            if (typeof sendProgress === "function") {
              if (status === "completed") {
                sendProgress(realTaskId, 100, "completed");
              } else if (status === "cancelled") {
                sendProgress(realTaskId, -1, "cancelled");
              } else if (status === "failed") {
                sendProgress(realTaskId, -1, "error");
              }
            }
          }
        }

        // Limpiar del servicio de cancelación de todos modos
        this.cancellationService.removeTask(taskId);

        logger.info(`Tarea ${taskId} procesada con métodos alternativos`);
        return true;
      } else {
        throw error; // Re-lanzar si no es el error que esperamos
      }
    }
  }
}

module.exports = new TaskTracker();
