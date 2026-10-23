/**
 * LoadsSQLService.js
 * Responsabilidad única: todas las lecturas y mutaciones directas a SQL Server
 * relacionadas con el flujo de cargas de pedidos.
 *
 * Gestiona conexiones a server1 (CATELLI/Exactus) y server2 (IMPLT_*).
 * No contiene lógica de negocio de orquestación — eso está en loadsService.js.
 */
const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const logger = require("./logger");

class LoadsSQLService {
    // ─── Lectura de pedidos ───────────────────────────────────────────────────

    /**
     * Obtiene pedidos pendientes desde CATELLI.PEDIDO con filtros opcionales.
     */
    static async getPendingOrders(filters = {}) {
        return await withConnection("server1", async (connection) => {
            try {
                let baseQuery = `
          WITH BaseData AS (
            SELECT
              pl.PEDIDO, pl.PEDIDO_LINEA, pl.CANTIDAD_PEDIDA, pl.CANTIDAD_BONIFICAD,
              pl.PRECIO_UNITARIO, pl.MONTO_DESCUENTO, pl.PORC_DESCUENTO,
              pl.PORC_IMPUESTO1, pl.PORC_IMPUESTO2,
              pe.RUBRO5, pe.U_Code_Load, pe.U_estado_proceso,
              pe.FECHA_PROMETIDA, pe.FECHA_PEDIDO, pe.CLIENTE, pe.VENDEDOR, pe.RUBRO4,
              cl.detalle_direccion,
              ar.ARTICULO, ar.UNIDAD_ALMACEN,
              pl.BODEGA,
              v.NOMBRE as NOMBRE_VENDEDOR
            FROM CATELLI.PEDIDO_LINEA AS pl
            INNER JOIN CATELLI.PEDIDO AS pe ON pe.PEDIDO = pl.PEDIDO
            INNER JOIN CATELLI.CLIENTE AS cl ON cl.CLIENTE = pe.CLIENTE
            LEFT JOIN CATELLI.ARTICULO AS ar ON ar.ARTICULO = pl.ARTICULO
            LEFT JOIN CATELLI.VENDEDOR AS v ON v.VENDEDOR = pe.VENDEDOR
            WHERE pe.estado = 'N'
        `;

                const params = {};

                if (!filters.includeLoaded) {
                    baseQuery += " AND (pe.U_Code_Load IS NULL OR pe.U_Code_Load = '')";
                }

                if (filters.transferStatus && filters.transferStatus !== "all") {
                    switch (filters.transferStatus) {
                        case "pending":
                            baseQuery += " AND (pe.U_estado_proceso = 'N' OR pe.U_estado_proceso IS NULL)";
                            break;
                        case "processing":
                            baseQuery += " AND pe.U_estado_proceso = 'P'";
                            break;
                        case "completed":
                            baseQuery += " AND pe.U_estado_proceso = 'S'";
                            break;
                        case "cancelled":
                            baseQuery += " AND pe.U_estado_proceso = 'C'";
                            break;
                    }
                } else {
                    baseQuery += " AND (pe.U_estado_proceso IN ('N', 'P') OR pe.U_estado_proceso IS NULL)";
                }

                if (filters.dateFrom) {
                    baseQuery += " AND pe.FECHA_PEDIDO >= @dateFrom";
                    params.dateFrom = new Date(filters.dateFrom);
                }

                if (filters.dateTo) {
                    baseQuery += " AND pe.FECHA_PEDIDO <= @dateTo";
                    const endDate = new Date(filters.dateTo);
                    endDate.setHours(23, 59, 59, 999);
                    params.dateTo = endDate;
                }

                if (filters.sellers) {
                    const sellerList = typeof filters.sellers === 'string'
                        ? filters.sellers.split(',').filter(s => s.trim() !== '')
                        : (Array.isArray(filters.sellers) ? filters.sellers : []);

                    if (sellerList.length > 0) {
                        const sellerPlaceholders = sellerList.map((_, i) => `@seller${i}`).join(", ");
                        baseQuery += ` AND pe.VENDEDOR IN (${sellerPlaceholders})`;
                        sellerList.forEach((s, i) => {
                            params[`seller${i}`] = s.trim();
                        });
                    }
                }

                const fullQuery = `
          ${baseQuery}
          ),
          Calc AS (
            SELECT PEDIDO, CANTIDAD_PEDIDA as Cantidad,
              (CANTIDAD_PEDIDA * PRECIO_UNITARIO) AS LineAmount,
              U_estado_proceso, FECHA_PEDIDO, CLIENTE, VENDEDOR, NOMBRE_VENDEDOR,
              FECHA_PROMETIDA, detalle_direccion, U_Code_Load
            FROM BaseData WHERE CANTIDAD_PEDIDA <> 0
            UNION ALL
            SELECT PEDIDO, CANTIDAD_BONIFICAD as Cantidad, 0 AS LineAmount,
              U_estado_proceso, FECHA_PEDIDO, CLIENTE, VENDEDOR, NOMBRE_VENDEDOR,
              FECHA_PROMETIDA, detalle_direccion, U_Code_Load
            FROM BaseData WHERE CANTIDAD_BONIFICAD > 0
          )
          SELECT
            PEDIDO, CLIENTE, VENDEDOR, NOMBRE_VENDEDOR,
            FECHA_PEDIDO, FECHA_PROMETIDA,
            COUNT(*) as totalLines,
            SUM(Cantidad) as totalQuantity,
            SUM(LineAmount) as totalAmount,
            detalle_direccion,
            MIN(U_estado_proceso) as estadoProceso,
            MIN(U_Code_Load) as codeLoad
          FROM Calc
          GROUP BY PEDIDO, CLIENTE, VENDEDOR, NOMBRE_VENDEDOR,
                   FECHA_PEDIDO, FECHA_PROMETIDA, detalle_direccion
          ORDER BY FECHA_PEDIDO DESC, PEDIDO DESC
        `;

                const result = await DatabaseServiceAdapter.query(connection, fullQuery, params);
                return {
                    success: true,
                    data: result.recordset.map((order) => ({
                        pedido: order.PEDIDO,
                        cliente: order.CLIENTE,
                        fechaPedido: order.FECHA_PEDIDO,
                        vendedor: order.VENDEDOR,
                        nombreVendedor: order.NOMBRE_VENDEDOR,
                        totalLineas: order.totalLines,
                        totalPedido: order.totalAmount || 0,
                        totalCantidad: order.totalQuantity || 0,
                        direccion: order.detalle_direccion,
                        codeLoad: order.codeLoad,
                        transferStatus: LoadsSQLService.mapTransferStatus(order.estadoProceso),
                    })),
                    totalRecords: result.recordset.length,
                };
            } catch (error) {
                logger.error("Error obteniendo pedidos pendientes:", error);
                throw error;
            }
        });
    }

