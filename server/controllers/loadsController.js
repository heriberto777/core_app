const LoadsService = require("../services/loadsService");
const traspasoService = require('../services/traspasoService');
const logger = require("../services/logger");

class LoadsController {
  /**
   * Obtiene pedidos pendientes de cargar
   */
  static async getPendingOrders(req, res) {
    console.log("Query Params in Controller:", req.query);

    try {
      //transferStatus
      const filters = {
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        seller: req.query.sellers,
        transferStatus: req.query.transferStatus,
        includeLoaded: req.query.includeLoaded === "true",
      };

      console.log("Filters in Controller:", filters);

      const result = await LoadsService.getPendingOrders(filters);

      res.json({
        success: true,
        message: "Pedidos obtenidos correctamente",
        data: result.data,
        totalRecords: result.totalRecords,
      });
    } catch (error) {
      logger.error("Error en getPendingOrders:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener pedidos pendientes",
        error: error.message,
      });
    }
  }

  /**
   * Obtiene detalles de líneas de un pedido específico
   */
  static async getOrderDetails(req, res) {
    try {
      const { pedidoId } = req.params;

      if (!pedidoId) {
        return res.status(400).json({
          success: false,
          message: "ID del pedido es requerido",
        });
      }

      const result = await LoadsService.getOrderDetails(pedidoId);

      res.json({
        success: true,
        message: "Detalles del pedido obtenidos correctamente",
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en getOrderDetails:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener detalles del pedido",
        error: error.message,
      });
    }
  }

  /**
   * Obtiene lista de vendedores activos
   */
  static async getSellers(req, res) {
    try {
      const result = await LoadsService.getSellers();

      res.json({
        success: true,
        message: "Vendedores obtenidos correctamente",
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en getSellers:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener vendedores",
        error: error.message,
      });
    }
  }

  /**
   * Obtiene vendedores que actúan como repartidores
   */
  static async getDeliveryPersons(req, res) {
    try {
      // Usar el mismo método que getSellers
      const result = await LoadsService.getSellers();

      res.json({
        success: true,
        message: "Vendedores/Repartidores obtenidos correctamente",
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en getDeliveryPersons:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener vendedores/repartidores",
        error: error.message,
      });
    }
  }

  /**
   * Procesa la carga de pedidos seleccionados
   */
  static async processOrderLoad(req, res) {
    try {
      const { selectedPedidos, deliveryPersonCode } = req.body;
      const userId = req.user?.user_id || req.user?._id;

      // ✅ AGREGAR DEBUG AQUÍ:
      console.log(
        "🔍 deliveryPersonCode:",
        deliveryPersonCode,
        typeof deliveryPersonCode
      );
      console.log(
        "🔍 selectedPedidos:",
        selectedPedidos,
        typeof selectedPedidos
      );
      console.log("🔍 selectedPedidos.length:", selectedPedidos?.length);
      console.log("🔍 userId:", userId, typeof userId);

      // Verificar que selectedPedidos sea un array
      if (!Array.isArray(selectedPedidos)) {
        return res.status(400).json({
          success: false,
          message: "selectedPedidos debe ser un array",
          received: typeof selectedPedidos,
          value: selectedPedidos,
        });
      }

      // Validaciones
      if (
        !selectedPedidos ||
        !Array.isArray(selectedPedidos) ||
        selectedPedidos.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Debe seleccionar al menos un pedido",
        });
      }

      if (!deliveryPersonCode) {
        return res.status(400).json({
          success: false,
          message: "Debe seleccionar un repartidor",
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Usuario no identificado",
        });
      }

      logger.info(
        `Procesando carga de ${selectedPedidos.length} pedidos para repartidor ${deliveryPersonCode}`
      );

      const result = await LoadsService.processOrderLoad(
        deliveryPersonCode,
        selectedPedidos,
        userId
      );

      res.json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en processOrderLoad:", error);
      res.status(500).json({
        success: false,
        message: "Error al procesar la carga",
        error: error.message,
      });
    }
  }

  /**
   * Cancela pedidos seleccionados
   */
  static async cancelOrders(req, res) {
    try {
      const { selectedPedidos, reason } = req.body;
      const userId = req.user?.user_id || req.user?._id;
      // console.log("Usuario", req.user)

      // console.log("Params in cancelOrders:", selectedPedidos, reason, userId);

      // Validaciones
      if (
        !selectedPedidos ||
        !Array.isArray(selectedPedidos) ||
        selectedPedidos.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Debe seleccionar al menos un pedido",
        });
      }

      logger.info(
        `Cancelando ${selectedPedidos.length} pedidos. Razón: ${
          reason || "No especificada"
        }`
      );

      const result = await LoadsService.cancelOrders(selectedPedidos, userId);

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error("Error en cancelOrders:", error);
      res.status(500).json({
        success: false,
        message: "Error al cancelar pedidos",
        error: error.message,
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

      // Validaciones
      if (!pedidoId) {
        return res.status(400).json({
          success: false,
          message: "ID del pedido es requerido",
        });
      }

      if (
        !lineasToRemove ||
        !Array.isArray(lineasToRemove) ||
        lineasToRemove.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Debe seleccionar al menos una línea para eliminar",
        });
      }

      logger.info(
        `Eliminando ${lineasToRemove.length} líneas del pedido ${pedidoId}`
      );

      const result = await LoadsService.removeOrderLines(
        pedidoId,
        lineasToRemove
      );

      res.json({
        success: true,
        message: result.message,
        deletedLines: result.deletedLines,
      });
    } catch (error) {
      logger.error("Error en removeOrderLines:", error);
      res.status(500).json({
        success: false,
        message: "Error al eliminar líneas del pedido",
        error: error.message,
      });
    }
  }

  /**
   * Crea un nuevo repartidor
   */
  static async createDeliveryPerson(req, res) {
    try {
      const { code, name, assignedWarehouse } = req.body;

      // Validaciones
      if (!code || !name || !assignedWarehouse) {
        return res.status(400).json({
          success: false,
          message: "Código, nombre y bodega asignada son requeridos",
        });
      }

      const result = await LoadsService.createDeliveryPerson({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        assignedWarehouse: assignedWarehouse.trim().toUpperCase(),
      });

      res.status(201).json({
        success: true,
        message: "Repartidor creado correctamente",
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en createDeliveryPerson:", error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Ya existe un repartidor con ese código",
        });
      }

      res.status(500).json({
        success: false,
        message: "Error al crear repartidor",
        error: error.message,
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

      res.json({
        success: true,
        message: "Repartidor actualizado correctamente",
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en updateDeliveryPerson:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar repartidor",
        error: error.message,
      });
    }
  }

  /**
   * Obtiene el historial de cargas
   */
  static async getLoadHistory(req, res) {
    try {
      const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;

      const filters = {
        status,
        dateFrom,
        dateTo,
        page: parseInt(page),
        limit: parseInt(limit),
      };

      const result = await LoadsService.getLoadHistory(filters);

      res.json({
        success: true,
        message: "Historial de cargas obtenido correctamente",
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error("Error en getLoadHistory:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener historial de cargas",
        error: error.message,
      });
    }
  }

  /**
   * Procesa traspaso de inventario (integración con traspasoService)
   */
  static async processInventoryTransfer(req, res) {
    try {
      const { loadId, bodegaDestino } = req.body;

      if (!loadId) {
        return res.status(400).json({
          success: false,
          message: "ID de carga es requerido",
        });
      }

      if (!bodegaDestino) {
        return res.status(400).json({
          success: false,
          message: "Bodega destino es requerida",
        });
      }

      logger.info(
        `Procesando traspaso de inventario para carga ${loadId} hacia bodega ${bodegaDestino}`
      );

      const result = await LoadsService.processInventoryTransfer(
        loadId,
        bodegaDestino
      );

      res.json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Error en processInventoryTransfer:", error);
      res.status(500).json({
        success: false,
        message: "Error al procesar traspaso de inventario",
        error: error.message,
      });
    }
  }

  /**
   * Controller limpio que SOLO llama a tu traspasoService.js
   */
  static async getTransfers(req, res) {
    try {
      const filters = req.query;
      console.log("Filters in getTransfers Controller:", filters);

      // USAR MÉTODO DE TU traspasoService.js (necesitamos agregarlo)
      const result = await traspasoService.getTransfersList(filters);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Error fetching transfers:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener traspasos",
        error: error.message,
      });
    }
  }

  static async executeTransfer(req, res) {
    try {
      const { loadId } = req.params;

      // TU SERVICIO YA MANEJA TODO ESTO
      const result = await traspasoService.executeTransferByLoadId(loadId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Error executing transfer:", error);
      res.status(500).json({
        success: false,
        message: "Error al ejecutar traspaso",
        error: error.message,
      });
    }
  }
  static async getTraspasoHistory(req, res) {
    try {
      const filters = req.query;

      // AGREGAR ESTE MÉTODO A traspasoService.js
      const result = await traspasoService.getTraspasoHistory(filters);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error("Error obteniendo historial de traspasos:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener historial de traspasos",
        error: error.message,
      });
    }
  }

  /**
   * Obtiene detalles - USAR MÉTODO DEL SERVICIO
   */
  static async getTraspasoDetails(req, res) {
    try {
      const { traspasoId } = req.params;

      // AGREGAR ESTE MÉTODO A traspasoService.js
      const result = await traspasoService.getTraspasoDetails(traspasoId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Error obteniendo detalles de traspaso:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener detalles del traspaso",
        error: error.message,
      });
    }
  }

  /**
   * Actualiza estado - YA EXISTE EN TRASPASOSERVICE
   */
  static async updateTraspasoStatus(req, res) {
    try {
      const { traspasoId } = req.params;
      const { status, notes } = req.body;
      const userId = req.user?.id || "SYSTEM";

      // USAR MÉTODO EXISTENTE DE traspasoService.js
      const result = await traspasoService.updateTraspasoStatus(
        traspasoId,
        status,
        notes,
        userId
      );

      res.json(result);
    } catch (error) {
      logger.error("Error actualizando estado de traspaso:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar estado del traspaso",
        error: error.message,
      });
    }
  }

  /**
   * Reintenta traspaso - YA EXISTE EN TRASPASOSERVICE
   */
  static async retryTraspaso(req, res) {
    try {
      const { traspasoId } = req.params;
      const { updatedData } = req.body;

      // USAR MÉTODO EXISTENTE DE traspasoService.js
      const result = await traspasoService.retryFailedTraspaso(
        traspasoId,
        updatedData
      );

      res.json({
        success: true,
        message: "Traspaso reintentado exitosamente",
        data: result,
      });
    } catch (error) {
      logger.error("Error reintentando traspaso:", error);
      res.status(500).json({
        success: false,
        message: "Error al reintentar traspaso",
        error: error.message,
      });
    }
  }

  /**
   * Procesa devoluciones - YA EXISTE EN TRASPASOSERVICE
   */
  static async processReturns(req, res) {
    try {
      const { traspasoId } = req.params;
      const { returnedProducts } = req.body;

      // USAR MÉTODO EXISTENTE DE traspasoService.js
      const result = await traspasoService.processProductReturns(
        traspasoId,
        returnedProducts
      );

      res.json({
        success: true,
        message: "Devoluciones procesadas correctamente",
        data: result,
      });
    } catch (error) {
      logger.error("Error procesando devoluciones:", error);
      res.status(500).json({
        success: false,
        message: "Error al procesar devoluciones",
        error: error.message,
      });
    }
  }

  /**
   * Estadísticas - AGREGAR A TRASPASOSERVICE
   */
  static async getTraspasoStats(req, res) {
    try {
      const filters = req.query;

      // AGREGAR ESTE MÉTODO A traspasoService.js
      const result = await traspasoService.getTraspasoStats(filters);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Error obteniendo estadísticas:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener estadísticas",
        error: error.message,
      });
    }
  }

  /**
   * Elimina traspaso - YA EXISTE EN TRASPASOSERVICE
   */
  static async deleteTraspaso(req, res) {
    try {
      const { traspasoId } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id || "SYSTEM";

      // USAR MÉTODO EXISTENTE DE traspasoService.js
      const result = await traspasoService.deleteTraspaso(
        traspasoId,
        reason,
        userId
      );

      res.json(result);
    } catch (error) {
      logger.error("Error eliminando traspaso:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error al eliminar traspaso",
      });
    }
  }

  /**
   * Operaciones masivas - YA EXISTE EN TRASPASOSERVICE
   */
  static async bulkAction(req, res) {
    try {
      const { action, traspasoIds, data } = req.body;
      const userId = req.user?.id || "SYSTEM";

      // USAR MÉTODO EXISTENTE DE traspasoService.js
      const result = await traspasoService.bulkTraspasoAction(
        action,
        traspasoIds,
        data || {},
        userId
      );

      res.json(result);
    } catch (error) {
      logger.error("Error en operación masiva:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error en operación masiva",
      });
    }
  }

  /**
   * Ejecutar múltiples traspasos (bulk) - FALTABA ESTE MÉTODO
   */
  static async executeBulkTransfers(req, res) {
    try {
      const { loadIds } = req.body;
      const userId = req.user?.id || "SYSTEM";

      if (!Array.isArray(loadIds) || loadIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Se requiere una lista válida de Load IDs",
        });
      }

      const results = {
        executed: 0,
        failed: 0,
        errors: [],
        details: [],
      };

      // Procesar cada traspaso
      for (const loadId of loadIds) {
        try {
          const result = await traspasoService.executeTransferByLoadId(loadId);

          if (result.success) {
            results.executed++;
            results.details.push({
              loadId,
              status: "success",
              message: "Traspaso ejecutado exitosamente",
            });
          } else {
            results.failed++;
            results.errors.push(
              `Load ID ${loadId}: ${result.mensaje || "Error en ejecución"}`
            );
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Load ID ${loadId}: ${error.message}`);
          logger.error(`Error en traspaso masivo ${loadId}:`, error);
        }
      }

      res.json({
        success: true,
        message: `Proceso masivo completado: ${results.executed} exitosos, ${results.failed} fallidos`,
        data: results,
      });
    } catch (error) {
      logger.error("Error in bulk execution:", error);
      res.status(500).json({
        success: false,
        message: "Error en ejecución masiva",
        error: error.message,
      });
    }
  }

  /**
   * Obtiene estadísticas de traspasos
   */
  static async getTransferStats(req, res) {
    try {
      const filters = req.query;

      // Usar método del traspasoService
      const result = await traspasoService.getTraspasoStats(filters);

      res.json({
        success: true,
        data: { stats: result },
      });
    } catch (error) {
      logger.error("Error obteniendo estadísticas de traspasos:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener estadísticas de traspasos",
        error: error.message,
      });
    }
  }

  /**
   * Obtiene bodegas activas
   */
  static async getWarehouses(req, res) {
    try {
      const result = await traspasoService.getWarehouses();

      res.json({
        success: true,
        data: { warehouses: result },
      });
    } catch (error) {
      logger.error("Error fetching warehouses:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener bodegas",
        error: error.message,
      });
    }
  }
}

module.exports = LoadsController;
