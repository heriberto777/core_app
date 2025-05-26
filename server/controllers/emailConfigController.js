// controllers/emailConfigController.js
const EmailConfigService = require("../services/emailConfigService");
const logger = require("../services/logger");

/**
 * Obtiene todas las configuraciones de email
 */
const getAllConfigs = async (req, res) => {
  try {
    const configs = await EmailConfigService.getAllConfigs();

    // No enviar las contraseñas en la respuesta
    const safeConfigs = configs.map((config) => {
      const configObj = config.toObject();
      if (configObj.auth && configObj.auth.pass) {
        configObj.auth.pass = "••••••••";
      }
      return configObj;
    });

    res.json(safeConfigs);
  } catch (error) {
    logger.error("Error al obtener configuraciones de email:", error);
    res.status(500).json({
      message: "Error al obtener configuraciones",
      error: error.message,
    });
  }
};

/**
 * Obtiene una configuración específica por ID
 */
const getConfigById = async (req, res) => {
  try {
    const { id } = req.params;
    const config = await EmailConfigService.getConfigById(id);

    if (!config) {
      return res.status(404).json({ message: "Configuración no encontrada" });
    }

    // No enviar la contraseña en la respuesta
    const safeConfig = config.toObject();
    if (safeConfig.auth && safeConfig.auth.pass) {
      safeConfig.auth.pass = "••••••••";
    }

    res.json(safeConfig);
  } catch (error) {
    logger.error(
      `Error al obtener configuración con ID ${req.params.id}:`,
      error
    );
    res.status(500).json({
      message: "Error al obtener configuración",
      error: error.message,
    });
  }
};

/**
 * Crea una nueva configuración de email
 */
const createConfig = async (req, res) => {
  try {
    const {
      name,
      host,
      port,
      secure,
      auth,
      from,
      isActive,
      isDefault,
      options,
    } = req.body;

    // Validar datos obligatorios
    if (!name || !host || !auth || !auth.user || !auth.pass || !from) {
      return res.status(400).json({
        message:
          "Los campos name, host, auth.user, auth.pass y from son obligatorios",
      });
    }

    const configData = {
      name,
      host,
      port: port || 587,
      secure: secure || false,
      auth,
      from,
      isActive: isActive !== undefined ? isActive : true,
      isDefault: isDefault || false,
      options: options || {},
    };

    const newConfig = await EmailConfigService.createConfig(configData);

    // No enviar la contraseña en la respuesta
    const safeConfig = newConfig.toObject();
    if (safeConfig.auth && safeConfig.auth.pass) {
      safeConfig.auth.pass = "••••••••";
    }

    res.status(201).json(safeConfig);
  } catch (error) {
    logger.error("Error al crear configuración de email:", error);

    if (error.message.includes("duplicate key") || error.code === 11000) {
      return res.status(400).json({
        message: "Ya existe una configuración con ese nombre",
      });
    }

    res.status(500).json({
      message: "Error al crear configuración",
      error: error.message,
    });
  }
};

/**
 * Actualiza una configuración de email
 */
const updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remover campos que no se pueden actualizar directamente
    delete updateData._id;
    delete updateData.createdAt;

    const updatedConfig = await EmailConfigService.updateConfig(id, updateData);

    // No enviar la contraseña en la respuesta
    const safeConfig = updatedConfig.toObject();
    if (safeConfig.auth && safeConfig.auth.pass) {
      safeConfig.auth.pass = "••••••••";
    }

    res.json(safeConfig);
  } catch (error) {
    logger.error(
      `Error al actualizar configuración con ID ${req.params.id}:`,
      error
    );

    if (error.message.includes("duplicate key") || error.code === 11000) {
      return res.status(400).json({
        message: "Ya existe una configuración con ese nombre",
      });
    }

    if (error.message.includes("No se encontró configuración")) {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({
      message: "Error al actualizar configuración",
      error: error.message,
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
    res.json({ message: "Configuración eliminada correctamente" });
  } catch (error) {
    logger.error(
      `Error al eliminar configuración con ID ${req.params.id}:`,
      error
    );

    if (error.message.includes("No se encontró configuración")) {
      return res.status(404).json({ message: error.message });
    }

    if (error.message.includes("No se puede eliminar la única configuración")) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({
      message: "Error al eliminar configuración",
      error: error.message,
    });
  }
};

/**
 * Establece una configuración como predeterminada
 */
const setAsDefault = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedConfig = await EmailConfigService.setAsDefault(id);

    // No enviar la contraseña en la respuesta
    const safeConfig = updatedConfig.toObject();
    if (safeConfig.auth && safeConfig.auth.pass) {
      safeConfig.auth.pass = "••••••••";
    }

    res.json({
      message: "Configuración establecida como predeterminada",
      config: safeConfig,
    });
  } catch (error) {
    logger.error(
      `Error al establecer configuración como predeterminada ${req.params.id}:`,
      error
    );

    if (error.message.includes("No se encontró configuración")) {
      return res.status(404).json({ message: error.message });
    }

    if (
      error.message.includes(
        "No se puede establecer como predeterminada una configuración inactiva"
      )
    ) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({
      message: "Error al establecer configuración como predeterminada",
      error: error.message,
    });
  }
};

/**
 * Prueba una configuración de email
 */
const testConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({
        message: "Es necesario proporcionar un email de prueba",
      });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      return res.status(400).json({
        message: "El formato del email de prueba no es válido",
      });
    }

    const result = await EmailConfigService.testConfig(id, testEmail);

    if (result) {
      res.json({
        message: "Correo de prueba enviado exitosamente",
        success: true,
      });
    } else {
      res.status(400).json({
        message: "Error al enviar correo de prueba",
        success: false,
      });
    }
  } catch (error) {
    logger.error(
      `Error al probar configuración con ID ${req.params.id}:`,
      error
    );

    if (error.message.includes("No se encontró configuración")) {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({
      message: "Error al probar configuración",
      error: error.message,
    });
  }
};

/**
 * Inicializa configuraciones por defecto
 */
const initializeDefaultConfigs = async (req, res) => {
  try {
    await EmailConfigService.initializeDefaultConfigs();
    res.json({
      message: "Configuraciones por defecto inicializadas correctamente",
    });
  } catch (error) {
    logger.error("Error al inicializar configuraciones por defecto:", error);
    res.status(500).json({
      message: "Error al inicializar configuraciones",
      error: error.message,
    });
  }
};

/**
 * Alterna el estado activo/inactivo de una configuración
 */
const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener configuración actual
    const currentConfig = await EmailConfigService.getConfigById(id);
    if (!currentConfig) {
      return res.status(404).json({ message: "Configuración no encontrada" });
    }

    // Alternar estado
    const updatedConfig = await EmailConfigService.updateConfig(id, {
      isActive: !currentConfig.isActive,
    });

    // No enviar la contraseña en la respuesta
    const safeConfig = updatedConfig.toObject();
    if (safeConfig.auth && safeConfig.auth.pass) {
      safeConfig.auth.pass = "••••••••";
    }

    res.json({
      message: `Configuración ${
        updatedConfig.isActive ? "activada" : "desactivada"
      } correctamente`,
      config: safeConfig,
    });
  } catch (error) {
    logger.error(
      `Error al alternar estado de configuración con ID ${req.params.id}:`,
      error
    );

    if (error.message.includes("No se encontró configuración")) {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({
      message: "Error al alternar estado de configuración",
      error: error.message,
    });
  }
};

/**
 * Limpia el cache de transporters
 */
const clearTransporterCache = async (req, res) => {
  try {
    const { clearTransporterCache } = require("../services/emailService");

    clearTransporterCache();

    res.json({
      message: "Cache de transporters limpiado correctamente",
      success: true,
    });
  } catch (error) {
    logger.error("Error al limpiar cache de transporters:", error);
    res.status(500).json({
      message: "Error al limpiar cache",
      error: error.message,
    });
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
  initializeDefaultConfigs,
  toggleStatus,
};