    /**
     * Mapea el estado interno de proceso (N/P/S/C) a un nombre legible.
     */
    static mapTransferStatus(estadoProceso) {
        switch (estadoProceso) {
            case "N": return "pending";
            case "P": return "processing";
            case "S": return "completed";
            case "C": return "cancelled";
            default: return "pending";
        }
    }

    /**
     * Obtiene las líneas detalladas de un pedido.
     */
    static async getOrderDetails(pedidoId) {
        return await withConnection("server1", async (connection) => {
            const query = `
        WITH BaseData AS (
          SELECT
            pl.PEDIDO, pl.PEDIDO_LINEA, pl.CANTIDAD_PEDIDA, pl.CANTIDAD_BONIFICAD,
            pl.PRECIO_UNITARIO, pl.MONTO_DESCUENTO,
            ar.ARTICULO, ar.DESCRIPCION as productDescription,
            ar.UNIDAD_ALMACEN as unitMeasure
          FROM CATELLI.PEDIDO_LINEA pl
          INNER JOIN CATELLI.ARTICULO ar ON pl.ARTICULO = ar.ARTICULO
          WHERE pl.PEDIDO = @pedidoId
        ),
        Details AS (
          SELECT
            PEDIDO_LINEA,
            CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-P' AS lineId,
            'P' AS lineType,
            'Pedida' AS lineTypeLabel,
            ARTICULO as Code_Product,
            productDescription,
            CANTIDAD_PEDIDA as quantity,
            PRECIO_UNITARIO as price,
            (CANTIDAD_PEDIDA * PRECIO_UNITARIO) as subtotal,
            unitMeasure
          FROM BaseData
          WHERE CANTIDAD_PEDIDA <> 0
          UNION ALL
          SELECT
            PEDIDO_LINEA,
            CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-B' AS lineId,
            'B' AS lineType,
            'Bonificada' AS lineTypeLabel,
            ARTICULO as Code_Product,
            productDescription,
            CANTIDAD_BONIFICAD as quantity,
            0 as price,
            0 as subtotal,
            unitMeasure
          FROM BaseData
          WHERE CANTIDAD_BONIFICAD > 0
        )
        SELECT * FROM Details ORDER BY PEDIDO_LINEA, lineType
      `;
            try {
                const result = await DatabaseServiceAdapter.query(connection, query, { pedidoId });
                return { success: true, data: result.recordset };
            } catch (error) {
                logger.error(`Error obteniendo detalles del pedido ${pedidoId}:`, error);
                throw error;
            }
        });
    }

    /**
     * Obtiene vendedores de preventa activos (U_ESVENDEDOR='Si') — CATELLI.VENDEDOR
     * guarda vendedores Y repartidores en la misma tabla, distinguidos por ese
     * flag ('Si'=vendedor, 'Re'=repartidor; ver RouteAccountsSQLService.js,
     * donde ya estaba documentado). Antes esto no filtraba y devolvía ambos
     * mezclados -- correcto para "filtrar pedidos por vendedor" (un pedido
     * nunca tiene un repartidor como VENDEDOR), pero conceptualmente mal.
     */
    static async getSellers() {
        return await withConnection("server1", async (connection) => {
            const query = `
        SELECT
          VENDEDOR as code,
          NOMBRE as name,
          U_BODEGA as assignedWarehouse,
          U_ESVENDEDOR as isVendedor,
          ACTIVO as isActive
        FROM CATELLI.VENDEDOR
        WHERE ACTIVO = 'S' AND U_ESVENDEDOR = 'Si'
        ORDER BY NOMBRE
      `;
            try {
                console.log("DEBUG: Executing getSellers query (SQL Server 1)...");
                const result = await DatabaseServiceAdapter.query(connection, query, {});
                return { success: true, data: result.recordset };
            } catch (error) {
                console.error("DEBUG ERROR: Error en getSellers SQL:");
                console.error(error);
                if (error instanceof AggregateError) {
                    console.error(`AggregateError (${error.errors.length} errores):`);
                    error.errors.forEach((err, i) => {
                        console.error(`Error ${i + 1}: ${err.message}`);
                    });
                }
                throw error;
            }
        });
    }

    /**
     * Repartidores activos (U_ESVENDEDOR='Re') — antes esto era un alias de
     * getSellers() y devolvía vendedores de preventa mezclados con
     * repartidores. El frontend (DeliveryPersonSelector) ya filtraba
     * client-side por isVendedor==='Re', pero acá en el backend no había
     * ningún filtro -- esta es la query real, separada.
     */
    static async getDeliveryPersons() {
        return await withConnection("server1", async (connection) => {
            const query = `
        SELECT
          VENDEDOR as code,
          NOMBRE as name,
          U_BODEGA as assignedWarehouse,
          U_ESVENDEDOR as isVendedor,
          ACTIVO as isActive
        FROM CATELLI.VENDEDOR
        WHERE ACTIVO = 'S' AND U_ESVENDEDOR = 'Re'
        ORDER BY NOMBRE
      `;
            const result = await DatabaseServiceAdapter.query(connection, query, {});
            return { success: true, data: result.recordset };
        });
    }

    /**
     * Valida que el repartidor existe, está activo y es REALMENTE un
     * repartidor (U_ESVENDEDOR='Re'), no un vendedor de preventa cualquiera.
     * Antes no se validaba esto acá -- el frontend filtraba el selector, pero
     * nada impedía que una llamada directa a la API (o un selector futuro sin
     * ese filtro) pasara el código de un vendedor normal, cuya U_BODEGA no
     * necesariamente representa una bodega de reparto real.
     * Lanza error si no existe, no es repartidor, o no tiene bodega asignada.
     */
    static async validateDeliveryPerson(deliveryPersonCode) {
        return await withConnection("server1", async (connection) => {
            const query = `
        SELECT
          VENDEDOR as code, NOMBRE as name,
          U_BODEGA as assignedWarehouse,
          U_BODEGA_CENTRAL as warehouseCentral,
          U_ESVENDEDOR as isVendedor, ACTIVO as isActive
        FROM CATELLI.VENDEDOR
        WHERE VENDEDOR = @deliveryPersonCode AND ACTIVO = 'S' AND U_ESVENDEDOR = 'Re'
      `;
            const result = await DatabaseServiceAdapter.query(connection, query, { deliveryPersonCode });

            if (!result.recordset || result.recordset.length === 0) {
                throw new Error(`Repartidor ${deliveryPersonCode} no encontrado, inactivo, o no está marcado como repartidor (U_ESVENDEDOR='Re').`);
            }

            const deliveryPerson = result.recordset[0];
            if (!deliveryPerson.assignedWarehouse) {
                throw new Error(`Repartidor ${deliveryPersonCode} no tiene bodega asignada (U_BODEGA)`);
            }

            logger.info(`Repartidor: ${deliveryPerson.name} — Bodega: ${deliveryPerson.assignedWarehouse} — Bodega Central: ${deliveryPerson.warehouseCentral}`);
            return deliveryPerson;
        });
    }

