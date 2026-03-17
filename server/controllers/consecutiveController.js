const ConsecutiveService = require("../services/ConsecutiveService");
const Consecutive = require("../models/consecutiveModel");
const ConsecutiveMonitor = require("../services/consecutiveMonitor");
const logger = require("../services/logger");

/**
 * Obtiene todos los consecutivos con filtros
 */
const getConsecutives = async (req, res) => {
  try {
    const filter = {};
    if (req.query.active !== undefined) filter.active = req.query.active === "true";
    if (req.query.entityType && req.query.entityId) {
      filter["assignedTo.entityType"] = req.query.entityType;
      filter["assignedTo.entityId"] = req.query.entityId;
    }

    const consecutives = await ConsecutiveService.getConsecutives(filter);
    return res.status(200).json({
      success: true,
      message: "Consecutivos obtenidos correctamente",
      data: consecutives,
    });
  } catch (error) {
    logger.error("Error en getConsecutives:", error);
    return res.status(500).json({ success: false, message: "Error al obtener consecutivos", error: error.message });
  }
};

/**
 * Obtiene un consecutivo por ID
 */
const getConsecutiveById = async (req, res) => {
  try {
    const { id } = req.params;
    const consecutive = await ConsecutiveService.getConsecutiveById(id);
    if (!consecutive) return res.status(404).json({ success: false, message: "Consecutivo no encontrado" });

    return res.status(200).json({
      success: true,
      message: "Consecutivo obtenido correctamente",
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error en getConsecutiveById (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Crea un nuevo consecutivo
 */
const createConsecutive = async (req, res) => {
  try {
    const consecutiveData = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";
    consecutiveData.createdBy = userId;

    const consecutive = await ConsecutiveService.createConsecutive(consecutiveData, req.user);
    logger.info(`Consecutivo creado: ${consecutive.name} por ${userId}`);
    return res.status(201).json({
      success: true,
      message: "Consecutivo creado correctamente",
      data: consecutive,
    });
  } catch (error) {
    logger.error("Error en createConsecutive:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Actualiza un consecutivo existente
 */
const updateConsecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    const consecutive = await ConsecutiveService.updateConsecutive(id, req.body, req.user);
    logger.info(`Consecutivo actualizado: ${id} por ${userId}`);
    return res.status(200).json({
      success: true,
      message: "Consecutivo actualizado correctamente",
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error en updateConsecutive (${req.params.id}):`, error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Elimina un consecutivo
 */
const deleteConsecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    await ConsecutiveService.deleteConsecutive(id);
    logger.info(`Consecutivo eliminado: ${id} por ${userId}`);
    return res.status(200).json({ success: true, message: "Consecutivo eliminado correctamente" });
  } catch (error) {
    logger.error(`Error en deleteConsecutive (${req.params.id}):`, error);
    return res.status(404).json({ success: false, message: error.message });
  }
};

/**
 * Obtiene el siguiente valor de un consecutivo
 */
const getNextConsecutiveValue = async (req, res) => {
  try {
    const { id } = req.params;
    const { segment } = req.query;
    const nextValue = await ConsecutiveService.getNextConsecutiveValue(id, { segment }, req.user);

    return res.status(200).json({
      success: true,
      message: "Siguiente valor obtenido",
      data: { value: nextValue },
    });
  } catch (error) {
    logger.error(`Error en getNextConsecutiveValue (${req.params.id}):`, error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Reinicia un consecutivo a un valor específico
 */
const resetConsecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const { value = 0, segment = null } = req.query;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    const consecutive = await ConsecutiveService.resetConsecutive(id, parseInt(value), segment, req.user);

    logger.info(`Consecutivo ${id} reiniciado a ${value} por ${userId}`);
    return res.status(200).json({
      success: true,
      message: `Consecutivo reiniciado a ${value} correctamente`,
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error en resetConsecutive (${req.params.id}):`, error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Asigna un consecutivo a una entidad
 */
const assignConsecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    const consecutive = await ConsecutiveService.assignConsecutive(id, req.body, req.user);

    logger.info(`Consecutivo ${id} asignado por ${userId}`);
    return res.status(200).json({
      success: true,
      message: "Consecutivo asignado correctamente",
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error en assignConsecutive (${req.params.id}):`, error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Obtiene consecutivos asignados a una entidad
 */
const getConsecutivesByEntity = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const consecutives = await ConsecutiveService.getConsecutivesByEntity(entityType, entityId);

    return res.status(200).json({
      success: true,
      message: "Consecutivos de entidad obtenidos",
      data: consecutives,
    });
  } catch (error) {
    logger.error("Error en getConsecutivesByEntity:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Reserva múltiples valores consecutivos
 */
const reserveConsecutiveValues = async (req, res) => {
  try {
    const { consecutiveId, quantity, segment, reservedBy } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!consecutiveId || !quantity) return res.status(400).json({ success: false, message: "consecutiveId y quantity requeridos" });

    const result = await ConsecutiveService.reserveConsecutiveValues(
      consecutiveId,
      quantity,
      { segment },
      { id: req.user?.id || reservedBy || userId, name: req.user?.name || "system" }
    );

    return res.status(200).json({
      success: true,
      message: "Valores reservados correctamente",
      data: result,
    });
  } catch (error) {
    logger.error("Error en reserveConsecutiveValues:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Confirma una reserva
 */
const commitReservation = async (req, res) => {
  try {
    const { consecutiveId, reservationId, values } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!consecutiveId || !reservationId || !values) return res.status(400).json({ success: false, message: "Datos de confirmación incompletos" });

    const result = await ConsecutiveService.commitReservation(consecutiveId, reservationId, values);
    logger.info(`Reserva ${reservationId} confirmada por ${userId}`);
    return res.status(200).json({
      success: true,
      message: "Reserva confirmada exitosamente",
      data: result,
    });
  } catch (error) {
    logger.error("Error en commitReservation:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Cancela una reserva
 */
const cancelReservation = async (req, res) => {
  try {
    const { consecutiveId, reservationId } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!consecutiveId || !reservationId) return res.status(400).json({ success: false, message: "Datos de cancelación incompletos" });

    const result = await ConsecutiveService.cancelReservation(consecutiveId, reservationId);
    logger.info(`Reserva ${reservationId} cancelada por ${userId}`);
    return res.status(200).json({
      success: true,
      message: "Reserva cancelada correctamente",
      data: result,
    });
  } catch (error) {
    logger.error("Error en cancelReservation:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Limpia reservas expiradas
 */
const cleanupExpiredReservations = async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";
    await ConsecutiveService.cleanAllExpiredReservations();
    logger.info(`Limpieza de reservas expiradas ejecutada por ${userId}`);
    return res.status(200).json({ success: true, message: "Reservas expiradas limpiadas correctamente" });
  } catch (error) {
    logger.error("Error en cleanupExpiredReservations:", error);
    return res.status(500).json({ success: false, message: "Error interno al limpiar reservas", error: error.message });
  }
};

/**
 * Obtiene métricas de un consecutivo
 */
const getConsecutiveMetrics = async (req, res) => {
  try {
    const { consecutiveId } = req.params;
    const { timeRange = "24h" } = req.query;
    const metrics = await ConsecutiveMonitor.getConsecutiveMetrics(consecutiveId, timeRange);

    return res.status(200).json({
      success: true,
      message: "Métricas obtenidas correctamente",
      data: metrics,
    });
  } catch (error) {
    logger.error("Error en getConsecutiveMetrics:", error);
    return res.status(500).json({ success: false, message: "Error al obtener métricas", error: error.message });
  }
};

/**
 * Obtiene el dashboard de consecutivos
 */
const getDashboard = async (req, res) => {
  try {
    const consecutives = await Consecutive.find({ active: true }).lean();
    const dashboard = await Promise.all(consecutives.map(async (c) => {
      const metrics = await ConsecutiveMonitor.getConsecutiveMetrics(c._id, "24h");
      return {
        id: c._id,
        name: c.name,
        currentValue: c.currentValue,
        activeReservations: metrics.metrics?.activeReservations || 0,
        totalIncrements: metrics.metrics?.totalIncrements || 0,
        expiredReservations: metrics.metrics?.expiredReservations || 0,
      };
    }));

    return res.status(200).json({
      success: true,
      message: "Dashboard de consecutivos obtenido",
      data: dashboard,
    });
  } catch (error) {
    logger.error("Error en getDashboard:", error);
    return res.status(500).json({ success: false, message: "Error al generar dashboard", error: error.message });
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
