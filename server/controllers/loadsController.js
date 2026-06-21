const LoadsService = require("../services/loadsService");
const traspasoService = require('../services/traspasoService');
const logger = require("../services/logger");

class LoadsController {
  /**
   * Obtiene pedidos pendientes de cargar
   */
  static async getPendingOrders(req, res) {
    const startTime = Date.now();
    try {
      const filters = {
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        sellers: req.query.sellers,
        transferStatus: req.query.transferStatus,
        includeLoaded: req.query.includeLoaded === "true",
      };

      logger.info("Obteniendo pedidos pendientes", {
        operationType: "QUERY",
        entityType: "PEDIDO",
        filters,
        httpMethod: req.method,
        httpPath: req.originalUrl,
      });

      const result = await LoadsService.getPendingOrders(filters);

      logger.info("Pedidos obtenidos correctamente", {
        operationType: "QUERY",
        entityType: "PEDIDO",
        affectedRecords: result.totalRecords,
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 200,
      });

      return res.status(200).json({
        success: true,
        message: "Pedidos obtenidos correctamente",
        data: result.data,
        totalRecords: result.totalRecords,
      });
    } catch (error) {
      logger.error("Error en getPendingOrders", {
        operationType: "QUERY",
        entityType: "PEDIDO",
        error: error.message,
        stack: error.stack,
        filters: req.query,
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 500,
      });
      return res.status(500).json({
        success: false,
        message: "Error al obtener pedidos pendientes",
      });
    }
  }

  /**
   * Obtiene detalles de líneas de un pedido específico
   */
  static async getOrderDetails(req, res) {
    const startTime = Date.now();
    try {
      const { pedidoId } = req.params;
      
      logger.info("Obteniendo detalles del pedido", {
        operationType: "QUERY",
        entityType: "PEDIDO",
        entityId: pedidoId,
        httpMethod: req.method,
        httpPath: req.originalUrl,
      });

      const result = await LoadsService.getOrderDetails(pedidoId);

      logger.info("Detalles del pedido obtenidos", {
        operationType: "QUERY",
        entityType: "PEDIDO",
        entityId: pedidoId,
        affectedRecords: result.data?.length || 0,
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 200,
      });

      return res.status(200).json({
        success: true,
        message: "Detalles del pedido obtenidos correctamente",
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en getOrderDetails", {
        operationType: "QUERY",
        entityType: "PEDIDO",
        entityId: req.params.pedidoId,
        error: error.message,
        stack: error.stack,
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 500,
      });
      return res.status(500).json({
        success: false,
        message: "Error al obtener detalles del pedido",
      });
    }
  }

  /**
   * Obtiene lista de vendedores activos
   */
  static async getSellers(req, res) {
    const startTime = Date.now();
    try {
      logger.debug("Obteniendo lista de vendedores");
      
      const result = await LoadsService.getSellers();

      logger.info("Vendedores obtenidos correctamente", {
        operationType: "QUERY",
        entityType: "VENDEDOR",
        affectedRecords: result.data?.length || 0,
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 200,
      });

      return res.status(200).json({
        success: true,
        message: "Vendedores obtenidos correctamente",
        data: result.data,
      });
    } catch (error) {
      if (error instanceof AggregateError) {
        logger.error("AggregateError en getSellers", {
          operationType: "QUERY",
          entityType: "VENDEDOR",
          errorCode: "AGGREGATE_ERROR",
          errorDetails: {
            errorsCount: error.errors.length,
            errors: error.errors.map(e => ({ message: e.message, code: e.code }))
          },
          durationMs: Date.now() - startTime,
          httpMethod: req.method,
          httpPath: req.originalUrl,
          httpStatusCode: 500,
        });
      } else {
        logger.error("Error en getSellers", {
          operationType: "QUERY",
          entityType: "VENDEDOR",
          error: error.message,
          stack: error.stack,
          durationMs: Date.now() - startTime,
          httpMethod: req.method,
          httpPath: req.originalUrl,
          httpStatusCode: 500,
        });
      }
      return res.status(500).json({
        success: false,
        message: "Error al obtener vendedores",
      });
    }
  }