    // ─── Mutaciones de pedidos ────────────────────────────────────────────────

    /**
     * Asigna el loadId a los pedidos seleccionados (U_Code_Load).
     */
    static async updatePedidosWithLoadId(connection, selectedPedidos, loadId) {
        if (!Array.isArray(selectedPedidos) || selectedPedidos.length === 0) {
            throw new Error("selectedPedidos debe ser un array no vacío.");
        }

        const pedidosList = selectedPedidos.map((_, i) => `@pedido${i}`).join(", ");
        const diagnosticParams = {};
        selectedPedidos.forEach((p, i) => { diagnosticParams[`pedido${i}`] = p; });

        const diagnosticQuery = `
      SELECT PEDIDO, estado, U_Code_Load, U_estado_proceso,
        CASE
          WHEN U_Code_Load IS NOT NULL AND U_Code_Load != '' THEN 'YA_TIENE_LOAD'
          WHEN estado != 'N' THEN 'ESTADO_NO_NORMAL'
          WHEN U_estado_proceso NOT IN ('N', 'P') AND U_estado_proceso IS NOT NULL THEN 'PROCESO_NO_VALIDO'
          ELSE 'ACTUALIZABLE'
        END as diagnostico
      FROM CATELLI.PEDIDO WHERE PEDIDO IN (${pedidosList})
    `;

        const diagResult = await DatabaseServiceAdapter.query(connection, diagnosticQuery, diagnosticParams);
        const noActualizables = diagResult.recordset.filter((p) => p.diagnostico !== "ACTUALIZABLE");

        if (noActualizables.length > 0) {
            const detalles = noActualizables.map((p) => `Pedido ${p.PEDIDO}: ${p.diagnostico}`).join(", ");
            throw new Error(`No se pueden actualizar algunos pedidos: ${detalles}`);
        }

        const params = { loadId };
        selectedPedidos.forEach((p, i) => { params[`pedido${i}`] = p; });

        const result = await DatabaseServiceAdapter.query(connection, `
      UPDATE CATELLI.PEDIDO SET U_Code_Load = @loadId
      WHERE PEDIDO IN (${pedidosList})
        AND (U_Code_Load IS NULL OR U_Code_Load = '')
        AND estado = 'N'
        AND (U_estado_proceso IN ('N', 'P') OR U_estado_proceso IS NULL)
    `, params);

        const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected;
        if (affected !== selectedPedidos.length) {
            throw new Error(`Solo se actualizaron ${affected} de ${selectedPedidos.length} pedidos.`);
        }

        logger.info(`${affected} pedidos actualizados con loadId: ${loadId}`);
    }

    /**
     * Limpia el loadId de los pedidos (U_Code_Load = NULL).
     * Se usa cuando el proceso de carga falla para que vuelvan a estar disponibles.
     */
    static async clearUCodeLoad(connection, selectedPedidos, loadId) {
        if (!Array.isArray(selectedPedidos) || selectedPedidos.length === 0) return;

        const pedidosList = selectedPedidos.map((_, i) => `@pedido${i}`).join(", ");
        const params = { loadId };
        selectedPedidos.forEach((p, i) => { params[`pedido${i}`] = p; });

        const result = await DatabaseServiceAdapter.query(connection, `
      UPDATE CATELLI.PEDIDO SET U_Code_Load = NULL
      WHERE PEDIDO IN (${pedidosList}) AND U_Code_Load = @loadId
    `, params);

        const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected;
        logger.info(`${affected} pedidos liberados del loadId: ${loadId}`);
    }

    /**
     * Actualiza el estado de proceso (U_estado_proceso) de los pedidos.
     */
    static async updateEstadoProceso(connection, selectedPedidos, estado, loadId = null) {
        if (!Array.isArray(selectedPedidos) || selectedPedidos.length === 0) {
            throw new Error("selectedPedidos debe ser un array no vacío.");
        }
        if (!estado || !["N", "P", "S", "C"].includes(estado)) {
            throw new Error(`Estado inválido: ${estado}. Debe ser N, P, S o C`);
        }

        const pedidosList = selectedPedidos.map((_, i) => `@pedido${i}`).join(", ");
        const params = { estado };
        selectedPedidos.forEach((p, i) => { params[`pedido${i}`] = p; });
        if (loadId) params.loadId = loadId;

        let query = `
      UPDATE CATELLI.PEDIDO SET U_estado_proceso = @estado
      WHERE PEDIDO IN (${pedidosList}) AND estado = 'N'
    `;

        switch (estado) {
            case "P":
                query += " AND (U_estado_proceso = 'N' OR U_estado_proceso IS NULL)";
                if (loadId) query += " AND U_Code_Load = @loadId";
                break;
            case "S":
                query += " AND U_estado_proceso = 'P'";
                if (loadId) query += " AND U_Code_Load = @loadId";
                break;
            case "N":
                // Al revertir a N, también nos aseguramos de limpiar el loadId si se proporcionó
                if (loadId) {
                    await LoadsSQLService.clearUCodeLoad(connection, selectedPedidos, loadId);
                }
                break;
        }

        const result = await DatabaseServiceAdapter.query(connection, query, params);
        const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : result.rowsAffected;

        logger.info(`${affected} pedidos actualizados a estado '${estado}'`);
        return { success: true, updatedCount: affected };
    }

    // ─── Preparación e inserción en tablas IMPLT ──────────────────────────────

