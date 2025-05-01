const ConsecutiveService = require("../services/ConsecutiveService");
const logger = require("../services/logger");

/**
 * Obtiene todos los consecutivos
 */
const getConsecutives = async (req, res) => {
  try {
    // Extraer filtros de la consulta
    const { active, entityType, entityId } = req.query;
    const filter = {};

    if (active !== undefined) {
      filter.active = active === "true";
    }

    if (entityType && entityId) {
      filter["assignedTo.entityType"] = entityType;
      filter["assignedTo.entityId"] = entityId;
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

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID del consecutivo",
      });
    }

    const consecutive = await ConsecutiveService.getConsecutiveById(id);

    res.json({
      success: true,
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error al obtener consecutivo por ID: ${error.message}`);
    res.status(error.message.includes("no encontrado") ? 404 : 500).json({
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

    if (!consecutiveData || !consecutiveData.name) {
      return res.status(400).json({
        success: false,
        message: "Datos de consecutivo incompletos",
      });
    }

    // Obtener información del usuario actual
    const user = {
      id: req.user?._id,
      name: req.user?.name || "Sistema",
    };

    const consecutive = await ConsecutiveService.createConsecutive(
      consecutiveData,
      user
    );

    res.status(201).json({
      success: true,
      message: "Consecutivo creado correctamente",
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error al crear consecutivo: ${error.message}`);
    res.status(error.message.includes("Ya existe") ? 409 : 500).json({
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

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID del consecutivo",
      });
    }

    if (!consecutiveData) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron datos para actualizar",
      });
    }

    // Obtener información del usuario actual
    const user = {
      id: req.user?._id,
      name: req.user?.name || "Sistema",
    };

    const consecutive = await ConsecutiveService.updateConsecutive(
      id,
      consecutiveData,
      user
    );

    res.json({
      success: true,
      message: "Consecutivo actualizado correctamente",
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error al actualizar consecutivo: ${error.message}`);
    res.status(error.message.includes("no encontrado") ? 404 : 500).json({
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

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID del consecutivo",
      });
    }

    const result = await ConsecutiveService.deleteConsecutive(id);

    res.json({
      success: true,
      message: "Consecutivo eliminado correctamente",
    });
  } catch (error) {
    logger.error(`Error al eliminar consecutivo: ${error.message}`);
    res.status(error.message.includes("no encontrado") ? 404 : 500).json({
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
    const { segment, companyId } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID o nombre del consecutivo",
      });
    }

    // Obtener información del usuario actual
    const user = {
      id: req.user?._id,
      name: req.user?.name || "Sistema",
    };

    const options = {
      segment,
      companyId,
    };

    const nextValue = await ConsecutiveService.getNextConsecutiveValue(
      id,
      options,
      user
    );

    res.json({
      success: true,
      data: {
        value: nextValue,
      },
    });
  } catch (error) {
    logger.error(
      `Error al obtener siguiente valor consecutivo: ${error.message}`
    );
    res.status(error.message.includes("no encontrado") ? 404 : 500).json({
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
    const { value, segment } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID del consecutivo",
      });
    }

    const initialValue = parseInt(value || "0", 10);

    // Obtener información del usuario actual
    const user = {
      id: req.user?._id,
      name: req.user?.name || "Sistema",
    };

    const consecutive = await ConsecutiveService.resetConsecutive(
      id,
      initialValue,
      segment,
      user
    );

    res.json({
      success: true,
      message: `Consecutivo reiniciado a ${initialValue}`,
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error al reiniciar consecutivo: ${error.message}`);
    res.status(error.message.includes("no encontrado") ? 404 : 500).json({
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
    const { entityType, entityId, allowedOperations } = req.body;

    if (!id || !entityType || !entityId) {
      return res.status(400).json({
        success: false,
        message:
          "Se requieren el ID del consecutivo, tipo de entidad e ID de entidad",
      });
    }

    // Obtener información del usuario actual
    const user = {
      id: req.user?._id,
      name: req.user?.name || "Sistema",
    };

    const assignment = {
      entityType,
      entityId,
      allowedOperations: allowedOperations || ["read", "increment"],
    };

    const consecutive = await ConsecutiveService.assignConsecutive(
      id,
      assignment,
      user
    );

    res.json({
      success: true,
      message: "Consecutivo asignado correctamente",
      data: consecutive,
    });
  } catch (error) {
    logger.error(`Error al asignar consecutivo: ${error.message}`);
    res.status(error.message.includes("no encontrado") ? 404 : 500).json({
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

    if (!entityType || !entityId) {
      return res.status(400).json({
        success: false,
        message: "Se requieren tipo de entidad e ID de entidad",
      });
    }

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
};