  /**
   * Obtiene todos los repartidores
   */
  static async getDeliveryPersons(req, res) {
    const startTime = Date.now();
    try {
      logger.debug("Obteniendo lista de repartidores");
      
      const result = await LoadsService.getDeliveryPersons();

      logger.info("Repartidores obtenidos correctamente", {
        operationType: "QUERY",
        entityType: "VENDEDOR",
        affectedRecords: result.data?.length || 0,
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 200,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error("Error en getDeliveryPersons", {
        operationType: "QUERY",
        entityType: "VENDEDOR",
        error: error.message,
        stack: error.stack,
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 500,
      });
      return res.status(500).json({ success: false, message: "Error al obtener repartidores" });
    }
  }


  /**
   * Procesa la carga de pedidos seleccionados
   */
  static async processOrderLoad(req, res) {
    const startTime = Date.now();
    try {
      const { selectedPedidos, deliveryPersonCode } = req.body;
      const userId = req.user?.user_id || req.user?._id || "SYSTEM";

      logger.info("Procesando carga de pedidos", {
        operationType: "LOAD",
        entityType: "CARGA",
        affectedRecords: selectedPedidos?.length || 0,
        deliveryPersonCode,
        userId,
        httpMethod: req.method,
        httpPath: req.originalUrl,
      });

      const result = await LoadsService.processOrderLoad(
        deliveryPersonCode.trim(),
        selectedPedidos,
        userId
      );

      logger.info("Carga procesada correctamente", {
        operationType: "LOAD",
        entityType: "CARGA",
        entityId: result.loadId,
        loadId: result.loadId,
        affectedRecords: selectedPedidos?.length || 0,
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 200,
      });

      return res.status(200).json({
        success: result.success !== false,
        message: result.message || "Proceso completado",
        data: {
          ...(result.data || {}),
          loadId: result.loadId,
          totalOrders: selectedPedidos.length
        },
        extra: {
          requiresManualTransfer: !!result.requiresManualTransfer,
          hasWarnings: !!result.hasWarnings
        }
      });
    } catch (error) {
      logger.error("Error en processOrderLoad", {
        operationType: "LOAD",
        entityType: "CARGA",
        error: error.message,
        stack: error.stack,
        affectedRecords: req.body.selectedPedidos?.length || 0,
        deliveryPersonCode: req.body.deliveryPersonCode,
        userId: req.user?.user_id || req.user?._id || "SYSTEM",
        durationMs: Date.now() - startTime,
        httpMethod: req.method,
        httpPath: req.originalUrl,
        httpStatusCode: 500,
      });
      return res.status(500).json({
        success: false,
        message: error.message || "Error al procesar la carga",
      });
    }
  }

  /**
   * Cancela pedidos seleccionados
   */
  static async cancelOrders(req, res) {
    try {
      const { selectedPedidos, reason } = req.body;
      const userId = req.user?.user_id || req.user?._id || "SYSTEM";

      logger.info(`Cancelando ${selectedPedidos?.length || 0} pedidos. Razón: ${reason || "No especificada"} por ${userId}`);

      const result = await LoadsService.cancelOrders(selectedPedidos, userId);

      return res.status(200).json({
        success: true,
        message: result.message || "Pedidos cancelados exitosamente",
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en cancelOrders:", error);
      return res.status(500).json({
        success: false,
        message: "Error al cancelar pedidos",
      });
    }
  }

  /**
   * Elimina líneas específicas de un pedido
   */
  static async removeOrderLines(req, res) {
    try {
      const { pedidoId } = req.params;
      const { lineasToRemove } = req.body;

      logger.info(`Eliminando ${lineasToRemove?.length || 0} líneas del pedido ${pedidoId}`);

      const result = await LoadsService.removeOrderLines(pedidoId, lineasToRemove);

      return res.status(200).json({
        success: true,
        message: result.message || "Líneas eliminadas exitosamente",
        data: { deletedLinesCount: result.deletedLines?.length || 0, deletedLines: result.deletedLines },
      });
    } catch (error) {
      logger.error(`Error en removeOrderLines (Pedido: ${req.params.pedidoId}):`, error);
      return res.status(500).json({
        success: false,
        message: "Error al eliminar líneas del pedido",
      });
    }
  }

  /**
   * Crea un nuevo repartidor
   */
  static async createDeliveryPerson(req, res) {
    try {
      const { code, name, assignedWarehouse } = req.body;

      const result = await LoadsService.createDeliveryPerson({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        assignedWarehouse: assignedWarehouse.trim().toUpperCase(),
      });

      return res.status(201).json({
        success: true,
        message: "Repartidor creado correctamente",
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en createDeliveryPerson:", error);
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "Ya existe un repartidor con ese código",
        });
      }
      return res.status(500).json({
        success: false,
        message: "Error al crear repartidor",
      });
    }
  }

  /**
   * Actualiza un repartidor existente
   */
  static async updateDeliveryPerson(req, res) {
    try {
      const { id } = req.params;
      const { name, assignedWarehouse, isActive } = req.body;

      const result = await LoadsService.updateDeliveryPerson(id, {
        name: name?.trim(),
        assignedWarehouse: assignedWarehouse?.trim().toUpperCase(),
        isActive,
      });

      return res.status(200).json({
        success: true,
        message: "Repartidor actualizado correctamente",
        data: result.data,
      });
    } catch (error) {
      logger.error(`Error en updateDeliveryPerson (${req.params.id}):`, error);
      return res.status(500).json({
        success: false,
        message: "Error al actualizar repartidor",
      });
    }
  }

  /**
   * Obtiene el historial de cargas
   */
  static async getLoadHistory(req, res) {
    try {
      const { page, limit, status, dateFrom, dateTo } = req.query;

      const result = await LoadsService.getLoadHistory({
        page, limit, status, dateFrom, dateTo
      });

      return res.status(200).json({
        success: true,
        message: "Historial de cargas obtenido correctamente",
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error("Error en getLoadHistory:", error);
      return res.status(500).json({
        success: false,
        message: "Error al obtener historial de cargas",
      });
    }
  }

  /**
   * Procesa traspaso de inventario
   */
  static async processInventoryTransfer(req, res) {
    try {
      const { loadId, bodegaDestino } = req.body;

      logger.info(`Procesando traspaso de inventario para carga ${loadId} hacia bodega ${bodegaDestino}`);

      const result = await LoadsService.processInventoryTransfer(loadId, bodegaDestino);

      return res.status(200).json({
        success: true,
        message: result.message || "Traspaso procesado exitosamente",
        data: result.data,
      });
    } catch (error) {
      logger.error(`Error en processInventoryTransfer (${req.body.loadId}):`, error);
      return res.status(500).json({
        success: false,
        message: "Error al procesar traspaso de inventario",
      });
    }
  }

  // ================================================
  // MÉTODOS DE TRASPASO ADICIONALES
  // ================================================

  static async executeTransfer(req, res) {
    try {
      const { loadId } = req.params;
      const result = await traspasoService.executeTransferByLoadId(loadId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error(`Error en executeTransfer (${req.params.loadId}):`, error);
      return res.status(500).json({ success: false, message: "Error al ejecutar traspaso" });
    }
  }

  static async getTraspasos(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page, 10) || 1,
        limit: parseInt(req.query.limit, 10) || 20,
        status: req.query.status,
        deliveryPerson: req.query.deliveryPerson,
        loadId: req.query.loadId,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };

      const result = await traspasoService.getTraspasosList(filters);
      return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error) {
      logger.error("Error en getTraspasos:", error);
      return res.status(500).json({ success: false, message: "Error al obtener traspasos" });
    }
  }

  static async getTraspasoDetails(req, res) {
    try {
      const { traspasoId } = req.params;
      const result = await traspasoService.getTraspasoDetails(traspasoId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error(`Error en getTraspasoDetails (${req.params.traspasoId}):`, error);
      return res.status(500).json({ success: false, message: "Error al obtener detalles" });
    }
  }

  static async updateTraspasoStatus(req, res) {
    try {
      const { traspasoId } = req.params;
      const { status, notes } = req.body;
      const userId = req.user?.user_id || req.user?._id || "SYSTEM";
      const result = await traspasoService.updateTraspasoStatus(traspasoId, status, notes, userId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error(`Error en updateTraspasoStatus (${req.params.traspasoId}):`, error);
      return res.status(500).json({ success: false, message: "Error al actualizar estado" });
    }
  }

  static async getWarehouses(req, res) {
    try {
      const result = await traspasoService.getWarehouses();
      return res.status(200).json({ success: true, data: { warehouses: result } });
    } catch (error) {
      logger.error("Error en getWarehouses:", error);
      return res.status(500).json({ success: false, message: "Error al obtener bodegas" });
    }
  }

  static async getTraspasoHistory(req, res) {
    try {
      const filters = req.query;
      const result = await traspasoService.getTraspasoHistory(filters);
      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error("Error obteniendo historial de traspasos:", error);
      return res.status(500).json({
        success: false,
        message: "Error al obtener historial de traspasos",
        error: error.message,
      });
    }
  }

  static async getDeliveryPersonsFilter(req, res) {
    try {
      const result = await traspasoService.getDeliveryPersonsForFilter();
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error("Error obteniendo repartidores para filtro:", error);
      return res.status(500).json({
        success: false,
        message: "Error al obtener repartidores",
        error: error.message,
      });
    }
  }

  static async retryTraspaso(req, res) {
    try {
      const { traspasoId } = req.params;
      const { updatedData } = req.body;
      const result = await traspasoService.retryFailedTraspaso(traspasoId, updatedData);
      return res.status(200).json({
        success: true,
        message: "Traspaso reintentado exitosamente",
        data: result,
      });
    } catch (error) {
      logger.error("Error reintentando traspaso:", error);
      return res.status(500).json({
        success: false,
        message: "Error al reintentar traspaso",
        error: error.message,
      });
    }
  }

  static async processReturns(req, res) {
    try {
      const { traspasoId } = req.params;
      const { returnedProducts } = req.body;
      const result = await traspasoService.processProductReturns(traspasoId, returnedProducts);
      return res.status(200).json({
        success: true,
        message: "Devoluciones procesadas correctamente",
        data: result,
      });
    } catch (error) {
      logger.error("Error procesando devoluciones:", error);
      return res.status(500).json({
        success: false,
        message: "Error al procesar devoluciones",
        error: error.message,
      });
    }
  }

  static async getTraspasoStats(req, res) {
    try {
      const filters = {
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };
      const result = await traspasoService.getTraspasoStats(filters);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error("Error obteniendo estadísticas de traspasos:", error);
      return res.status(500).json({
        success: false,
        message: "Error al obtener estadísticas de traspasos",
        error: error.message,
      });
    }
  }

  static async deleteTraspaso(req, res) {
    try {
      const { traspasoId } = req.params;
      const { reason } = req.body;
      const userId = req.user?.user_id || req.user?._id || "SYSTEM";
      const result = await traspasoService.deleteTraspaso(traspasoId, reason, userId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error("Error eliminando traspaso:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Error al eliminar traspaso",
      });
    }
  }

  static async bulkAction(req, res) {
    try {
      const { action, traspasoIds, data } = req.body;
      const userId = req.user?.user_id || req.user?._id || "SYSTEM";
      const result = await traspasoService.bulkTraspasoAction(action, traspasoIds, data || {}, userId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error("Error en operación masiva:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Error en operación masiva",
      });
    }
  }

  static async executeBulkTransfers(req, res) {
    try {
      const { loadIds } = req.body;
      if (!Array.isArray(loadIds) || loadIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Se requiere una lista válida de Load IDs",
        });
      }

      const results = { executed: 0, failed: 0, errors: [], details: [] };
      for (const loadId of loadIds) {
        try {
          const result = await traspasoService.executeTransferByLoadId(loadId);
          if (result.success) {
            results.executed++;
            results.details.push({ loadId, status: "success", message: "Traspaso ejecutado exitosamente" });
          } else {
            results.failed++;
            results.errors.push(`Load ID ${loadId}: ${result.mensaje || "Error en ejecución"}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Load ID ${loadId}: ${error.message}`);
          logger.error(`Error en traspaso masivo ${loadId}:`, error);
        }
      }
      return res.status(200).json({
        success: true,
        message: `Proceso masivo completado: ${results.executed} exitosos, ${results.failed} fallidos`,
        data: results,
      });
    } catch (error) {
      logger.error("Error in bulk execution:", error);
      return res.status(500).json({
        success: false,
        message: "Error en ejecución masiva",
        error: error.message,
      });
    }
  }
}

module.exports = LoadsController;
