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
const { DeliveryPerson, LoadTracking } = require("../models/loadsModel");

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

  // ─── Revisión de Almacén ─────────────────────────────────────────────────

  static async getPendingReviewLoads() {
    const summaries = await LoadsSQLService.getPendingReviewLoads();
    if (summaries.length === 0) return [];

    const loadIds = summaries.map((s) => s.code_load);
    const trackings = await LoadTracking.find({ loadId: { $in: loadIds } }).lean();
    const trackingMap = new Map(trackings.map((t) => [t.loadId, t]));

    return summaries.map((s) => {
      const tracking = trackingMap.get(s.code_load);
      return {
        loadId: s.code_load,
        totalPedidos: s.totalPedidos,
        totalProductos: s.totalProductos,
        fechaPedido: s.fechaPedido,
        fechaEntrega: s.fechaEntrega,
        route: tracking?.route || null,
        bodega: tracking?.bodega || null,
        createdAt: tracking?.createdAt || null,
      };
    });
  }

  static async getLoadReviewDetail(loadId) {
    return await LoadsSQLService.getLoadReviewDetail(loadId);
  }

  static async saveLineAdjustment(loadId, adjustment, userId) {
    return await LoadsSQLService.upsertLineAdjustment(loadId, adjustment, userId);
  }

  /**
   * Autoriza el despacho de una carga que está en Revisión de Almacén:
   * regenera el staging con los ajustes ya aplicados (review_status='approved')
   * y recién ahí dispara el traspaso real de inventario.
   *
   * Guarda de idempotencia: realizarTraspaso no tiene ninguna propia (ver
   * notas del plan), así que si el tracking ya no está en
   * "pendingWarehouseReview" se rechaza acá, antes de tocar nada — evita
   * generar un segundo TRA###### si alguien reintenta autorizar la misma carga.
   */
  static async authorizeDispatch(loadId, userId, bodegaOrigen) {
    const tracking = await LoadsTrackingService.getByLoadId(loadId);
    if (!tracking) {
      throw new Error(`Carga ${loadId} no encontrada`);
    }
    if (tracking.status !== "pendingWarehouseReview") {
      throw new Error(`Carga ${loadId} no está pendiente de revisión (estado actual: ${tracking.status})`);
    }

    // tracking.bodega NO es la bodega destino real -- createLoadTracking lo
    // graba como el literal "MULTIPLE" (bodegas de ORIGEN variadas entre
    // las líneas de la carga, ver insertToLoadsDetailStaging). La bodega
    // DESTINO del traspaso es la asignada al repartidor (U_BODEGA en
    // CATELLI.VENDEDOR), la misma que resuelve processOrderLoad al
    // despachar -- hay que recalcularla acá, no leerla de Mongo.
    const deliveryPerson = await LoadsSQLService.validateDeliveryPerson(tracking.route);
    const bodegaDestino = deliveryPerson.assignedWarehouse;

    return await DatabaseServiceAdapter.withTransaction("server1", async (server1Connection) => {
      const pedidosResult = await DatabaseServiceAdapter.query(server1Connection,
        `SELECT PEDIDO FROM CATELLI.PEDIDO WHERE U_Code_Load = @loadId`, { loadId });
      const selectedPedidos = pedidosResult.recordset.map((r) => r.PEDIDO);
      if (selectedPedidos.length === 0) {
        throw new Error(`No se encontraron pedidos para la carga ${loadId}`);
      }

      const ordersData = await LoadsSQLService.getTransformedOrdersData(server1Connection, selectedPedidos, loadId);

      // Bodega de origen: Almacén la confirma o la cambia en Revisión de
      // Almacén (sugerida automáticamente a partir de U_BODEGA_CENTRAL, ver
      // getLoadReviewDetail) en vez de confiar ciegamente en esa inferencia
      // -- ya nos jugó en contra una vez. Si viene, se valida contra
      // CATELLI.BODEGA y se aplica a TODAS las líneas de la carga.
      if (bodegaOrigen) {
        const bodegaValidation = await DatabaseServiceAdapter.query(server1Connection,
          `SELECT BODEGA FROM CATELLI.BODEGA WHERE BODEGA = @bodegaOrigen`, { bodegaOrigen });
        if (!bodegaValidation.recordset || bodegaValidation.recordset.length === 0) {
          throw new Error(`La bodega de origen "${bodegaOrigen}" no existe en CATELLI.BODEGA`);
        }
        ordersData.forEach((order) => { order.Code_Warehouse_Orig = bodegaOrigen; });
      }

      const traspasoData = LoadsSQLService.prepareTraspasoData(ordersData, bodegaDestino);

      await LoadsSQLService.clearStagingForLoad(server1Connection, loadId);
      await LoadsSQLService.insertToLoadsOrdersStaging(server1Connection, ordersData, "approved");

      const codeRoute = ordersData[0]?.Code_Route;
      await LoadsSQLService.insertToLoadsDetailStaging(server1Connection, loadId, codeRoute || tracking.route, ordersData, bodegaDestino, "approved");

      const traspasoResult = await realizarTraspaso({
        route: tracking.route,
        salesData: traspasoData,
        bodega_destino: bodegaDestino,
      });

      if (!traspasoResult || !traspasoResult.success) {
        throw new Error(`Traspaso falló: ${traspasoResult?.mensaje || "Error desconocido"}`);
      }

      // "MULTIPLE" era un texto fijo, sin importar si la carga de verdad tenía
      // una sola bodega de origen o varias (ver bodegasOrigen más abajo, ya
      // calculado por realizarTraspaso a partir de las bodegas reales
      // usadas en las líneas) -- ahora se arma con el dato real.
      const warehouseOriginLabel = traspasoResult.bodegasOrigen?.length
        ? traspasoResult.bodegasOrigen.join(", ")
        : "MULTIPLE";

      const trackingId = await LoadsTrackingService.saveTraspasoTracking(server1Connection, {
        loadId, deliveryPersonCode: tracking.route,
        warehouseOrigin: warehouseOriginLabel, warehouseDestination: bodegaDestino,
        ordersData, traspasoResult, userId,
      }, "completed");

      await LoadsSQLService.updateEstadoProceso(server1Connection, selectedPedidos, "S", loadId);

      await LoadsTrackingService.updateTrackingStatus(loadId, "completed", {
        traspasoDocument: traspasoResult.documento_inv,
        traspasoStatus: "completed",
        traspasoTrackingId: trackingId,
        warehouseOrigin: warehouseOriginLabel,
        warehouseDestination: bodegaDestino,
      });

      return {
        success: true,
        loadId,
        message: "Despacho autorizado — traspaso completado",
        data: traspasoResult,
      };
    });
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
          // Code_Route real del cliente (core_app.route_accounts_syncs, ver
          // getTransformedOrdersData) — no el código del repartidor. Un
          // repartidor entrega una sola ruta, así que toma la de cualquier
          // línea de la carga; si ningún cliente tiene ruta asignada todavía
          // (no debería pasar en producción, pero no hay que romper la carga
          // por eso), cae de vuelta al código del repartidor como antes.
          const codeRoute = ordersData[0]?.Code_Route;
          if (!codeRoute) {
            logger.warn(`${step}: ningún cliente de la carga tiene Ruta de Reparto asignada en route_accounts_syncs — usando código de repartidor (${deliveryPersonCode}) como Code_Route de respaldo`);
          }
          logger.info(`${step}: Insertando en core_app.loads_detail_staging (Code_Route=${codeRoute || deliveryPersonCode})...`);
          await LoadsSQLService.insertToLoadsDetailStaging(server1Connection, loadId, codeRoute || deliveryPersonCode, ordersData, bodegaDestino);

          // El traspaso de inventario (realizarTraspaso) ya no se ejecuta acá.
          // Queda pendiente de Revisión de Almacén: el operador concilia cantidades
          // (ver core_app.loads_orders_adjustments) y recién ahí autoriza el despacho
          // desde loadsController.authorize, que es quien dispara el traspaso real.
          step = "markAsPendingWarehouseReview";
          await LoadsSQLService.updateEstadoProceso(server1Connection, selectedPedidos, "S", loadId);

          await LoadsTrackingService.updateTrackingStatus(loadId, "pendingWarehouseReview", {
            processedOrders: selectedPedidos.length,
            warehouseOrigin: "MULTIPLE",
            warehouseDestination: bodegaDestino
          });

          return {
            success: true,
            loadId,
            message: "Carga armada y enviada a Revisión de Almacén",
            data: { bodegaDestino, totalOrders: selectedPedidos.length },
          };

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
      // Antes "message" era un texto fijo ("Error al procesar la carga") y el
      // detalle real quedaba solo en "error" -- el controller nunca lo leía,
      // así que el frontend mostraba el genérico sin el motivo real. Ahora
      // message incluye el paso y el error real (la transacción SQL ya hizo
      // rollback de todo lo que se alcanzó a escribir -- los pedidos quedan
      // intactos, no hay nada que "arreglar" en CATELLI por este fallo).
      return {
        success: false,
        message: `No se pudo procesar la carga (paso "${step}"): ${error.message}. Si el problema persiste, contactá al administrador del sistema.`,
        error: error.message,
        step,
      };
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
   *
   * La bodega ORIGEN real sale de code_warehouse_orig, no de
   * code_warehouse_sou -- ese campo pasó a significar "bodega del
   * repartidor" (destino real del traspaso, ver insertToLoadsDetailStaging).
   */
  static async processInventoryTransfer(loadId, bodegaDestino) {
    try {
      const loadData = await withConnection("server1", async (connection) => {
        const query = `
          SELECT code_product as codigo, quantity as cantidad, code_warehouse_orig as bodegaOrigen
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