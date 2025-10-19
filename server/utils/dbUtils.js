// server/utils/dbUtils.js - USAR SOLO ConnectionCentralService

const ConnectionCentralService = require("../services/ConnectionCentralService");
const logger = require("../services/logger");

async function withConnection(serverKey, callback) {
  let connection = null;

  try {
    // Asegurar que el servicio esté inicializado
    await ConnectionCentralService.initialize();

    connection = await ConnectionCentralService.getConnection(serverKey);
    const result = await callback(connection);
    return result;
  } catch (error) {
    logger.error(`Error en withConnection para ${serverKey}:`, error);
    throw error;
  } finally {
    if (connection) {
      await ConnectionCentralService.releaseConnection(connection);
    }
  }
}

module.exports = { withConnection };