    /**
     * Prepara el array de datos de traspaso mapeando bodegas origen por línea.
     */
    static prepareTraspasoData(ordersData, bodegaDestino) {
        return ordersData.map((order) => ({
            Code_Product: order.Code_Product,
            Quantity: order.Quantity,
            bodega: order.Code_Warehouse_Orig,
            bodega_destino: bodegaDestino,
            Code_load: order.Code_load,
        }));
    }

    /**
     * Lee y transforma las líneas de pedido para insertar en IMPLT_Orders (server2).
     */
    static async getTransformedOrdersData(connection, selectedPedidos, loadId) {
        if (!Array.isArray(selectedPedidos) || selectedPedidos.length === 0) {
            throw new Error("selectedPedidos debe ser un array no vacío.");
        }

        const pedidosList = selectedPedidos.map((_, i) => `@pedido${i}`).join(", ");
        const params = { loadId };
        selectedPedidos.forEach((p, i) => { params[`pedido${i}`] = p; });

        const query = `
      WITH BaseData AS (
        SELECT
          pl.PEDIDO, pl.PEDIDO_LINEA,
          pl.CANTIDAD_PEDIDA, pl.CANTIDAD_BONIFICAD,
          pl.PRECIO_UNITARIO, pl.MONTO_DESCUENTO, pl.PORC_DESCUENTO,
          pl.PORC_IMPUESTO1, pl.PORC_IMPUESTO2,
          pe.RUBRO5, GETDATE() as FECHA_PROMETIDA, pe.FECHA_PEDIDO,
          pe.CLIENTE, pe.VENDEDOR, pe.RUBRO4, pe.RUBRO2,
          cl.detalle_direccion, ar.ARTICULO, ar.UNIDAD_ALMACEN,
          pl.BODEGA as BODEGA_LINEA,
          pl.LOCALIZACION as LOCALIZACION_ORIGEN_REAL,
          v.U_BODEGA_CENTRAL as BODEGA_ORIGEN_REAL
        FROM CATELLI.PEDIDO_LINEA AS pl
        INNER JOIN CATELLI.PEDIDO AS pe ON pe.PEDIDO = pl.PEDIDO
        INNER JOIN CATELLI.CLIENTE AS cl ON cl.CLIENTE = pe.CLIENTE
        LEFT JOIN CATELLI.ARTICULO AS ar ON ar.ARTICULO = pl.ARTICULO
        LEFT JOIN CATELLI.VENDEDOR AS v ON v.VENDEDOR = pe.VENDEDOR
        WHERE pe.PEDIDO IN (${pedidosList})
        AND pe.U_Code_Load = @loadId
      ),
      Calc AS (
        -- Ajuste de Almacen por faltante de stock (Revision de Almacen) --
        -- nunca toca CATELLI.PEDIDO_LINEA, solo reemplaza la cantidad que
        -- usamos para ESTA carga puntual. Vacio al momento del Despacho
        -- inicial (sin filas en loads_orders_adjustments todavia), se llena
        -- recien si Almacen ajusta antes de autorizar -- por eso esta misma
        -- query sirve tanto para el insert inicial como para la
        -- regeneracion del staging al autorizar. Pagado ('P') y bonificado
        -- ('B') son ajustes independientes de la MISMA PEDIDO_LINEA -- no
        -- sabemos la regla de promocion de Preventa para recalcular la
        -- bonificacion sola, asi que Almacen la ajusta aparte si corresponde
        -- (ver loads_orders_adjustments.tipo_linea).
        SELECT bd.PEDIDO, bd.PEDIDO_LINEA, CAST(bd.PEDIDO_LINEA AS VARCHAR(10)) + '-P' AS LINEA_TIPO,
               'P' AS TIPO_LINEA,
               COALESCE(adjP.cantidad_ajustada, bd.CANTIDAD_PEDIDA) AS Cantidad,
               bd.PRECIO_UNITARIO,
               bd.MONTO_DESCUENTO, bd.PORC_DESCUENTO, bd.PORC_IMPUESTO1, bd.PORC_IMPUESTO2,
               bd.RUBRO5, bd.FECHA_PROMETIDA, bd.FECHA_PEDIDO, bd.CLIENTE, bd.VENDEDOR, bd.RUBRO4, bd.RUBRO2,
               bd.detalle_direccion, bd.ARTICULO, bd.UNIDAD_ALMACEN, bd.BODEGA_ORIGEN_REAL, bd.LOCALIZACION_ORIGEN_REAL,
               (COALESCE(adjP.cantidad_ajustada, bd.CANTIDAD_PEDIDA) * bd.PRECIO_UNITARIO) AS SubTotal,
               ((COALESCE(adjP.cantidad_ajustada, bd.CANTIDAD_PEDIDA) * bd.PRECIO_UNITARIO) - bd.MONTO_DESCUENTO) AS TotalAmount,
               CASE
                 WHEN SUBSTRING(bd.CLIENTE, PATINDEX('%[A-Za-z]%', bd.CLIENTE), 1) NOT IN ('O','R')
                   THEN 'CN' + bd.CLIENTE ELSE bd.CLIENTE
               END AS Code_Account_Calc
        FROM BaseData bd
        LEFT JOIN core_app.loads_orders_adjustments adjP
          ON adjP.code_load = @loadId AND adjP.pedido = bd.PEDIDO AND adjP.pedido_linea = bd.PEDIDO_LINEA AND adjP.tipo_linea = 'P'
        WHERE COALESCE(adjP.cantidad_ajustada, bd.CANTIDAD_PEDIDA) <> 0
        UNION ALL
        SELECT bd.PEDIDO, bd.PEDIDO_LINEA, CAST(bd.PEDIDO_LINEA AS VARCHAR(10)) + '-B' AS LINEA_TIPO,
               'B' AS TIPO_LINEA,
               COALESCE(adjB.cantidad_ajustada, bd.CANTIDAD_BONIFICAD) AS Cantidad,
               0 AS PRECIO_UNITARIO,
               0 AS MONTO_DESCUENTO, 0 AS PORC_DESCUENTO, 0 AS PORC_IMPUESTO1, 0 AS PORC_IMPUESTO2,
               bd.RUBRO5, bd.FECHA_PROMETIDA, bd.FECHA_PEDIDO, bd.CLIENTE, bd.VENDEDOR, bd.RUBRO4, bd.RUBRO2,
               bd.detalle_direccion, bd.ARTICULO, bd.UNIDAD_ALMACEN, bd.BODEGA_ORIGEN_REAL, bd.LOCALIZACION_ORIGEN_REAL,
               0 AS SubTotal, 0 AS TotalAmount,
               CASE
                 WHEN SUBSTRING(bd.CLIENTE, PATINDEX('%[A-Za-z]%', bd.CLIENTE), 1) NOT IN ('O','R')
                   THEN 'CN' + bd.CLIENTE ELSE bd.CLIENTE
               END AS Code_Account_Calc
        FROM BaseData bd
        LEFT JOIN core_app.loads_orders_adjustments adjB
          ON adjB.code_load = @loadId AND adjB.pedido = bd.PEDIDO AND adjB.pedido_linea = bd.PEDIDO_LINEA AND adjB.tipo_linea = 'B'
        WHERE bd.CANTIDAD_BONIFICAD > 0 AND COALESCE(adjB.cantidad_ajustada, bd.CANTIDAD_BONIFICAD) > 0
      )
      SELECT
        'CATELLI' AS Code_Unit_Org, 'CATELLI' AS Code_Sales_Org,
        PEDIDO AS Order_Num_ofClient,
        ROW_NUMBER() OVER (ORDER BY PEDIDO, PEDIDO_LINEA, LINEA_TIPO) AS Num_Line,
        -- RUBRO4 viene NULL en pedidos cargados internamente (no por
        -- preventa). Mandar NULL tal cual a IMPLT_Orders hace que server2
        -- le invente un numero propio (le vimos generar valores de 22
        -- digitos) -- en vez de eso armamos uno del mismo largo que usa
        -- Preventa (16 digitos: epoch-ms + 3 digitos), para que nunca
        -- llegue NULL. Se arma sobre FECHA_PEDIDO (no GETDATE()) para que
        -- de el mismo valor si esta query se vuelve a correr para el mismo
        -- pedido (ver Revision de Almacen: se regenera al autorizar).
        COALESCE(
          RUBRO4,
          CAST(DATEDIFF(SECOND, '19700101', FECHA_PEDIDO) AS VARCHAR(20)) + '000' + RIGHT(PEDIDO, 3)
        ) AS Order_Num, 'S' AS Type_Rec, @loadId AS Code_load,
        CONVERT(VARCHAR, FECHA_PROMETIDA, 112) AS Date_Delivery,
        CONVERT(VARCHAR, FECHA_PEDIDO, 112) AS Order_Date,
        Code_Account_Calc AS Code_Account,
        -- Ruta de Reparto real del cliente (core_app.route_accounts_syncs,
        -- Centro de Carga de Rutas) -- antes se mandaba el codigo del
        -- Repartidor elegido en el Code_Route de IMPLT_loads_detail, que no
        -- es lo mismo. Un repartidor entrega una sola ruta (segun los
        -- clientes cargados en route_accounts_syncs), asi que toma el
        -- Code_Route de cualquiera de los clientes de la carga.
        ra.code_route AS Code_Route,
        ARTICULO AS Code_Product, '999999999' AS Lot_Number,
        CAST(Cantidad AS NUMERIC(11,3)) AS Quantity,
        CAST(Cantidad AS NUMERIC(11,3)) AS Quantity_Order,
        UNIDAD_ALMACEN AS Unit_Measure,
        CAST(PRECIO_UNITARIO AS NUMERIC(11,3)) AS Price_Br,
        CAST(CASE WHEN Cantidad <> 0 THEN TotalAmount / Cantidad ELSE 0 END AS NUMERIC(11,3)) AS Price,
        CAST(TotalAmount AS NUMERIC(11,3)) AS Total_Amount,
        CAST(PORC_DESCUENTO AS NUMERIC(5,2)) AS Por_Discount1,
        CAST(MONTO_DESCUENTO AS NUMERIC(11,3)) AS Amount_Discount1,
        CAST(PORC_IMPUESTO1 AS NUMERIC(5,2)) AS Por_Tax1,
        CAST(TotalAmount * (PORC_IMPUESTO1 / 100.0) AS NUMERIC(11,3)) AS Amount_Tax1,
        CAST(PORC_IMPUESTO2 AS NUMERIC(5,2)) AS Por_Tax2,
        CAST(TotalAmount * (PORC_IMPUESTO2 / 100.0) AS NUMERIC(11,3)) AS Amount_Tax2,
        -- Order_Num_Cli vuelve a ser PEDIDO (como era originalmente); RUBRO2
        -- pasa a Order_Alt_Num, un campo nuevo aparte -- no un reemplazo.
        'RD' AS Code_Currency, '0' AS Secuence, PEDIDO AS Order_Num_Cli, RUBRO2 AS Order_Alt_Num,
        VENDEDOR AS Code_Seller, CASE WHEN TIPO_LINEA = 'B' THEN '1' ELSE '0' END AS Sale_Type,
        detalle_direccion AS Code_Address, '00' AS Transport, 1 AS Transfer_status,
        BODEGA_ORIGEN_REAL AS Code_Warehouse_Orig,
        LOCALIZACION_ORIGEN_REAL AS Localizacion_Orig,
        TIPO_LINEA, LINEA_TIPO -- Mantener para trazabilidad interna
      FROM Calc
      LEFT JOIN core_app.route_accounts_syncs ra
        ON ra.code_account = Calc.Code_Account_Calc AND ra.assignment_type = 'REPARTO'
      ORDER BY PEDIDO, PEDIDO_LINEA, LINEA_TIPO
    `;

        const result = await DatabaseServiceAdapter.query(connection, query, params);
        return result.recordset;
    }

