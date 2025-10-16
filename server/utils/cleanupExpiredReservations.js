// Crear un archivo: cleanupExpiredReservations.js
const ConsecutiveService = require("../services/ConsecutiveService");
const logger = require("../services/logger");

// Función para ejecutar limpieza
async function cleanupExpiredReservations() {
  try {
    logger.info("Iniciando limpieza de reservas expiradas...");
    await ConsecutiveService.cleanAllExpiredReservations();
    logger.info("Limpieza de reservas expiradas completada");
  } catch (error) {
    logger.error(`Error en limpieza de reservas: ${error.message}`);
  }
}

// Ejecutar cada 5 minutos
setInterval(cleanupExpiredReservations, 5 * 60 * 1000);

// Ejecutar inmediatamente al iniciar
cleanupExpiredReservations();

module.exports = { cleanupExpiredReservations };
