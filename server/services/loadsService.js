const { withConnection } = require("../utils/dbUtils");
const { SqlService } = require("./SqlService");
const logger = require("./logger");
const { LoadTracking, DeliveryPerson } = require("../models/loadsModel");
const { wrapService } = require("../utils/serviceWrapper");

/**
 * Servicio para manejo de cargas de pedidos
 * Implementa lógica secuencial con control de estado U_estado_proceso
 */
class LoadsService {
  /**
   * Obtiene pedidos pendientes desde CATELLI.PEDIDO usando consulta optimizada
   */
  static async getPendingOrders(filters = {}) {
    console.log("Filters received:", filters);
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
            pe.U_estado_proceso,
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
            AND pe.U_estado_proceso = 'N'
      `;

        const params = {};

        // Aplicar filtros de fecha
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

        // Aplicar filtro de vendedor
        if (filters.seller && filters.seller !== "all") {
          baseQuery += " AND pe.VENDEDOR = @seller";
          params.seller = filters.seller;
        }

        // Aplicar filtro de transferStatus
        if (filters.transferStatus && filters.transferStatus !== "all") {
          switch (filters.transferStatus) {
            case "pending":
              baseQuery += " AND pe.U_estado_proceso = 'N'";
              break;
            case "processing":
              baseQuery += " AND pe.U_estado_proceso = 'P'";
              break;
            case "completed":
              baseQuery += " AND pe.U_estado_proceso = 'S'";
              break;
            case "cancelled":
              baseQuery += " AND pe.estado = 'C'";
              break;
          }
        }

        // Aplicar filtro includeLoaded
        if (!filters.includeLoaded) {
          // Ya está incluido en la condición base: U_Code_Load IS NULL OR U_Code_Load = ''
        }

        const fullQuery = `
          ${baseQuery}
          ),
          Calc AS (
            -- LÍNEAS DE CANTIDAD PEDIDA
            SELECT
              PEDIDO,
              CANTIDAD_PEDIDA as Cantidad,
              (CANTIDAD_PEDIDA * PRECIO_UNITARIO) AS LineAmount,
              U_estado_proceso,
              FECHA_PEDIDO,
              CLIENTE,
              VENDEDOR,
              NOMBRE_VENDEDOR,
              FECHA_PROMETIDA,
              detalle_direccion
            FROM BaseData
            WHERE CANTIDAD_PEDIDA <> 0

            UNION ALL

            -- LÍNEAS DE CANTIDAD BONIFICADA (valor 0)
            SELECT
              PEDIDO,
              CANTIDAD_BONIFICAD as Cantidad,
              0 AS LineAmount,
              U_estado_proceso,
              FECHA_PEDIDO,
              CLIENTE,
              VENDEDOR,
              NOMBRE_VENDEDOR,
              FECHA_PROMETIDA,
              detalle_direccion
            FROM BaseData
            WHERE CANTIDAD_BONIFICAD > 0
          )
          SELECT
            PEDIDO,
            CLIENTE,
            VENDEDOR,
            NOMBRE_VENDEDOR,
            FECHA_PEDIDO,
            FECHA_PROMETIDA,
            COUNT(*) as totalLines,
            SUM(Cantidad) as totalQuantity,
            SUM(LineAmount) as totalAmount,
            detalle_direccion,
            MIN(U_estado_proceso) as estadoProceso
          FROM Calc
          GROUP BY PEDIDO, CLIENTE, VENDEDOR, NOMBRE_VENDEDOR,
                  FECHA_PEDIDO, FECHA_PROMETIDA, detalle_direccion
          ORDER BY FECHA_PEDIDO DESC, PEDIDO DESC
        `;

        const result = await SqlService.query(connection, fullQuery, params);

        // Retornar estructura consistente con transformación de datos
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
            transferStatus: this.mapTransferStatus(order.estadoProceso),
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
   * Mapear estados de proceso a transferStatus
   */
  static mapTransferStatus(estadoProceso) {
    switch (estadoProceso) {
      case "N":
        return "pending";
      case "P":
        return "processing";
      case "S":
        return "completed";
      case "C":
        return "cancelled";
      default:
        return "pending";
    }
  }

  /**
   * Obtiene detalles de líneas de un pedido específico
   */
  static async getOrderDetails(pedidoId) {
    try {
      return await withConnection("server1", async (connection) => {
        const query = `
          WITH BaseData AS (
            SELECT
              pl.PEDIDO,
              pl.PEDIDO_LINEA,
              pl.CANTIDAD_PEDIDA,
              pl.CANTIDAD_BONIFICAD,
              pl.PRECIO_UNITARIO,
              pl.MONTO_DESCUENTO,
              ar.ARTICULO,
              ar.DESCRIPCION as productDescription,
              ar.UNIDAD_ALMACEN as unitMeasure
            FROM CATELLI.PEDIDO_LINEA pl
            INNER JOIN CATELLI.ARTICULO ar ON pl.ARTICULO = ar.ARTICULO
            WHERE pl.PEDIDO = @pedidoId
          ),
          Details AS (
            -- LÍNEAS DE CANTIDAD PEDIDA
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

            -- LÍNEAS DE CANTIDAD BONIFICADA
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
          SELECT *
          FROM Details
          ORDER BY PEDIDO_LINEA, lineType
        `;

        const result = await SqlService.query(connection, query, { pedidoId });

        return {
          success: true,
          data: result.recordset,
        };
      });
    } catch (error) {
      logger.error(`Error obteniendo detalles del pedido ${pedidoId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene vendedores activos que son repartidores (U_ESVENDEDOR = 'Re')
   */
  static async getSellers() {
    try {
      return await withConnection("server1", async (connection) => {
        const query = `
          SELECT
            VENDEDOR as code,
            NOMBRE as name,
            U_ESVENDEDOR as isVendedor,
            U_BODEGA as assignedWarehouse,
            ACTIVO as isActive
          FROM CATELLI.VENDEDOR
          WHERE ACTIVO = 'S'
          ORDER BY NOMBRE
        `;

        const result = await SqlService.query(connection, query);

        return {
          success: true,
          data: result.recordset,
        };
      });
    } catch (error) {
      logger.error("Error obteniendo vendedores/repartidores:", error);
      throw error;
    }
  }

  /**
   * Obtiene repartidores con sus bodegas asignadas (mismo que getSellers)
   */
  static async getDeliveryPersons() {
    return await this.getSellers();
  }

  /**
   * ⭐ PROCESO PRINCIPAL: Procesa carga de pedidos con validación secuencial ⭐
   */
  static async processOrderLoad(deliveryPersonCode, selectedPedidos, userId) {
    let loadTracking = null;

    try {
      logger.info(
        `🚀 Iniciando proceso de carga para repartidor: ${deliveryPersonCode}`
      );
      logger.info(`📦 Pedidos seleccionados: ${selectedPedidos.join(", ")}`);

      // 1. Validar repartidor usando SQL Server
      const deliveryPerson = await this.validateDeliveryPerson(
        deliveryPersonCode
      );

      // 2. Generar loadId único
      const loadId = await this.generateLoadId();
      logger.info(`📖 LoadId generado: ${loadId}`);

      // 3. Crear tracking inicial
      loadTracking = await this.createLoadTracking(
        loadId,
        deliveryPersonCode,
        deliveryPerson.assignedWarehouse,
        selectedPedidos.length,
        userId
      );

      let ordersData = null;
      let step = "";

      try {
        return await withConnection("server1", async (server1Connection) => {
          // ⭐ PASO 1: Actualizar U_Code_Load en PEDIDO ⭐
          step = "updatePedidosWithLoadId";
          logger.info(`📝 ${step}: Actualizando pedidos con loadId...`);
          await this.updatePedidosWithLoadId(
            server1Connection,
            selectedPedidos,
            loadId
          );
          logger.info(`✅ ${step}: Completado exitosamente`);

          // ⭐ PASO 2: Obtener datos transformados ⭐
          step = "getTransformedOrdersData";
          logger.info(`🔄 ${step}: Obteniendo datos transformados...`);
          ordersData = await this.getTransformedOrdersData(
            server1Connection,
            selectedPedidos,
            loadId
          );
          logger.info(`✅ ${step}: ${ordersData.length} registros obtenidos`);

          // ⭐ PASOS 3 y 4: Insertar en server2 (IMPLT_Orders e IMPLT_loads_detail) ⭐
          await withConnection("server2", async (server2Connection) => {
            // PASO 3: Insertar en IMPLT_Orders
            step = "insertToIMPLTOrders";
            logger.info(`📥 ${step}: Insertando en IMPLT_Orders...`);
            await this.insertToIMPLTOrders(server2Connection, ordersData);
            logger.info(`✅ ${step}: Completado exitosamente`);

            // PASO 4: Insertar en IMPLT_loads_detail
            step = "insertToIMPLTLoadsDetail";
            logger.info(`📥 ${step}: Insertando en IMPLT_loads_detail...`);
            await this.insertToIMPLTLoadsDetail(
              server2Connection,
              loadId,
              deliveryPersonCode,
              deliveryPerson.assignedWarehouse,
              ordersData
            );
            logger.info(`✅ ${step}: Completado exitosamente`);
          });

          // ⭐ PASO 5: Ejecutar traspaso de inventario ⭐
          step = "realizarTraspaso";
          logger.info(`🔄 ${step}: Ejecutando traspaso de inventario...`);

          const { realizarTraspaso } = require("./traspasoService");
          const traspasoData = ordersData.map((order) => ({
            Code_Product: order.Code_Product,
            Quantity: order.Quantity,
            bodega: deliveryPerson.assignedWarehouse,
          }));

          const traspasoResult = await realizarTraspaso({
            route: deliveryPersonCode,
            salesData: traspasoData,
            bodega_destino: "02",
          });

          logger.info(
            `✅ ${step}: Traspaso completado - Documento: ${traspasoResult.documento_inv}`
          );

          // ⭐ PASO 6: Actualizar U_estado_proceso = 'S' (TODO EXITOSO) ⭐
          step = "updateEstadoProceso";
          logger.info(
            `🏁 ${step}: Marcando pedidos como procesados exitosamente...`
          );
          await this.updateEstadoProceso(
            server1Connection,
            selectedPedidos,
            "S"
          );
          logger.info(`✅ ${step}: Pedidos marcados como procesados`);

          // ⭐ PASO 7: Actualizar tracking como completado ⭐
          await LoadTracking.findOneAndUpdate(
            { loadId },
            {
              status: "completed",
              processedOrders: selectedPedidos.length,
              traspasoDocument: traspasoResult.documento_inv,
              traspasoStatus: "completed",
              updatedAt: new Date(),
            }
          );

          return {
            success: true,
            message: "Proceso de carga completado exitosamente",
            data: {
              loadId,
              deliveryPerson: {
                code: deliveryPersonCode,
                name: deliveryPerson.name,
                warehouse: deliveryPerson.assignedWarehouse,
              },
              ordersProcessed: selectedPedidos.length,
              linesProcessed: ordersData.length,
              traspaso: {
                documento: traspasoResult.documento_inv,
                success: traspasoResult.success,
                lineasProcesadas: traspasoResult.totalLineas,
                lineasExitosas: traspasoResult.lineasExitosas,
              },
            },
          };
        });
      } catch (error) {
        logger.error(`❌ Error en paso ${step}:`, error);

        // ⚠️ ROLLBACK MEJORADO: Si algo falla, marcar como error y limpiar ⚠️
        try {
          // Actualizar tracking como fallido
          if (loadTracking) {
            await LoadTracking.findOneAndUpdate(
              { loadId: loadTracking.loadId },
              {
                status: "error",
                errorMessage: error.message,
                failedStep: step,
                updatedAt: new Date(),
              }
            );
          }

          // Si ya se actualizó U_Code_Load pero falló después, limpiar
          if (
            [
              "getTransformedOrdersData",
              "insertToIMPLTOrders",
              "insertToIMPLTLoadsDetail",
              "realizarTraspaso",
              "updateEstadoProceso",
            ].includes(step)
          ) {
            await withConnection("server1", async (connection) => {
              await this.clearLoadIdFromPedidos(connection, selectedPedidos);
              logger.info("🔄 LoadId removido de pedidos debido a fallo");
            });
          }

          logger.info("🔄 Rollback completado");
        } catch (rollbackError) {
          logger.error("❌ Error durante rollback:", rollbackError);
        }

        throw error;
      }
    } catch (error) {
      logger.error("❌ Error general en processOrderLoad:", error);
      throw error;
    }
  }

  /**
   * Valida que el repartidor existe y está activo usando SQL Server
   */
  static async validateDeliveryPerson(deliveryPersonCode) {
    return await withConnection("server1", async (connection) => {
      const query = `
        SELECT
          VENDEDOR as code,
          NOMBRE as name,
          U_BODEGA as assignedWarehouse,
          U_ESVENDEDOR as isVendedor,
          ACTIVO as isActive
        FROM CATELLI.VENDEDOR
        WHERE VENDEDOR = @deliveryPersonCode
        AND ACTIVO = 'S'
      `;

      const result = await SqlService.query(connection, query, {
        deliveryPersonCode,
      });

      if (!result.recordset || result.recordset.length === 0) {
        throw new Error(
          `Repartidor ${deliveryPersonCode} no encontrado o inactivo. ` +
            `Verifique que sea un repartidor válido (U_ESVENDEDOR = 'Re')`
        );
      }

      const deliveryPerson = result.recordset[0];

      if (!deliveryPerson.assignedWarehouse) {
        throw new Error(
          `Repartidor ${deliveryPersonCode} no tiene bodega asignada (U_BODEGA)`
        );
      }

      logger.info(
        `✅ Repartidor encontrado: ${deliveryPerson.name} - Bodega: ${deliveryPerson.assignedWarehouse}`
      );

      return deliveryPerson;
    });
  }

  /**
   * Crea el tracking inicial de la carga
   */
  static async createLoadTracking(loadId, route, bodega, totalOrders, userId) {
    const loadTracking = new LoadTracking({
      loadId,
      route,
      bodega,
      totalOrders,
      createdBy: userId,
      status: "processing",
    });

    await loadTracking.save();
    logger.info(`📊 Tracking creado para carga ${loadId}`);
    return loadTracking;
  }

  /**
   * ⭐ Actualiza U_Code_Load en los pedidos seleccionados ⭐
   */
  static async updatePedidosWithLoadId(connection, selectedPedidos, loadId) {
    // Validación inicial
    if (!Array.isArray(selectedPedidos)) {
      throw new Error(
        `selectedPedidos debe ser un array, recibido: ${typeof selectedPedidos}`
      );
    }

    if (selectedPedidos.length === 0) {
      throw new Error("selectedPedidos no puede estar vacío");
    }

    const pedidosList = selectedPedidos
      .map((_, index) => `@pedido${index}`)
      .join(", ");

    const params = { loadId };

    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido;
    });

    const query = `
    UPDATE CATELLI.PEDIDO
    SET U_Code_Load = @loadId
    WHERE PEDIDO IN (${pedidosList})
    AND U_Code_Load IS NULL
    AND U_estado_proceso = 'N'
  `;

    // DEBUG: Agregar logging antes de ejecutar
    console.log("🔍 Query a ejecutar:", query);
    console.log("🔍 Params:", params);
    console.log("🔍 Pedidos a actualizar:", selectedPedidos);

    const result = await SqlService.query(connection, query, params);

    // DEBUG: Ver estructura completa del resultado
    console.log("🔍 Resultado completo:", result);
    console.log("🔍 result.rowsAffected:", result.rowsAffected);
    console.log("🔍 result.rowsAffected type:", typeof result.rowsAffected);
    console.log("🔍 result.rowsAffected[0]:", result.rowsAffected?.[0]);

    // Verificar diferentes posibles formatos de rowsAffected
    let affectedRows = 0;

    if (Array.isArray(result.rowsAffected)) {
      affectedRows = result.rowsAffected[0] || 0;
    } else if (typeof result.rowsAffected === "number") {
      affectedRows = result.rowsAffected;
    } else if (result.recordset && result.recordset.affectedRows) {
      affectedRows = result.recordset.affectedRows;
    } else {
      // Si no podemos determinar filas afectadas, intentar una consulta de verificación
      console.log(
        "⚠️ No se puede determinar filas afectadas, verificando manualmente..."
      );

      const verifyQuery = `
      SELECT COUNT(*) as count
      FROM CATELLI.PEDIDO
      WHERE PEDIDO IN (${pedidosList})
      AND U_Code_Load = @loadId
    `;

      const verifyResult = await SqlService.query(
        connection,
        verifyQuery,
        params
      );
      affectedRows = verifyResult.recordset[0]?.count || 0;

      console.log("🔍 Verificación manual - filas actualizadas:", affectedRows);
    }

    if (affectedRows !== selectedPedidos.length) {
      throw new Error(
        `Solo se actualizaron ${affectedRows} de ${selectedPedidos.length} pedidos. ` +
          `Algunos pedidos pueden ya estar procesados o no existen.`
      );
    }

    logger.info(
      `✅ ${affectedRows} pedidos actualizados con loadId: ${loadId}`
    );
  }

