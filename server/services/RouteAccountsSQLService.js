/**
 * RouteAccountsSQLService.js
 * Filtro/selección de clientes y asignación en lote a rutas
 * (core_app.route_accounts_syncs / route_org_accounts_syncs, server1).
 *
 * Una sola tabla para las dos asignaciones independientes de un cliente:
 * - assignment_type = 'REPARTO' -> Repartidor + Ruta de reparto (elegido a mano)
 * - assignment_type = 'VENTA'   -> Vendedor + Ruta de venta (autocompletado
 *   desde accounts_syncs.code_seller)
 * Cada cliente puede tener hasta 2 filas (una por tipo), clave única
 * (code_account, assignment_type) — reasignar es un UPDATE de esa fila, no
 * una fila nueva. assignment_type es un campo interno nuestro, NO es parte
 * del contrato STDB — se excluye al armar el envío a server2, igual que
 * "Ruta ERP" en getClients().
 *
 * Reglas de transfer_status (ver artifact "Centro de Operaciones"):
 * - Cliente sin fila todavía -> INSERT, transfer_status = 1 (Nuevo)
 * - Cliente con fila y last_synced_hash NULL (nunca entregado) -> se
 *   refrescan los valores, el flag se queda como estaba (sigue en 1)
 * - Cliente con fila y last_synced_hash con valor (ya entregado) -> 2 (Cambio)
 * - "Quitar de ruta": nunca entregado -> se borra; ya entregado -> 3 (Baja)
 */
const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const logger = require("./logger");

const DAY_FIELDS = [
  "visit_mon",
  "visit_tue",
  "visit_wen",
  "visit_thu",
  "visit_fri",
  "visit_sat",
  "visit_sun",
];

class RouteAccountsSQLService {
  // El filtro compara contra core_app.accounts_syncs.code_seller, que mirroreó
  // IMPLT_accounts.Code_Seller — esa vista antepone 'C' al VENDEDOR crudo
  // salvo que empiece con 'O' (ver vistas.txt). Si acá devolviéramos el
  // VENDEDOR sin transformar (como CATELLI.VENDEDOR lo tiene, o como hace
  // LoadsSQLService.getSellers() para Cargas), el filtro nunca matchearía.
  //
  // CATELLI.VENDEDOR guarda vendedores Y repartidores en la misma tabla,
  // distinguidos por U_ESVENDEDOR ('Si' = vendedor, 'Re' = repartidor) — acá
  // solo interesan los vendedores reales, para filtrar clientes por su
  // vendedor de venta. Ver getRepartidores() para el otro caso.
  static async getSellers() {
    return await withConnection("server1", async (connection) => {
      const query = `
        SELECT
          CASE
            WHEN SUBSTRING(VENDEDOR, PATINDEX('%[A-Za-z]%', VENDEDOR), 1) NOT LIKE 'O'
                 THEN 'C' + VENDEDOR
            ELSE VENDEDOR
          END AS code,
          NOMBRE AS name
        FROM CATELLI.VENDEDOR
        WHERE ACTIVO = 'S' AND U_ESVENDEDOR = 'Si'
        ORDER BY NOMBRE
      `;
      const result = await DatabaseServiceAdapter.query(connection, query, {});
      return result.recordset;
    });
  }

