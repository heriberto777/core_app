import { ENV } from "../index";

class LoadsApi {
  baseApi = ENV.BASE_API;
  // constructor() {
  //   this.baseApi = ENV.BASE_API;
  // }

  /**
   * Obtiene pedidos pendientes de cargar
   */
  async getPendingOrders(accessToken, filters = {}) {
    try {
      const queryParams = new URLSearchParams();

      if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);
      if (filters.seller && filters.seller !== "all")
        queryParams.append("seller", filters.seller);
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
}

export default LoadsApi;