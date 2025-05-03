const Consecutive = require("../models/consecutiveModel");
const logger = require("./logger");
const mongoose = require("mongoose");
const { setTimeout } = require("timers/promises");

class ConsecutiveService {
  /**
   * Reserva un bloque de números consecutivos
   * @param {string} entityType - Tipo de entidad ('mapping', 'company', etc.)
   * @param {string} entityId - ID de la entidad
   * @param {number} quantity - Cantidad de números a reservar
   * @param {object} options - Opciones adicionales
   * @returns {Promise<object>} - Objeto con el bloque reservado
   */
  async reserveBlock(entityType, entityId, quantity, options = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Buscar el consecutivo asignado a la entidad
      const consecutive = await Consecutive.findOne({
        "assignedTo.entityType": entityType,
        "assignedTo.entityId": entityId,
        active: true,
      }).session(session);

      if (!consecutive) {
        throw new Error(
          `No hay consecutivo configurado para ${entityType}/${entityId}`
        );
      }

      // Calcular segmento si está habilitado
      const segmentValue =
        options.segment || this._calculateSegment(consecutive);

      // Intentar reserva con reintentos
      const maxRetries = 3;
      let attempt = 0;
      let lastError;

      while (attempt < maxRetries) {
        attempt++;
        try {
          const block = await consecutive.reserveBlock(quantity, {
            ...options,
            entityId,
            segment: segmentValue,
            processId: options.processId || "consecutive-service",
            user: options.user || { id: "system", name: "ConsecutiveService" },
          });

          await session.commitTransaction();
          return block;
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            await setTimeout(200 * attempt); // Espera exponencial
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error reservando bloque consecutivo: ${error.message}`, {
        entityType,
        entityId,
        quantity,
        error: error.stack,
      });
      throw new Error(`No se pudo reservar el bloque: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  /**
   * Obtiene el siguiente valor consecutivo
   * @param {string} consecutiveId - ID del consecutivo
   * @param {object} options - Opciones (segment, format, etc.)
   * @returns {Promise<string>} - Valor formateado
   */
  async getNextValue(consecutiveId, options = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const consecutive = await Consecutive.findById(consecutiveId).session(
        session
      );
      if (!consecutive) {
        throw new Error("Consecutivo no encontrado");
      }

      const segmentValue =
        options.segment || this._calculateSegment(consecutive);
      const formattedValue = consecutive.getNextValue(segmentValue);

      consecutive.history.push({
        action: "increment",
        value: consecutive.currentValue,
        segment: segmentValue,
        user: options.user || { id: "system", name: "ConsecutiveService" },
      });

      await consecutive.save({ session });
      await session.commitTransaction();

      return formattedValue;
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        `Error obteniendo siguiente valor consecutivo: ${error.message}`,
        {
          consecutiveId,
          error: error.stack,
        }
      );
      throw new Error(
        `No se pudo obtener el siguiente valor: ${error.message}`
      );
    } finally {
      session.endSession();
    }
  }

  /**
   * Usa un valor de un bloque reservado
   * @param {string} blockId - ID del bloque reservado
   * @param {object} options - Opciones (entityId, user, etc.)
   * @returns {Promise<string>} - Valor formateado
   */
  async useFromBlock(blockId, options = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const consecutive = await Consecutive.findOne({
        "blockReservations.blockId": blockId,
      }).session(session);

      if (!consecutive) {
        throw new Error("Bloque de consecutivos no encontrado");
      }

      const formattedValue = await consecutive.useFromBlock(blockId, {
        user: options.user || { id: "system", name: "ConsecutiveService" },
      });

      await session.commitTransaction();
      return formattedValue;
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        `Error usando valor de bloque consecutivo: ${error.message}`,
        {
          blockId,
          error: error.stack,
        }
      );
      throw new Error(`No se pudo usar el valor del bloque: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  /**
   * Obtiene los consecutivos asignados a una entidad
   * @param {string} entityType - Tipo de entidad
   * @param {string} entityId - ID de la entidad
   * @returns {Promise<Array>} - Lista de consecutivos
   */
  async getConsecutivesByEntity(entityType, entityId) {
    try {
      return await Consecutive.findByEntity(entityType, entityId);
    } catch (error) {
      logger.error(
        `Error obteniendo consecutivos por entidad: ${error.message}`,
        {
          entityType,
          entityId,
          error: error.stack,
        }
      );
      throw new Error(
        `No se pudieron obtener los consecutivos: ${error.message}`
      );
    }
  }

  /**
   * Crea un nuevo consecutivo
   * @param {object} data - Datos del consecutivo
   * @returns {Promise<object>} - Consecutivo creado
   */
  async createConsecutive(data) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validar formato único
      const exists = await Consecutive.findOne({ code: data.code }).session(
        session
      );
      if (exists) {
        throw new Error("Ya existe un consecutivo con este código");
      }

      const consecutive = new Consecutive({
        ...data,
        createdBy: data.user?.id || "system",
        updatedBy: data.user?.id || "system",
      });

      consecutive.history.push({
        action: "create",
        user: data.user || { id: "system", name: "ConsecutiveService" },
      });

      await consecutive.save({ session });
      await session.commitTransaction();

      return consecutive;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error creando consecutivo: ${error.message}`, {
        data,
        error: error.stack,
      });
      throw new Error(`No se pudo crear el consecutivo: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  /**
   * Actualiza un consecutivo existente
   * @param {string} consecutiveId - ID del consecutivo
   * @param {object} updates - Campos a actualizar
   * @returns {Promise<object>} - Consecutivo actualizado
   */
  async updateConsecutive(consecutiveId, updates) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const consecutive = await Consecutive.findById(consecutiveId).session(
        session
      );
      if (!consecutive) {
        throw new Error("Consecutivo no encontrado");
      }

      Object.assign(consecutive, updates, {
        updatedBy: updates.user?.id || "system",
        updatedAt: new Date(),
      });

      consecutive.history.push({
        action: "update",
        user: updates.user || { id: "system", name: "ConsecutiveService" },
        metadata: { updates },
      });

      await consecutive.save({ session });
      await session.commitTransaction();

      return consecutive;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error actualizando consecutivo: ${error.message}`, {
        consecutiveId,
        updates,
        error: error.stack,
      });
      throw new Error(`No se pudo actualizar el consecutivo: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  /**
   * Obtiene información de un bloque reservado
   * @param {string} blockId - ID del bloque
   * @returns {Promise<object>} - Información del bloque
   */
  async getBlockInfo(blockId) {
    try {
      const consecutive = await Consecutive.findOne({
        "blockReservations.blockId": blockId,
      });

      if (!consecutive) {
        throw new Error("Bloque no encontrado");
      }

      const block = consecutive.blockReservations.id(blockId);
      return {
        blockId: block.blockId,
        startValue: block.startValue,
        endValue: block.endValue,
        usedValues: block.usedValues.length,
        available:
          block.endValue - block.startValue + 1 - block.usedValues.length,
        status: block.status,
        segment: block.segment,
        consecutive: {
          id: consecutive._id,
          name: consecutive.name,
          code: consecutive.code,
        },
      };
    } catch (error) {
      logger.error(`Error obteniendo información de bloque: ${error.message}`, {
        blockId,
        error: error.stack,
      });
      throw new Error(
        `No se pudo obtener la información del bloque: ${error.message}`
      );
    }
  }

  // Métodos privados
  _calculateSegment(consecutive) {
    if (!consecutive.segments.enabled) return null;

    const now = new Date();
    switch (consecutive.segments.type) {
      case "year":
        return now.getFullYear().toString();
      case "month":
        return `${now.getFullYear()}${(now.getMonth() + 1)
          .toString()
          .padStart(2, "0")}`;
      case "day":
        return `${now.getFullYear()}${(now.getMonth() + 1)
          .toString()
          .padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}`;
      default:
        return null;
    }
  }

  /**
   * Libera un bloque no utilizado
   * @param {string} blockId - ID del bloque
   * @returns {Promise<boolean>} - True si se liberó correctamente
   */
  async releaseBlock(blockId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const consecutive = await Consecutive.findOne({
        "blockReservations.blockId": blockId,
        "blockReservations.status": { $in: ["reserved", "active"] },
      }).session(session);

      if (!consecutive) {
        throw new Error("Bloque no encontrado o ya completado");
      }

      const block = consecutive.blockReservations.id(blockId);
      block.status = "cancelled";

      consecutive.history.push({
        action: "release",
        value: block.startValue,
        endValue: block.endValue,
        segment: block.segment,
        user: { id: "system", name: "ConsecutiveService" },
        metadata: { blockId },
      });

      await consecutive.save({ session });
      await session.commitTransaction();

      return true;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error liberando bloque: ${error.message}`, {
        blockId,
        error: error.stack,
      });
      throw new Error(`No se pudo liberar el bloque: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  /**
   * Formatea un valor manualmente
   * @param {string} consecutiveId - ID del consecutivo
   * @param {number} value - Valor a formatear
   * @param {object} options - Opciones (segment, etc.)
   * @returns {Promise<string>} - Valor formateado
   */
  async formatValue(consecutiveId, value, options = {}) {
    try {
      const consecutive = await Consecutive.findById(consecutiveId);
      if (!consecutive) {
        throw new Error("Consecutivo no encontrado");
      }

      const segmentValue =
        options.segment || this._calculateSegment(consecutive);
      return consecutive.formatValue(value, segmentValue);
    } catch (error) {
      logger.error(`Error formateando valor: ${error.message}`, {
        consecutiveId,
        value,
        error: error.stack,
      });
      throw new Error(`No se pudo formatear el valor: ${error.message}`);
    }
  }

  /**
   * Verifica la disponibilidad de un bloque
   * @param {string} blockId - ID del bloque
   * @returns {Promise<object>} - Estado del bloque
   */
  async checkBlockAvailability(blockId) {
    try {
      const consecutive = await Consecutive.findOne({
        "blockReservations.blockId": blockId,
      });

      if (!consecutive) {
        throw new Error("Bloque no encontrado");
      }

      const block = consecutive.blockReservations.id(blockId);
      const available =
        block.endValue - block.startValue + 1 - block.usedValues.length;

      return {
        blockId: block.blockId,
        status: block.status,
        startValue: block.startValue,
        endValue: block.endValue,
        used: block.usedValues.length,
        available,
        percentageUsed: Math.round(
          (block.usedValues.length / (block.endValue - block.startValue + 1)) *
            100
        ),
      };
    } catch (error) {
      logger.error(
        `Error verificando disponibilidad de bloque: ${error.message}`,
        {
          blockId,
          error: error.stack,
        }
      );
      throw new Error(
        `No se pudo verificar la disponibilidad: ${error.message}`
      );
    }
  }
}

module.exports = new ConsecutiveService();