  // Repartidores: mismo catálogo (CATELLI.VENDEDOR), pero U_ESVENDEDOR = 'Re'.
  // Esto es lo que va en la fila assignment_type='REPARTO' — pese al nombre
  // del campo code_seller (heredado del contrato STDB, ver docx: "Necesaria
  // para el reparto"), ahí representa al repartidor, no al vendedor.
  //
  // OJO: el formato de código NO es el mismo que getSellers(). Ese compara
  // contra accounts_syncs.code_seller (viene de IMPLT_accounts, que excluye
  // solo 'O'). Este código en cambio se escribe directo en la fila de
  // reparto, y tiene que coincidir con el Code_Seller que genera
  // IMPLT_sellers para esa misma persona (el catálogo real de
  // vendedores/repartidores) — y esa vista excluye 'O' Y 'R' (confirmado
  // contra la definición viva de IMPLT_sellers, no solo el docx).
  static async getRepartidores() {
    return await withConnection("server1", async (connection) => {
      const query = `
        SELECT
          CASE
            WHEN SUBSTRING(VENDEDOR, PATINDEX('%[A-Za-z]%', VENDEDOR), 1) NOT IN ('O','R')
                 THEN 'C' + VENDEDOR
            ELSE VENDEDOR
          END AS code,
          NOMBRE AS name
        FROM CATELLI.VENDEDOR
        WHERE ACTIVO = 'S' AND U_ESVENDEDOR = 'Re'
        ORDER BY NOMBRE
      `;
      const result = await DatabaseServiceAdapter.query(connection, query, {});
      return result.recordset;
    });
  }

  // Catálogo de rutas TAL COMO EXISTEN HOY en el ERP — solo para poblar el
  // filtro "Ruta ERP" de getClients. Deliberadamente NO usa erpadmin (esa es
  // justo la dependencia que estamos sacando): la fuente real es
  // CATELLI.CLIENTE.RUTA (poblada al 100% en clientes activos), con
  // CATELLI.RUTA solo como catálogo descriptivo (código -> nombre). No tiene
  // relación con core_app.routes (nuestro maestro propio).
  //
  // Sin vendedor: catálogo completo de CATELLI.RUTA.
  // Con vendedor: solo las rutas que sus clientes tienen hoy asignadas —
  // CATELLI.RUTA no tiene un campo de vendedor propio, así que se derivan
  // mirando accounts_syncs + CLIENTE.RUTA (mismo join de getClients).
  static async getErpRoutes(seller) {
    return await withConnection("server1", async (connection) => {
      let query;
      const params = {};

      if (seller) {
        query = `
          SELECT DISTINCT cl.RUTA AS code, r.DESCRIPCION AS description
          FROM core_app.accounts_syncs a
          INNER JOIN CATELLI.CLIENTE cl ON cl.CLIENTE = a.code_ofclient OR 'CN' + cl.CLIENTE = a.code_ofclient
          LEFT JOIN CATELLI.RUTA r ON r.RUTA = cl.RUTA
          WHERE a.code_seller = @seller AND cl.RUTA IS NOT NULL AND cl.RUTA <> ''
          ORDER BY cl.RUTA
        `;
        params.seller = seller;
      } else {
        query = `
          SELECT RUTA AS code, DESCRIPCION AS description
          FROM CATELLI.RUTA
          WHERE RUTA <> 'ND'
          ORDER BY RUTA
        `;
      }

      const result = await DatabaseServiceAdapter.query(connection, query, params);
      return result.recordset;
    });
  }

