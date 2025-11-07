const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const logger = require("./logger");
const { LoadTracking, DeliveryPerson } = require("../models/loadsModel");

/**
 * Servicio para manejo de cargas de pedidos
 * Implementa lÃ³gica secuencial con control de estado U_estado_proceso
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
    `;

        const params = {};

        // ✅ Aplicar filtro includeLoaded PRIMERO
        if (!filters.includeLoaded) {
          baseQuery += " AND (pe.U_Code_Load IS NULL OR pe.U_Code_Load = '')";
        }

        // ✅ Aplicar filtro de transferStatus con lógica corregida
        if (filters.transferStatus && filters.transferStatus !== "all") {
          switch (filters.transferStatus) {
            case "pending":
              baseQuery +=
                " AND (pe.U_estado_proceso = 'N' OR pe.U_estado_proceso IS NULL)";
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
          // ✅ Si no hay filtro específico, solo pedidos pendientes o en proceso
          baseQuery +=
            " AND (pe.U_estado_proceso IN ('N', 'P') OR pe.U_estado_proceso IS NULL)";
        }

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
            detalle_direccion,
            U_Code_Load
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
            detalle_direccion,
            U_Code_Load
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
          MIN(U_estado_proceso) as estadoProceso,
          MIN(U_Code_Load) as codeLoad
        FROM Calc
        GROUP BY PEDIDO, CLIENTE, VENDEDOR, NOMBRE_VENDEDOR,
                FECHA_PEDIDO, FECHA_PROMETIDA, detalle_direccion
        ORDER BY FECHA_PEDIDO DESC, PEDIDO DESC
      `;

        const result = await DatabaseServiceAdapter.query(
          connection,
          fullQuery,
          params
        );

        // ✅ Retornar estructura consistente con transformación de datos
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
            codeLoad: order.codeLoad, // ✅ Ahora viene del SELECT
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
   * Obtiene detalles de lÃ­neas de un pedido especÃ­fico
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
            -- LÃNEAS DE CANTIDAD PEDIDA
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

            -- LÃNEAS DE CANTIDAD BONIFICADA
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

        const result = await DatabaseServiceAdapter.query(connection, query, {
          pedidoId,
        });

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

        const result = await DatabaseServiceAdapter.query(connection, query);

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
   * PROCESO PRINCIPAL: Procesa carga de pedidos con validación de resultado y transacciones
   */
  static async processOrderLoad(deliveryPersonCode, selectedPedidos, userId) {
    let loadTracking = null;
    let step = "initialization";

    try {
      logger.info(
        `Iniciando proceso de carga para repartidor: ${deliveryPersonCode}`
      );
      logger.info(`Pedidos seleccionados: ${selectedPedidos.join(", ")}`);

      // 1. Validar repartidor y obtener bodega destino
      step = "validateDeliveryPerson";
      const deliveryPerson = await this.validateDeliveryPerson(
        deliveryPersonCode
      );
      const bodegaDestino = deliveryPerson.assignedWarehouse;

      // 2. Generar loadId único
      step = "generateLoadId";
      const loadId = await this.generateLoadId();
      logger.info(`LoadId generado: ${loadId}`);

      // 3. Crear tracking inicial (MongoDB - sin transacción SQL)
      step = "createLoadTracking";
      loadTracking = await this.createLoadTracking(
        loadId,
        deliveryPersonCode,
        "MULTIPLE",
        selectedPedidos.length,
        userId
      );

      let ordersData = null;

      // USAR withTransaction para manejo automático de transacciones
      return await DatabaseServiceAdapter.withTransaction(
        "server1",
        async (server1Connection) => {
          try {
            // PASO 1: Actualizar U_Code_Load en PEDIDO
            step = "updatePedidosWithLoadId";
            logger.info(`${step}: Actualizando pedidos con loadId...`);
            await this.updatePedidosWithLoadId(
              server1Connection,
              selectedPedidos,
              loadId
            );
            logger.info(`${step}: Completado exitosamente`);

            // ✅ PASO 1.5: Marcar pedidos como PROCESANDO ('P')
            step = "markAsProcessing";
            logger.info(`${step}: Marcando pedidos como procesando...`);
            await this.updateEstadoProceso(
              server1Connection,
              selectedPedidos,
              "P",
              loadId
            );
            logger.info(`${step}: Pedidos marcados como procesando`);

            // PASO 2: Obtener datos transformados
            step = "getTransformedOrdersData";
            logger.info(`${step}: Obteniendo datos transformados...`);
            ordersData = await this.getTransformedOrdersData(
              server1Connection,
              selectedPedidos,
              loadId
            );
            logger.info(`${step}: ${ordersData.length} registros obtenidos`);

            // PASO 3: Preparar datos de traspaso
            step = "prepareTraspasoData";
            const traspasoData = this.prepareTraspasoData(
              ordersData,
              bodegaDestino
            );

            // PASOS 4 y 5: Insertar en server2 (conexión separada)
            await withConnection("server2", async (server2Connection) => {
              // PASO 4: Insertar en IMPLT_Orders
              step = "insertToIMPLTOrders";
              logger.info(`${step}: Insertando en IMPLT_Orders...`);
              await this.insertToIMPLTOrders(server2Connection, ordersData);
              logger.info(`${step}: Completado exitosamente`);

              // PASO 5: Insertar en IMPLT_loads_detail
              step = "insertToIMPLTLoadsDetail";
              logger.info(`${step}: Insertando en IMPLT_loads_detail...`);
              await this.insertToIMPLTLoadsDetail(
                server2Connection,
                loadId,
                deliveryPersonCode,
                ordersData
              );
              logger.info(`${step}: Completado exitosamente`);
            });

            // PASO 6: Ejecutar traspaso automático
            step = "realizarTraspaso";
            logger.info(`${step}: Ejecutando traspaso de inventario...`);

            const { realizarTraspaso } = require("./traspasoService");
            const traspasoResult = await realizarTraspaso({
              route: deliveryPersonCode,
              salesData: traspasoData,
              bodega_destino: bodegaDestino,
            });

            // VALIDAR RESULTADO DEL TRASPASO
            if (!traspasoResult || !traspasoResult.success) {
              logger.warn(
                `Traspaso falló: ${
                  traspasoResult?.mensaje || "Error desconocido"
                }`
              );

              // ✅ Marcar como CANCELADO ('C') en caso de fallo del traspaso
              step = "markAsCancelled";
              logger.info(
                `${step}: Marcando pedidos como cancelados por fallo en traspaso...`
              );
              await this.updateEstadoProceso(
                server1Connection,
                selectedPedidos,
                "C",
                loadId
              );

              // Guardar tracking de fallo
              const trackingId = await this.saveFailedTraspasoTracking(
                server1Connection,
                {
                  loadId,
                  deliveryPersonCode,
                  deliveryPersonName: deliveryPerson.name,
                  warehouseOrigin: "MULTIPLE",
                  warehouseDestination: bodegaDestino,
                  selectedPedidos,
                  ordersData,
                  traspasoResult,
                  userId: String(userId),
                }
              );

              // Actualizar LoadTracking MongoDB
              await LoadTracking.findOneAndUpdate(
                { loadId },
                {
                  status: "completed_manual_transfer_required",
                  processedOrders: selectedPedidos.length,
                  traspasoStatus: "execution_failed",
                  traspasoTrackingId: trackingId,
                  errorMessage: traspasoResult?.mensaje || "Error en traspaso",
                  warehouseOrigin: "MULTIPLE",
                  warehouseDestination: bodegaDestino,
                  updatedAt: new Date(),
                }
              );

              // Lanzar error para activar rollback automático
              throw new Error(
                `Traspaso falló: ${
                  traspasoResult?.mensaje || "Error desconocido"
                }`
              );
            }

            // VALIDAR QUE AL MENOS ALGUNAS LÍNEAS FUERON EXITOSAS
            if (
              traspasoResult.lineasExitosas === 0 &&
              traspasoResult.totalLineas > 0
            ) {
              // ✅ Marcar como CANCELADO ('C') por fallo total
              step = "markAsCancelledTotalFailure";
              logger.info(
                `${step}: Marcando pedidos como cancelados por fallo total...`
              );
              await this.updateEstadoProceso(
                server1Connection,
                selectedPedidos,
                "C",
                loadId
              );

              const trackingId = await this.saveFailedTraspasoTracking(
                server1Connection,
                {
                  loadId,
                  deliveryPersonCode,
                  deliveryPersonName: deliveryPerson.name,
                  warehouseOrigin: "MULTIPLE",
                  warehouseDestination: bodegaDestino,
                  selectedPedidos,
                  ordersData,
                  traspasoResult,
                  userId: String(userId),
                }
              );

              await LoadTracking.findOneAndUpdate(
                { loadId },
                {
                  status: "completed_manual_transfer_required",
                  processedOrders: selectedPedidos.length,
                  traspasoStatus: "total_failure",
                  traspasoTrackingId: trackingId,
                  errorMessage: "Ninguna línea procesada exitosamente",
                  warehouseOrigin: "MULTIPLE",
                  warehouseDestination: bodegaDestino,
                  updatedAt: new Date(),
                }
              );

              throw new Error("Ninguna línea procesada exitosamente");
            }

            // VALIDAR FALLAS PARCIALES SIGNIFICATIVAS
            const porcentajeExito =
              (traspasoResult.lineasExitosas / traspasoResult.totalLineas) *
              100;

            if (porcentajeExito < 80 && traspasoResult.lineasFallidas > 0) {
              logger.warn(
                `Traspaso con fallas significativas: ${
                  traspasoResult.lineasExitosas
                }/${traspasoResult.totalLineas} (${porcentajeExito.toFixed(
                  1
                )}%)`
              );

              // GUARDAR tracking pero CONTINUAR con la transacción
              const trackingId = await this.saveSuccessfulTraspasoTracking(
                server1Connection,
                {
                  loadId,
                  deliveryPersonCode,
                  deliveryPersonName: deliveryPerson.name,
                  warehouseOrigin: "MULTIPLE",
                  warehouseDestination: bodegaDestino,
                  selectedPedidos,
                  ordersData,
                  traspasoResult,
                  userId: String(userId),
                }
              );

              // ✅ PASO 7: Actualizar U_estado_proceso = 'S' (con warnings)
              step = "updateEstadoProcesoSuccess";
              logger.info(
                `${step}: Marcando pedidos como exitosos (con advertencias)...`
              );
              await this.updateEstadoProceso(
                server1Connection,
                selectedPedidos,
                "S",
                loadId
              );
              logger.info(`${step}: Pedidos marcados como exitosos`);

              await LoadTracking.findOneAndUpdate(
                { loadId },
                {
                  status: "completed_with_warnings",
                  processedOrders: selectedPedidos.length,
                  traspasoDocument: traspasoResult.documento_inv,
                  traspasoStatus: "partial_success",
                  traspasoTrackingId: trackingId,
                  warningMessage: `Traspaso parcial: ${traspasoResult.lineasExitosas}/${traspasoResult.totalLineas} líneas exitosas`,
                  warehouseOrigin: "MULTIPLE",
                  warehouseDestination: bodegaDestino,
                  updatedAt: new Date(),
                }
              );

              return {
                success: true,
                hasWarnings: true,
                message: `Proceso completado con advertencias. Traspaso parcial: ${traspasoResult.lineasExitosas}/${traspasoResult.totalLineas} líneas exitosas`,
                data: {
                  loadId,
                  traspasoTrackingId: trackingId,
                  deliveryPerson: {
                    code: deliveryPersonCode,
                    name: deliveryPerson.name,
                    warehouse: bodegaDestino,
                  },
                  ordersProcessed: selectedPedidos.length,
                  linesProcessed: ordersData.length,
                  traspaso: {
                    documento: traspasoResult.documento_inv,
                    success: true,
                    status: "partial_success",
                    lineasProcesadas: traspasoResult.totalLineas,
                    lineasExitosas: traspasoResult.lineasExitosas,
                    lineasFallidas: traspasoResult.lineasFallidas,
                    porcentajeExito: porcentajeExito.toFixed(1),
                  },
                },
              };
            }

            logger.info(
              `Traspaso completado exitosamente - Documento: ${traspasoResult.documento_inv}`
            );

            // GUARDAR TRASPASO EXITOSO EN TABLA DE TRACKING
            step = "saveSuccessfulTracking";
            const trackingId = await this.saveSuccessfulTraspasoTracking(
              server1Connection,
              {
                loadId,
                deliveryPersonCode,
                deliveryPersonName: deliveryPerson.name,
                warehouseOrigin: "MULTIPLE",
                warehouseDestination: bodegaDestino,
                selectedPedidos,
                ordersData,
                traspasoResult,
                userId: String(userId),
              }
            );

            // ✅ PASO 7: Actualizar U_estado_proceso = 'S' (TODO EXITOSO)
            step = "updateEstadoProcesoSuccess";
            logger.info(
              `${step}: Marcando pedidos como procesados exitosamente...`
            );
            await this.updateEstadoProceso(
              server1Connection,
              selectedPedidos,
              "S",
              loadId
            );
            logger.info(`${step}: Pedidos marcados como procesados`);

            // PASO 8: Actualizar tracking MongoDB (fuera de transacción SQL)
            await LoadTracking.findOneAndUpdate(
              { loadId },
              {
                status: "completed",
                processedOrders: selectedPedidos.length,
                traspasoDocument: traspasoResult.documento_inv,
                traspasoStatus: "completed",
                traspasoTrackingId: trackingId,
                warehouseOrigin: "MULTIPLE",
                warehouseDestination: bodegaDestino,
                updatedAt: new Date(),
              }
            );

            return {
              success: true,
              message: "Proceso de carga completado exitosamente",
              data: {
                loadId,
                traspasoTrackingId: trackingId,
                deliveryPerson: {
                  code: deliveryPersonCode,
                  name: deliveryPerson.name,
                  warehouse: bodegaDestino,
                },
                ordersProcessed: selectedPedidos.length,
                linesProcessed: ordersData.length,
                traspaso: {
                  documento: traspasoResult.documento_inv,
                  success: traspasoResult.success,
                  lineasProcesadas: traspasoResult.totalLineas,
                  lineasExitosas: traspasoResult.lineasExitosas,
                  lineasFallidas: traspasoResult.lineasFallidas || 0,
                  porcentajeExito: "100",
                  trackingId: trackingId,
                },
              },
            };
          } catch (transactionError) {
            logger.error(`Error en paso ${step}:`, transactionError);

            // ✅ ROLLBACK: Si estamos después de markAsProcessing, intentar marcar como cancelado
            if (
              step !== "updatePedidosWithLoadId" &&
              step !== "markAsProcessing"
            ) {
              try {
                logger.info(
                  "Intentando marcar pedidos como cancelados debido a error..."
                );
                await this.updateEstadoProceso(
                  server1Connection,
                  selectedPedidos,
                  "C",
                  loadId
                );
                logger.info("Pedidos marcados como cancelados por rollback");
              } catch (rollbackError) {
                logger.error("Error en rollback de estado:", rollbackError);
                // No lanzar error aquí para no ocultar el error original
              }
            }

            // withTransaction hará rollback automáticamente
            throw transactionError;
          }
        }
      );
    } catch (error) {
      logger.error("Error general en processOrderLoad:", error);

      // Actualizar tracking MongoDB
      try {
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
      } catch (trackingError) {
        logger.error("Error actualizando tracking:", trackingError);
      }

      return {
        success: false,
        message: "Error al procesar la carga",
        error: error.message,
        data: {
          loadId: loadTracking?.loadId || null,
          step: step || "unknown",
          deliveryPersonCode,
          selectedPedidos: selectedPedidos || [],
        },
      };
    }
  }

  /**
   * Guarda traspaso exitoso - CORREGIDO PARA LA TABLA REAL
   */
  static async saveSuccessfulTraspasoTracking(connection, data) {
    const {
      loadId,
      deliveryPersonCode,
      deliveryPersonName,
      warehouseOrigin,
      warehouseDestination,
      selectedPedidos,
      ordersData,
      traspasoResult,
      userId,
    } = data;

    try {
      const insertTrackingQuery = `
      INSERT INTO dbo.IMPLT_traspaso_tracking (
        load_id, delivery_person_code, delivery_person_name,
        warehouse_origin, warehouse_destination, status,
        success_message, validation_report, total_products,
        documento_generated, lines_successful, lines_failed,
        created_by
      )
      OUTPUT INSERTED.id
      VALUES (
        @load_id, @delivery_person_code, @delivery_person_name,
        @warehouse_origin, @warehouse_destination, @status,
        @success_message, @validation_report, @total_products,
        @documento_generated, @lines_successful, @lines_failed,
        @created_by
      )
    `;

      const trackingParams = {
        load_id: loadId || "N/A",
        delivery_person_code: deliveryPersonCode || "N/A",
        delivery_person_name: deliveryPersonName || "N/A",
        warehouse_origin: warehouseOrigin || "MULTIPLE",
        warehouse_destination: warehouseDestination || "02",
        status: "completed",
        success_message: "Traspaso ejecutado exitosamente",
        validation_report: JSON.stringify(traspasoResult || {}),
        total_products: ordersData?.length || 0,
        documento_generated: traspasoResult?.documento_inv || null,
        lines_successful: traspasoResult?.lineasExitosas || 0,
        lines_failed: traspasoResult?.lineasFallidas || 0,
        created_by: userId ? String(userId) : "SYSTEM",
      };

      const trackingResult = await DatabaseServiceAdapter.query(
        connection,
        insertTrackingQuery,
        trackingParams
      );

      const trackingId = trackingResult.recordset[0].id;
      logger.info(`Tracking exitoso insertado con ID: ${trackingId}`);
      return trackingId;
    } catch (error) {
      logger.error("Error guardando tracking de traspaso exitoso:", error);
      throw error;
    }
  }

  /**
   * Guarda traspaso fallido - CORREGIDO PARA LA TABLA REAL
   */
  static async saveFailedTraspasoTracking(connection, data) {
    const {
      loadId,
      deliveryPersonCode,
      deliveryPersonName,
      warehouseOrigin,
      warehouseDestination,
      selectedPedidos,
      ordersData,
      traspasoResult,
      userId,
    } = data;

    try {
      // Determinar tipo de error
      let errorType = "failed";
      let errorMessage = "Error en ejecuciÃ³n de traspaso";

      if (traspasoResult) {
        if (!traspasoResult.success) {
          errorType = "failed";
          errorMessage =
            traspasoResult.mensaje || "Traspaso fallÃ³ durante ejecuciÃ³n";
        } else if (traspasoResult.lineasExitosas === 0) {
          errorType = "failed";
          errorMessage = "Ninguna lÃ­nea procesada exitosamente";
        } else if (traspasoResult.lineasFallidas > 0) {
          errorType = "completed"; // Parcialmente exitoso
          errorMessage = `Traspaso parcial: ${traspasoResult.lineasExitosas}/${traspasoResult.totalLineas} lÃ­neas exitosas`;
        }
      }

      const insertTrackingQuery = `
      INSERT INTO dbo.IMPLT_traspaso_tracking (
        load_id, delivery_person_code, delivery_person_name,
        warehouse_origin, warehouse_destination, status,
        error_message, validation_report, total_products,
        documento_generated, lines_successful, lines_failed,
        created_by
      )
      OUTPUT INSERTED.id
      VALUES (
        @load_id, @delivery_person_code, @delivery_person_name,
        @warehouse_origin, @warehouse_destination, @status,
        @error_message, @validation_report, @total_products,
        @documento_generated, @lines_successful, @lines_failed,
        @created_by
      )
    `;

      const trackingParams = {
        load_id: loadId || "N/A",
        delivery_person_code: deliveryPersonCode || "N/A",
        delivery_person_name: deliveryPersonName || "N/A",
        warehouse_origin: warehouseOrigin || "MULTIPLE",
        warehouse_destination: warehouseDestination || "02",
        status: errorType,
        error_message: errorMessage,
        validation_report: JSON.stringify(traspasoResult || {}),
        total_products: ordersData?.length || 0,
        documento_generated: traspasoResult?.documento_inv || null,
        lines_successful: traspasoResult?.lineasExitosas || 0,
        lines_failed: traspasoResult?.lineasFallidas || 0,
        created_by: userId ? String(userId) : "SYSTEM",
      };

      const trackingResult = await DatabaseServiceAdapter.query(
        connection,
        insertTrackingQuery,
        trackingParams
      );
      const trackingId = trackingResult.recordset[0].id;

      logger.info(`Tracking fallido insertado con ID: ${trackingId}`);

      // Insertar detalles de productos si existen
      if (ordersData && ordersData.length > 0) {
        for (let i = 0; i < ordersData.length; i++) {
          const product = ordersData[i];

          const detailQuery = `
          INSERT INTO dbo.IMPLT_traspaso_detail (
            traspaso_tracking_id, product_code, quantity_requested,
            quantity_processed, status, error_message
          ) VALUES (
            @traspaso_tracking_id, @product_code, @quantity_requested,
            @quantity_processed, @status, @error_message
          )
        `;

          const detailParams = {
            traspaso_tracking_id: trackingId,
            product_code: product.Code_Product || "N/A",
            quantity_requested: product.Quantity || 0,
            quantity_processed: 0,
            status: errorType,
            error_message: errorMessage.substring(0, 500),
          };

          await DatabaseServiceAdapter.query(
            connection,
            detailQuery,
            detailParams
          );
        }

        logger.info(`${ordersData.length} detalles de productos insertados`);
      }

      return trackingId;
    } catch (error) {
      logger.error("Error guardando tracking de traspaso fallido:", error);
      throw error;
    }
  }

  /**
   * Valida que el repartidor existe y estÃ¡ activo
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

      const result = await DatabaseServiceAdapter.query(connection, query, {
        deliveryPersonCode,
      });

      if (!result.recordset || result.recordset.length === 0) {
        throw new Error(
          `Repartidor ${deliveryPersonCode} no encontrado o inactivo. ` +
            `Verifique que sea un repartidor vÃ¡lido`
        );
      }

      const deliveryPerson = result.recordset[0];

      if (!deliveryPerson.assignedWarehouse) {
        throw new Error(
          `Repartidor ${deliveryPersonCode} no tiene bodega asignada (U_BODEGA)`
        );
      }

      logger.info(
        `Repartidor encontrado: ${deliveryPerson.name} - Bodega destino: ${deliveryPerson.assignedWarehouse}`
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
    logger.info(`Tracking creado para carga ${loadId}`);
    return loadTracking;
  }

  /**
   * Actualiza U_Code_Load en los pedidos seleccionados
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

    // ✅ PASO 1: Diagnosticar estado actual de los pedidos
    const pedidosList = selectedPedidos
      .map((_, index) => `@pedido${index}`)
      .join(", ");

    const diagnosticParams = {};
    selectedPedidos.forEach((pedido, index) => {
      diagnosticParams[`pedido${index}`] = pedido;
    });

    const diagnosticQuery = `
    SELECT
      PEDIDO,
      estado,
      U_Code_Load,
      U_estado_proceso,
      CASE
        WHEN U_Code_Load IS NOT NULL AND U_Code_Load != '' THEN 'YA_TIENE_LOAD'
        WHEN estado != 'N' THEN 'ESTADO_NO_NORMAL'
        WHEN U_estado_proceso NOT IN ('N', 'P') AND U_estado_proceso IS NOT NULL THEN 'PROCESO_NO_VALIDO'
        ELSE 'ACTUALIZABLE'
      END as diagnostico
    FROM CATELLI.PEDIDO
    WHERE PEDIDO IN (${pedidosList})
  `;

    const diagnosticResult = await DatabaseServiceAdapter.query(
      connection,
      diagnosticQuery,
      diagnosticParams
    );

    // Log del diagnóstico
    logger.info("🔍 Diagnóstico de pedidos antes de actualizar:");
    diagnosticResult.recordset.forEach((pedido) => {
      logger.info(
        `  Pedido ${pedido.PEDIDO}: estado=${pedido.estado}, U_Code_Load=${pedido.U_Code_Load}, U_estado_proceso=${pedido.U_estado_proceso}, diagnóstico=${pedido.diagnostico}`
      );
    });

    // Verificar si hay pedidos no actualizables
    const noActualizables = diagnosticResult.recordset.filter(
      (p) => p.diagnostico !== "ACTUALIZABLE"
    );
    if (noActualizables.length > 0) {
      const detalles = noActualizables
        .map((p) => `Pedido ${p.PEDIDO}: ${p.diagnostico}`)
        .join(", ");
      throw new Error(`No se pueden actualizar algunos pedidos: ${detalles}`);
    }

    // ✅ PASO 2: UPDATE con condiciones corregidas
    const params = { loadId };
    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido;
    });

    const query = `
    UPDATE CATELLI.PEDIDO
    SET U_Code_Load = @loadId
    WHERE PEDIDO IN (${pedidosList})
      AND (U_Code_Load IS NULL OR U_Code_Load = '')
      AND estado = 'N'
      AND (U_estado_proceso IN ('N', 'P') OR U_estado_proceso IS NULL)
  `;

    const result = await DatabaseServiceAdapter.query(
      connection,
      query,
      params
    );

    // ✅ PASO 3: Verificar resultados con logging mejorado
    let affectedRows = 0;

    if (Array.isArray(result.rowsAffected)) {
      affectedRows = result.rowsAffected[0] || 0;
    } else if (typeof result.rowsAffected === "number") {
      affectedRows = result.rowsAffected;
    } else {
      // Verificación manual si no podemos determinar filas afectadas
      const verifyQuery = `
      SELECT COUNT(*) as count
      FROM CATELLI.PEDIDO
      WHERE PEDIDO IN (${pedidosList})
      AND U_Code_Load = @loadId
    `;

      const verifyResult = await DatabaseServiceAdapter.query(
        connection,
        verifyQuery,
        params
      );
      affectedRows = verifyResult.recordset[0]?.count || 0;
    }

    // ✅ PASO 4: Verificación post-actualización si falla
    if (affectedRows !== selectedPedidos.length) {
      // Diagnóstico post-update
      const postUpdateResult = await DatabaseServiceAdapter.query(
        connection,
        diagnosticQuery,
        diagnosticParams
      );

      logger.error("❌ Error en actualización - Estado POST-UPDATE:");
      postUpdateResult.recordset.forEach((pedido) => {
        logger.error(
          `  Pedido ${pedido.PEDIDO}: estado=${pedido.estado}, U_Code_Load=${pedido.U_Code_Load}, U_estado_proceso=${pedido.U_estado_proceso}`
        );
      });

      throw new Error(
        `Solo se actualizaron ${affectedRows} de ${selectedPedidos.length} pedidos. ` +
          `Revise los logs para detalles específicos de cada pedido.`
      );
    }

    logger.info(
      `✅ ${affectedRows} pedidos actualizados exitosamente con loadId: ${loadId}`
    );
  }

  /**
   * Actualiza U_estado_proceso con validaciones y diagnóstico
   */
  static async updateEstadoProceso(
    connection,
    selectedPedidos,
    estado,
    loadId = null
  ) {
    // ✅ Validaciones iniciales
    if (!Array.isArray(selectedPedidos)) {
      throw new Error(
        `selectedPedidos debe ser un array, recibido: ${typeof selectedPedidos}`
      );
    }

    if (selectedPedidos.length === 0) {
      throw new Error("selectedPedidos no puede estar vacío");
    }

    if (!estado || !["N", "P", "S", "C"].includes(estado)) {
      throw new Error(`Estado inválido: ${estado}. Debe ser N, P, S o C`);
    }

    const pedidosList = selectedPedidos
      .map((_, index) => `@pedido${index}`)
      .join(", ");

    // ✅ PASO 1: Diagnóstico pre-actualización
    const diagnosticParams = {};
    selectedPedidos.forEach((pedido, index) => {
      diagnosticParams[`pedido${index}`] = pedido;
    });

    const diagnosticQuery = `
    SELECT
      PEDIDO,
      estado,
      U_Code_Load,
      U_estado_proceso,
      CASE
        WHEN estado != 'N' THEN 'PEDIDO_NO_NORMAL'
        WHEN U_Code_Load IS NULL OR U_Code_Load = '' THEN 'SIN_LOAD_ASIGNADO'
        ${loadId ? `WHEN U_Code_Load != '${loadId}' THEN 'LOAD_DIFERENTE'` : ""}
        ELSE 'ACTUALIZABLE'
      END as diagnostico
    FROM CATELLI.PEDIDO
    WHERE PEDIDO IN (${pedidosList})
  `;

    const diagnosticResult = await DatabaseServiceAdapter.query(
      connection,
      diagnosticQuery,
      diagnosticParams
    );

    // Log del diagnóstico
    logger.info(
      `🔍 Diagnóstico antes de actualizar U_estado_proceso a '${estado}':`
    );
    diagnosticResult.recordset.forEach((pedido) => {
      logger.info(
        `  Pedido ${pedido.PEDIDO}: estado=${pedido.estado}, U_Code_Load=${pedido.U_Code_Load}, U_estado_proceso=${pedido.U_estado_proceso} → ${pedido.diagnostico}`
      );
    });

    // Verificar pedidos no actualizables
    const noActualizables = diagnosticResult.recordset.filter(
      (p) => p.diagnostico !== "ACTUALIZABLE"
    );
    if (noActualizables.length > 0) {
      const detalles = noActualizables
        .map((p) => `Pedido ${p.PEDIDO}: ${p.diagnostico}`)
        .join(", ");
      logger.warn(`⚠️ Algunos pedidos no son actualizables: ${detalles}`);

      // Dependiendo del caso, podrías querer fallar o continuar
      if (estado === "S") {
        // Para éxito, es crítico que todos se actualicen
        throw new Error(
          `No se pueden marcar como exitosos algunos pedidos: ${detalles}`
        );
      }
    }

    // ✅ PASO 2: UPDATE con condiciones de seguridad
    const params = { estado };
    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido; // ✅ Sintaxis corregida
    });

    // Agregar loadId a params si se proporciona
    if (loadId) {
      params.loadId = loadId;
    }

    let query = `
    UPDATE CATELLI.PEDIDO
    SET U_estado_proceso = @estado
    WHERE PEDIDO IN (${pedidosList})
      AND estado = 'N'
  `;

    // ✅ Condiciones adicionales según el estado
    switch (estado) {
      case "P": // Procesando
        query += " AND (U_estado_proceso = 'N' OR U_estado_proceso IS NULL)";
        if (loadId) {
          query += " AND U_Code_Load = @loadId";
        }
        break;

      case "S": // Exitoso
        query += " AND U_estado_proceso = 'P'";
        if (loadId) {
          query += " AND U_Code_Load = @loadId";
        }
        break;

      case "C": // Cancelado
        // Puede cancelar desde cualquier estado
        break;

      case "N": // Resetear a normal
        // Permitir resetear desde cualquier estado
        break;
    }

    const result = await DatabaseServiceAdapter.query(
      connection,
      query,
      params
    );

    // ✅ PASO 3: Verificar resultados
    let affectedRows = 0;

    if (Array.isArray(result.rowsAffected)) {
      affectedRows = result.rowsAffected[0] || 0;
    } else if (typeof result.rowsAffected === "number") {
      affectedRows = result.rowsAffected;
    } else {
      // Verificación manual
      const verifyQuery = `
      SELECT COUNT(*) as count
      FROM CATELLI.PEDIDO
      WHERE PEDIDO IN (${pedidosList})
      AND U_estado_proceso = @estado
    `;

      const verifyResult = await DatabaseServiceAdapter.query(
        connection,
        verifyQuery,
        params
      );
      affectedRows = verifyResult.recordset[0]?.count || 0;
    }

    // ✅ PASO 4: Verificación de integridad
    const expectedUpdates = diagnosticResult.recordset.filter(
      (p) => p.diagnostico === "ACTUALIZABLE"
    ).length;

    if (affectedRows !== expectedUpdates) {
      // Diagnóstico post-update para debugging
      const postUpdateResult = await DatabaseServiceAdapter.query(
        connection,
        diagnosticQuery,
        diagnosticParams
      );

      logger.error("❌ Error en actualización de estado - Estado POST-UPDATE:");
      postUpdateResult.recordset.forEach((pedido) => {
        logger.error(
          `  Pedido ${pedido.PEDIDO}: estado=${pedido.estado}, U_Code_Load=${pedido.U_Code_Load}, U_estado_proceso=${pedido.U_estado_proceso}`
        );
      });

      throw new Error(
        `Solo se actualizaron ${affectedRows} de ${expectedUpdates} pedidos esperados con estado '${estado}'.`
      );
    }

    logger.info(
      `✅ ${affectedRows} pedidos actualizados exitosamente con estado '${estado}'`
    );

    return {
      success: true,
      updatedCount: affectedRows,
      expectedCount: expectedUpdates,
    };
  }

  /**
   * Prepara datos de traspaso usando bodegas origen reales de cada lÃ­nea
   */
  static prepareTraspasoData(ordersData, bodegaDestino) {
    const traspasoData = ordersData.map((order) => ({
      Code_Product: order.Code_Product,
      Quantity: order.Quantity,
      bodega: order.Code_Warehouse_Orig,
      bodega_destino: bodegaDestino,
      Code_load: order.Code_load,
    }));

    return traspasoData;
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
        GETDATE() as FECHA_PROMETIDA,  --pe.FECHA_PROMETIDA,
        pe.FECHA_PEDIDO,
        pe.CLIENTE,
        pe.VENDEDOR,
        pe.RUBRO4,
        cl.detalle_direccion,
        ar.ARTICULO,
        ar.UNIDAD_ALMACEN,
        pl.BODEGA as BODEGA_ORIGEN_REAL
      FROM CATELLI.PEDIDO_LINEA AS pl
      INNER JOIN CATELLI.PEDIDO AS pe ON pe.PEDIDO = pl.PEDIDO
      INNER JOIN CATELLI.CLIENTE AS cl ON cl.CLIENTE = pe.CLIENTE
      LEFT JOIN CATELLI.ARTICULO AS ar ON ar.ARTICULO = pl.ARTICULO
      WHERE pe.PEDIDO IN (${pedidosList})
      AND pe.U_Code_Load = @loadId
    ),
    Calc AS (
      -- LINEAS DE CANTIDAD PEDIDA
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
        BODEGA_ORIGEN_REAL,
        (CANTIDAD_PEDIDA * PRECIO_UNITARIO) AS SubTotal,
        ((CANTIDAD_PEDIDA * PRECIO_UNITARIO) - MONTO_DESCUENTO) AS TotalAmount
      FROM BaseData
      WHERE CANTIDAD_PEDIDA <> 0

      UNION ALL

      -- LINEAS DE CANTIDAD BONIFICADA
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
        BODEGA_ORIGEN_REAL,
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
      LINEA_TIPO,
      BODEGA_ORIGEN_REAL AS Code_Warehouse_Orig
    FROM Calc
    ORDER BY PEDIDO, PEDIDO_LINEA, LINEA_TIPO
  `;

    const params = { loadId };
    selectedPedidos.forEach((pedido, index) => {
      params[`pedido${index}`] = pedido;
    });

    const result = await DatabaseServiceAdapter.query(
      connection,
      query,
      params
    );
    return result.recordset;
  }

  /**
   * Inserta datos en IMPLT_Orders
   */
  static async insertToIMPLTOrders(connection, ordersData) {
    logger.info(`Insertando ${ordersData.length} registros en IMPLT_Orders`);

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

      await DatabaseServiceAdapter.query(connection, query, order);
    }

    logger.info(`${ordersData.length} registros insertados en IMPLT_Orders`);
  }

  /**
   * Inserta datos en IMPLT_loads_detail con bodegas origen reales
   */
  static async insertToIMPLTLoadsDetail(connection, loadId, route, ordersData) {
    logger.info(
      `Insertando registros en IMPLT_loads_detail para load: ${loadId}`
    );

    if (!ordersData || !Array.isArray(ordersData)) {
      throw new Error(
        `ordersData debe ser un array vÃ¡lido. Recibido: ${typeof ordersData}`
      );
    }

    if (ordersData.length === 0) {
      logger.warn(`No hay ordersData para procesar en loadId: ${loadId}`);
      return;
    }

    // Agrupar por producto Y bodega origen (mantener origen separado)
    const productMap = new Map();

    ordersData.forEach((order) => {
      if (!order || !order.Code_Product) {
        logger.warn(`Orden invÃ¡lida encontrada:`, order);
        return;
      }

      const bodegaOrigen = order.Code_Warehouse_Orig || order.bodega || "01";
      const key = `${order.Code_Product}_${bodegaOrigen}`;

      if (productMap.has(key)) {
        const existing = productMap.get(key);
        existing.Quantity += order.Quantity || 0;
      } else {
        productMap.set(key, {
          Code_Product: order.Code_Product,
          Quantity: order.Quantity || 0,
          Unit_Measure: order.Unit_Measure || "UND",
          Order_Date: order.Order_Date,
          Code_Warehouse_Orig: route,
        });
      }
    });

    if (productMap.size === 0) {
      throw new Error(
        `No se pudieron procesar productos vÃ¡lidos de ordersData`
      );
    }

    // Insertar lÃ­neas consolidadas
    let lineNumber = 1;
    for (const [productKey, productData] of productMap) {
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
        Code_Warehouse_Sou: route,
        Code_Route: route,
        Source_Create: "0",
        Transfer_status: "1",
      };

      try {
        await DatabaseServiceAdapter.query(connection, query, params);
        lineNumber++;
      } catch (error) {
        logger.error(
          `Error insertando lÃ­nea ${lineNumber} para producto ${productData.Code_Product}:`,
          error
        );
        throw error;
      }
    }

    logger.info(
      `${lineNumber - 1} lÃ­neas consolidadas insertadas en IMPLT_loads_detail`
    );
  }

  /**
   * Genera un nuevo loadId Ãºnico
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

        const result = await DatabaseServiceAdapter.query(
          connection,
          query,
          params
        );

        logger.info(`${result.rowsAffected[0]} pedidos cancelados`);

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
   * Elimina lÃ­neas especÃ­ficas de un pedido
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

        const result = await DatabaseServiceAdapter.query(
          connection,
          query,
          params
        );

        logger.info(
          `${result.rowsAffected[0]} lÃ­neas eliminadas del pedido ${pedidoId}`
        );

        return {
          success: true,
          message: `${result.rowsAffected[0]} lÃ­neas eliminadas correctamente`,
          removedCount: result.rowsAffected[0],
        };
      });
    } catch (error) {
      logger.error(`Error eliminando lÃ­neas del pedido ${pedidoId}:`, error);
      throw error;
    }
  }

  /**
   * Resto de mÃ©todos sin cambios de transacciones...
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

  static async processInventoryTransfer(loadId, bodegaDestino) {
    try {
      const loadData = await withConnection("server2", async (connection) => {
        const query = `
          SELECT
            Code_Product as codigo,
            Quantity as cantidad,
            Code_Warehouse_Sou as bodegaOrigen
          FROM dbo.IMPLT_loads_detail
          WHERE Code = @loadId
        `;

        const result = await DatabaseServiceAdapter.query(connection, query, {
          loadId,
        });
        return result.recordset;
      });

      if (!loadData || loadData.length === 0) {
        throw new Error(`No se encontraron datos para la carga ${loadId}`);
      }

      const traspasoService = require("./traspasoService");

      const traspasoResult = await traspasoService.procesarTraspasoBodega(
        loadData,
        loadData[0].bodegaOrigen,
        bodegaDestino,
        loadId
      );

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