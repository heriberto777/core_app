/**
 * RoutesSQLService.js
 * CRUD del maestro propio de rutas (core_app.routes, server1).
 * Reemplaza la dependencia de erpadmin.RUTA_RT — ver artifact "Centro de
 * Operaciones". Sin borrado físico: solo activar/desactivar (setActive),
 * para no dejar huérfanas las filas de route_accounts_syncs que ya
 * referencian una ruta.
 */
const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const logger = require("./logger");

class RoutesSQLService {
  static async getRoutes(filters = {}) {
    return await withConnection("server1", async (connection) => {
      let query = `
        SELECT
          r.id, r.code_route, r.description, r.active, r.created_at, r.updated_at,
          (SELECT COUNT(*) FROM core_app.route_accounts_syncs ra WHERE ra.code_route = r.code_route) AS assigned_count
        FROM core_app.routes r
        WHERE 1 = 1
      `;
      const params = {};

      if (filters.active === "true") {
        query += " AND r.active = 1";
      } else if (filters.active === "false") {
        query += " AND r.active = 0";
      }

      if (filters.search) {
        query += " AND (r.code_route LIKE @search OR r.description LIKE @search)";
        params.search = `%${filters.search}%`;
      }

      query += " ORDER BY r.code_route";

      const result = await DatabaseServiceAdapter.query(connection, query, params);
      return result.recordset;
    });
  }

  static async getRouteByCode(codeRoute) {
    return await withConnection("server1", async (connection) => {
      const result = await DatabaseServiceAdapter.query(
        connection,
        `SELECT id, code_route, description, active, created_at, updated_at
         FROM core_app.routes WHERE code_route = @codeRoute`,
        { codeRoute }
      );
      return result.recordset[0] || null;
    });
  }

  static async createRoute({ codeRoute, description }) {
    return await withConnection("server1", async (connection) => {
      const existing = await DatabaseServiceAdapter.query(
        connection,
        "SELECT id FROM core_app.routes WHERE code_route = @codeRoute",
        { codeRoute }
      );
      if (existing.recordset.length > 0) {
        throw new Error(`Ya existe una ruta con el código ${codeRoute}`);
      }

      await DatabaseServiceAdapter.query(
        connection,
        `INSERT INTO core_app.routes (code_route, description, active)
         VALUES (@codeRoute, @description, 1)`,
        { codeRoute, description }
      );

      logger.info(`Ruta creada: ${codeRoute}`);
      return await RoutesSQLService.getRouteByCode(codeRoute);
    });
  }

  static async updateRoute(codeRoute, { description }) {
    return await withConnection("server1", async (connection) => {
      const result = await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.routes SET description = @description, updated_at = SYSDATETIME()
         WHERE code_route = @codeRoute`,
        { codeRoute, description }
      );
      const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected;
      if (!affected) {
        throw new Error(`Ruta ${codeRoute} no encontrada`);
      }
      return await RoutesSQLService.getRouteByCode(codeRoute);
    });
  }

  static async setActive(codeRoute, active) {
    return await withConnection("server1", async (connection) => {
      const result = await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.routes SET active = @active, updated_at = SYSDATETIME()
         WHERE code_route = @codeRoute`,
        { codeRoute, active: active ? 1 : 0 }
      );
      const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected;
      if (!affected) {
        throw new Error(`Ruta ${codeRoute} no encontrada`);
      }
      logger.info(`Ruta ${codeRoute} ${active ? "activada" : "desactivada"}`);
      return await RoutesSQLService.getRouteByCode(codeRoute);
    });
  }
}

module.exports = RoutesSQLService;
