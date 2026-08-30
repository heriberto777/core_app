const ClusterBaseSQLService = require("../services/ClusterBaseSQLService");
const logger = require("../services/logger");

async function getClusterBase(req, res) {
  try {
    const data = await ClusterBaseSQLService.getAllClusterBase();
    return res.status(200).json({
      success: true,
      message: "Objetivos base obtenidos correctamente",
      data,
    });
  } catch (error) {
    logger.error("Error en getClusterBase:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener los objetivos base",
      error: error.message,
    });
  }
}

async function createClusterBase(req, res) {
  try {
    const { bronzeBase, silverBase, goldBase, organization } = req.body;
    if (!organization?.trim()) {
      return res.status(400).json({ success: false, message: "La organización es obligatoria" });
    }
    const data = await ClusterBaseSQLService.createClusterBase({ bronzeBase, silverBase, goldBase, organization });
    return res.status(201).json({
      success: true,
      message: "Objetivos base creados correctamente",
      data,
    });
  } catch (error) {
    logger.error("Error en createClusterBase:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al crear los objetivos base",
    });
  }
}

async function updateClusterBase(req, res) {
  try {
    const { bronzeBase, silverBase, goldBase } = req.body;
    const data = await ClusterBaseSQLService.updateClusterBase(req.params.organization, {
      bronzeBase,
      silverBase,
      goldBase,
    });
    return res.status(200).json({
      success: true,
      message: "Objetivos base actualizados correctamente",
      data,
    });
  } catch (error) {
    logger.error("Error en updateClusterBase:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al actualizar los objetivos base",
    });
  }
}

async function deleteClusterBase(req, res) {
  try {
    await ClusterBaseSQLService.deleteClusterBase(req.params.organization);
    return res.status(200).json({
      success: true,
      message: "Objetivos base eliminados correctamente",
    });
  } catch (error) {
    logger.error("Error en deleteClusterBase:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al eliminar los objetivos base",
    });
  }
}

module.exports = {
  getClusterBase,
  createClusterBase,
  updateClusterBase,
  deleteClusterBase,
};
