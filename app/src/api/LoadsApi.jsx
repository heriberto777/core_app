// src/api/LoadsApi.jsx - VERSIÓN CONSOLIDADA SIN DUPLICACIÓN

import { ENV } from "../utils/index";

class LoadsApi {
  baseApi = ENV.BASE_API;

  // ========================================
  // MÉTODOS PRINCIPALES DE CARGAS (MANTENER)
  // ========================================

  /**
   * Obtiene pedidos pendientes de cargar
   */
  async getPendingOrders(accessToken, filters = {}) {
    console.log("🚀 ~ LoadsApi ~ getPendingOrders ~ filters:", filters);
    try {
      const queryParams = new URLSearchParams();

      if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);
      if (filters.sellers && filters.sellers !== "all")
        queryParams.append("sellers", filters.sellers);
      if (filters.transferStatus && filters.transferStatus !== "all")
        queryParams.append("transferStatus", filters.transferStatus);
      if (filters.includeLoaded)
        queryParams.append("includeLoaded", filters.includeLoaded);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/pending-orders${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener pedidos pendientes:", error);
      throw error;
    }
  }

  /**
   * Obtiene detalles de líneas de un pedido específico
   */
  async getOrderDetails(accessToken, pedidoId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/order-details/${pedidoId}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener detalles del pedido:", error);
      throw error;
    }
  }

  /**
   * Obtiene lista de vendedores activos
   */
  async getSellers(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/sellers`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener vendedores:", error);
      throw error;
    }
  }

  /**
   * Procesa la carga de pedidos seleccionados
   */
  async processOrderLoad(accessToken, selectedPedidos, vendedorCode) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/process-load`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedPedidos,
          deliveryPersonCode: vendedorCode,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al procesar carga:", error);
      throw error;
    }
  }

  /**
   * Cancela pedidos seleccionados
   */
  async cancelOrders(accessToken, selectedPedidos, reason) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/cancel-orders`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedPedidos,
          reason,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al cancelar pedidos:", error);
      throw error;
    }
  }

  /**
   * Elimina líneas específicas de un pedido
   */
  async removeOrderLines(accessToken, pedidoId, lineasToRemove) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/order-lines/${pedidoId}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lineasToRemove,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al eliminar líneas:", error);
      throw error;
    }
  }

  /**
   * Obtiene historial de cargas
   */
  async getLoadHistory(accessToken, filters = {}) {
    try {
      const queryParams = new URLSearchParams();

      if (filters.page) queryParams.append("page", filters.page);
      if (filters.limit) queryParams.append("limit", filters.limit);
      if (filters.status && filters.status !== "all")
        queryParams.append("status", filters.status);
      if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/history${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener historial:", error);
      throw error;
    }
  }

  /**
   * Procesa traspaso de inventario
   */
  async processInventoryTransfer(accessToken, loadId, bodegaDestino) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/inventory-transfer`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loadId,
          bodegaDestino,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al procesar traspaso:", error);
      throw error;
    }
  }

  // ========================================
  // MÉTODOS PARA GESTIÓN DE TRASPASOS (CONSOLIDADOS)
  // ========================================

  /**
   * Obtiene lista de traspasos con tracking completo
   * CONSOLIDADO: Reemplaza getTransfers() y getTraspasos()
   */
  async getTraspasos(accessToken, filters = {}) {
    try {
      const queryParams = new URLSearchParams();

      // Procesar filtros específicos para traspasos
      if (filters.page) queryParams.append("page", filters.page);
      if (filters.limit) queryParams.append("limit", filters.limit);
      if (filters.status && filters.status !== "all")
        queryParams.append("status", filters.status);
      if (filters.deliveryPerson && filters.deliveryPerson !== "all")
        queryParams.append("deliveryPerson", filters.deliveryPerson);
      if (filters.loadId) queryParams.append("loadId", filters.loadId);
      if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/traspasos${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener traspasos:", error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de traspasos
   * CONSOLIDADO: Reemplaza getTransferStats() y getTraspasoStats()
   */
  async getTraspasoStats(accessToken, filters = {}) {
    try {
      const queryParams = new URLSearchParams();

      if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/traspasos/stats${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener estadísticas de traspasos:", error);
      throw error;
    }
  }

  /**
   * Obtiene detalles de un traspaso específico
   * CONSOLIDADO: Reemplaza getTransferDetails() y getTraspasoDetails()
   */
  async getTraspasoDetails(accessToken, traspasoId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/traspasos/details/${traspasoId}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener detalles del traspaso:", error);
      throw error;
    }
  }

  /**
   * Obtiene repartidores para filtros
   * CONSOLIDADO: Reemplaza getDeliveryPersons() y getDeliveryPersonsFilter()
   */
  async getDeliveryPersonsFilter(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/traspasos/delivery-persons`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener repartidores para filtro:", error);
      throw error;
    }
  }

  /**
   * Obtiene lista de bodegas
   * CONSOLIDADO: Reemplaza getTransferWarehouses() y getWarehouses()
   */
  async getWarehouses(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/warehouses`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error al obtener bodegas");
      }

      return {
        success: true,
        data: result.data?.warehouses || [],
      };
    } catch (error) {
      console.error("Error fetching warehouses:", error);
      return {
        success: false,
        data: [],
      };
    }
  }

  /**
   * Ejecuta un traspaso específico
   */
  async executeTransfer(accessToken, loadId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/traspasos/execute/${loadId}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al ejecutar traspaso:", error);
      throw error;
    }
  }

  /**
   * Ejecuta múltiples traspasos
   */
  async executeBulkTransfers(accessToken, loadIds) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/traspasos/execute-bulk`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ loadIds }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al ejecutar traspasos masivos:", error);
      throw error;
    }
  }

  /**
   * Cancela un traspaso específico
   */
  async cancelTransfer(accessToken, loadId, reason = "") {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/traspasos/${loadId}/cancel`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al cancelar traspaso:", error);
      throw error;
    }
  }
}

export default LoadsApi;