    /**
     * Inserta los datos transformados en core_app.loads_orders_staging (server1,
     * misma conexion/transaccion que el resto de processOrderLoad). Antes esto
     * insertaba directo en dbo.IMPLT_Orders (server2) en una conexion aparte —
     * si el traspaso fallaba despues, esas filas quedaban huerfanas ahi porque
     * no habia forma de revertir un INSERT ya hecho en otro servidor. Ahora una
     * tarea del motor de Tareas de Transferencia empuja desde este staging a
     * server2, y si la transaccion de server1 se revierte, esta fila se revierte
     * con ella — no hay nada que limpiar en server2 porque nunca llegó a existir.
     */
    static async insertToLoadsOrdersStaging(connection, ordersData, reviewStatus = "pending") {
        for (const order of ordersData) {
            await DatabaseServiceAdapter.query(connection, `
        INSERT INTO core_app.loads_orders_staging (
          code_load, num_line, code_unit_org, code_sales_org, order_num_ofclient, order_num,
          type_rec, date_delivery, order_date, code_account, code_product,
          lot_number, quantity, quantity_order, unit_measure, price_br, price,
          total_amount, por_discount1, amount_discount1, por_tax1, amount_tax1,
          por_tax2, amount_tax2, code_currency, secuence, order_num_cli, order_alt_num,
          code_seller, sale_type, code_address, transport, transfer_status, review_status
        ) VALUES (
          @Code_load, @Num_Line, @Code_Unit_Org, @Code_Sales_Org, @Order_Num_ofClient, @Order_Num,
          @Type_Rec, @Date_Delivery, @Order_Date, @Code_Account, @Code_Product,
          @Lot_Number, @Quantity, @Quantity_Order, @Unit_Measure, @Price_Br, @Price,
          @Total_Amount, @Por_Discount1, @Amount_Discount1, @Por_Tax1, @Amount_Tax1,
          @Por_Tax2, @Amount_Tax2, @Code_Currency, @Secuence, @Order_Num_Cli, @Order_Alt_Num,
          @Code_Seller, @Sale_Type, @Code_Address, @Transport, @Transfer_status, @Review_status
        )
      `, { ...order, Review_status: reviewStatus });
        }
        logger.info(`${ordersData.length} registros insertados en core_app.loads_orders_staging (review_status=${reviewStatus})`);
    }

