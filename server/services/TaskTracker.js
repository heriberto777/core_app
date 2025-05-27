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
      let isValidObjectId = false;

      // Verificar que sea string y tenga el formato correcto
      if (typeof taskId === "string") {
        try {
          // Verificar si es un ObjectId válido usando mongoose
          isValidObjectId =
            mongoose.Types.ObjectId.isValid(taskId) &&
            taskId.length === 24 &&
            /^[0-9a-fA-F]{24}$/i.test(taskId);
        } catch (validationError) {
          logger.debug(
            `Error en validación de ObjectId para ${taskId}: ${validationError.message}`
          );
          isValidObjectId = false;
        }
      }

      logger.debug(
        `TaskId: ${taskId}, tipo: ${typeof taskId}, longitud: ${
          taskId?.length
        }, esValidObjectId: ${isValidObjectId}`
      );

      if (isValidObjectId) {
        // Es un ObjectId válido de MongoDB, actualizar la base de datos
        logger.debug(
          `Actualizando tarea en BD: ${taskId} con estado: ${status}`
        );

        try {
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
            logger.debug(
              `Estado actualizado en BD para tarea ${taskId}: failed`
            );
          }
        } catch (updateError) {
          logger.error(
            `Error al actualizar tarea ${taskId} en BD: ${updateError.message}`
          );
        }
      } else {
        // Para IDs compuestos como "runTask_...", solo hacer logging
        logger.info(
          `Tarea con ID compuesto ${taskId} completada con estado: ${status} (no se actualiza BD)`
        );

        // Si el ID compuesto contiene información de tarea, intentar extraerla
        if (typeof taskId === "string" && taskId.includes("_")) {
          const extractedInfo = this.extractTaskInfoFromCompositeId(taskId);
          if (extractedInfo) {
            logger.info(
              `Información extraída de ${taskId}: ${JSON.stringify(
                extractedInfo
              )}`
            );

            try {
              const realTaskId = await this.updateTaskByName(
                extractedInfo.taskName,
                status
              );
              if (realTaskId) {
                logger.info(
                  `Tarea real ${realTaskId} actualizada basada en nombre ${extractedInfo.taskName}`
                );
              }
            } catch (extractError) {
              logger.warn(
                `No se pudo actualizar la tarea por nombre: ${extractError.message}`
              );
            }
          }
        }
      }

      // Enviar progreso final vía SSE si está disponible (funciona con cualquier tipo de ID)
      if (typeof sendProgress === "function") {
        try {
          if (status === "completed") {
            sendProgress(taskId, 100, "completed");
          } else if (status === "cancelled") {
            sendProgress(taskId, -1, "cancelled");
          } else if (status === "failed") {
            sendProgress(taskId, -1, "error");
          }
        } catch (progressError) {
          logger.debug(
            `Error enviando progreso para ${taskId}: ${progressError.message}`
          );
        }
      }

      // Confirmar la cancelación en el servicio unificado si fue cancelada
      if (status === "cancelled") {
        try {
          this.cancellationService.confirmCancellation(taskId, { status });
        } catch (confirmError) {
          logger.debug(
            `Error confirmando cancelación para ${taskId}: ${confirmError.message}`
          );
        }
      }

      logger.info(`Tarea ${taskId} completada con estado: ${status}`);
      return true;
    } catch (error) {
      logger.error(`Error al completar la tarea ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Intenta extraer información de la tarea de un ID compuesto
   * @param {string} compositeId - ID compuesto como "runTask_IMPLT_Carga_Pedidos_1748318836078"
   * @returns {Object|null} - Información extraída o null si no se encuentra
   */
  extractTaskInfoFromCompositeId(compositeId) {
    try {
      if (typeof compositeId !== "string") {
        logger.debug(`ID no es string: ${typeof compositeId}`);
        return null;
      }

      // Buscar patrones de nombres de tarea en el ID compuesto
      const patterns = [
        /^runTask_(.+)_\d+$/, // runTask_TASKNAME_timestamp
        /^batch_insert_(.+)_\d+$/, // batch_insert_TASKID_timestamp
        /^transfer_(.+)_\d+$/, // transfer_TASKNAME_timestamp
        /^(.+)_\d{13,}$/, // TASKNAME_timestamp (13+ dígitos para timestamp)
      ];

      for (const pattern of patterns) {
        const match = compositeId.match(pattern);
        if (match) {
          const extractedName = match[1];

          // Verificar si el nombre extraído parece ser un ObjectId
          const mongoose = require("mongoose");
          if (
            mongoose.Types.ObjectId.isValid(extractedName) &&
            extractedName.length === 24 &&
            /^[0-9a-fA-F]{24}$/i.test(extractedName)
          ) {
            return {
              type: "objectId",
              taskId: extractedName,
              taskName: null,
            };
          } else {
            return {
              type: "taskName",
              taskId: null,
              taskName: extractedName,
            };
          }
        }
      }

      logger.debug(
        `No se pudo extraer información del ID compuesto: ${compositeId}`
      );
      return null;
    } catch (error) {
      logger.debug(
        `Error al extraer información de ${compositeId}: ${error.message}`
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
      if (!taskName || typeof taskName !== "string") {
        logger.debug(`Nombre de tarea inválido: ${taskName}`);
        return null;
      }

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
        logger.debug(`No se encontró tarea con nombre: ${taskName}`);
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
        // Si es un error de casting de ObjectId, intentar métodos alternativos
        logger.info(
          `Error de casting para ${taskId}, intentando métodos alternativos`
        );

        // Intentar extraer información del ID
        const extractedInfo = this.extractTaskInfoFromCompositeId(taskId);
        if (extractedInfo) {
          if (extractedInfo.type === "objectId" && extractedInfo.taskId) {
            // Intentar actualizar con el ObjectId extraído
            try {
              await this.completeTask(extractedInfo.taskId, status);
              logger.info(
                `Tarea actualizada usando ObjectId extraído: ${extractedInfo.taskId}`
              );
            } catch (extractedError) {
              logger.warn(
                `Error actualizando con ObjectId extraído: ${extractedError.message}`
              );
            }
          } else if (
            extractedInfo.type === "taskName" &&
            extractedInfo.taskName
          ) {
            // Intentar actualizar por nombre
            const realTaskId = await this.updateTaskByName(
              extractedInfo.taskName,
              status
            );
            if (realTaskId) {
              logger.info(
                `Tarea actualizada por nombre: ${extractedInfo.taskName} -> ${realTaskId}`
              );
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
