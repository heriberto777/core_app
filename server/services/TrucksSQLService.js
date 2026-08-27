/**
 * TrucksSQLService.js
 * CRUD del maestro propio de camiones (core_app.trucks, server1) — mismo
 * criterio que RoutesSQLService: reemplaza la dependencia de CATELLI.trucks
 * como fuente para la sincronización a server2, esta app pasa a ser dueña
 * del dato. A diferencia de rutas, acá no hace falta una tabla de
 * asignación aparte: cada camión es su propia fila, con su repartidor
 * asignado directo (code_seller) — no hay "muchos clientes comparten un
 * camión" como sí pasaba con rutas y clientes.
 *
 * El repartidor se elige del mismo catálogo que ya usa Centro de Carga de
 * Rutas (CATELLI.VENDEDOR con U_ESVENDEDOR='Re') — ver
 * RouteAccountsSQLService.getRepartidores(), reutilizado tal cual desde el
 * controller, sin duplicar la consulta acá.
 *
 * Reglas de transfer_status (mismo patrón que route_accounts_syncs):
 * - Alta nueva -> transfer_status = 1 (Nuevo)
 * - Edición y last_synced_hash NULL (nunca entregado) -> se refrescan los
 *   valores, el flag se queda como estaba (sigue en 1)
 * - Edición y last_synced_hash con valor (ya entregado) -> 2 (Cambio)
 * - Desactivar: nunca entregado -> se borra; ya entregado -> 3 (Baja)
 * - Reactivar un camión en Baja: se trata como una edición más (Cambio)
 */
const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const logger = require("./logger");

class TrucksSQLService {
  static async getTrucks(filters = {}) {
    return await withConnection("server1", async (connection) => {
      let query = `
        SELECT
          t.id, t.code, t.description, t.plate, t.code_seller,
          t.code_unit_org, t.code_sales_org,
          v.NOMBRE AS seller_name,
          t.active, t.transfer_status, t.synced_at, t.created_at, t.updated_at
        FROM core_app.trucks t
        LEFT JOIN CATELLI.VENDEDOR v ON t.code_seller IS NOT NULL AND (v.VENDEDOR = t.code_seller OR 'C' + v.VENDEDOR = t.code_seller)
        WHERE 1 = 1
      `;
      const params = {};

      if (filters.active === "true") {
        query += " AND t.active = 1";
      } else if (filters.active === "false") {
        query += " AND t.active = 0";
      }

      if (filters.search) {
        query += " AND (t.code LIKE @search OR t.description LIKE @search OR t.plate LIKE @search)";
        params.search = `%${filters.search}%`;
      }

      query += " ORDER BY t.code";

      const result = await DatabaseServiceAdapter.query(connection, query, params);
      return result.recordset;
    });
  }

  static async getTruckByCode(code) {
    return await withConnection("server1", async (connection) => {
      const result = await DatabaseServiceAdapter.query(
        connection,
        `SELECT id, code, description, plate, code_seller, code_unit_org, code_sales_org,
                active, transfer_status, synced_at, created_at, updated_at
         FROM core_app.trucks WHERE code = @code`,
        { code }
      );
      return result.recordset[0] || null;
    });
  }

  static async createTruck({ code, description, plate, codeSeller, organization, createdBy }) {
    // Antes hardcodeado a 'CATELLI' — ahora es un campo real (Organización),
    // por si en el futuro hace falta otro valor. Siempre en mayúsculas.
    const orgValue = (organization || "CATELLI").toUpperCase();

    return await withConnection("server1", async (connection) => {
      const existing = await DatabaseServiceAdapter.query(
        connection,
        "SELECT id FROM core_app.trucks WHERE code = @code",
        { code }
      );
      if (existing.recordset.length > 0) {
        throw new Error(`Ya existe un camión con el código ${code}`);
      }

      await DatabaseServiceAdapter.query(
        connection,
        `INSERT INTO core_app.trucks (code, description, plate, code_seller, code_unit_org, code_sales_org, active, source_create, transfer_status, created_by)
         VALUES (@code, @description, @plate, @codeSeller, @organization, @organization, 1, '1', 1, @createdBy)`,
        { code, description, plate: plate || null, codeSeller: codeSeller || null, organization: orgValue, createdBy: createdBy || null }
      );

      logger.info(`Camión creado: ${code}`);
      return await TrucksSQLService.getTruckByCode(code);
    });
  }

  static async updateTruck(code, { description, plate, codeSeller, organization }) {
    const orgValue = (organization || "CATELLI").toUpperCase();

    return await withConnection("server1", async (connection) => {
      const result = await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.trucks SET
           description = @description,
           plate = @plate,
           code_seller = @codeSeller,
           code_unit_org = @organization,
           code_sales_org = @organization,
           transfer_status = CASE WHEN last_synced_hash IS NULL THEN transfer_status ELSE 2 END,
           updated_at = SYSDATETIME()
         WHERE code = @code`,
        { code, description, plate: plate || null, codeSeller: codeSeller || null, organization: orgValue }
      );
      const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected;
      if (!affected) {
        throw new Error(`Camión ${code} no encontrado`);
      }
      return await TrucksSQLService.getTruckByCode(code);
    });
  }

  static async setActive(code, active) {
    return await withConnection("server1", async (connection) => {
      if (active) {
        // Reactivar: si nunca se había entregado (alta que se desactivó
        // antes de sincronizar) esto no debería pasar en la práctica porque
        // esa fila ya se hubiera borrado — pero por las dudas, se trata
        // igual que una edición cualquiera.
        const result = await DatabaseServiceAdapter.query(
          connection,
          `UPDATE core_app.trucks SET
             active = 1,
             transfer_status = CASE WHEN last_synced_hash IS NULL THEN transfer_status ELSE 2 END,
             updated_at = SYSDATETIME()
           WHERE code = @code`,
          { code }
        );
        const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected;
        if (!affected) throw new Error(`Camión ${code} no encontrado`);
      } else {
        // Nunca entregado -> se borra (nunca le importó a server2).
        // Ya entregado -> Baja (3), se reenvía hasta que se confirme.
        await DatabaseServiceAdapter.query(
          connection,
          `UPDATE core_app.trucks SET active = 0, transfer_status = 3, updated_at = SYSDATETIME()
           WHERE code = @code AND last_synced_hash IS NOT NULL`,
          { code }
        );
        await DatabaseServiceAdapter.query(
          connection,
          `DELETE FROM core_app.trucks WHERE code = @code AND last_synced_hash IS NULL`,
          { code }
        );
      }

      logger.info(`Camión ${code} ${active ? "activado" : "desactivado"}`);
      return await TrucksSQLService.getTruckByCode(code);
    });
  }
}

module.exports = TrucksSQLService;
