// services/initService.js
const logger = require("./logger");
const { initializeDefaultRecipients } = require("./emailRecipientService");

/**
 * Inicializa los servicios y datos necesarios al iniciar la aplicación
 */
const initializeServices = async () => {
  try {
    logger.info("Inicializando servicios...");

    // Inicializar destinatarios de correo por defecto
    await initializeDefaultRecipients();

    // Aquí se pueden agregar otras inicializaciones

    logger.info("Servicios inicializados correctamente");
  } catch (error) {
    logger.error("Error al inicializar servicios:", error);
  }
};

module.exports = { initializeServices };
