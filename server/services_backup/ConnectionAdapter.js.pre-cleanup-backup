// services/ConnectionAdapter.js
const ConnectionCentralService = require("./ConnectionCentralService");
const logger = require("./logger");

/**
 * Adaptador para compatibilidad con código existente
 * Proporciona la misma API que ConnectionManager pero usa ConnectionCentralService
 */
class ConnectionAdapter {
  /**
   * Proxy para ConnectionManager.getConnection
   * @param {string} serverKey - Clave del servidor
   * @returns {Promise<Object>} - Conexión
   */
  async getConnection(serverKey) {
    try {
      return await ConnectionCentralService.getConnection(serverKey);
    } catch (error) {
      logger.error(
        `[Adapter] Error al obtener conexión para ${serverKey}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Proxy para ConnectionManager.enhancedRobustConnect
   * @param {string} serverKey - Clave del servidor
   * @returns {Promise<Object>} - Resultado con conexión
   */
  async enhancedRobustConnect(serverKey) {
    try {
      return await ConnectionCentralService.enhancedRobustConnect(serverKey);
    } catch (error) {
      logger.error(
        `[Adapter] Error en enhancedRobustConnect para ${serverKey}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Proxy para ConnectionManager.releaseConnection
   * @param {Object} connection - Conexión a liberar
   * @returns {Promise<void>}
   */
  async releaseConnection(connection) {
    try {
      await ConnectionCentralService.releaseConnection(connection);
    } catch (error) {
      logger.error(`[Adapter] Error al liberar conexión: ${error.message}`);
      throw error;
    }
  }

  /**
   * Proxy para ConnectionManager.initPool
   * @param {string} serverKey - Clave del servidor
   * @param {Object} config - Configuración del pool
   * @returns {Promise<boolean>} - true si se inicializó correctamente
   */
  async initPool(serverKey, config) {
    try {
      return await ConnectionCentralService.initPool(serverKey, config);
    } catch (error) {
      logger.error(
        `[Adapter] Error al inicializar pool para ${serverKey}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Proxy para ConnectionManager.closePool
   * @param {string} serverKey - Clave del servidor
   * @returns {Promise<boolean>} - true si se cerró correctamente
   */
  async closePool(serverKey) {
    try {
      return await ConnectionCentralService.closePool(serverKey);
    } catch (error) {
      logger.error(
        `[Adapter] Error al cerrar pool para ${serverKey}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Proxy para ConnectionManager.closePools
   * @returns {Promise<Object>} - Resultados por servidor
   */
  async closePools() {
    try {
      return await ConnectionCentralService.closePools();
    } catch (error) {
      logger.error(
        `[Adapter] Error al cerrar todos los pools: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtener estado de los pools
   * @returns {Object} - Estado actual de los pools
   */
  getPoolsStatus() {
    try {
      const stats = ConnectionCentralService.getConnectionStats();
      return stats.pools || {};
    } catch (error) {
      logger.error(
        `[Adapter] Error al obtener estado de pools: ${error.message}`
      );
      return {};
    }
  }
}

// Crear instancia compatible con el ConnectionManager original
module.exports = new ConnectionAdapter();
