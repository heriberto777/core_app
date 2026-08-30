/**
 * loadsService.js — Orquestador
 * 
 * Este servicio actúa como la fachada principal y orquestador para el flujo de cargas.
 * Delega las operaciones pesadas de datos a LoadsSQLService y la persistencia a LoadsTrackingService.
 * Cumple con el Principio de Responsabilidad Única (SoC).
 */
const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const logger = require("./logger");
const { realizarTraspaso, traspasoBodega } = require("./traspasoService");

// Sub-servicios especializados
const LoadsSQLService = require("./LoadsSQLService");
const LoadsTrackingService = require("./LoadsTrackingService");
const ConsecutiveService = require("./ConsecutiveService");
const { DeliveryPerson } = require("../models/loadsModel");

class LoadsService {
  // ─── Métodos delegados a LoadsSQLService ────────────────────────────────

  static async getPendingOrders(filters = {}) {
    return await LoadsSQLService.getPendingOrders(filters);
  }

  static async getOrderDetails(pedidoId) {
    return await LoadsSQLService.getOrderDetails(pedidoId);
  }

  static async getSellers() {
    return await LoadsSQLService.getSellers();
  }

  static async getDeliveryPersons() {
    return await LoadsSQLService.getDeliveryPersons();
  }

  static async cancelOrders(selectedPedidos, userId, reason) {
    return await LoadsSQLService.cancelOrders(selectedPedidos, userId, reason);
  }

  static async removeOrderLines(pedidoId, selectedLines, userId) {
    return await LoadsSQLService.removeOrderLines(pedidoId, selectedLines, userId);
  }

  // ─── Métodos delegados a LoadsTrackingService ───────────────────────────

  static async getLoadHistory(filters = {}) {
    return await LoadsTrackingService.getLoadHistory(filters);
  }

  // ─── Gestión de Repartidores (Mongoose) ─────────────────────────────────
  // Se mantienen aquí por ser operaciones CRUD directas sobre el modelo base de este dominio

  static async createDeliveryPerson(deliveryPersonData) {
    try {
      const newDeliveryPerson = new DeliveryPerson(deliveryPersonData);
      await newDeliveryPerson.save();
      return { success: true, data: newDeliveryPerson, message: "Repartidor creado exitosamente" };
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
      if (!updatedDeliveryPerson) throw new Error("Repartidor no encontrado");
      return { success: true, data: updatedDeliveryPerson, message: "Repartidor actualizado exitosamente" };
    } catch (error) {
      logger.error(`Error actualizando repartidor ${id}:`, error);
      throw error;
    }
  }

  // ─── ORQUESTACIÓN PRINCIPAL ──────────────────────────────────────────────

