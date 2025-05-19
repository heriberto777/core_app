// services/emailRecipientService.js
const EmailRecipient = require("../models/emailRecipientModel");
const logger = require("./logger");

/**
 * Obtiene la lista de correos electrónicos para un tipo de notificación específico
 * @param {string} notificationType - Tipo de notificación (traspaso, transferencias, erroresCriticos)
 * @returns {Promise<Array<string>>} - Lista de correos electrónicos
 */
const getRecipientEmails = async (notificationType) => {
  try {
    // Validar que el tipo de notificación sea válido
    if (
      !["traspaso", "transferencias", "erroresCriticos"].includes(
        notificationType
      )
    ) {
      logger.warn(`Tipo de notificación inválido: ${notificationType}`);
      return [];
    }

    // Construir la condición de búsqueda
    const filter = {
      isSend: true,
      isActive: true,
      [`notificationTypes.${notificationType}`]: true,
    };

    // Buscar los destinatarios que cumplen con las condiciones
    const recipients = await EmailRecipient.find(filter);

    if (!recipients || recipients.length === 0) {
      logger.warn(
        `No se encontraron destinatarios para notificaciones de tipo: ${notificationType}`
      );
      return [];
    }

    // Extraer los correos electrónicos
    const emails = recipients.map((recipient) => recipient.email);
    logger.debug(
      `Se encontraron ${emails.length} destinatarios para notificaciones de tipo: ${notificationType}`
    );

    return emails;
  } catch (error) {
    logger.error(
      `Error al obtener destinatarios para ${notificationType}:`,
      error
    );
    return [];
  }
};

/**
 * Agrega un nuevo destinatario de correo
 * @param {Object} recipientData - Datos del destinatario
 * @returns {Promise<Object>} - Destinatario creado
 */
const addRecipient = async (recipientData) => {
  try {
    const newRecipient = new EmailRecipient(recipientData);
    await newRecipient.save();
    logger.info(`Nuevo destinatario de correo agregado: ${newRecipient.email}`);
    return newRecipient;
  } catch (error) {
    logger.error(`Error al agregar destinatario:`, error);
    throw error;
  }
};

/**
 * Actualiza un destinatario existente
 * @param {string} id - ID del destinatario
 * @param {Object} updateData - Datos a actualizar
 * @returns {Promise<Object>} - Destinatario actualizado
 */
const updateRecipient = async (id, updateData) => {
  try {
    // Asegurar que no se puede modificar el correo a uno existente
    if (updateData.email) {
      const existingRecipient = await EmailRecipient.findOne({
        email: updateData.email,
        _id: { $ne: id },
      });

      if (existingRecipient) {
        throw new Error(
          `Ya existe un destinatario con el correo: ${updateData.email}`
        );
      }
    }

    // Agregar fecha de actualización
    updateData.updatedAt = new Date();

    const updatedRecipient = await EmailRecipient.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedRecipient) {
      throw new Error(`No se encontró destinatario con ID: ${id}`);
    }

    logger.info(`Destinatario actualizado: ${updatedRecipient.email}`);
    return updatedRecipient;
  } catch (error) {
    logger.error(`Error al actualizar destinatario:`, error);
    throw error;
  }
};

/**
 * Elimina un destinatario
 * @param {string} id - ID del destinatario
 * @returns {Promise<boolean>} - true si se eliminó correctamente
 */
const deleteRecipient = async (id) => {
  try {
    const result = await EmailRecipient.findByIdAndDelete(id);

    if (!result) {
      throw new Error(`No se encontró destinatario con ID: ${id}`);
    }

    logger.info(`Destinatario eliminado: ${result.email}`);
    return true;
  } catch (error) {
    logger.error(`Error al eliminar destinatario:`, error);
    throw error;
  }
};

/**
 * Obtiene todos los destinatarios
 * @param {Object} filter - Filtros opcionales
 * @returns {Promise<Array>} - Lista de destinatarios
 */
const getAllRecipients = async (filter = {}) => {
  try {
    const recipients = await EmailRecipient.find(filter);
    return recipients;
  } catch (error) {
    logger.error(`Error al obtener destinatarios:`, error);
    throw error;
  }
};

/**
 * Obtiene un destinatario por su ID
 * @param {string} id - ID del destinatario
 * @returns {Promise<Object>} - Destinatario encontrado
 */
const getRecipientById = async (id) => {
  try {
    const recipient = await EmailRecipient.findById(id);

    if (!recipient) {
      throw new Error(`No se encontró destinatario con ID: ${id}`);
    }

    return recipient;
  } catch (error) {
    logger.error(`Error al obtener destinatario por ID:`, error);
    throw error;
  }
};

/**
 * Alterna el estado de envío de correos para un destinatario
 * @param {string} id - ID del destinatario
 * @returns {Promise<Object>} - Destinatario actualizado
 */
const toggleSendStatus = async (id) => {
  try {
    const recipient = await EmailRecipient.findById(id);

    if (!recipient) {
      throw new Error(`No se encontró destinatario con ID: ${id}`);
    }

    recipient.isSend = !recipient.isSend;
    recipient.updatedAt = new Date();

    await recipient.save();

    logger.info(
      `Estado de envío actualizado para ${recipient.email}: ${
        recipient.isSend ? "Activado" : "Desactivado"
      }`
    );
    return recipient;
  } catch (error) {
    logger.error(`Error al alternar estado de envío:`, error);
    throw error;
  }
};

/**
 * Inicializa algunos destinatarios por defecto si no existen
 */
const initializeDefaultRecipients = async () => {
  try {
    const count = await EmailRecipient.countDocuments();

    if (count === 0) {
      logger.info("Inicializando destinatarios de correo por defecto...");

      // Crear destinatario por defecto para todos los tipos de notificación
      await addRecipient({
        name: "Admin",
        email: "heriberto777@gmail.com",
        notificationTypes: {
          traspaso: true,
          transferencias: true,
          erroresCriticos: true,
        },
        isSend: true,
      });

      logger.info("Destinatarios por defecto inicializados correctamente");
    }
  } catch (error) {
    logger.error("Error al inicializar destinatarios por defecto:", error);
  }
};

module.exports = {
  getRecipientEmails,
  addRecipient,
  updateRecipient,
  deleteRecipient,
  getAllRecipients,
  getRecipientById,
  toggleSendStatus,
  initializeDefaultRecipients,
};
