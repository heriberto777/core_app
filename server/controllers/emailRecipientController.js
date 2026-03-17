const EmailRecipientService = require("../services/emailRecipientService");
const logger = require("../services/logger");

/**
 * Obtiene todos los destinatarios de correo
 */
const getAllRecipients = async (req, res) => {
  try {
    const recipients = await EmailRecipientService.getAllRecipients();
    return res.status(200).json({
      success: true,
      message: "Destinatarios obtenidos correctamente",
      data: recipients,
    });
  } catch (error) {
    logger.error("Error en getAllRecipients:", error);
    return res.status(500).json({ success: false, message: "Error al obtener destinatarios", error: error.message });
  }
};

/**
 * Obtiene un destinatario por ID
 */
const getRecipientById = async (req, res) => {
  try {
    const { id } = req.params;
    const recipient = await EmailRecipientService.getRecipientById(id);
    if (!recipient) return res.status(404).json({ success: false, message: "Destinatario no encontrado" });

    return res.status(200).json({
      success: true,
      message: "Destinatario obtenido correctamente",
      data: recipient,
    });
  } catch (error) {
    logger.error(`Error en getRecipientById (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al obtener destinatario", error: error.message });
  }
};

/**
 * Crea un nuevo destinatario
 */
const createRecipient = async (req, res) => {
  try {
    const { name, email, notificationTypes, isSend, isActive } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!name || !email) return res.status(400).json({ success: false, message: "Nombre y correo son obligatorios" });

    const newRecipient = await EmailRecipientService.addRecipient({
      name, email, notificationTypes, isSend, isActive
    });

    logger.info(`Destinatario creado: ${email} por ${userId}`);
    return res.status(201).json({
      success: true,
      message: "Destinatario creado correctamente",
      data: newRecipient,
    });
  } catch (error) {
    logger.error("Error en createRecipient:", error);
    if (error.message.includes("duplicate key") || error.code === 11000) {
      return res.status(400).json({ success: false, message: "El correo electrónico ya está registrado" });
    }
    return res.status(500).json({ success: false, message: "Error al crear destinatario", error: error.message });
  }
};

/**
 * Actualiza un destinatario
 */
const updateRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, notificationTypes, isSend, isActive } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!name && !email && !notificationTypes && isSend === undefined && isActive === undefined) {
      return res.status(400).json({ success: false, message: "No se proporcionaron datos para actualizar" });
    }

    const updatedRecipient = await EmailRecipientService.updateRecipient(id, {
      name, email, notificationTypes, isSend, isActive
    });

    logger.info(`Destinatario actualizado: ${id} por ${userId}`);
    return res.status(200).json({
      success: true,
      message: "Destinatario actualizado correctamente",
      data: updatedRecipient,
    });
  } catch (error) {
    logger.error(`Error en updateRecipient (${req.params.id}):`, error);
    if (error.message.includes("duplicate key") || error.code === 11000) {
      return res.status(400).json({ success: false, message: "El correo electrónico ya está registrado" });
    }
    if (error.message.includes("No se encontró destinatario")) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Error al actualizar", error: error.message });
  }
};

/**
 * Elimina un destinatario
 */
const deleteRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    await EmailRecipientService.deleteRecipient(id);
    logger.info(`Destinatario eliminado: ${id} por ${userId}`);
    return res.status(200).json({ success: true, message: "Destinatario eliminado correctamente" });
  } catch (error) {
    logger.error(`Error en deleteRecipient (${req.params.id}):`, error);
    if (error.message.includes("No se encontró destinatario")) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Error al eliminar", error: error.message });
  }
};

/**
 * Alterna el estado de envío
 */
const toggleSendStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    const updated = await EmailRecipientService.toggleSendStatus(id);
    const msg = `Estado de envío ${updated.isSend ? "activado" : "desactivado"} correctamente`;

    logger.info(`Toggle isSend para ${id} por ${userId}: ${updated.isSend}`);
    return res.status(200).json({
      success: true,
      message: msg,
      data: updated,
    });
  } catch (error) {
    logger.error(`Error en toggleSendStatus (${req.params.id}):`, error);
    if (error.message.includes("No se encontró destinatario")) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Error al alternar estado", error: error.message });
  }
};

/**
 * Inicializa destinatarios por defecto
 */
const initializeDefaultRecipients = async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";
    await EmailRecipientService.initializeDefaultRecipients();
    logger.info(`Destinatarios por defecto inicializados por ${userId}`);
    return res.status(200).json({ success: true, message: "Destinatarios por defecto inicializados correctamente" });
  } catch (error) {
    logger.error("Error en initializeDefaultRecipients:", error);
    return res.status(500).json({ success: false, message: "Error al inicializar destinatarios", error: error.message });
  }
};

module.exports = {
  getAllRecipients,
  getRecipientById,
  createRecipient,
  updateRecipient,
  deleteRecipient,
  toggleSendStatus,
  initializeDefaultRecipients,
};