  /**
   * Proceso central de carga de pedidos.
   * Coordina validaciones, transacciones en múltiples servidores y tracking.
   */
  static async processOrderLoad(deliveryPersonCode, selectedPedidos, userId) {
    let step = "initialization";
    let loadId;

    try {
      logger.info(`Iniciando proceso de carga para repartidor: ${deliveryPersonCode}`);
      logger.info(`Pedidos seleccionados: ${selectedPedidos.join(", ")}`);

      // 1. Validar repartidor y obtener bodega destino y bodega central
      step = "validateDeliveryPerson";
      const deliveryPerson = await LoadsSQLService.validateDeliveryPerson(deliveryPersonCode);
      const bodegaDestino = deliveryPerson.assignedWarehouse;
      const bodegaCentral = deliveryPerson.warehouseCentral;
      logger.info(`Bodega Central: ${bodegaCentral} -> Bodega Destino: ${bodegaDestino}`);

      // 2. Generar loadId único
      step = "generateLoadId";
      loadId = await this.generateLoadId();
      logger.info(`LoadId generado: ${loadId}`);

      // 3. Crear tracking inicial (MongoDB)
      step = "createLoadTracking";
      await LoadsTrackingService.createLoadTracking(loadId, deliveryPersonCode, "MULTIPLE", selectedPedidos.length, userId);

      let ordersData = null;

      // Usar withTransaction para manejo automático de transacciones en Server 1
      return await DatabaseServiceAdapter.withTransaction("server1", async (server1Connection) => {
        try {
          // PASO 1: Actualizar U_Code_Load en PEDIDO
          step = "updatePedidosWithLoadId";
          logger.info(`${step}: Actualizando pedidos con loadId...`);
          await LoadsSQLService.updatePedidosWithLoadId(server1Connection, selectedPedidos, loadId);

          // PASO 1.5: Marcar pedidos como PROCESANDO ('P')
          step = "markAsProcessing";
          logger.info(`${step}: Marcando pedidos como procesando...`);
          await LoadsSQLService.updateEstadoProceso(server1Connection, selectedPedidos, "P", loadId);

          // PASO 2: Obtener datos transformados
          step = "getTransformedOrdersData";
          logger.info(`${step}: Obteniendo datos transformados...`);
          ordersData = await LoadsSQLService.getTransformedOrdersData(server1Connection, selectedPedidos, loadId);
          logger.info(`${step}: ${ordersData.length} registros obtenidos`);

          // PASO 3: Preparar datos de traspaso
          step = "prepareTraspasoData";
          const traspasoData = LoadsSQLService.prepareTraspasoData(ordersData, bodegaDestino);

          // PASOS 4 y 5: Insertar en staging (server1, misma transaccion) — una
          // tarea del motor de Tareas de Transferencia se encarga de empujarlo
          // a server2 despues. Antes esto insertaba directo en server2 en una
          // conexion aparte, y dejaba filas huerfanas ahi si el traspaso (PASO 6)
          // fallaba luego, porque no había forma de revertir un INSERT ya hecho
          // en otro servidor.
          step = "insertToLoadsOrdersStaging";
          logger.info(`${step}: Insertando en core_app.loads_orders_staging...`);
          await LoadsSQLService.insertToLoadsOrdersStaging(server1Connection, ordersData);

          step = "insertToLoadsDetailStaging";
          logger.info(`${step}: Insertando en core_app.loads_detail_staging...`);
          await LoadsSQLService.insertToLoadsDetailStaging(server1Connection, loadId, deliveryPersonCode, ordersData);

          // PASO 6: Ejecutar traspaso automático
          step = "realizarTraspaso";
          logger.info(`${step}: Ejecutando traspaso de inventario...`);
          const traspasoResult = await realizarTraspaso({
            route: deliveryPersonCode,
            salesData: traspasoData,
            bodega_destino: bodegaDestino,
          });

          // VALIDAR RESULTADO DEL TRASPASO
          if (!traspasoResult || !traspasoResult.success) {
            logger.warn(`Traspaso falló: ${traspasoResult?.mensaje || "Error desconocido"}`);
            step = "markAsCancelled";
            await LoadsSQLService.updateEstadoProceso(server1Connection, selectedPedidos, "C", loadId);

            const trackingId = await LoadsTrackingService.saveTraspasoTracking(server1Connection, {
              loadId, deliveryPersonCode, deliveryPersonName: deliveryPerson.name,
              warehouseOrigin: "MULTIPLE", warehouseDestination: bodegaDestino,
              ordersData, traspasoResult, userId
            }, "failed");

            await LoadsTrackingService.updateTrackingStatus(loadId, "completed_manual_transfer_required", {
              processedOrders: selectedPedidos.length,
              traspasoStatus: "execution_failed",
              traspasoTrackingId: trackingId,
              errorMessage: traspasoResult?.mensaje || "Error en traspaso",
              warehouseOrigin: "MULTIPLE",
              warehouseDestination: bodegaDestino
            });

            throw new Error(`Traspaso falló: ${traspasoResult?.mensaje || "Error desconocido"}`);
          }

          // VALIDAR FALLAS PARCIALES
          const totalLineas = traspasoResult.totalLineas || 0;
          const lineasExitosas = traspasoResult.lineasExitosas || 0;
          const porcentajeExito = totalLineas > 0 ? (lineasExitosas / totalLineas) * 100 : 0;

          if (porcentajeExito < 80 && traspasoResult.lineasFallidas > 0) {
            logger.warn(`Traspaso con fallas significativas: ${lineasExitosas}/${totalLineas} (${porcentajeExito.toFixed(1)}%)`);
            const trackingId = await LoadsTrackingService.saveTraspasoTracking(server1Connection, {
              loadId, deliveryPersonCode, deliveryPersonName: deliveryPerson.name,
              warehouseOrigin: "MULTIPLE", warehouseDestination: bodegaDestino,
              ordersData, traspasoResult, userId
            }, "completed");

            step = "updateEstadoProcesoSuccess";
            await LoadsSQLService.updateEstadoProceso(server1Connection, selectedPedidos, "S", loadId);

            await LoadsTrackingService.updateTrackingStatus(loadId, "completed_with_warnings", {
              processedOrders: selectedPedidos.length,
              traspasoDocument: traspasoResult.documento_inv,
              traspasoStatus: "partial_success",
              traspasoTrackingId: trackingId,
              warningMessage: `Traspaso parcial: ${lineasExitosas}/${totalLineas} líneas exitosas`,
              warehouseOrigin: "MULTIPLE",
              warehouseDestination: bodegaDestino
            });

            return { success: true, hasWarnings: true, loadId, message: "Carga completada con advertencias en inventario", result: traspasoResult };
          }

          // EXITO TOTAL
          logger.info(`Traspaso completado exitosamente - Documento: ${traspasoResult.documento_inv}`);
          const trackingId = await LoadsTrackingService.saveTraspasoTracking(server1Connection, {
            loadId, deliveryPersonCode, deliveryPersonName: deliveryPerson.name,
            warehouseOrigin: "MULTIPLE", warehouseDestination: bodegaDestino,
            ordersData, traspasoResult, userId
          }, "completed");

          step = "updateEstadoProcesoSuccess";
          await LoadsSQLService.updateEstadoProceso(server1Connection, selectedPedidos, "S", loadId);

          await LoadsTrackingService.updateTrackingStatus(loadId, "completed", {
            processedOrders: selectedPedidos.length,
            traspasoDocument: traspasoResult.documento_inv,
            traspasoStatus: "completed",
            traspasoTrackingId: trackingId,
            warehouseOrigin: "MULTIPLE",
            warehouseDestination: bodegaDestino
          });

          return { success: true, loadId, message: "Proceso de carga completado exitosamente", data: traspasoResult };

        } catch (transactionError) {
          logger.error(`Error en paso ${step} (transacción server1):`, transactionError);
          if (step !== "updatePedidosWithLoadId" && step !== "markAsProcessing") {
            try {
              await LoadsSQLService.updateEstadoProceso(server1Connection, selectedPedidos, "C", loadId);
            } catch (rollbackError) {
              logger.error("Error en rollback de estado:", rollbackError);
            }
          }
          throw transactionError;
        }
      });

    } catch (error) {
      logger.error(`Error crítico en processOrderLoad (${loadId}):`, error);
      if (loadId) {
        await LoadsTrackingService.updateTrackingStatus(loadId, "error", {
          errorMessage: error.message,
          failedStep: step
        });
      }
      return { success: false, message: "Error al procesar la carga", error: error.message, step };
    }
  }

