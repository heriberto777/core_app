// server/utils/dbUtils.js - MEJORADO CON MEJOR MANEJO DE ERRORES

const ConnectionCentralService = require("../services/ConnectionCentralService");
const logger = require("../services/logger");

async function withConnection(serverKey, callback) {
  let connection = null;
  const startTime = Date.now();

  try {
    await ConnectionCentralService.initialize();

    logger.debug(`Solicitando conexión para ${serverKey}...`);
    connection = await ConnectionCentralService.getConnection(serverKey);

    const acquireTime = Date.now() - startTime;
    logger.debug(`Conexión obtenida para ${serverKey} en ${acquireTime}ms`);

    const result = await callback(connection);
    return result;
  } catch (error) {
    const errorTime = Date.now() - startTime;
    logger.error(
      `Error en withConnection para ${serverKey} (${errorTime}ms):`,
      {
        message: error.message,
        code: error.code,
        state: error.state,
      }
    );
    throw error;
  } finally {
    if (connection) {
      try {
        await ConnectionCentralService.releaseConnection(connection);
        logger.debug(`Conexión liberada correctamente`);
      } catch (releaseError) {
        logger.warn(`Error liberando conexión: ${releaseError.message}`);
      }
    }
  }
}

module.exports = { withConnection };