  static async getClients(filters = {}) {
    return await withConnection("server1", async (connection) => {
      // erp_route_* es SOLO de referencia/filtro para no cargar todo a una
      // ruta por error al migrar — nunca se guarda en route_accounts_syncs,
      // así que no hay forma de que termine yéndose a server2 más adelante.
      // Fuente: CATELLI.CLIENTE.RUTA directo (poblada al 100% en clientes
      // activos) — NO erpadmin.RUTA_CLIENTE, esa es justo la dependencia que
      // estamos sacando. cl.CLIENTE (crudo) puede no llevar el prefijo 'CN'
      // que sí puede tener accounts_syncs.code_ofclient, se contemplan las
      // dos formas en el join.
      //
      // Dos joins a la MISMA tabla (ra = REPARTO, sr = VENTA), distinguidos
      // por assignment_type.
      let query = `
        SELECT
          a.code_ofclient AS code_account,
          a.name1,
          a.code_seller,
          ra.code_route AS current_route,
          ra.description AS current_route_description,
          ra.code_seller AS current_repartidor,
          ra.transfer_status AS assignment_status,
          sr.code_route AS current_seller_route,
          sr.description AS current_seller_route_description,
          sr.transfer_status AS seller_assignment_status,
          cl.RUTA AS erp_route_code,
          erp_r.DESCRIPCION AS erp_route_description
        FROM core_app.accounts_syncs a
        LEFT JOIN core_app.route_accounts_syncs ra
          ON ra.code_account = a.code_ofclient AND ra.assignment_type = 'REPARTO'
        LEFT JOIN core_app.route_accounts_syncs sr
          ON sr.code_account = a.code_ofclient AND sr.assignment_type = 'VENTA'
        LEFT JOIN CATELLI.CLIENTE cl ON cl.CLIENTE = a.code_ofclient OR 'CN' + cl.CLIENTE = a.code_ofclient
        LEFT JOIN CATELLI.RUTA erp_r ON erp_r.RUTA = cl.RUTA
        WHERE a.code_status = '1'
      `;
      const params = {};

      if (filters.seller) {
        query += " AND a.code_seller = @seller";
        params.seller = filters.seller;
      }

      if (filters.routeStatus === "unassigned") {
        query += " AND ra.code_route IS NULL";
      } else if (filters.routeStatus === "assigned" && filters.routeCode) {
        query += " AND ra.code_route = @routeCode";
        params.routeCode = filters.routeCode;
      }

      if (filters.erpRouteCode) {
        query += " AND cl.RUTA = @erpRouteCode";
        params.erpRouteCode = filters.erpRouteCode;
      }

      if (filters.search) {
        query += " AND (a.code_ofclient LIKE @search OR a.name1 LIKE @search)";
        params.search = `%${filters.search}%`;
      }

      query += " ORDER BY a.name1";

      const result = await DatabaseServiceAdapter.query(connection, query, params);
      return result.recordset;
    });
  }

  // ─── Ruta de REPARTO (Repartidor) ──────────────────────────────────────

