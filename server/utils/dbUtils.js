// utils/dbUtils.js
const ConnectionManager = require("../services/ConnectionManager");
const logger = require("../services/logger");

/**
 * Ejecuta una operación con una conexión a base de datos, asegurando que
 * la conexión sea adquirida y liberada correctamente
 *
 * @param {string} serverKey - Servidor al que conectarse (server1, server2)
 * @param {Function} operation - Función a ejecutar con la conexión (debe recibir connection como parámetro)
 * @returns {Promise<any>} - El resultado de la operación
 */
async function withConnection(serverKey, operation) {
  let connection = null;
  try {
    logger.debug(`Intentando conectar a ${serverKey}...`);
    connection = await ConnectionManager.getConnection(serverKey);

    if (!connection) {
      throw new Error(
        `No se pudo establecer una conexión válida con ${serverKey}`
      );
    }

    logger.info(`Conexión establecida correctamente a ${serverKey}`);

    // Ejecutar la operación pasando la conexión
    return await operation(connection);
  } catch (error) {
    // Capturar y propagar cualquier error
    logger.error(`Error en operación con conexión a ${serverKey}:`, error);
    throw error;
  } finally {
    // Garantizar que siempre se libera la conexión
    if (connection) {
      try {
        await ConnectionManager.releaseConnection(connection);
        logger.debug(`Conexión a ${serverKey} liberada correctamente`);
      } catch (closeError) {
        logger.error(`Error al cerrar conexión a ${serverKey}:`, closeError);
      }
    }
  }
}

/**
 * Ejecuta una operación dentro de una transacción
 * @param {Connection} connection - Conexión a la base de datos
 * @param {Function} operation - Función que recibe la conexión
 * @returns {Promise<any>} - Resultado de la operación
 */
async function withTransaction(connection, operation) {
  try {
    // Iniciar transacción - Asumiendo que existe este método en SqlService
    const SqlService = require("../services/SqlService").SqlService;
    await SqlService.query(connection, "BEGIN TRANSACTION");

    // Ejecutar la operación
    const result = await operation(connection);

    // Commit si todo sale bien
    await SqlService.query(connection, "COMMIT TRANSACTION");

    return result;
  } catch (error) {
    // Rollback en caso de error
    try {
      await SqlService.query(connection, "ROLLBACK TRANSACTION");
    } catch (rollbackError) {
      logger.error("Error durante el rollback:", rollbackError);
    }

    throw error;
  }
}

module.exports = {
  withConnection,
  withTransaction,
};