  /**
   * ⭐ Actualiza U_estado_proceso ('N' → 'S' si exitoso) ⭐
   */
  static async updateEstadoProceso(connection, selectedPedidos, estado) {
    const pedidosList = selectedPedidos
      .map((_, index) => `@pedido${index}`)
      .join(", ");
    const params = { estado };

    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido;
    });

    const query = `
      UPDATE CATELLI.PEDIDO
      SET U_estado_proceso = @estado
      WHERE PEDIDO IN (${pedidosList})
    `;

    const result = await SqlService.query(connection, query, params);
    logger.info(
      `✅ ${result.rowsAffected[0]} pedidos actualizados con estado: ${estado}`
    );
  }

  /**
   * Limpia U_Code_Load de los pedidos (usado en rollback)
   */
  static async clearLoadIdFromPedidos(connection, selectedPedidos) {
    const pedidosList = selectedPedidos
      .map((_, index) => `@pedido${index}`)
      .join(", ");
    const params = {};

    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido;
    });

    const query = `
      UPDATE CATELLI.PEDIDO
      SET U_Code_Load = NULL
      WHERE PEDIDO IN (${pedidosList})
    `;

    await SqlService.query(connection, query, params);
  }

  /**
   * Obtiene datos transformados para IMPLT_Orders
   */
  static async getTransformedOrdersData(connection, selectedPedidos, loadId) {
    if (!Array.isArray(selectedPedidos)) {
      throw new Error(
        `selectedPedidos debe ser un array, recibido: ${typeof selectedPedidos}`
      );
    }

    const pedidosList = selectedPedidos
      .map((_, index) => `@pedido${index}`)
      .join(", ");

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
      AND pe.U_Code_Load = @loadId
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
      ROW_NUMBER() OVER (ORDER BY PEDIDO, PEDIDO_LINEA, LINEA_TIPO) AS Num_Line,
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
      CASE WHEN TIPO_LINEA = 'B' THEN '1' ELSE '0' END AS Sale_Type,
      NULL AS Code_ReturnCause,
      detalle_direccion AS Code_Address,
      '00' AS Transport,
      1 AS Transfer_status,
      TIPO_LINEA,
      LINEA_TIPO
    FROM Calc
    ORDER BY PEDIDO, PEDIDO_LINEA, LINEA_TIPO
  `;

    const params = { loadId };
    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido;
    });

    const result = await SqlService.query(connection, query, params);

    console.log(
      `Registros transformados obtenidos: ${result.recordset.length}`
    );

    return result.recordset;
  }

  /**
   * Inserta datos en IMPLT_Orders
   */
  static async insertToIMPLTOrders(connection, ordersData) {
    logger.info(`📥 Insertando ${ordersData.length} registros en IMPLT_Orders`);

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

    logger.info(`✅ ${ordersData.length} registros insertados en IMPLT_Orders`);
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
      `📥 Insertando registros en IMPLT_loads_detail para load: ${loadId}`
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
          Code, Num_Line, Lot_Group,
          Code_Product, Date_Load, Quantity, Unit_Type, Code_Warehouse_Sou,
          Code_Route, Source_Create, Transfer_status
        ) VALUES (
          @Code, @Num_Line, @Lot_Group,
          @Code_Product, @Date_Load, @Quantity, @Unit_Type, @Code_Warehouse_Sou,
          @Code_Route, @Source_Create, @Transfer_status
        )
      `;

      const params = {
        Code: loadId,
        Num_Line: lineNumber,
        Lot_Group: "999999999",
        Code_Product: productData.Code_Product,
        Date_Load: productData.Order_Date,
        Quantity: productData.Quantity,
        Unit_Type: "UND",
        Code_Warehouse_Sou: warehouse,
        Code_Route: route,
        Source_Create: "0",
        Transfer_status: "1",
      };

      await SqlService.query(connection, query, params);
      lineNumber++;
    }

    logger.info(
      `✅ ${
        lineNumber - 1
      } líneas consolidadas insertadas en IMPLT_loads_detail`
    );
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
   * Cancela pedidos seleccionados (marca como anulados)
   */
  static async cancelOrders(selectedPedidos, userId, reason) {
    try {
      return await withConnection("server1", async (connection) => {
        const placeholders = selectedPedidos
          .map((_, index) => `@pedido${index}`)
          .join(", ");

        // Solo los parámetros de los pedidos
        const params = {};
        selectedPedidos.forEach((pedido, index) => {
          params[`pedido${index}`] = pedido;
        });

        const query = `
        UPDATE CATELLI.PEDIDO
        SET estado = 'C',
            U_estado_proceso = 'C'
        WHERE PEDIDO IN (${placeholders})
        AND estado = 'N'
        AND U_Code_Load IS NULL
      `;

        console.log("🔍 DEBUG Query:", query);
        console.log("🔍 DEBUG Params:", params);
        console.log("🔍 DEBUG Placeholders:", placeholders);

        // IMplementar usuario Modificacion
        //  UPDATE CATELLI.PEDIDO
        //   SET estado = 'C',
        //       U_estado_proceso = 'C',
        //       USUARIO_MODIF = @userId,
        //       FECHA_MODIF = GETDATE()
        //   WHERE PEDIDO IN (${pedidosList})
        //   AND estado = 'N'
        //   AND U_Code_Load IS NULL

        const result = await SqlService.query(connection, query, params);

        logger.info(`✅ ${result.rowsAffected[0]} pedidos cancelados`);

        return {
          success: true,
          message: `${result.rowsAffected[0]} pedidos cancelados correctamente`,
          cancelledCount: result.rowsAffected[0],
        };
      });
    } catch (error) {
      logger.error("Error cancelando pedidos:", error);
      throw error;
    }
  }

  /**
   * Elimina líneas específicas de un pedido
   */
  static async removeOrderLines(pedidoId, selectedLines, userId) {
    try {
      return await withConnection("server1", async (connection) => {
        const linesList = selectedLines
          .map((_, index) => `@line${index}`)
          .join(", ");
        const params = { pedidoId, userId };

        selectedLines.forEach((line, index) => {
          params[`line${index}`] = line;
        });

        const query = `
          DELETE FROM CATELLI.PEDIDO_LINEA
          WHERE PEDIDO = @pedidoId
          AND PEDIDO_LINEA IN (${linesList})
        `;

        const result = await SqlService.query(connection, query, params);

        logger.info(
          `✅ ${result.rowsAffected[0]} líneas eliminadas del pedido ${pedidoId}`
        );

        return {
          success: true,
          message: `${result.rowsAffected[0]} líneas eliminadas correctamente`,
          removedCount: result.rowsAffected[0],
        };
      });
    } catch (error) {
      logger.error(`Error eliminando líneas del pedido ${pedidoId}:`, error);
      throw error;
    }
  }

  /**
   * Crea un nuevo repartidor en MongoDB (para casos especiales)
   */
  static async createDeliveryPerson(deliveryPersonData) {
    try {
      const newDeliveryPerson = new DeliveryPerson(deliveryPersonData);
      await newDeliveryPerson.save();

      return {
        success: true,
        data: newDeliveryPerson,
        message: "Repartidor creado exitosamente",
      };
    } catch (error) {
      logger.error("Error creando repartidor:", error);
      throw error;
    }
  }

  /**
   * Actualiza un repartidor existente en MongoDB
   */
  static async updateDeliveryPerson(id, updateData) {
    try {
      const updatedDeliveryPerson = await DeliveryPerson.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
      );

      if (!updatedDeliveryPerson) {
        throw new Error("Repartidor no encontrado");
      }

      return {
        success: true,
        data: updatedDeliveryPerson,
        message: "Repartidor actualizado exitosamente",
      };
    } catch (error) {
      logger.error(`Error actualizando repartidor ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene historial de cargas con filtros
   */
  static async getLoadHistory(filters = {}) {
    try {
      const { page = 1, limit = 20, status, dateFrom, dateTo } = filters;

      const query = {};

      if (status) {
        query.status = status;
      }

      if (dateFrom && dateTo) {
        query.createdAt = {
          $gte: new Date(dateFrom),
          $lte: new Date(dateTo),
        };
      }

      const skip = (page - 1) * limit;

      const [loads, total] = await Promise.all([
        LoadTracking.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("createdBy", "name email"),
        LoadTracking.countDocuments(query),
      ]);

      return {
        success: true,
        data: loads,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
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
      // Obtener datos de la carga desde IMPLT_loads_detail
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

      // Usar traspasoService existente
      const traspasoService = require("./traspasoService");

      const traspasoResult = await traspasoService.procesarTraspasoBodega(
        loadData, // productos con formato: [{codigo, cantidad, bodegaOrigen}]
        loadData[0].bodegaOrigen, // bodega origen (primera línea)
        bodegaDestino, // bodega destino
        loadId // referencia del traspaso
      );

      // Actualizar estado del tracking
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