  static async assignRoute({ clientCodes, codeRoute, description, codeRepartidor, days, codeFrecuency, codeWeek, createdBy, organization }) {
    if (!Array.isArray(clientCodes) || clientCodes.length === 0) {
      throw new Error("clientCodes debe ser un array no vacío");
    }
    if (!codeRepartidor) {
      throw new Error("codeRepartidor es obligatorio");
    }
    // Antes hardcodeado a 'CATELLI' directo en el SQL — ahora es un campo
    // real (Organización), por si en el futuro hace falta otro valor.
    // Siempre en mayúsculas.
    const orgValue = (organization || "CATELLI").toUpperCase();

    return await withConnection("server1", async (connection) => {
      const valuesList = clientCodes.map((_, i) => `(@account${i})`).join(", ");
      const params = {
        codeRoute,
        description,
        codeRepartidor,
        codeFrecuency,
        codeWeek: codeWeek || null,
        createdBy: createdBy || null,
        organization: orgValue,
      };
      clientCodes.forEach((c, i) => {
        params[`account${i}`] = c;
      });
      DAY_FIELDS.forEach((field) => {
        params[field] = days?.[field] ? "1" : "0";
      });

      // code_seller = Repartidor elegido a mano — NO se autocompleta desde
      // accounts_syncs (eso es el Vendedor de venta, la fila 'VENTA'). Ver
      // getRepartidores() y la nota del docx STDB sobre esta tabla.
      const query = `
        MERGE core_app.route_accounts_syncs AS tgt
        USING (VALUES ${valuesList}) AS src(code_account)
        ON tgt.code_account = src.code_account AND tgt.assignment_type = 'REPARTO'
        WHEN NOT MATCHED BY TARGET THEN
          INSERT (code_account, assignment_type, code_route, description, code_seller,
                  visit_mon, visit_tue, visit_wen, visit_thu, visit_fri, visit_sat, visit_sun,
                  code_frecuency, code_week, source_create, transfer_status, created_by)
          VALUES (src.code_account, 'REPARTO', @codeRoute, @description, @codeRepartidor,
                  @visit_mon, @visit_tue, @visit_wen, @visit_thu, @visit_fri, @visit_sat, @visit_sun,
                  @codeFrecuency, @codeWeek, '1', 1, @createdBy)
        WHEN MATCHED THEN
          UPDATE SET
            code_route = @codeRoute,
            description = @description,
            code_seller = @codeRepartidor,
            visit_mon = @visit_mon, visit_tue = @visit_tue, visit_wen = @visit_wen,
            visit_thu = @visit_thu, visit_fri = @visit_fri, visit_sat = @visit_sat, visit_sun = @visit_sun,
            code_frecuency = @codeFrecuency,
            code_week = @codeWeek,
            transfer_status = CASE WHEN tgt.last_synced_hash IS NULL THEN tgt.transfer_status ELSE 2 END,
            updated_at = SYSDATETIME();
      `;

      await DatabaseServiceAdapter.query(connection, query, params);

      // Espejo en route_org_accounts_syncs: mismo hecho de negocio, para el
      // proceso "Import Org" del STDB — Code_Unit_Org/Code_Sales_Org son
      // constantes en TODA vistas.txt (Catelli es un solo "org" en Hydra),
      // así que van hardcodeadas, no vienen de ningún catálogo.
      const orgQuery = `
        MERGE core_app.route_org_accounts_syncs AS tgt
        USING (VALUES ${valuesList}) AS src(code_account)
        ON tgt.code_account = src.code_account AND tgt.assignment_type = 'REPARTO'
        WHEN NOT MATCHED BY TARGET THEN
          INSERT (code_account, assignment_type, code_unit_org, code_sales_org, code_route, description, code_seller,
                  visit_mon, visit_tue, visit_wen, visit_thu, visit_fri, visit_sat, visit_sun,
                  code_frecuency, code_week, source_create, transfer_status, created_by)
          VALUES (src.code_account, 'REPARTO', @organization, @organization, @codeRoute, @description, @codeRepartidor,
                  @visit_mon, @visit_tue, @visit_wen, @visit_thu, @visit_fri, @visit_sat, @visit_sun,
                  @codeFrecuency, @codeWeek, '1', 1, @createdBy)
        WHEN MATCHED THEN
          UPDATE SET
            code_unit_org = @organization,
            code_sales_org = @organization,
            code_route = @codeRoute,
            description = @description,
            code_seller = @codeRepartidor,
            visit_mon = @visit_mon, visit_tue = @visit_tue, visit_wen = @visit_wen,
            visit_thu = @visit_thu, visit_fri = @visit_fri, visit_sat = @visit_sat, visit_sun = @visit_sun,
            code_frecuency = @codeFrecuency,
            code_week = @codeWeek,
            transfer_status = CASE WHEN tgt.last_synced_hash IS NULL THEN tgt.transfer_status ELSE 2 END,
            updated_at = SYSDATETIME();
      `;
      await DatabaseServiceAdapter.query(connection, orgQuery, params);

      logger.info(`Ruta de reparto ${codeRoute} (repartidor ${codeRepartidor}) asignada a ${clientCodes.length} clientes`);
      return { assignedCount: clientCodes.length };
    });
  }

