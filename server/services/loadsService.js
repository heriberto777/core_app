const { withConnection } = require("../utils/dbUtils");
const { SqlService } = require("./SqlService");
const logger = require("./logger");
const { LoadTracking, DeliveryPerson } = require("../models/loadsModel");

class LoadsService {
  /**
   * Obtiene pedidos pendientes desde CATELLI.PEDIDO usando tu consulta
   */
  static async getPendingOrders(filters = {}) {
    return await withConnection("server1", async (connection) => {
      try {
        let baseQuery = `
          WITH BaseData AS (
            SELECT
              pl.PEDIDO,
              pl.PEDIDO_LINEA,
              pl.CANTIDAD_PEDIDA,
              pl.CANTIDAD_BONIFICAD,
              pl.PRECIO_UNITARIO,
              pl.MONTO_DESCUENTO,
              pl.PORC_DESCUENTO,
              pl.PORC_IMPUESTO1,
              pl.PORC_IMPUESTO2,
              pe.RUBRO5,
              pe.U_Code_Load,
              pe.FECHA_PROMETIDA,
              pe.FECHA_PEDIDO,
              pe.CLIENTE,
              pe.VENDEDOR,
              pe.RUBRO4,
              cl.detalle_direccion,
              ar.ARTICULO,
              ar.UNIDAD_ALMACEN,
              pl.BODEGA,
              v.NOMBRE as NOMBRE_VENDEDOR
            FROM CATELLI.PEDIDO_LINEA AS pl
            INNER JOIN CATELLI.PEDIDO AS pe ON pe.PEDIDO = pl.PEDIDO
            INNER JOIN CATELLI.CLIENTE AS cl ON cl.CLIENTE = pe.CLIENTE
            LEFT JOIN CATELLI.ARTICULO AS ar ON ar.ARTICULO = pl.ARTICULO
            LEFT JOIN CATELLI.VENDEDOR AS v ON v.VENDEDOR = pe.VENDEDOR
            WHERE pe.estado = 'N'
              AND (pe.U_Code_Load IS NULL OR pe.U_Code_Load = '')
        `;

        const params = {};

        // Aplicar filtros
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
            -- LÍNEAS DE CANTIDAD PEDIDA
            SELECT
              PEDIDO,
              PEDIDO_LINEA,
              CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-P' AS LINEA_TIPO,
              'P' AS TIPO_LINEA,
              CANTIDAD_PEDIDA AS Cantidad,
              PRECIO_UNITARIO,
              MONTO_DESCUENTO,
              PORC_DESCUENTO,
              PORC_IMPUESTO1,
              PORC_IMPUESTO2,
              RUBRO5,
              U_Code_Load,
              FECHA_PROMETIDA,
              FECHA_PEDIDO,
              CLIENTE,
              VENDEDOR,
              NOMBRE_VENDEDOR,
              RUBRO4,
              detalle_direccion,
              ARTICULO,
              UNIDAD_ALMACEN,
              BODEGA,
              (CANTIDAD_PEDIDA * PRECIO_UNITARIO) AS SubTotal,
              ((CANTIDAD_PEDIDA * PRECIO_UNITARIO) - MONTO_DESCUENTO) AS TotalAmount
            FROM BaseData
            WHERE CANTIDAD_PEDIDA <> 0

            UNION ALL

            -- LÍNEAS DE CANTIDAD BONIFICADA
            SELECT
              PEDIDO,
              PEDIDO_LINEA,
              CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-B' AS LINEA_TIPO,
              'B' AS TIPO_LINEA,
              CANTIDAD_BONIFICAD AS Cantidad,
              0 AS PRECIO_UNITARIO,
              0 AS MONTO_DESCUENTO,
              0 AS PORC_DESCUENTO,
              0 AS PORC_IMPUESTO1,
              0 AS PORC_IMPUESTO2,
              RUBRO5,
              U_Code_Load,
              FECHA_PROMETIDA,
              FECHA_PEDIDO,
              CLIENTE,
              VENDEDOR,
              NOMBRE_VENDEDOR,
              RUBRO4,
              detalle_direccion,
              ARTICULO,
              UNIDAD_ALMACEN,
              BODEGA,
              0 AS SubTotal,
              0 AS TotalAmount
            FROM BaseData
            WHERE CANTIDAD_BONIFICAD > 0
          )
          SELECT
            PEDIDO,
            CLIENTE,
            FECHA_PEDIDO,
            VENDEDOR,
            NOMBRE_VENDEDOR,
            COUNT(*) as TOTAL_LINEAS,
            SUM(TotalAmount) as TOTAL_PEDIDO,
            SUM(Cantidad) as TOTAL_CANTIDAD,
            MIN(BODEGA) as BODEGA_PRINCIPAL,
            U_Code_Load,
            RUBRO5,
            'pending' as TRANSFER_STATUS
          FROM Calc
          GROUP BY PEDIDO, CLIENTE, FECHA_PEDIDO, VENDEDOR, NOMBRE_VENDEDOR, U_Code_Load, RUBRO5
          ORDER BY FECHA_PEDIDO DESC
        `;

        const result = await SqlService.query(connection, fullQuery, params);

        return {
          success: true,
          data: result.recordset.map((order) => ({
            pedido: order.PEDIDO,
            cliente: order.CLIENTE,
            fechaPedido: order.FECHA_PEDIDO,
            vendedor: order.VENDEDOR,
            nombreVendedor: order.NOMBRE_VENDEDOR,
            totalLineas: order.TOTAL_LINEAS,
            totalPedido: order.TOTAL_PEDIDO,
            totalCantidad: order.TOTAL_CANTIDAD,
            bodegaPrincipal: order.BODEGA_PRINCIPAL,
            codeLoad: order.U_Code_Load,
            rubro4: order.RUBRO4, //NUMERO PEDIDO DE TELYNET
            transferStatus: order.TRANSFER_STATUS,
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
   * Obtiene detalles completos de un pedido específico
   */
  static async getOrderDetails(pedidoId) {
    return await withConnection("server1", async (connection) => {
      try {
        const query = `
          WITH BaseData AS (
            SELECT
              pl.PEDIDO,
              pl.PEDIDO_LINEA,
              pl.CANTIDAD_PEDIDA,
              pl.CANTIDAD_BONIFICAD,
              pl.PRECIO_UNITARIO,
              pl.MONTO_DESCUENTO,
              pl.PORC_DESCUENTO,
              pl.PORC_IMPUESTO1,
              pl.PORC_IMPUESTO2,
              pe.RUBRO5,
              pe.U_Code_Load,
              pe.FECHA_PROMETIDA,
              pe.FECHA_PEDIDO,
              pe.CLIENTE,
              pe.VENDEDOR,
              pe.RUBRO4,
              cl.detalle_direccion,
              ar.ARTICULO,
              ar.NOMBRE as NOMBRE_PRODUCTO,
              ar.UNIDAD_ALMACEN,
              pl.BODEGA
            FROM CATELLI.PEDIDO_LINEA AS pl
            INNER JOIN CATELLI.PEDIDO AS pe ON pe.PEDIDO = pl.PEDIDO
            INNER JOIN CATELLI.CLIENTE AS cl ON cl.CLIENTE = pe.CLIENTE
            LEFT JOIN CATELLI.ARTICULO AS ar ON ar.ARTICULO = pl.ARTICULO
            WHERE pe.PEDIDO = @pedidoId
          ),
          Calc AS (
            -- LÍNEAS DE CANTIDAD PEDIDA
            SELECT
              PEDIDO,
              PEDIDO_LINEA,
              CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-P' AS LINEA_TIPO,
              'P' AS TIPO_LINEA,
              CANTIDAD_PEDIDA AS Cantidad,
              PRECIO_UNITARIO,
              MONTO_DESCUENTO,
              PORC_DESCUENTO,
              PORC_IMPUESTO1,
              PORC_IMPUESTO2,
              RUBRO5,
              U_Code_Load,
              FECHA_PROMETIDA,
              FECHA_PEDIDO,
              CLIENTE,
              VENDEDOR,
              RUBRO4,
              detalle_direccion,
              ARTICULO,
              NOMBRE_PRODUCTO,
              UNIDAD_ALMACEN,
              BODEGA,
              (CANTIDAD_PEDIDA * PRECIO_UNITARIO) AS SubTotal,
              ((CANTIDAD_PEDIDA * PRECIO_UNITARIO) - MONTO_DESCUENTO) AS TotalAmount
            FROM BaseData
            WHERE CANTIDAD_PEDIDA <> 0

            UNION ALL

            -- LÍNEAS DE CANTIDAD BONIFICADA
            SELECT
              PEDIDO,
              PEDIDO_LINEA,
              CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-B' AS LINEA_TIPO,
              'B' AS TIPO_LINEA,
              CANTIDAD_BONIFICAD AS Cantidad,
              0 AS PRECIO_UNITARIO,
              0 AS MONTO_DESCUENTO,
              0 AS PORC_DESCUENTO,
              0 AS PORC_IMPUESTO1,
              0 AS PORC_IMPUESTO2,
              RUBRO5,
              U_Code_Load,
              FECHA_PROMETIDA,
              FECHA_PEDIDO,
              CLIENTE,
              VENDEDOR,
              RUBRO4,
              detalle_direccion,
              ARTICULO,
              NOMBRE_PRODUCTO,
              UNIDAD_ALMACEN,
              BODEGA,
              0 AS SubTotal,
              0 AS TotalAmount
            FROM BaseData
            WHERE CANTIDAD_BONIFICAD > 0
          )
          SELECT *
          FROM Calc
          ORDER BY PEDIDO_LINEA
        `;

        const result = await SqlService.query(connection, query, { pedidoId });

        return {
          success: true,
          data: result.recordset,
        };
      } catch (error) {
        logger.error("Error obteniendo detalles del pedido:", error);
        throw error;
      }
    });
  }

  /**
   * Obtiene lista de vendedores activos
   */
  static async getSellers() {
    return await withConnection("server1", async (connection) => {
      try {
        const query = `
        SELECT DISTINCT
        v.VENDEDOR as code,
        v.NOMBRE as name,
        v.ACTIVO,
        v.U_BODEGA as assignedWarehouse,
        v.U_ESVENDEDOR as isVendedor,
        'S' as isActive
      FROM CATELLI.VENDEDOR v
      WHERE v.ACTIVO = 'S'
      ORDER BY v.NOMBRE
      `;

        const result = await SqlService.query(connection, query);

        return {
          success: true,
          data: result.recordset,
        };
      } catch (error) {
        logger.error("Error obteniendo vendedores:", error);
        throw error;
      }
    });
  }

  /**
   * Obtiene repartidores con sus bodegas asignadas
   */
  static async getDeliveryPersons() {
    try {
      const deliveryPersons = await DeliveryPerson.find({
        isActive: true,
      }).sort({ name: 1 });

      return {
        success: true,
        data: deliveryPersons,
      };
    } catch (error) {
      logger.error("Error obteniendo repartidores:", error);
      throw error;
    }
  }

  /**
   * Procesa la carga de pedidos seleccionados
   */
  static async processOrderLoad(selectedPedidos, deliveryPersonCode, userId) {
    try {
      // ⭐ OBTENER INFORMACIÓN DEL REPARTIDOR DESDE SQL SERVER ⭐
      const deliveryPerson = await withConnection(
        "server1",
        async (connection) => {
          const query = `
        SELECT
          v.VENDEDOR as code,
          v.NOMBRE as name,
          v.ACTIVO,
          v.U_BODEGA as assignedWarehouse,
          v.U_ESVENDEDOR as isVendedor
        FROM CATELLI.VENDEDOR v
        WHERE v.VENDEDOR = @deliveryPersonCode
          AND v.ACTIVO = 'S'
          AND v.U_ESVENDEDOR = 'Re'
      `;

          const result = await SqlService.query(connection, query, {
            deliveryPersonCode: deliveryPersonCode,
          });

          if (!result.recordset || result.recordset.length === 0) {
            return null;
          }

          return result.recordset[0];
        }
      );

      if (!deliveryPerson) {
        throw new Error(
          `Repartidor '${deliveryPersonCode}' no encontrado o inactivo. Verifique que sea un repartidor válido (U_ESVENDEDOR = 'Re')`
        );
      }

      console.log(
        `✅ Repartidor encontrado: ${deliveryPerson.name} - Bodega: ${deliveryPerson.assignedWarehouse}`
      );

      // Generar nuevo loadId
      const loadId = await this.generateLoadId();

      // Crear tracking de la carga
      const loadTracking = new LoadTracking({
        loadId,
        route: deliveryPersonCode,
        bodega: deliveryPerson.assignedWarehouse,
        totalOrders: selectedPedidos.length,
        createdBy: userId,
        status: "processing",
      });

      await loadTracking.save();

      const result = await withConnection(
        "server1",
        async (server1Connection) => {
          // 1. Actualizar U_Code_Load en CATELLI.PEDIDO
          await this.updatePedidosWithLoadId(
            server1Connection,
            selectedPedidos,
            loadId
          );

          // 2. Obtener datos transformados para IMPLT_Orders
          const ordersData = await this.getTransformedOrdersData(
            server1Connection,
            selectedPedidos,
            loadId
          );

          // ⭐ NESTED withConnection PARA SERVER2 ⭐
          await withConnection("server2", async (server2Connection) => {
            // 3. Insertar en IMPLT_Orders
            await this.insertToIMPLTOrders(server2Connection, ordersData);

            // 4. Insertar en IMPLT_loads_detail
            await this.insertToIMPLTLoadsDetail(
              server2Connection,
              loadId,
              deliveryPersonCode,
              deliveryPerson.assignedWarehouse,
              ordersData
            );
          });

          return ordersData;
        }
      );

      // Actualizar tracking
      loadTracking.status = "completed";
      loadTracking.processedOrders = selectedPedidos.length;
      loadTracking.updatedAt = new Date();
      await loadTracking.save();

      return {
        success: true,
        message: "Carga procesada exitosamente",
        data: {
          loadId,
          deliveryPerson: deliveryPerson.name,
          warehouse: deliveryPerson.assignedWarehouse,
          totalOrders: selectedPedidos.length,
        },
      };
    } catch (error) {
      logger.error("Error procesando carga:", error);
      throw error;
    }
  }

  /**
   * Cancela pedidos (cambia estado)
   */
  static async cancelOrders(selectedPedidos, userId) {
    return await withConnection("server1", async (connection) => {
      try {
        const pedidosList = selectedPedidos
          .map((_, i) => `@pedido${i}`)
          .join(",");
        const query = `
          UPDATE CATELLI.PEDIDO
          SET estado = 'C',
              USUARIO_MODIF = 'SYSTEM',
              FECHA_MODIF = GETDATE()
          WHERE PEDIDO IN (${pedidosList})
        `;

        const params = {};
        selectedPedidos.forEach((pedido, index) => {
          params[`pedido${index}`] = pedido;
        });

        await SqlService.query(connection, query, params);

        return {
          success: true,
          message: `${selectedPedidos.length} pedidos cancelados correctamente`,
        };
      } catch (error) {
        logger.error("Error cancelando pedidos:", error);
        throw error;
      }
    });
  }

  /**
   * Elimina líneas específicas de un pedido
   */
  static async removeOrderLines(pedidoId, lineasToRemove) {
    return await withConnection("server1", async (connection) => {
      try {
        const lineasList = lineasToRemove.map((_, i) => `@linea${i}`).join(",");
        const query = `
          DELETE FROM CATELLI.PEDIDO_LINEA
          WHERE PEDIDO = @pedidoId
          AND PEDIDO_LINEA IN (${lineasList})
        `;

        const params = { pedidoId };
        lineasToRemove.forEach((linea, index) => {
          params[`linea${index}`] = linea;
        });

        const result = await SqlService.query(connection, query, params);

        return {
          success: true,
          message: `${result.rowsAffected[0]} líneas eliminadas`,
          deletedLines: result.rowsAffected[0],
        };
      } catch (error) {
        logger.error("Error eliminando líneas:", error);
        throw error;
      }
    });
  }

  // =============================================================================
  // MÉTODOS AUXILIARES PRIVADOS
  // =============================================================================

  /**
   * Actualiza U_Code_Load en tabla PEDIDO
   */
  static async updatePedidosWithLoadId(connection, selectedPedidos, loadId) {
    const pedidosList = selectedPedidos.map((_, i) => `@pedido${i}`).join(",");
    const query = `
      UPDATE CATELLI.PEDIDO
      SET U_Code_Load = @loadId
      WHERE PEDIDO IN (${pedidosList})
    `;

    const params = { loadId };
    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido;
    });

    await SqlService.query(connection, query, params);
    logger.info(
      `Actualizado U_Code_Load para ${selectedPedidos.length} pedidos`
    );
  }

  /**
   * Obtiene datos transformados según tu consulta CTE
   */
  static async getTransformedOrdersData(connection, selectedPedidos, loadId) {
    const pedidosList = selectedPedidos.map((_, i) => `@pedido${i}`).join(",");

    const query = `
      WITH BaseData AS (
        SELECT
          pl.PEDIDO,
          pl.PEDIDO_LINEA,
          pl.CANTIDAD_PEDIDA,
          pl.CANTIDAD_BONIFICAD,
          pl.PRECIO_UNITARIO,
          pl.MONTO_DESCUENTO,
          pl.PORC_DESCUENTO,
          pl.PORC_IMPUESTO1,
          pl.PORC_IMPUESTO2,
          pe.RUBRO5,
          pe.FECHA_PROMETIDA,
          pe.FECHA_PEDIDO,
          pe.CLIENTE,
          pe.VENDEDOR,
          pe.RUBRO4,
          cl.detalle_direccion,
          ar.ARTICULO,
          ar.UNIDAD_ALMACEN,
          pl.BODEGA
        FROM CATELLI.PEDIDO_LINEA AS pl
        INNER JOIN CATELLI.PEDIDO AS pe ON pe.PEDIDO = pl.PEDIDO
        INNER JOIN CATELLI.CLIENTE AS cl ON cl.CLIENTE = pe.CLIENTE
        LEFT JOIN CATELLI.ARTICULO AS ar ON ar.ARTICULO = pl.ARTICULO
        WHERE pe.PEDIDO IN (${pedidosList})
      ),
      Calc AS (
        -- LÍNEAS DE CANTIDAD PEDIDA
        SELECT
          PEDIDO,
          PEDIDO_LINEA,
          CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-P' AS LINEA_TIPO,
          'P' AS TIPO_LINEA,
          CANTIDAD_PEDIDA AS Cantidad,
          PRECIO_UNITARIO,
          MONTO_DESCUENTO,
          PORC_DESCUENTO,
          PORC_IMPUESTO1,
          PORC_IMPUESTO2,
          RUBRO5,
          FECHA_PROMETIDA,
          FECHA_PEDIDO,
          CLIENTE,
          VENDEDOR,
          RUBRO4,
          detalle_direccion,
          ARTICULO,
          UNIDAD_ALMACEN,
          BODEGA,
          (CANTIDAD_PEDIDA * PRECIO_UNITARIO) AS SubTotal,
          ((CANTIDAD_PEDIDA * PRECIO_UNITARIO) - MONTO_DESCUENTO) AS TotalAmount
        FROM BaseData
        WHERE CANTIDAD_PEDIDA <> 0

        UNION ALL

        -- LÍNEAS DE CANTIDAD BONIFICADA
        SELECT
          PEDIDO,
          PEDIDO_LINEA,
          CAST(PEDIDO_LINEA AS VARCHAR(10)) + '-B' AS LINEA_TIPO,
          'B' AS TIPO_LINEA,
          CANTIDAD_BONIFICAD AS Cantidad,
          0 AS PRECIO_UNITARIO,
          0 AS MONTO_DESCUENTO,
          0 AS PORC_DESCUENTO,
          0 AS PORC_IMPUESTO1,
          0 AS PORC_IMPUESTO2,
          RUBRO5,
          FECHA_PROMETIDA,
          FECHA_PEDIDO,
          CLIENTE,
          VENDEDOR,
          RUBRO4,
          detalle_direccion,
          ARTICULO,
          UNIDAD_ALMACEN,
          BODEGA,
          0 AS SubTotal,
          0 AS TotalAmount
        FROM BaseData
        WHERE CANTIDAD_BONIFICAD > 0
      )
      SELECT
        'CATELLI' AS Code_Unit_Org,
        'CATELLI' AS Code_Sales_Org,
        PEDIDO AS Order_Num_ofClient,
        LINEA_TIPO AS Num_Line,
        RUBRO4 AS Order_Num,
        'S' AS Type_Rec,
        @loadId AS Code_load,
        CONVERT(VARCHAR, FECHA_PROMETIDA, 112) AS Date_Delivery,
        CONVERT(VARCHAR, FECHA_PEDIDO, 112) AS Order_Date,
        CLIENTE AS Code_Account,
        ARTICULO AS Code_Product,
        '999999999' AS Lot_Number,
        CAST(Cantidad AS NUMERIC(11,3)) AS Quantity,
        CAST(Cantidad AS NUMERIC(11,3)) AS Quantity_Order,
        UNIDAD_ALMACEN AS Unit_Measure,
        CAST(PRECIO_UNITARIO AS NUMERIC(11,3)) AS Price_Br,
        CAST(CASE WHEN Cantidad <> 0 THEN TotalAmount / Cantidad ELSE 0 END AS NUMERIC(11,3)) AS Price,
        CAST(TotalAmount AS NUMERIC(11,3)) AS Total_Amount,
        CAST(PORC_DESCUENTO AS NUMERIC(5,2)) AS Por_Discount1,
        CAST(MONTO_DESCUENTO AS NUMERIC(11,3)) AS Amount_Discount1,
        NULL AS Por_Discount2,
        NULL AS Amount_Discount2,
        NULL AS Por_Discount3,
        NULL AS Amount_Discount3,
        CAST(PORC_IMPUESTO1 AS NUMERIC(5,2)) AS Por_Tax1,
        CAST(TotalAmount * (PORC_IMPUESTO1 / 100.0) AS NUMERIC(11,3)) AS Amount_Tax1,
        CAST(PORC_IMPUESTO2 AS NUMERIC(5,2)) AS Por_Tax2,
        CAST(TotalAmount * (PORC_IMPUESTO2 / 100.0) AS NUMERIC(11,3)) AS Amount_Tax2,
        'RD' AS Code_Currency,
        '0' AS Secuence,
        PEDIDO AS Order_Num_Cli,
        NULL AS Code_Paymentway,
        VENDEDOR AS Code_Seller,
        NULL AS Order_Type,
        '0' AS Sale_Type,
        NULL AS Code_ReturnCause,
        detalle_direccion AS Code_Address,
        '00' AS Transport,
        1 AS Transfer_status
      FROM Calc
      ORDER BY PEDIDO, PEDIDO_LINEA
    `;

    const params = { loadId };
    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido;
    });

    const result = await SqlService.query(connection, query, params);
    return result.recordset;
  }

  /**
   * Inserta datos en IMPLT_Orders
   */
  static async insertToIMPLTOrders(connection, ordersData) {
    // Aquí integrarías con tu sistema existente de transferencia por lotes
    // Similar a insertInBatchesSSE pero directo
    logger.info(`Insertando ${ordersData.length} registros en IMPLT_Orders`);

    // Por ahora, implementación simple - después se integra con tu sistema SSE
    for (const order of ordersData) {
      const query = `
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
      `;

      await SqlService.query(connection, query, order);
    }
  }

  /**
   * Inserta datos en IMPLT_loads_detail
   */
  static async insertToIMPLTLoadsDetail(
    connection,
    loadId,
    route,
    warehouse,
    ordersData
  ) {
    logger.info(
      `Insertando registros en IMPLT_loads_detail para load: ${loadId}`
    );

    // Agrupar por producto para consolidar cantidades
    const productMap = new Map();

    ordersData.forEach((order) => {
      const key = order.Code_Product;
      if (productMap.has(key)) {
        const existing = productMap.get(key);
        existing.Quantity += order.Quantity;
      } else {
        productMap.set(key, {
          Code_Product: order.Code_Product,
          Quantity: order.Quantity,
          Unit_Measure: order.Unit_Measure,
          Order_Date: order.Order_Date,
        });
      }
    });

    // Insertar líneas consolidadas
    let lineNumber = 1;
    for (const [productCode, productData] of productMap) {
      const query = `
        INSERT INTO dbo.IMPLT_loads_detail (
          Code, Code_Unit_Org, Code_Sales_Org, Num_Line, Lot_Group,
          Code_Product, Date_Load, Quantity, Unit_Type, Code_Warehouse_Sou,
          Code_Route, Transfer_status
        ) VALUES (
          @Code, @Code_Unit_Org, @Code_Sales_Org, @Num_Line, @Lot_Group,
          @Code_Product, @Date_Load, @Quantity, @Unit_Type, @Code_Warehouse_Sou,
          @Code_Route, @Transfer_status
        )
      `;

      const params = {
        Code: loadId,
        Code_Unit_Org: "CATELLI",
        Code_Sales_Org: "CATELLI",
        Num_Line: lineNumber,
        Lot_Group: "999999999",
        Code_Product: productData.Code_Product,
        Date_Load: productData.Order_Date,
        Quantity: productData.Quantity,
        Unit_Type: "UND",
        Code_Warehouse_Sou: warehouse,
        Code_Route: route,
        Transfer_status: "1",
      };

      await SqlService.query(connection, query, params);
      lineNumber++;
    }
  }

  /**
   * Genera un nuevo loadId único
   */
  static async generateLoadId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `LOAD${timestamp}${random}`;
  }

  /**
   * Crea un nuevo repartidor
   */
  static async createDeliveryPerson(deliveryPersonData) {
    try {
      const newDeliveryPerson = new DeliveryPerson(deliveryPersonData);
      await newDeliveryPerson.save();

      return {
        success: true,
        data: newDeliveryPerson,
      };
    } catch (error) {
      logger.error("Error creando repartidor:", error);
      throw error;
    }
  }

  /**
   * Actualiza un repartidor existente
   */
  static async updateDeliveryPerson(id, updateData) {
    try {
      const updatedDeliveryPerson = await DeliveryPerson.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );

      if (!updatedDeliveryPerson) {
        throw new Error("Repartidor no encontrado");
      }

      return {
        success: true,
        data: updatedDeliveryPerson,
      };
    } catch (error) {
      logger.error("Error actualizando repartidor:", error);
      throw error;
    }
  }

  /**
   * Obtiene historial de cargas
   */
  static async getLoadHistory(filters) {
    try {
      const query = {};

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) {
          query.createdAt.$gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          const endDate = new Date(filters.dateTo);
          endDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDate;
        }
      }

      const skip = (filters.page - 1) * filters.limit;

      const [loads, totalCount] = await Promise.all([
        LoadTracking.find(query)
          .populate("createdBy", "name lastname email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(filters.limit),
        LoadTracking.countDocuments(query),
      ]);

      return {
        success: true,
        data: loads,
        pagination: {
          currentPage: filters.page,
          totalPages: Math.ceil(totalCount / filters.limit),
          totalRecords: totalCount,
          hasNext: skip + filters.limit < totalCount,
          hasPrev: filters.page > 1,
        },
      };
    } catch (error) {
      logger.error("Error obteniendo historial de cargas:", error);
      throw error;
    }
  }

  /**
   * Procesa traspaso de inventario (integración con traspasoService existente)
   */
  static async processInventoryTransfer(loadId, bodegaDestino) {
    try {
      // Aquí integrarías con tu traspasoService existente
      // Para obtener los datos necesarios del loadId y procesarlos

      // 1. Obtener datos de la carga desde IMPLT_loads_detail
      const loadData = await withConnection("server2", async (connection) => {
        const query = `
          SELECT
            Code_Product as codigo,
            Quantity as cantidad,
            Code_Warehouse_Sou as bodegaOrigen
          FROM dbo.IMPLT_loads_detail
          WHERE Code = @loadId
        `;

        const result = await SqlService.query(connection, query, { loadId });
        return result.recordset;
      });

      if (!loadData || loadData.length === 0) {
        throw new Error(`No se encontraron datos para la carga ${loadId}`);
      }

      // 2. Usar tu traspasoService existente
      const traspasoService = require("./traspasoService");

      const traspasoResult = await traspasoService.procesarTraspasoBodega(
        loadData, // productos con formato: [{codigo, cantidad, bodegaOrigen}]
        loadData[0].bodegaOrigen, // bodega origen (primera línea)
        bodegaDestino, // bodega destino
        loadId // referencia del traspaso
      );

      // 3. Actualizar estado del tracking
      await LoadTracking.findOneAndUpdate(
        { loadId },
        {
          status: "transferred",
          updatedAt: new Date(),
        }
      );

      return {
        success: true,
        message: "Traspaso de inventario procesado correctamente",
        data: {
          loadId,
          documentoGenerado: traspasoResult.documento_inv,
          lineasProcesadas: traspasoResult.successCount,
          bodegaOrigen: loadData[0].bodegaOrigen,
          bodegaDestino,
        },
      };
    } catch (error) {
      logger.error("Error procesando traspaso de inventario:", error);
      throw error;
    }
  }
}



module.exports = LoadsService;