    /**
     * Borra el staging previo de una carga (ambas tablas) antes de regenerarlo
     * al autorizar — las cantidades pueden haber cambiado por ajustes de
     * Almacén, así que se reemplaza entero en vez de hacer UPDATE fila a fila.
     */
    static async clearStagingForLoad(connection, loadId) {
        await DatabaseServiceAdapter.query(connection,
            `DELETE FROM core_app.loads_orders_staging WHERE code_load = @loadId`, { loadId });
        await DatabaseServiceAdapter.query(connection,
            `DELETE FROM core_app.loads_detail_staging WHERE code = @loadId`, { loadId });
    }

    /**
     * Inserta el resumen de la carga en core_app.loads_detail_staging (server1) —
     * mismo motivo que insertToLoadsOrdersStaging: evitar filas huerfanas en
     * server2 cuando el traspaso falla despues del insert.
     *
     * code_warehouse_sou = bodega de ORIGEN real (de donde sale la mercadería
     * físicamente) -- se probó por un momento usar acá la bodega del
     * repartidor, pero el usuario corrigió: Code_Warehouse_Sou tiene que ser
     * el origen. ordersData ya trae el valor correcto en Code_Warehouse_Orig
     * -- en el despacho inicial, la inferencia automática; al autorizar, lo
     * que haya confirmado el operador en el selector de Revisión de Almacén
     * (ver authorizeDispatch), que pisa Code_Warehouse_Orig en todas las
     * líneas antes de llegar acá.
     */
    static async insertToLoadsDetailStaging(connection, loadId, route, ordersData, reviewStatus = "pending") {
        if (!ordersData || ordersData.length === 0) return;

        const productMap = new Map();
        ordersData.forEach((order) => {
            const bodegaOrigen = order.Code_Warehouse_Orig || "01";
            const key = `${order.Code_Product}_${bodegaOrigen}`;

            if (productMap.has(key)) {
                productMap.get(key).Quantity += order.Quantity || 0;
            } else {
                productMap.set(key, {
                    Code_Product: order.Code_Product,
                    Quantity: order.Quantity || 0,
                    Order_Date: order.Date_Delivery,
                    Code_Warehouse_Orig: bodegaOrigen
                });
            }
        });

        let lineNumber = 1;
        for (const product of productMap.values()) {
            await DatabaseServiceAdapter.query(connection, `
        INSERT INTO core_app.loads_detail_staging (
          code, num_line, lot_group, code_product, date_load, quantity, unit_type,
          code_warehouse_sou, code_route, source_create, transfer_status, review_status
        ) VALUES (
          @Code, @Num_Line, '999999999', @Code_Product, @Date_Load, @Quantity, 'UND',
          @warehouseSou, @route, '0', 1, @reviewStatus
        )
      `, {
                Code: loadId,
                Num_Line: lineNumber++,
                Code_Product: product.Code_Product,
                Date_Load: product.Order_Date,
                Quantity: product.Quantity,
                warehouseSou: product.Code_Warehouse_Orig,
                route,
                reviewStatus
            });
        }
        logger.info(`${lineNumber - 1} líneas insertadas en core_app.loads_detail_staging (review_status=${reviewStatus})`);
    }

    // ─── Revisión de Almacén ───────────────────────────────────────────────────

    /**
     * Cargas armadas con staging en review_status='pending' — lista para la
     * pantalla "Revisión de Almacén". Se agrupa sobre loads_orders_staging
     * (ya tiene las líneas finales de la carga) en vez de volver a leer
     * CATELLI, porque acá solo hace falta un resumen por carga.
     */
    static async getPendingReviewLoads() {
        return await withConnection("server1", async (connection) => {
            const query = `
        SELECT
          code_load,
          COUNT(DISTINCT order_num_ofclient) AS totalPedidos,
          COUNT(DISTINCT code_product) AS totalProductos,
          MIN(order_date) AS fechaPedido,
          MIN(date_delivery) AS fechaEntrega
        FROM core_app.loads_orders_staging
        WHERE review_status = 'pending'
        GROUP BY code_load
        ORDER BY MIN(date_delivery), code_load
      `;
            const result = await DatabaseServiceAdapter.query(connection, query, {});
            return result.recordset;
        });
    }

