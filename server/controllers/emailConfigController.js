const EmailConfigService = require("../services/emailConfigService");
const logger = require("../services/logger");

/**
 * Helper para limpiar datos sensibles (contraseñas)
 */
const sanitizeConfig = (config) => {
  if (!config) return null;
  const configObj = config.toObject ? config.toObject() : { ...config };
  if (configObj.auth?.pass) {
    configObj.auth.pass = "••••••••";
  }
  return configObj;
};

/**
 * Obtiene todas las configuraciones de email
 */
const getAllConfigs = async (req, res) => {
  try {
    const configs = await EmailConfigService.getAllConfigs();
    const data = configs.map(sanitizeConfig);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error("Error en getAllConfigs:", error);
    return res.status(500).json({ success: false, message: "Error al obtener configuraciones", error: error.message });
  }
};

/**
 * Obtiene una configuración específica por ID
 */
const getConfigById = async (req, res) => {
  try {
    const config = await EmailConfigService.getConfigById(req.params.id);
    if (!config) return res.status(404).json({ success: false, message: "Configuración no encontrada" });

    return res.status(200).json({ success: true, data: sanitizeConfig(config) });
  } catch (error) {
    logger.error(`Error en getConfigById (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al obtener configuración", error: error.message });
  }
};

/**
 * Crea una nueva configuración de email
 */
const createConfig = async (req, res) => {
  try {
    const configData = req.body;
    const newConfig = await EmailConfigService.createConfig({
      ...configData,
      isActive: configData.isActive !== undefined ? configData.isActive : true
    });

    logger.info(`Configuración de email creada: ${newConfig.name} por ${req.user?._id}`);
    return res.status(201).json({
      success: true,
      message: "Configuración creada exitosamente",
      data: sanitizeConfig(newConfig)
    });
  } catch (error) {
    logger.error("Error en createConfig:", error);
    const isDuplicate = error.message.includes("duplicate key") || error.code === 11000;
    return res.status(isDuplicate ? 409 : 500).json({
      success: false,
      message: isDuplicate ? "Ya existe una configuración con ese nombre" : "Error al crear configuración",
      error: error.message
    });
  }
};

/**
 * Actualiza una configuración de email
 */
const updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.createdAt;

    const updatedConfig = await EmailConfigService.updateConfig(id, updateData);
    logger.info(`Configuración de email actualizada: ${updatedConfig.name} por ${req.user?._id}`);

    return res.status(200).json({
      success: true,
      message: "Configuración actualizada exitosamente",
      data: sanitizeConfig(updatedConfig)
    });
  } catch (error) {
    logger.error(`Error en updateConfig (${req.params.id}):`, error);
    const isNotFound = error.message.includes("No se encontró configuración");
    const isDuplicate = error.message.includes("duplicate key") || error.code === 11000;

    return res.status(isNotFound ? 404 : (isDuplicate ? 409 : 500)).json({
      success: false,
      message: isNotFound ? "Configuración no encontrada" : (isDuplicate ? "El nombre ya está en uso" : "Error al actualizar"),
      error: error.message
    });
  }
};

/**
 * Elimina una configuración de email
 */
const deleteConfig = async (req, res) => {
  try {
    const { id } = req.params;
    await EmailConfigService.deleteConfig(id);
    logger.warn(`Configuración de email eliminada: ${id} por ${req.user?._id}`);

    return res.status(200).json({ success: true, message: "Configuración eliminada correctamente" });
  } catch (error) {
    logger.error(`Error en deleteConfig (${req.params.id}):`, error);
    const isNotFound = error.message.includes("No se encontró configuración");
    return res.status(isNotFound ? 404 : 400).json({ success: false, message: error.message });
  }
};

/**
 * Establece una configuración como predeterminada
 */
const setAsDefault = async (req, res) => {
  try {
    const updatedConfig = await EmailConfigService.setAsDefault(req.params.id);
    logger.info(`Configuración de email marcada como predeterminada: ${updatedConfig.name} por ${req.user?._id}`);

    return res.status(200).json({
      success: true,
      message: "Configuración establecida como predeterminada",
      data: sanitizeConfig(updatedConfig),
    });
  } catch (error) {
    logger.error(`Error en setAsDefault (${req.params.id}):`, error);
    const isNotFound = error.message.includes("No se encontró configuración");
    return res.status(isNotFound ? 404 : 400).json({ success: false, message: error.message });
  }
};

/**
 * Prueba una configuración de email
 */
const testConfig = async (req, res) => {
  try {
    const { testEmail } = req.body;
    await EmailConfigService.testConfig(req.params.id, testEmail);

    return res.status(200).json({
      success: true,
      message: "Correo de prueba enviado exitosamente"
    });
  } catch (error) {
    logger.error(`Error en testConfig (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Alterna el estado activo/inactivo de una configuración
 */
const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const currentConfig = await EmailConfigService.getConfigById(id);
    if (!currentConfig) return res.status(404).json({ success: false, message: "Configuración no encontrada" });

    const updatedConfig = await EmailConfigService.updateConfig(id, { isActive: !currentConfig.isActive });
    logger.info(`Estado de email config cambiado: ${updatedConfig.name} a ${updatedConfig.isActive} por ${req.user?._id}`);

    return res.status(200).json({
      success: true,
      message: `Configuración ${updatedConfig.isActive ? "activada" : "desactivada"} correctamente`,
      data: sanitizeConfig(updatedConfig),
    });
  } catch (error) {
    logger.error(`Error en toggleStatus (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al alternar estado", error: error.message });
  }
};

module.exports = {
  getAllConfigs,
  getConfigById,
  createConfig,
  updateConfig,
  deleteConfig,
  setAsDefault,
  testConfig,
  toggleStatus,
};
