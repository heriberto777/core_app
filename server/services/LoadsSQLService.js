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

                if (filters.seller && filters.seller !== "all") {
                    baseQuery += " AND pe.VENDEDOR = @seller";
                    params.seller = filters.seller;
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
     * Obtiene vendedores/repartidores activos con sus bodegas asignadas.
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
        WHERE ACTIVO = 'S'
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

    /** Alias de getSellers — mantiene retrocompatibilidad. */
    static async getDeliveryPersons() {
        return LoadsSQLService.getSellers();
    }

    /**
     * Valida que el repartidor existe y está activo.
     * Lanza error si no existe o no tiene bodega asignada.
     */
    static async validateDeliveryPerson(deliveryPersonCode) {
        return await withConnection("server1", async (connection) => {
            const query = `
        SELECT
          VENDEDOR as code, NOMBRE as name,
          U_BODEGA as assignedWarehouse, U_ESVENDEDOR as isVendedor, ACTIVO as isActive
        FROM CATELLI.VENDEDOR
        WHERE VENDEDOR = @deliveryPersonCode AND ACTIVO = 'S'
      `;
            const result = await DatabaseServiceAdapter.query(connection, query, { deliveryPersonCode });

            if (!result.recordset || result.recordset.length === 0) {
                throw new Error(`Repartidor ${deliveryPersonCode} no encontrado o inactivo.`);
            }

            const deliveryPerson = result.recordset[0];
            if (!deliveryPerson.assignedWarehouse) {
                throw new Error(`Repartidor ${deliveryPersonCode} no tiene bodega asignada (U_BODEGA)`);
            }

            logger.info(`Repartidor: ${deliveryPerson.name} — Bodega: ${deliveryPerson.assignedWarehouse}`);
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
          pl.PEDIDO, pl.PEDIDO_LINEA, pl.CANTIDAD_PEDIDA, pl.CANTIDAD_BONIFICAD,
          pl.PRECIO_UNITARIO, pl.MONTO_DESCUENTO, pl.PORC_DESCUENTO,
          pl.PORC_IMPUESTO1, pl.PORC_IMPUESTO2,
          pe.RUBRO5, GETDATE() as FECHA_PROMETIDA, pe.FECHA_PEDIDO,
          pe.CLIENTE, pe.VENDEDOR, pe.RUBRO4,
          cl.detalle_direccion, ar.ARTICULO, ar.UNIDAD_ALMACEN,
          pl.BODEGA as BODEGA_ORIGEN_REAL,
          pl.LOCALIZACION as LOCALIZACION_ORIGEN_REAL
        FROM CATELLI.PEDIDO_LINEA AS pl
        INNER JOIN CATELLI.PEDIDO AS pe ON pe.PEDIDO = pl.PEDIDO
        INNER JOIN CATELLI.CLIENTE AS cl ON cl.CLIENTE = pe.CLIENTE
        LEFT JOIN CATELLI.ARTICULO AS ar ON ar.ARTICULO = pl.ARTICULO
        WHERE pe.PEDIDO IN (${pedidosList})
        AND pe.U_Code_Load = @loadId
      ),
      Calc AS (
        SELECT PEDIDO, PEDIDO_LINEA, CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-P' AS LINEA_TIPO,
               'P' AS TIPO_LINEA, CANTIDAD_PEDIDA AS Cantidad, PRECIO_UNITARIO,
               MONTO_DESCUENTO, PORC_DESCUENTO, PORC_IMPUESTO1, PORC_IMPUESTO2,
               RUBRO5, FECHA_PROMETIDA, FECHA_PEDIDO, CLIENTE, VENDEDOR, RUBRO4,
               detalle_direccion, ARTICULO, UNIDAD_ALMACEN, BODEGA_ORIGEN_REAL, LOCALIZACION_ORIGEN_REAL,
               (CANTIDAD_PEDIDA * PRECIO_UNITARIO) AS SubTotal,
               ((CANTIDAD_PEDIDA * PRECIO_UNITARIO) - MONTO_DESCUENTO) AS TotalAmount
        FROM BaseData WHERE CANTIDAD_PEDIDA <> 0
        UNION ALL
        SELECT PEDIDO, PEDIDO_LINEA, CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-B' AS LINEA_TIPO,
               'B' AS TIPO_LINEA, CANTIDAD_BONIFICAD AS Cantidad, 0 AS PRECIO_UNITARIO,
               0 AS MONTO_DESCUENTO, 0 AS PORC_DESCUENTO, 0 AS PORC_IMPUESTO1, 0 AS PORC_IMPUESTO2,
               RUBRO5, FECHA_PROMETIDA, FECHA_PEDIDO, CLIENTE, VENDEDOR, RUBRO4,
               detalle_direccion, ARTICULO, UNIDAD_ALMACEN, BODEGA_ORIGEN_REAL, LOCALIZACION_ORIGEN_REAL,
               0 AS SubTotal, 0 AS TotalAmount
        FROM BaseData WHERE CANTIDAD_BONIFICAD > 0
      )
      SELECT
        'CATELLI' AS Code_Unit_Org, 'CATELLI' AS Code_Sales_Org,
        PEDIDO AS Order_Num_ofClient,
        ROW_NUMBER() OVER (ORDER BY PEDIDO, PEDIDO_LINEA, LINEA_TIPO) AS Num_Line,
        RUBRO4 AS Order_Num, 'S' AS Type_Rec, @loadId AS Code_load,
        CONVERT(VARCHAR, FECHA_PROMETIDA, 112) AS Date_Delivery,
        CONVERT(VARCHAR, FECHA_PEDIDO, 112) AS Order_Date,
        CASE
          WHEN SUBSTRING(CLIENTE, PATINDEX('%[A-Za-z]%', CLIENTE), 1) NOT IN ('O','R')
            THEN 'C' + CLIENTE ELSE CLIENTE
        END AS Code_Account,
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
        'RD' AS Code_Currency, '0' AS Secuence, PEDIDO AS Order_Num_Cli,
        VENDEDOR AS Code_Seller, CASE WHEN TIPO_LINEA = 'B' THEN '1' ELSE '0' END AS Sale_Type,
        detalle_direccion AS Code_Address, '00' AS Transport, 1 AS Transfer_status,
        BODEGA_ORIGEN_REAL AS Code_Warehouse_Orig,
        LOCALIZACION_ORIGEN_REAL AS Localizacion_Orig,
        TIPO_LINEA, LINEA_TIPO -- Mantener para trazabilidad interna
      FROM Calc ORDER BY PEDIDO, PEDIDO_LINEA, LINEA_TIPO
    `;

        const result = await DatabaseServiceAdapter.query(connection, query, params);
        return result.recordset;
    }

    /**
     * Inserta los datos transformados en IMPLT_Orders (server2).
     */
    static async insertToIMPLTOrders(connection, ordersData) {
        for (const order of ordersData) {
            await DatabaseServiceAdapter.query(connection, `
        INSERT INTO dbo.IMPLT_Orders (
          Code_Unit_Org, Code_Sales_Org, Order_Num_ofClient, Num_Line, Order_Num,
          Type_Rec, Code_load, Date_Delivery, Order_Date, Code_Account, Code_Product,
          Lot_Number, Quantity, Quantity_Order, Unit_Measure, Price_Br, Price,
          Total_Amount, Por_Discount1, Amount_Discount1, Por_Tax1, Amount_Tax1,
          Por_Tax2, Amount_Tax2, Code_Currency, Secuence, Order_Num_Cli,
          Code_Seller, Sale_Type, Code_Address, Transport, Transfer_status
        ) VALUES (
          @Code_Unit_Org, @Code_Sales_Org, @Order_Num_ofClient, @Num_Line, @Order_Num,
          @Type_Rec, @Code_load, @Date_Delivery, @Order_Date, @Code_Account, @Code_Product,
          @Lot_Number, @Quantity, @Quantity_Order, @Unit_Measure, @Price_Br, @Price,
          @Total_Amount, @Por_Discount1, @Amount_Discount1, @Por_Tax1, @Amount_Tax1,
          @Por_Tax2, @Amount_Tax2, @Code_Currency, @Secuence, @Order_Num_Cli,
          @Code_Seller, @Sale_Type, @Code_Address, @Transport, @Transfer_status
        )
      `, order);
        }
        logger.info(`${ordersData.length} registros insertados en IMPLT_Orders`);
    }

    /**
     * Inserta el resumen de la carga en IMPLT_loads_detail (server2).
     */
    static async insertToIMPLTLoadsDetail(connection, loadId, route, ordersData) {
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
        INSERT INTO dbo.IMPLT_loads_detail (
          Code, Num_Line, Lot_Group, Code_Product, Date_Load, Quantity, Unit_Type,
          Code_Warehouse_Sou, Code_Route, Source_Create, Transfer_status
        ) VALUES (
          @Code, @Num_Line, '999999999', @Code_Product, @Date_Load, @Quantity, 'UND',
          @route, @route, '0', '1'
        )
      `, {
                Code: loadId,
                Num_Line: lineNumber++,
                Code_Product: product.Code_Product,
                Date_Load: product.Order_Date,
                Quantity: product.Quantity,
                route
            });
        }
        logger.info(`${lineNumber - 1} líneas insertadas en IMPLT_loads_detail`);
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