    /**
     * Detalle de conciliación por producto de una carga: acumulado armado,
     * empaque (CATELLI.ARTICULO.peso_bruto) y líneas por pedido/cliente, con
     * el ajuste de Almacén ya aplicado si existe (core_app.loads_orders_adjustments).
     * Se lee directo de CATELLI.PEDIDO_LINEA (no del staging) porque el staging
     * no guarda PEDIDO_LINEA — solo así se puede referenciar la línea exacta
     * a ajustar.
     */
    static async getLoadReviewDetail(loadId) {
        return await withConnection("server1", async (connection) => {
            const query = `
        WITH BaseData AS (
          SELECT
            pl.PEDIDO, pl.PEDIDO_LINEA, pl.ARTICULO AS Code_Product,
            pl.CANTIDAD_PEDIDA, pl.CANTIDAD_BONIFICAD,
            ar.DESCRIPCION AS descripcion,
            ar.peso_bruto AS empaque,
            ar.UNIDAD_ALMACEN AS unidadMedida,
            pe.CLIENTE AS cliente,
            cl.detalle_direccion AS direccionCliente
          FROM CATELLI.PEDIDO_LINEA pl
          INNER JOIN CATELLI.PEDIDO pe ON pe.PEDIDO = pl.PEDIDO
          INNER JOIN CATELLI.CLIENTE cl ON cl.CLIENTE = pe.CLIENTE
          LEFT JOIN CATELLI.ARTICULO ar ON ar.ARTICULO = pl.ARTICULO
          WHERE pe.U_Code_Load = @loadId
        )
        -- Pagado ('P') y bonificado ('B') de la MISMA PEDIDO_LINEA salen como
        -- dos líneas editables independientes -- no sabemos la regla de
        -- promoción de Preventa para recalcular la bonificación sola cuando
        -- Almacén ajusta lo pagado, así que las dos quedan a criterio del
        -- operador (ver loads_orders_adjustments.tipo_linea).
        SELECT bd.PEDIDO, bd.PEDIDO_LINEA, bd.Code_Product, 'P' AS tipoLinea,
               bd.CANTIDAD_PEDIDA AS cantidadOriginal,
               COALESCE(adj.cantidad_ajustada, bd.CANTIDAD_PEDIDA) AS cantidadActual,
               bd.descripcion, bd.empaque, bd.unidadMedida, bd.cliente, bd.direccionCliente,
               adj.motivo, adj.ajustado_por AS ajustadoPor, adj.fecha AS fechaAjuste
        FROM BaseData bd
        LEFT JOIN core_app.loads_orders_adjustments adj
          ON adj.code_load = @loadId AND adj.pedido = bd.PEDIDO AND adj.pedido_linea = bd.PEDIDO_LINEA AND adj.tipo_linea = 'P'
        WHERE bd.CANTIDAD_PEDIDA <> 0
        UNION ALL
        SELECT bd.PEDIDO, bd.PEDIDO_LINEA, bd.Code_Product, 'B' AS tipoLinea,
               bd.CANTIDAD_BONIFICAD AS cantidadOriginal,
               COALESCE(adj.cantidad_ajustada, bd.CANTIDAD_BONIFICAD) AS cantidadActual,
               bd.descripcion, bd.empaque, bd.unidadMedida, bd.cliente, bd.direccionCliente,
               adj.motivo, adj.ajustado_por AS ajustadoPor, adj.fecha AS fechaAjuste
        FROM BaseData bd
        LEFT JOIN core_app.loads_orders_adjustments adj
          ON adj.code_load = @loadId AND adj.pedido = bd.PEDIDO AND adj.pedido_linea = bd.PEDIDO_LINEA AND adj.tipo_linea = 'B'
        WHERE bd.CANTIDAD_BONIFICAD > 0
        ORDER BY Code_Product, PEDIDO, PEDIDO_LINEA, tipoLinea
      `;
            const result = await DatabaseServiceAdapter.query(connection, query, { loadId });

            if (result.recordset.length === 0) {
                throw new Error(`No se encontraron líneas de pedido para la carga ${loadId}`);
            }

            const productosMap = new Map();
            for (const row of result.recordset) {
                if (!productosMap.has(row.Code_Product)) {
                    productosMap.set(row.Code_Product, {
                        codigo: row.Code_Product,
                        descripcion: row.descripcion || row.Code_Product,
                        empaque: row.empaque || 1,
                        unidadMedida: row.unidadMedida,
                        totalOriginal: 0,
                        totalActual: 0,
                        lineas: [],
                    });
                }
                const producto = productosMap.get(row.Code_Product);
                producto.totalOriginal += Number(row.cantidadOriginal) || 0;
                producto.totalActual += Number(row.cantidadActual) || 0;
                producto.lineas.push({
                    pedido: row.PEDIDO,
                    pedidoLinea: row.PEDIDO_LINEA,
                    tipoLinea: row.tipoLinea,
                    cliente: row.cliente,
                    direccionCliente: row.direccionCliente,
                    cantidadOriginal: Number(row.cantidadOriginal) || 0,
                    cantidadActual: Number(row.cantidadActual) || 0,
                    motivo: row.motivo || null,
                    ajustadoPor: row.ajustadoPor || null,
                    fechaAjuste: row.fechaAjuste || null,
                });
            }

            // Bodegas de origen detectadas: la bodega propia de cada línea
            // (pl.BODEGA) SOLO cuando esa línea es la "regular" (CANTIDAD_PEDIDA
            // <> 0) -- las líneas de oferta/bonificación pueden tener su propia
            // BODEGA (ej. una bodega de oferta aparte) que no representa de
            // dónde sale la mercadería real, así que se ignoran. Si un mismo
            // pedido no tiene ninguna línea regular con bodega (caso raro), cae
            // a U_BODEGA_CENTRAL del vendedor como respaldo. Esto es solo para
            // sugerir/poblar el selector en Revisión de Almacén -- el operador
            // confirma o cambia antes de autorizar (ver authorizeDispatch, que
            // valida contra CATELLI.BODEGA de todas formas).
            const bodegasDetectadasResult = await DatabaseServiceAdapter.query(connection, `
        SELECT pl.BODEGA AS bodega, COUNT(*) AS cantidad
        FROM CATELLI.PEDIDO_LINEA pl
        INNER JOIN CATELLI.PEDIDO pe ON pe.PEDIDO = pl.PEDIDO
        WHERE pe.U_Code_Load = @loadId AND pl.CANTIDAD_PEDIDA <> 0 AND pl.BODEGA IS NOT NULL
        GROUP BY pl.BODEGA
        ORDER BY COUNT(*) DESC
      `, { loadId });
            const bodegasDetectadas = bodegasDetectadasResult.recordset.map((r) => r.bodega);

            let bodegaOrigenSugerida = bodegasDetectadas[0] || null;
            if (!bodegaOrigenSugerida) {
                const bodegaVendedorResult = await DatabaseServiceAdapter.query(connection, `
          SELECT TOP 1 v.U_BODEGA_CENTRAL AS bodega, COUNT(*) AS cantidad
          FROM CATELLI.PEDIDO_LINEA pl
          INNER JOIN CATELLI.PEDIDO pe ON pe.PEDIDO = pl.PEDIDO
          LEFT JOIN CATELLI.VENDEDOR v ON v.VENDEDOR = pe.VENDEDOR
          WHERE pe.U_Code_Load = @loadId AND pl.CANTIDAD_PEDIDA <> 0 AND v.U_BODEGA_CENTRAL IS NOT NULL
          GROUP BY v.U_BODEGA_CENTRAL
          ORDER BY COUNT(*) DESC
        `, { loadId });
                bodegaOrigenSugerida = bodegaVendedorResult.recordset[0]?.bodega || null;
            }

            return { loadId, bodegasDetectadas, bodegaOrigenSugerida, productos: Array.from(productosMap.values()) };
        });
    }

