import { ENV } from "../utils/index";

class TrucksApi {
  baseApi = ENV.BASE_API;

  async getTrucks(accessToken, filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.active !== undefined && filters.active !== "all") {
        params.set("active", filters.active);
      }
      if (filters.search) params.set("search", filters.search);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRUCKS}${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || [];
    } catch (error) {
      console.error("Error obteniendo camiones:", error);
      throw error;
    }
  }

  async getRepartidoresFilter(accessToken) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.TRUCKS}/repartidores`, {
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

  async createTruck(accessToken, { code, description, plate, codeSeller, organization }) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.TRUCKS}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code, description, plate, codeSeller, organization }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error creando camión:", error);
      throw error;
    }
  }

  async updateTruck(accessToken, code, { description, plate, codeSeller, organization }) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.TRUCKS}/${code}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ description, plate, codeSeller, organization }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error actualizando camión:", error);
      throw error;
    }
  }

  async toggleTruckActive(accessToken, code, active) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.TRUCKS}/${code}/active`, {
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
      console.error("Error cambiando estado del camión:", error);
      throw error;
    }
  }
}

export default TrucksApi;
