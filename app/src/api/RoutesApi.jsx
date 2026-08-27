import { ENV } from "../utils/index";

class RoutesApi {
  baseApi = ENV.BASE_API;

  // ─── Centro de Carga (asignación de clientes a rutas) ─────────────────────

  async getClients(accessToken, filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.seller) params.set("seller", filters.seller);
      if (filters.routeStatus) params.set("routeStatus", filters.routeStatus);
      if (filters.routeCode) params.set("routeCode", filters.routeCode);
      if (filters.erpRouteCode) params.set("erpRouteCode", filters.erpRouteCode);
      if (filters.search) params.set("search", filters.search);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROUTE_ACCOUNTS}/clients${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || [];
    } catch (error) {
      console.error("Error obteniendo clientes:", error);
      throw error;
    }
  }

  async getSellersFilter(accessToken) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTE_ACCOUNTS}/sellers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || [];
    } catch (error) {
      console.error("Error obteniendo vendedores:", error);
      throw error;
    }
  }

  async getRepartidoresFilter(accessToken) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTE_ACCOUNTS}/repartidores`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || [];
    } catch (error) {
      console.error("Error obteniendo repartidores:", error);
      throw error;
    }
  }

  async getErpRoutesFilter(accessToken, seller) {
    try {
      const params = seller ? `?seller=${encodeURIComponent(seller)}` : "";
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTE_ACCOUNTS}/erp-routes${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || [];
    } catch (error) {
      console.error("Error obteniendo rutas del ERP:", error);
      throw error;
    }
  }

  async assignRoute(accessToken, { clientCodes, codeRoute, codeRepartidor, days, codeFrecuency, codeWeek, organization }) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTE_ACCOUNTS}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ clientCodes, codeRoute, codeRepartidor, days, codeFrecuency, codeWeek, organization }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error asignando ruta:", error);
      throw error;
    }
  }

  async removeFromRoute(accessToken, clientCodes) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTE_ACCOUNTS}/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ clientCodes }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error quitando ruta:", error);
      throw error;
    }
  }

  async assignSellerRoute(accessToken, { clientCodes, codeRoute, days, codeFrecuency, codeWeek, organization }) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTE_ACCOUNTS}/assign-seller`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ clientCodes, codeRoute, days, codeFrecuency, codeWeek, organization }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error asignando ruta de venta:", error);
      throw error;
    }
  }

  async removeFromSellerRoute(accessToken, clientCodes) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTE_ACCOUNTS}/remove-seller`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ clientCodes }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error quitando ruta de venta:", error);
      throw error;
    }
  }

  async getRoutes(accessToken, filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.active !== undefined && filters.active !== "all") {
        params.set("active", filters.active);
      }
      if (filters.search) params.set("search", filters.search);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROUTES}${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || [];
    } catch (error) {
      console.error("Error obteniendo rutas:", error);
      throw error;
    }
  }

  async createRoute(accessToken, { codeRoute, description }) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTES}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ codeRoute, description }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error creando ruta:", error);
      throw error;
    }
  }

  async updateRoute(accessToken, codeRoute, { description }) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTES}/${codeRoute}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ description }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error actualizando ruta:", error);
      throw error;
    }
  }

  async toggleRouteActive(accessToken, codeRoute, active) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.ROUTES}/${codeRoute}/active`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ active }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error cambiando estado de la ruta:", error);
      throw error;
    }
  }
}

export default RoutesApi;
