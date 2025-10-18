const LoadsService = require("../services/loadsService");
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
}

module.exports = LoadsController;
