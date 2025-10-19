import { ENV } from "../utils/index";

class LoadsApi {
  baseApi = ENV.BASE_API;
  /**
   * Obtiene pedidos pendientes de cargar
   */
  async getPendingOrders(accessToken, filters = {}) {
    console.log(
      "🚀 ~ file: LoadsApi.jsx:7 ~ LoadsApi ~ getPendingOrders ~ filters:",
      filters
    );
    try {
      const queryParams = new URLSearchParams();

      console.log(
        "🚀 ~ file: LoadsApi.jsx:11 ~ LoadsApi ~ getPendingOrders ~ queryParams before:",
        filters.transferStatus && filters.transferStatus !== "all"
      );

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
   * Obtiene lista de repartidores
   */
  async getDeliveryPersons(accessToken) {
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
      console.error("Error al obtener repartidores:", error);
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
  /**
   * ========================================
   * MÉTODOS PARA GESTIÓN DE TRASPASOS
   * ========================================
   */

  async getTransfers(accessToken, filters = {}) {
    console.log("🚀 getTransfers filters:", filters);

    try {
      const queryParams = new URLSearchParams();

      // ✅ PROCESAR CADA FILTRO ESPECÍFICAMENTE
      const processedFilters = {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        status: filters.status,
        sourceWarehouse: filters.sourceWarehouse,
        targetWarehouse: filters.targetWarehouse,
        loadId: filters.loadId,
        page: filters.page,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      };

      Object.keys(processedFilters).forEach((key) => {
        const value = processedFilters[key];

        if (
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== "all"
        ) {
          // ✅ VALIDACIONES ESPECÍFICAS POR TIPO
          if (key === "page" || key === "pageSize") {
            const numValue = parseInt(value);
            if (!isNaN(numValue) && numValue > 0) {
              queryParams.append(key, numValue.toString());
            }
          } else if (key === "dateFrom" || key === "dateTo") {
            // Validar formato de fecha
            const dateValue = new Date(value);
            if (!isNaN(dateValue.getTime())) {
              queryParams.append(key, value.toString());
            }
          } else {
            // Otros valores como string
            queryParams.append(key, String(value));
          }
        }
      });

      const queryString = queryParams.toString();
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/transfers${
        queryString ? `?${queryString}` : ""
      }`;

      console.log("🚀 getTransfers url:", url);
      console.log(
        "🚀 getTransfers queryParams:",
        Object.fromEntries(queryParams)
      );

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error in getTransfers:", error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de traspasos
   */
  async getTransferStats(accessToken, filters = {}) {
    try {
      const queryParams = new URLSearchParams();

      if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);
      if (filters.sourceWarehouse && filters.sourceWarehouse !== "all")
        queryParams.append("sourceWarehouse", filters.sourceWarehouse);
      if (filters.targetWarehouse && filters.targetWarehouse !== "all")
        queryParams.append("targetWarehouse", filters.targetWarehouse);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/transfers/stats${
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
   * Ejecuta un traspaso específico
   */
  async executeTransfer(accessToken, loadId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/transfers/execute/${loadId}`;

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
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/transfers/execute-bulk`;

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
   * Obtiene detalles de un traspaso específico
   */
  async getTransferDetails(accessToken, loadId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/transfers/${loadId}/details`;

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
   * Obtiene lista de bodegas para traspasos
   */
  async getTransferWarehouses(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/warehouses`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener bodegas:", error);
      throw error;
    }
  }

  /**
   * Cancela un traspaso específico
   */
  async cancelTransfer(accessToken, loadId, reason = "") {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOAD}/transfers/${loadId}/cancel`;

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
}

export default LoadsApi;
