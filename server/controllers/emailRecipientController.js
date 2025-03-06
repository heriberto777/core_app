// controllers/emailRecipientController.js
const EmailRecipientService = require("../services/emailRecipientService");
const logger = require("../services/logger");

/**
 * Obtiene todos los destinatarios de correo
 * @param {Request} req - Objeto de solicitud Express
 * @param {Response} res - Objeto de respuesta Express
 */
const getAllRecipients = async (req, res) => {
  try {
    const recipients = await EmailRecipientService.getAllRecipients();
    res.json(recipients);
  } catch (error) {
    logger.error("Error al obtener destinatarios de correo:", error);
    res.status(500).json({
      message: "Error al obtener destinatarios",
      error: error.message,
    });
  }
};

/**
 * Obtiene un destinatario de correo por ID
 * @param {Request} req - Objeto de solicitud Express
 * @param {Response} res - Objeto de respuesta Express
 */
const getRecipientById = async (req, res) => {
  try {
    const { id } = req.params;
    const recipient = await EmailRecipientService.getRecipientById(id);

    if (!recipient) {
      return res.status(404).json({ message: "Destinatario no encontrado" });
    }

    res.json(recipient);
  } catch (error) {
    logger.error(
      `Error al obtener destinatario de correo con ID ${req.params.id}:`,
      error
    );
    res
      .status(500)
      .json({ message: "Error al obtener destinatario", error: error.message });
  }
};

/**
 * Crea un nuevo destinatario de correo
 * @param {Request} req - Objeto de solicitud Express
 * @param {Response} res - Objeto de respuesta Express
 */
const createRecipient = async (req, res) => {
  try {
    const { name, email, notificationTypes, isSend, isActive } = req.body;

    // Validar datos obligatorios
    if (!name || !email) {
      return res
        .status(400)
        .json({ message: "El nombre y correo son obligatorios" });
    }

    // Crear el destinatario
    const newRecipient = await EmailRecipientService.addRecipient({
      name,
      email,
      notificationTypes,
      isSend,
      isActive,
    });

    res.status(201).json(newRecipient);
  } catch (error) {
    logger.error("Error al crear destinatario de correo:", error);

    // Verificar si es un error de duplicado
    if (error.message.includes("duplicate key") || error.code === 11000) {
      return res
        .status(400)
        .json({ message: "El correo electrónico ya está registrado" });
    }

    res
      .status(500)
      .json({ message: "Error al crear destinatario", error: error.message });
  }
};

/**
 * Actualiza un destinatario de correo
 * @param {Request} req - Objeto de solicitud Express
 * @param {Response} res - Objeto de respuesta Express
 */
const updateRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, notificationTypes, isSend, isActive } = req.body;

    // Validar que exista algún dato para actualizar
    if (
      !name &&
      !email &&
      !notificationTypes &&
      isSend === undefined &&
      isActive === undefined
    ) {
      return res
        .status(400)
        .json({ message: "No se proporcionaron datos para actualizar" });
    }

    // Construir el objeto con los datos a actualizar
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (notificationTypes) updateData.notificationTypes = notificationTypes;
    if (isSend !== undefined) updateData.isSend = isSend;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Actualizar el destinatario
    const updatedRecipient = await EmailRecipientService.updateRecipient(
      id,
      updateData
    );

    res.json(updatedRecipient);
  } catch (error) {
    logger.error(
      `Error al actualizar destinatario de correo con ID ${req.params.id}:`,
      error
    );

    // Verificar si es un error de duplicado
    if (error.message.includes("duplicate key") || error.code === 11000) {
      return res
        .status(400)
        .json({ message: "El correo electrónico ya está registrado" });
    }

    // Verificar si no se encontró el destinatario
    if (error.message.includes("No se encontró destinatario")) {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({
      message: "Error al actualizar destinatario",
      error: error.message,
    });
  }
};

/**
 * Elimina un destinatario de correo
 * @param {Request} req - Objeto de solicitud Express
 * @param {Response} res - Objeto de respuesta Express
 */
const deleteRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    await EmailRecipientService.deleteRecipient(id);
    res.json({ message: "Destinatario eliminado correctamente" });
  } catch (error) {
    logger.error(
      `Error al eliminar destinatario de correo con ID ${req.params.id}:`,
      error
    );

    // Verificar si no se encontró el destinatario
    if (error.message.includes("No se encontró destinatario")) {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({
      message: "Error al eliminar destinatario",
      error: error.message,
    });
  }
};

/**
 * Alterna el estado de envío de un destinatario (activar/desactivar)
 * @param {Request} req - Objeto de solicitud Express
 * @param {Response} res - Objeto de respuesta Express
 */
const toggleSendStatus = async (req, res) => {
  console.log(req.params);
  try {
    const { id } = req.params;
    const updatedRecipient = await EmailRecipientService.toggleSendStatus(id);
    res.json({
      message: `Estado de envío ${
        updatedRecipient.isSend ? "activado" : "desactivado"
      } correctamente`,
      recipient: updatedRecipient,
    });
  } catch (error) {
    logger.error(
      `Error al alternar estado de destinatario con ID ${req.params.id}:`,
      error
    );

    // Verificar si no se encontró el destinatario
    if (error.message.includes("No se encontró destinatario")) {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({
      message: "Error al alternar estado de envío",
      error: error.message,
    });
  }
};

/**
 * Inicializa destinatarios por defecto
 * @param {Request} req - Objeto de solicitud Express
 * @param {Response} res - Objeto de respuesta Express
 */
const initializeDefaultRecipients = async (req, res) => {
  try {
    await EmailRecipientService.initializeDefaultRecipients();
    res.json({
      message: "Destinatarios por defecto inicializados correctamente",
    });
  } catch (error) {
    logger.error("Error al inicializar destinatarios por defecto:", error);
    res.status(500).json({
      message: "Error al inicializar destinatarios",
      error: error.message,
    });
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
