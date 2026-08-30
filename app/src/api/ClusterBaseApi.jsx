import { ENV } from "../utils/index";

class ClusterBaseApi {
  baseApi = ENV.BASE_API;

  async getClusterBase(accessToken) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.CLUSTER_BASE}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || [];
    } catch (error) {
      console.error("Error obteniendo objetivos base:", error);
      throw error;
    }
  }

  async createClusterBase(accessToken, { bronzeBase, silverBase, goldBase, organization }) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.CLUSTER_BASE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bronzeBase, silverBase, goldBase, organization }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error creando objetivos base:", error);
      throw error;
    }
  }

  async updateClusterBase(accessToken, organization, { bronzeBase, silverBase, goldBase }) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.CLUSTER_BASE}/${organization}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bronzeBase, silverBase, goldBase }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error actualizando objetivos base:", error);
      throw error;
    }
  }

  async deleteClusterBase(accessToken, organization) {
    try {
      const response = await fetch(`${this.baseApi}/${ENV.API_ROUTERS.CLUSTER_BASE}/${organization}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error eliminando objetivos base:", error);
      throw error;
    }
  }
}

export default ClusterBaseApi;
