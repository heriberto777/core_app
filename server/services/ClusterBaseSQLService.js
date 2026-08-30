/**
 * ClusterBaseSQLService.js
 * core_app.cluster_base (server1) — objetivos base (Bronze/Silver/Gold) por
 * organización. No viene de ninguna vista de Catelli — es dato propio de
 * esta app, mismo criterio que core_app.trucks/routes: la app es dueña del
 * dato, no hay MERGE/hash contra un origen externo. A diferencia de la
 * primera versión (una sola fila global), ahora es una fila por
 * code_unit_org, editable/eliminable desde una tabla como Trucks.
 *
 * Reglas de transfer_status (mismo patrón que trucks):
 * - Alta nueva -> transfer_status = 1 (Nuevo)
 * - Edición y last_synced_hash NULL (nunca entregado) -> se refrescan los
 *   valores, el flag se queda como estaba (sigue en 1)
 * - Edición y last_synced_hash con valor (ya entregado) -> 2 (Cambio)
 * - Eliminar: nunca entregado -> se borra; ya entregado -> 3 (Baja), la fila
 *   se queda hasta que el push confirme la baja en server2 (nunca se
 *   autoborra, mismo criterio que el resto de las tablas _syncs)
 * - Editar una fila en Baja(3): se trata como una edición más (vuelve a 2)
 */
const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const logger = require("./logger");

const SELECT_COLUMNS = `
  id, code_unit_org, code_sales_org, bronze_base, silver_base, gold_base,
  transfer_status, synced_at, created_at, updated_at
`;

class ClusterBaseSQLService {
  static async getAllClusterBase() {
    return await withConnection("server1", async (connection) => {
      const result = await DatabaseServiceAdapter.query(
        connection,
        `SELECT ${SELECT_COLUMNS} FROM core_app.cluster_base ORDER BY code_unit_org`
      );
      return result.recordset;
    });
  }

  static async getClusterBaseByOrg(organization) {
    return await withConnection("server1", async (connection) => {
      const result = await DatabaseServiceAdapter.query(
        connection,
        `SELECT ${SELECT_COLUMNS} FROM core_app.cluster_base WHERE code_unit_org = @organization`,
        { organization }
      );
      return result.recordset[0] || null;
    });
  }

  static async createClusterBase({ bronzeBase, silverBase, goldBase, organization }) {
    const orgValue = (organization || "").trim().toUpperCase();
    if (!orgValue) throw new Error("La organización es obligatoria");

    return await withConnection("server1", async (connection) => {
      const existing = await DatabaseServiceAdapter.query(
        connection,
        "SELECT id FROM core_app.cluster_base WHERE code_unit_org = @organization",
        { organization: orgValue }
      );
      if (existing.recordset.length > 0) {
        throw new Error(`Ya existen objetivos base para la organización ${orgValue}`);
      }

      await DatabaseServiceAdapter.query(
        connection,
        `INSERT INTO core_app.cluster_base
           (code_unit_org, code_sales_org, bronze_base, silver_base, gold_base, source_create, transfer_status, updated_at)
         VALUES (@organization, @organization, @bronzeBase, @silverBase, @goldBase, '0', 1, SYSDATETIME())`,
        { organization: orgValue, bronzeBase, silverBase, goldBase }
      );

      logger.info(`Objetivos base creados: ${orgValue}`);
      return await ClusterBaseSQLService.getClusterBaseByOrg(orgValue);
    });
  }

  static async updateClusterBase(organization, { bronzeBase, silverBase, goldBase }) {
    return await withConnection("server1", async (connection) => {
      const result = await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.cluster_base SET
           bronze_base = @bronzeBase,
           silver_base = @silverBase,
           gold_base = @goldBase,
           transfer_status = CASE WHEN last_synced_hash IS NULL THEN transfer_status ELSE 2 END,
           updated_at = SYSDATETIME()
         WHERE code_unit_org = @organization`,
        { organization, bronzeBase, silverBase, goldBase }
      );
      const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected;
      if (!affected) {
        throw new Error(`No existen objetivos base para la organización ${organization}`);
      }

      logger.info(`Objetivos base actualizados: ${organization}`);
      return await ClusterBaseSQLService.getClusterBaseByOrg(organization);
    });
  }

  static async deleteClusterBase(organization) {
    return await withConnection("server1", async (connection) => {
      // Nunca entregado -> se borra (nunca le importó a server2).
      // Ya entregado -> Baja (3), se reenvía hasta que se confirme.
      await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.cluster_base SET transfer_status = 3, updated_at = SYSDATETIME()
         WHERE code_unit_org = @organization AND last_synced_hash IS NOT NULL`,
        { organization }
      );
      const result = await DatabaseServiceAdapter.query(
        connection,
        `DELETE FROM core_app.cluster_base WHERE code_unit_org = @organization AND last_synced_hash IS NULL`,
        { organization }
      );

      logger.info(`Objetivos base eliminados: ${organization}`);
      const deletedHard = (Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected) > 0;
      return { deletedHard };
    });
  }
}

module.exports = ClusterBaseSQLService;
