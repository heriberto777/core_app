const ConsecutiveService = require("../services/ConsecutiveService");
const Consecutive = require("../models/consecutiveModel");
const ConsecutiveMonitor = require("../services/consecutiveMonitor");
const logger = require("../services/logger");

/**
 * Obtiene todos los consecutivos
 */
const getConsecutives = async (req, res) => {
  try {
    const filter = {};

    // Aplicar filtros si existen
    if (req.query.active !== undefined) {
      filter.active = req.query.active === "true";
    }

    if (req.query.entityType && req.query.entityId) {
      filter["assignedTo.entityType"] = req.query.entityType;
      filter["assignedTo.entityId"] = req.query.entityId;
    }

    const consecutives = await ConsecutiveService.getConsecutives(filter);

    res.json({
      success: true,
      data: consecutives,
    });
  } catch (error) {
    logger.error(`Error al obtener consecutivos: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene un consecutivo por ID
 */
const getConsecutiveById = async (req, res) => {
  try {
    const { id } = req.params;
    const consecutive = await ConsecutiveService.getConsecutiveById(id);

    res.json({
      success: true,
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error al obtener consecutivo: ${error.message}`);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Crea un nuevo consecutivo
 */
const createConsecutive = async (req, res) => {
  try {
    const consecutiveData = req.body;

    // Añadir información del usuario si existe
    if (req.user) {
      consecutiveData.createdBy = req.user.id;
    }

    const consecutive = await ConsecutiveService.createConsecutive(
      consecutiveData,
      req.user
    );

    res.status(201).json({
      success: true,
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error al crear consecutivo: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Actualiza un consecutivo existente
 */
const updateConsecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const consecutiveData = req.body;

    const consecutive = await ConsecutiveService.updateConsecutive(
      id,
      consecutiveData,
      req.user
    );

    res.json({
      success: true,
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error al actualizar consecutivo: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Elimina un consecutivo
 */
const deleteConsecutive = async (req, res) => {
  try {
    const { id } = req.params;
    await ConsecutiveService.deleteConsecutive(id);

    res.json({
      success: true,
      message: "Consecutivo eliminado correctamente",
    });
  } catch (error) {
    logger.error(`Error al eliminar consecutivo: ${error.message}`);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene el siguiente valor de un consecutivo
 */
const getNextConsecutiveValue = async (req, res) => {
  try {
    const { id } = req.params;
    const { segment } = req.query;

    const nextValue = await ConsecutiveService.getNextConsecutiveValue(
      id,
      { segment },
      req.user
    );

    res.json({
      success: true,
      data: {
        value: nextValue,
      },
    });
  } catch (error) {
    logger.error(`Error al obtener siguiente valor: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Reinicia un consecutivo a un valor específico
 */
const resetConsecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const { value = 0, segment = null } = req.query;

    const consecutive = await ConsecutiveService.resetConsecutive(
      id,
      parseInt(value),
      segment,
      req.user
    );

    res.json({
      success: true,
      data: consecutive,
      message: `Consecutivo reiniciado a ${value}`,
    });
  } catch (error) {
    logger.error(`Error al reiniciar consecutivo: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Asigna un consecutivo a una entidad
 */
const assignConsecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = req.body;

    const consecutive = await ConsecutiveService.assignConsecutive(
      id,
      assignment,
      req.user
    );

    res.json({
      success: true,
      data: consecutive,
      message: "Consecutivo asignado correctamente",
    });
  } catch (error) {
    logger.error(`Error al asignar consecutivo: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene consecutivos asignados a una entidad
 */
const getConsecutivesByEntity = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    const consecutives = await ConsecutiveService.getConsecutivesByEntity(
      entityType,
      entityId
    );

    res.json({
      success: true,
      data: consecutives,
    });
  } catch (error) {
    logger.error(`Error al obtener consecutivos por entidad: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Reserva múltiples valores consecutivos
 */
const reserveConsecutiveValues = async (req, res) => {
  try {
    const { consecutiveId, quantity, segment, reservedBy } = req.body;

    if (!consecutiveId || !quantity) {
      return res.status(400).json({
        success: false,
        message: "consecutiveId y quantity son requeridos",
      });
    }

    const result = await ConsecutiveService.reserveConsecutiveValues(
      consecutiveId,
      quantity,
      { segment },
      { id: req.user?.id || reservedBy, name: req.user?.name || "system" }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Error en reserva de lote: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Confirma una reserva de valores consecutivos
 */
const commitReservation = async (req, res) => {
  try {
    const { consecutiveId, reservationId, values } = req.body;

    if (!consecutiveId || !reservationId || !values) {
      return res.status(400).json({
        success: false,
        message: "Todos los campos son requeridos",
      });
    }

    const result = await ConsecutiveService.commitReservation(
      consecutiveId,
      reservationId,
      values
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Error al confirmar reserva: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Cancela una reserva no utilizada
 */
const cancelReservation = async (req, res) => {
  try {
    const { consecutiveId, reservationId } = req.body;

    if (!consecutiveId || !reservationId) {
      return res.status(400).json({
        success: false,
        message: "consecutiveId y reservationId son requeridos",
      });
    }

    const result = await ConsecutiveService.cancelReservation(
      consecutiveId,
      reservationId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Error al cancelar reserva: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Limpia reservas expiradas de todos los consecutivos
 */
const cleanupExpiredReservations = async (req, res) => {
  try {
    await ConsecutiveService.cleanAllExpiredReservations();

    res.json({
      success: true,
      message: "Reservas expiradas limpiadas correctamente",
    });
  } catch (error) {
    logger.error(`Error al limpiar reservas: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene métricas de un consecutivo
 */
const getConsecutiveMetrics = async (req, res) => {
  try {
    const { consecutiveId } = req.params;
    const { timeRange = "24h" } = req.query;

    const metrics = await ConsecutiveMonitor.getConsecutiveMetrics(
      consecutiveId,
      timeRange
    );

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error(`Error al obtener métricas: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene el dashboard de consecutivos
 */
const getDashboard = async (req, res) => {
  try {
    const consecutives = await Consecutive.find({ active: true });
    const dashboard = [];

    for (const consecutive of consecutives) {
      const metrics = await ConsecutiveMonitor.getConsecutiveMetrics(
        consecutive._id,
        "24h"
      );
      dashboard.push({
        id: consecutive._id,
        name: consecutive.name,
        currentValue: consecutive.currentValue,
        activeReservations: metrics.metrics.activeReservations,
        totalIncrements: metrics.metrics.totalIncrements,
        expiredReservations: metrics.metrics.expiredReservations,
      });
    }

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error(`Error al generar dashboard: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getConsecutives,
  getConsecutiveById,
  createConsecutive,
  updateConsecutive,
  deleteConsecutive,
  getNextConsecutiveValue,
  resetConsecutive,
  assignConsecutive,
  getConsecutivesByEntity,
  reserveConsecutiveValues,
  commitReservation,
  cancelReservation,
  cleanupExpiredReservations,
  getConsecutiveMetrics,
  getDashboard,
};