  /**
   * Procesa el traspaso de inventario diferido.
   *
   * Lee de core_app.loads_detail_staging (server1), no de dbo.IMPLT_loads_detail
   * (server2): esa tabla se llena directo en la misma transaccion de
   * processOrderLoad, mientras que server2 depende de que ya haya corrido la
   * tarea de push — si alguien reintenta el traspaso antes de esa corrida,
   * leer de server2 no encontraría nada.
   */
  static async processInventoryTransfer(loadId, bodegaDestino) {
    try {
      const loadData = await withConnection("server1", async (connection) => {
        const query = `
          SELECT code_product as codigo, quantity as cantidad, code_warehouse_sou as bodegaOrigen
          FROM core_app.loads_detail_staging WHERE code = @loadId
        `;
        const result = await DatabaseServiceAdapter.query(connection, query, { loadId });
        return result.recordset;
      });

      if (!loadData || loadData.length === 0) {
        throw new Error(`No se encontraron datos para la carga ${loadId}`);
      }

      // Fix: eliminar require dinámico
      let traspasoResult;
      try {
        traspasoResult = await traspasoBodega({
          route: "SYSTEM", // O el código que corresponda
          salesData: loadData.map(d => ({
            Code_Product: d.codigo,
            Quantity: d.cantidad,
            bodega: d.bodegaOrigen
          })),
          bodega_destino: bodegaDestino
        });
      } catch (traspasoError) {
        await LoadsTrackingService.saveTraspasoTracking(null, {
          loadId,
          deliveryPersonCode: "SYSTEM",
          warehouseOrigin: loadData[0].bodegaOrigen,
          warehouseDestination: bodegaDestino,
          traspasoResult: { mensaje: traspasoError.message },
          executionSource: "manual",
        }, "failed");
        throw traspasoError;
      }

      await LoadsTrackingService.saveTraspasoTracking(null, {
        loadId,
        deliveryPersonCode: "SYSTEM",
        warehouseOrigin: loadData[0].bodegaOrigen,
        warehouseDestination: bodegaDestino,
        traspasoResult,
        executionSource: "manual",
      }, "completed");

      await LoadsTrackingService.updateTrackingStatus(loadId, "transferred");

      return {
        success: true,
        message: "Traspaso de inventario procesado correctamente",
        data: { loadId, documentoGenerado: traspasoResult.documento_inv, bodegaOrigen: loadData[0].bodegaOrigen, bodegaDestino }
      };
    } catch (error) {
      logger.error("Error procesando traspaso de inventario:", error);
      throw error;
    }
  }

  /**
   * Genera un nuevo loadId — via el consecutivo Mongo "LOAD", el mismo que ya
   * usa el Flujo B (Carga de Camiones, getLoadConsecutiveMongo) para no tener
   * dos generadores de loadId distintos. Antes era un id de 24 dígitos
   * (timestamp + random); Code / Code_load en server2 solo tienen un tope de
   * 24 caracteres, no un formato fijo, así que un consecutivo más corto entra
   * sin problema.
   */
  static async generateLoadId() {
    // getNextConsecutiveValue devuelve un array de { numeric, formatted, segment }
    // (getNextValue del modelo soporta reservar varios de una vez) -- acá solo
    // pedimos uno, así que hay que sacar el string formateado del primer elemento.
    const values = await ConsecutiveService.getNextConsecutiveValue("LOAD");
    const formatted = Array.isArray(values) ? values[0]?.formatted : values?.formatted;
    if (!formatted) {
      throw new Error("El consecutivo 'LOAD' no devolvió un valor formateado válido");
    }
    return formatted;
  }
}

module.exports = LoadsService;