const Consecutive = require("../models/consecutiveModel");
const logger = require("./logger");
const mongoose = require("mongoose");

class ConsecutiveService {
  /**
   * Obtiene todos los consecutivos
   * @param {Object} filter - Filtros opcionales
   * @returns {Promise<Array>} - Lista de consecutivos
   */
  static async getConsecutives(filter = {}) {
    try {
      return await Consecutive.find(filter);
    } catch (error) {
      logger.error(`Error al obtener consecutivos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene un consecutivo por ID
   * @param {string} id - ID del consecutivo
   * @returns {Promise<Object>} - Consecutivo encontrado
   */
  static async getConsecutiveById(id) {
    try {
      const consecutive = await Consecutive.findById(id);
      if (!consecutive) {
        throw new Error(`Consecutivo con ID ${id} no encontrado`);
      }
      return consecutive;
    } catch (error) {
      logger.error(`Error al obtener consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene un consecutivo por nombre
   * @param {string} name - Nombre del consecutivo
   * @returns {Promise<Object>} - Consecutivo encontrado
   */
  static async getConsecutiveByName(name) {
    try {
      const consecutive = await Consecutive.findOne({ name });
      if (!consecutive) {
        throw new Error(`Consecutivo con nombre ${name} no encontrado`);
      }
      return consecutive;
    } catch (error) {
      logger.error(`Error al obtener consecutivo por nombre: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crea un nuevo consecutivo
   * @param {Object} data - Datos del consecutivo
   * @param {Object} user - Usuario que realiza la acción
   * @returns {Promise<Object>} - Consecutivo creado
   */
  static async createConsecutive(data, user = {}) {
    try {
      // Verificar si ya existe un consecutivo con el mismo nombre
      const exists = await Consecutive.findOne({ name: data.name });
      if (exists) {
        throw new Error(`Ya existe un consecutivo con el nombre ${data.name}`);
      }

      // Preparar datos iniciales
      const consecutiveData = {
        ...data,
        createdBy: user.id,
        history: [
          {
            date: new Date(),
            action: "created",
            value: data.currentValue || 0,
            performedBy: {
              userId: user.id,
              userName: user.name || "System",
            },
          },
        ],
      };

      // Crear el consecutivo
      const consecutive = new Consecutive(consecutiveData);
      await consecutive.save();

      logger.info(`Consecutivo ${consecutive.name} creado correctamente`);
      return consecutive;
    } catch (error) {
      logger.error(`Error al crear consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza un consecutivo existente
   * @param {string} id - ID del consecutivo
   * @param {Object} data - Datos a actualizar
   * @param {Object} user - Usuario que realiza la acción
   * @returns {Promise<Object>} - Consecutivo actualizado
   */
  static async updateConsecutive(id, data, user = {}) {
    try {
      const consecutive = await this.getConsecutiveById(id);

      // Guardar valor anterior para registro
      const oldValue = consecutive.currentValue;

      // Actualizar campos
      Object.keys(data).forEach((key) => {
        if (key !== "_id" && key !== "history" && key !== "createdAt") {
          consecutive[key] = data[key];
        }
      });

      // Agregar a historial
      consecutive.history.push({
        date: new Date(),
        action: "updated",
        value: consecutive.currentValue,
        performedBy: {
          userId: user.id,
          userName: user.name || "System",
        },
      });

      await consecutive.save();
      logger.info(`Consecutivo ${consecutive.name} actualizado correctamente`);
      return consecutive;
    } catch (error) {
      logger.error(`Error al actualizar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Elimina un consecutivo
   * @param {string} id - ID del consecutivo
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async deleteConsecutive(id) {
    try {
      const result = await Consecutive.findByIdAndDelete(id);
      if (!result) {
        throw new Error(`Consecutivo con ID ${id} no encontrado`);
      }
      logger.info(`Consecutivo ${result.name} eliminado correctamente`);
      return true;
    } catch (error) {
      logger.error(`Error al eliminar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene el siguiente valor de un consecutivo
   * @param {string} idOrName - ID o nombre del consecutivo
   * @param {Object} options - Opciones adicionales
   * @param {Object} user - Usuario que realiza la acción
   * @returns {Promise<string>} - Siguiente valor formateado
   */
  static async getNextConsecutiveValue(idOrName, options = {}, user = {}) {
    try {
      // Buscar consecutivo por ID o por nombre
      let consecutive;
      if (mongoose.Types.ObjectId.isValid(idOrName)) {
        consecutive = await this.getConsecutiveById(idOrName);
      } else {
        consecutive = await this.getConsecutiveByName(idOrName);
      }

      // Verificar que esté activo
      if (!consecutive.active) {
        throw new Error(`El consecutivo ${consecutive.name} está desactivado`);
      }

      // Verificar permisos si hay asignaciones
      if (consecutive.assignedTo.length > 0 && user.id) {
        const hasPermission = consecutive.assignedTo.some(
          (assignment) =>
            assignment.entityType === "user" &&
            assignment.entityId.equals(user.id) &&
            assignment.allowedOperations.includes("increment")
        );

        if (!hasPermission) {
          throw new Error(
            `El usuario no tiene permiso para incrementar este consecutivo`
          );
        }
      }

      // Obtener el segmento si es necesario
      let segmentValue = null;
      if (consecutive.segments.enabled) {
        if (options.segment) {
          segmentValue = options.segment;
        } else if (consecutive.segments.type === "year") {
          segmentValue = new Date().getFullYear().toString();
        } else if (consecutive.segments.type === "month") {
          const date = new Date();
          segmentValue = `${date.getFullYear()}${(date.getMonth() + 1)
            .toString()
            .padStart(2, "0")}`;
        } else if (
          consecutive.segments.type === "company" &&
          options.companyId
        ) {
          segmentValue = options.companyId;
        } else if (consecutive.segments.type === "user" && user.id) {
          segmentValue = user.id.toString();
        }
      }

      // Obtener el siguiente valor
      const nextValue = consecutive.getNextValue(segmentValue);

      // Actualizar la información del usuario que realizó la acción
      if (user.id) {
        consecutive.history[consecutive.history.length - 1].performedBy = {
          userId: user.id,
          userName: user.name || "Unknown",
        };
      }

      // Guardar los cambios
      await consecutive.save();

      return nextValue;
    } catch (error) {
      logger.error(
        `Error al obtener siguiente valor consecutivo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Reinicia un consecutivo a un valor específico
   * @param {string} id - ID del consecutivo
   * @param {number} value - Valor inicial
   * @param {string} segment - Segmento (opcional)
   * @param {Object} user - Usuario que realiza la acción
   * @returns {Promise<Object>} - Consecutivo actualizado
   */
  static async resetConsecutive(id, value = 0, segment = null, user = {}) {
    try {
      const consecutive = await this.getConsecutiveById(id);

      // Verificar permisos si hay asignaciones
      if (consecutive.assignedTo.length > 0 && user.id) {
        const hasPermission = consecutive.assignedTo.some(
          (assignment) =>
            assignment.entityType === "user" &&
            assignment.entityId.equals(user.id) &&
            assignment.allowedOperations.includes("reset")
        );

        if (!hasPermission) {
          throw new Error(
            `El usuario no tiene permiso para reiniciar este consecutivo`
          );
        }
      }

      // Reiniciar valor global o específico por segmento
      if (consecutive.segments.enabled && segment) {
        consecutive.segments.values.set(segment, value);
      } else {
        consecutive.currentValue = value;
      }

      // Registrar acción en historial
      consecutive.history.push({
        date: new Date(),
        action: "reset",
        value: value,
        segment: segment,
        performedBy: {
          userId: user.id,
          userName: user.name || "System",
        },
      });

      await consecutive.save();
      logger.info(`Consecutivo ${consecutive.name} reiniciado a ${value}`);
      return consecutive;
    } catch (error) {
      logger.error(`Error al reiniciar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Asigna un consecutivo a una entidad
   * @param {string} id - ID del consecutivo
   * @param {Object} assignment - Datos de asignación
   * @returns {Promise<Object>} - Consecutivo actualizado
   */
  static async assignConsecutive(id, assignment, user = {}) {
    try {
      const consecutive = await this.getConsecutiveById(id);

      // Verificar si ya existe esta asignación
      const exists = consecutive.assignedTo.some(
        (a) =>
          a.entityType === assignment.entityType &&
          a.entityId.equals(assignment.entityId)
      );

      if (!exists) {
        consecutive.assignedTo.push(assignment);

        // Registrar en historial
        consecutive.history.push({
          date: new Date(),
          action: "updated",
          value: consecutive.currentValue,
          performedBy: {
            userId: user.id,
            userName: user.name || "System",
          },
        });

        await consecutive.save();
      }

      return consecutive;
    } catch (error) {
      logger.error(`Error al asignar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Devuelve los consecutivos asignados a una entidad
   * @param {string} entityType - Tipo de entidad
   * @param {string} entityId - ID de la entidad
   * @returns {Promise<Array>} - Lista de consecutivos asignados
   */
  static async getConsecutivesByEntity(entityType, entityId) {
    try {
      return await Consecutive.find({
        "assignedTo.entityType": entityType,
        "assignedTo.entityId": entityId,
      });
    } catch (error) {
      logger.error(
        `Error al obtener consecutivos por entidad: ${error.message}`
      );
      throw error;
    }
  }
}

module.exports = ConsecutiveService;