  static async removeFromRoute(clientCodes) {
    if (!Array.isArray(clientCodes) || clientCodes.length === 0) {
      throw new Error("clientCodes debe ser un array no vacío");
    }

    return await withConnection("server1", async (connection) => {
      const placeholders = clientCodes.map((_, i) => `@account${i}`).join(", ");
      const params = {};
      clientCodes.forEach((c, i) => {
        params[`account${i}`] = c;
      });

      await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.route_accounts_syncs
         SET transfer_status = 3, updated_at = SYSDATETIME()
         WHERE code_account IN (${placeholders}) AND assignment_type = 'REPARTO' AND last_synced_hash IS NOT NULL`,
        params
      );

      await DatabaseServiceAdapter.query(
        connection,
        `DELETE FROM core_app.route_accounts_syncs
         WHERE code_account IN (${placeholders}) AND assignment_type = 'REPARTO' AND last_synced_hash IS NULL`,
        params
      );

      // Mismo espejo en route_org_accounts_syncs que en assignRoute().
      await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.route_org_accounts_syncs
         SET transfer_status = 3, updated_at = SYSDATETIME()
         WHERE code_account IN (${placeholders}) AND assignment_type = 'REPARTO' AND last_synced_hash IS NOT NULL`,
        params
      );

      await DatabaseServiceAdapter.query(
        connection,
        `DELETE FROM core_app.route_org_accounts_syncs
         WHERE code_account IN (${placeholders}) AND assignment_type = 'REPARTO' AND last_synced_hash IS NULL`,
        params
      );

      logger.info(`${clientCodes.length} clientes removidos de su ruta de reparto`);
      return { removedCount: clientCodes.length };
    });
  }

  // ─── Ruta de VENTA (Vendedor) — misma tabla, assignment_type distinto ──
  // code_seller acá SÍ se autocompleta desde accounts_syncs.code_seller (el
  // Vendedor real del cliente en el ERP) — a diferencia de la fila
  // 'REPARTO', donde el Repartidor se elige a mano.

  static async assignSellerRoute({ clientCodes, codeRoute, description, days, codeFrecuency, codeWeek, createdBy, organization }) {
    if (!Array.isArray(clientCodes) || clientCodes.length === 0) {
      throw new Error("clientCodes debe ser un array no vacío");
    }
    // Ver nota de assignRoute() — mismo campo Organización, ya no hardcodeado.
    const orgValue = (organization || "CATELLI").toUpperCase();

    return await withConnection("server1", async (connection) => {
      const valuesList = clientCodes.map((_, i) => `(@account${i})`).join(", ");
      const params = {
        codeRoute,
        description,
        codeFrecuency,
        codeWeek: codeWeek || null,
        createdBy: createdBy || null,
        organization: orgValue,
      };
      clientCodes.forEach((c, i) => {
        params[`account${i}`] = c;
      });
      DAY_FIELDS.forEach((field) => {
        params[field] = days?.[field] ? "1" : "0";
      });

      const query = `
        MERGE core_app.route_accounts_syncs AS tgt
        USING (VALUES ${valuesList}) AS src(code_account)
        ON tgt.code_account = src.code_account AND tgt.assignment_type = 'VENTA'
        WHEN NOT MATCHED BY TARGET THEN
          INSERT (code_account, assignment_type, code_route, description, code_seller,
                  visit_mon, visit_tue, visit_wen, visit_thu, visit_fri, visit_sat, visit_sun,
                  code_frecuency, code_week, source_create, transfer_status, created_by)
          VALUES (src.code_account, 'VENTA', @codeRoute, @description,
                  (SELECT code_seller FROM core_app.accounts_syncs WHERE code_ofclient = src.code_account),
                  @visit_mon, @visit_tue, @visit_wen, @visit_thu, @visit_fri, @visit_sat, @visit_sun,
                  @codeFrecuency, @codeWeek, '1', 1, @createdBy)
        WHEN MATCHED THEN
          UPDATE SET
            code_route = @codeRoute,
            description = @description,
            code_seller = (SELECT code_seller FROM core_app.accounts_syncs WHERE code_ofclient = tgt.code_account),
            visit_mon = @visit_mon, visit_tue = @visit_tue, visit_wen = @visit_wen,
            visit_thu = @visit_thu, visit_fri = @visit_fri, visit_sat = @visit_sat, visit_sun = @visit_sun,
            code_frecuency = @codeFrecuency,
            code_week = @codeWeek,
            transfer_status = CASE WHEN tgt.last_synced_hash IS NULL THEN tgt.transfer_status ELSE 2 END,
            updated_at = SYSDATETIME();
      `;

      await DatabaseServiceAdapter.query(connection, query, params);

      // Mismo espejo en route_org_accounts_syncs que assignRoute().
      const orgQuery = `
        MERGE core_app.route_org_accounts_syncs AS tgt
        USING (VALUES ${valuesList}) AS src(code_account)
        ON tgt.code_account = src.code_account AND tgt.assignment_type = 'VENTA'
        WHEN NOT MATCHED BY TARGET THEN
          INSERT (code_account, assignment_type, code_unit_org, code_sales_org, code_route, description, code_seller,
                  visit_mon, visit_tue, visit_wen, visit_thu, visit_fri, visit_sat, visit_sun,
                  code_frecuency, code_week, source_create, transfer_status, created_by)
          VALUES (src.code_account, 'VENTA', @organization, @organization, @codeRoute, @description,
                  (SELECT code_seller FROM core_app.accounts_syncs WHERE code_ofclient = src.code_account),
                  @visit_mon, @visit_tue, @visit_wen, @visit_thu, @visit_fri, @visit_sat, @visit_sun,
                  @codeFrecuency, @codeWeek, '1', 1, @createdBy)
        WHEN MATCHED THEN
          UPDATE SET
            code_unit_org = @organization,
            code_sales_org = @organization,
            code_route = @codeRoute,
            description = @description,
            code_seller = (SELECT code_seller FROM core_app.accounts_syncs WHERE code_ofclient = tgt.code_account),
            visit_mon = @visit_mon, visit_tue = @visit_tue, visit_wen = @visit_wen,
            visit_thu = @visit_thu, visit_fri = @visit_fri, visit_sat = @visit_sat, visit_sun = @visit_sun,
            code_frecuency = @codeFrecuency,
            code_week = @codeWeek,
            transfer_status = CASE WHEN tgt.last_synced_hash IS NULL THEN tgt.transfer_status ELSE 2 END,
            updated_at = SYSDATETIME();
      `;
      await DatabaseServiceAdapter.query(connection, orgQuery, params);

      logger.info(`Ruta de venta ${codeRoute} asignada a ${clientCodes.length} clientes`);
      return { assignedCount: clientCodes.length };
    });
  }

  static async removeFromSellerRoute(clientCodes) {
    if (!Array.isArray(clientCodes) || clientCodes.length === 0) {
      throw new Error("clientCodes debe ser un array no vacío");
    }

    return await withConnection("server1", async (connection) => {
      const placeholders = clientCodes.map((_, i) => `@account${i}`).join(", ");
      const params = {};
      clientCodes.forEach((c, i) => {
        params[`account${i}`] = c;
      });

      await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.route_accounts_syncs
         SET transfer_status = 3, updated_at = SYSDATETIME()
         WHERE code_account IN (${placeholders}) AND assignment_type = 'VENTA' AND last_synced_hash IS NOT NULL`,
        params
      );

      await DatabaseServiceAdapter.query(
        connection,
        `DELETE FROM core_app.route_accounts_syncs
         WHERE code_account IN (${placeholders}) AND assignment_type = 'VENTA' AND last_synced_hash IS NULL`,
        params
      );

      await DatabaseServiceAdapter.query(
        connection,
        `UPDATE core_app.route_org_accounts_syncs
         SET transfer_status = 3, updated_at = SYSDATETIME()
         WHERE code_account IN (${placeholders}) AND assignment_type = 'VENTA' AND last_synced_hash IS NOT NULL`,
        params
      );

      await DatabaseServiceAdapter.query(
        connection,
        `DELETE FROM core_app.route_org_accounts_syncs
         WHERE code_account IN (${placeholders}) AND assignment_type = 'VENTA' AND last_synced_hash IS NULL`,
        params
      );

      logger.info(`${clientCodes.length} clientes removidos de su ruta de venta`);
      return { removedCount: clientCodes.length };
    });
  }
}

module.exports = RouteAccountsSQLService;
