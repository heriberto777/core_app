import { ENV } from "../utils/index";

export class DBConfigApi {
  baseApi = ENV.BASE_API;

  async getDBConfigs(accessToken) {
    try {
      const url = `${this.baseApi}/config/db`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) {
        throw result;
      }

      return result;
    } catch (error) {
      console.error("❌ Error al obtener configuraciones DB:", error);
      throw error;
    }
  }

  async createDBConfig(accessToken, configData) {
    try {
      const url = `${this.baseApi}/config/create/db`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(configData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) {
        throw result;
      }
      return result;
    } catch (error) {
      console.error("❌ Error al crear configuración DB:", error);
      throw error;
    }
  }

  async deleteDBConfig(accessToken, serverName) {
    try {
      const url = `${this.baseApi}/config/delete/db/${serverName}`;
      const params = {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) {
        throw result;
      }

      return result;
    } catch (error) {
      console.error("❌ Error al eliminar configuración DB:", error);
      throw error;
    }
  }

  async testConnection(accessToken, configData) {
    try {
      const url = `${this.baseApi}/config/test/db`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(configData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      return {
        success: response.status === 200,
        ...result,
      };
    } catch (error) {
      console.error("❌ Error al probar conexión:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
