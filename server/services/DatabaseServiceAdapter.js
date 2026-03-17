// server/services/DatabaseServiceAdapter.js
const DatabaseService = require("./DatabaseService");
const logger = require("./logger");

/**
 * Adapter para migrar gradualmente desde ConnectionCentralService
 * Mantiene la API existente pero usa DatabaseService internamente
 */
class DatabaseServiceAdapter {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await DatabaseService.initialize();
      this.initialized = true;
      logger.info("DatabaseServiceAdapter inicializado");
    }
  }

  // API compatible con ConnectionCentralService
  async getConnection(serverKey) {
    await this.initialize();
    return await DatabaseService.getConnection(serverKey);
  }

  async releaseConnection(connection) {
    return await DatabaseService.releaseConnection(connection);
  }

  // API compatible con SqlService
  async query(connectionOrServerKey, sql, params = {}) {
    await this.initialize();
    return await DatabaseService.query(connectionOrServerKey, sql, params);
  }

  // Nuevas APIs para transacciones
  async withTransaction(serverKey, callback) {
    await this.initialize();
    return await DatabaseService.withTransaction(serverKey, callback);
  }

  async withConnections(mapping, callback) {
    await this.initialize();

    return await DatabaseService.withTransaction(
      mapping.sourceServer,
      async (sourceConn) => {
        return await DatabaseService.withTransaction(
          mapping.targetServer,
          async (targetConn) => {
            return await callback({
              source: sourceConn,
              target: targetConn,
              // No pasar objetos transaction separados, las conexiones manejan su propia transacción
            });
          }
        );
      }
    );
  }

  async withConnection(serverKey, callback) {
    await this.initialize();
    return await DatabaseService.withConnection(serverKey, callback);
  }

  getConnectionStats() {
    return DatabaseService.getStats();
  }

  async shutdown() {
    return await DatabaseService.shutdown();
  }
}

module.exports = new DatabaseServiceAdapter();