    /**
     * Crea o reemplaza el ajuste de una línea puntual (upsert por
     * code_load+pedido+pedido_linea+tipo_linea, ver
     * UQ_loads_orders_adjustments_linea). No toca CATELLI.PEDIDO_LINEA.
     */
    static async upsertLineAdjustment(loadId, adjustment, userId) {
        const { pedido, pedidoLinea, tipoLinea = "P", codeProduct, cantidadOriginal, cantidadAjustada, motivo } = adjustment;
        return await withConnection("server1", async (connection) => {
            await DatabaseServiceAdapter.query(connection, `
        MERGE core_app.loads_orders_adjustments AS target
        USING (SELECT @loadId AS code_load, @pedido AS pedido, @pedidoLinea AS pedido_linea, @tipoLinea AS tipo_linea) AS src
          ON target.code_load = src.code_load AND target.pedido = src.pedido
             AND target.pedido_linea = src.pedido_linea AND target.tipo_linea = src.tipo_linea
        WHEN MATCHED THEN UPDATE SET
          cantidad_original = @cantidadOriginal,
          cantidad_ajustada = @cantidadAjustada,
          code_product = @codeProduct,
          motivo = @motivo,
          ajustado_por = @userId,
          fecha = GETDATE()
        WHEN NOT MATCHED THEN INSERT (
          code_load, pedido, pedido_linea, tipo_linea, code_product, cantidad_original, cantidad_ajustada, motivo, ajustado_por, fecha
        ) VALUES (
          @loadId, @pedido, @pedidoLinea, @tipoLinea, @codeProduct, @cantidadOriginal, @cantidadAjustada, @motivo, @userId, GETDATE()
        );
      `, {
                loadId, pedido, pedidoLinea, tipoLinea, codeProduct,
                cantidadOriginal, cantidadAjustada,
                motivo: motivo || null,
                userId,
            });
        });
    }

    // ─── Otras operaciones de pedidos ─────────────────────────────────────────

    /**
     * Cancela pedidos marcándolos como anulados (estado C).
     */
    static async cancelOrders(selectedPedidos, userId, reason) {
        return await withConnection("server1", async (connection) => {
            const placeholders = selectedPedidos.map((_, i) => `@pedido${i}`).join(", ");
            const params = {};
            selectedPedidos.forEach((p, i) => { params[`pedido${i}`] = p; });

            const result = await DatabaseServiceAdapter.query(connection, `
        UPDATE CATELLI.PEDIDO SET estado = 'C', U_estado_proceso = 'C'
        WHERE PEDIDO IN (${placeholders}) AND estado = 'N' AND U_Code_Load IS NULL
      `, params);

            const cancelled = result.rowsAffected[0];
            logger.info(`${cancelled} pedidos cancelados. Motivo: ${reason}`);
            return { success: true, message: `${cancelled} pedidos cancelados`, cancelledCount: cancelled };
        });
    }

    /**
     * Elimina líneas específicas de un pedido.
     */
    static async removeOrderLines(pedidoId, selectedLines, userId) {
        return await withConnection("server1", async (connection) => {
            const linesList = selectedLines.map((_, i) => `@line${i}`).join(", ");
            const params = { pedidoId, userId };
            selectedLines.forEach((l, i) => { params[`line${i}`] = l; });

            const result = await DatabaseServiceAdapter.query(connection, `
        DELETE FROM CATELLI.PEDIDO_LINEA
        WHERE PEDIDO = @pedidoId AND PEDIDO_LINEA IN (${linesList})
      `, params);

            const removed = result.rowsAffected[0];
            logger.info(`${removed} líneas eliminadas del pedido ${pedidoId}`);
            return { success: true, message: `${removed} líneas eliminadas`, removedCount: removed };
        });
    }

    // ─── Helpers internos ─────────────────────────────────────────────────────

    /**
     * Construye el WHERE clause de forma segura (sin interpolación de valores de usuario).
     * Todos los valores van en el objeto `params` para prevenir SQL Injection.
     */
    static buildWhereConditions(baseQuery, filters) {
        const conditions = [];
        const params = {};

        if (!filters.includeLoaded) {
            conditions.push("(pe.U_Code_Load IS NULL OR pe.U_Code_Load = '')");
        }

        const transferStatusMap = {
            pending: "(pe.U_estado_proceso = 'N' OR pe.U_estado_proceso IS NULL)",
            processing: "pe.U_estado_proceso = 'P'",
            completed: "pe.U_estado_proceso = 'S'",
            cancelled: "pe.U_estado_proceso = 'C'",
        };

        if (filters.transferStatus && filters.transferStatus !== "all") {
            const cond = transferStatusMap[filters.transferStatus];
            if (cond) conditions.push(cond);
        } else {
            conditions.push("(pe.U_estado_proceso IN ('N', 'P') OR pe.U_estado_proceso IS NULL)");
        }

        if (filters.dateFrom) {
            conditions.push("CAST(pe.FECHA_PEDIDO AS DATE) >= @dateFrom");
            params.dateFrom = filters.dateFrom;
        }

        if (filters.dateTo) {
            conditions.push("CAST(pe.FECHA_PEDIDO AS DATE) <= @dateTo");
            params.dateTo = filters.dateTo;
        }

        if (filters.seller && filters.seller !== "all") {
            const sellerList = typeof filters.seller === 'string'
                ? filters.seller.split(',').filter(s => s.trim() !== '')
                : (Array.isArray(filters.seller) ? filters.seller : [filters.seller]);

            if (sellerList.length > 0) {
                const sellerPlaceholders = sellerList.map((_, i) => `@seller${i}`).join(", ");
                conditions.push(`pe.VENDEDOR IN (${sellerPlaceholders})`);
                sellerList.forEach((s, i) => {
                    params[`seller${i}`] = s;
                });
            }
        }

        const whereClause = conditions.length > 0
            ? `${baseQuery} AND ${conditions.join(" AND ")}`
            : baseQuery;

        return { whereClause, params };
    }
}

module.exports = LoadsSQLService;
