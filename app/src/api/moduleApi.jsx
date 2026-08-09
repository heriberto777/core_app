import { ENV } from "../utils/index";

class ModuleApi {
  baseApi = ENV.BASE_API;

  // ⭐ OBTENER TODOS LOS MÓDULOS ⭐
  async getAllModules(accessToken, params = {}) {
    console.log("🔍 Obteniendo todos los módulos con parámetros:", accessToken);
    try {
      // const queryParams = new URLSearchParams({
      //   page: params.page || 1,
      //   limit: params.limit || 10,
      //   category: params.category || "all",
      //   active: params.active || "all",
      //   includeSystem: params.includeSystem || "true",
      //   search: params.search || "",
      //   sortBy: params.sortBy || "uiConfig.order",
      //   sortOrder: params.sortOrder || "asc",
      // }).toString();

      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/get-all`;
      const params2 = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(params),
      };

      const response = await fetch(url, params2);

      console.log("🔍 Obteniendo módulos con parámetros:", response);

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error obteniendo módulos:", error);
      throw error;
    }
  }

  // ⭐ CREAR MÓDULO ⭐
  async createModule(accessToken, moduleData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(moduleData),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error creando módulo:", error);
      throw error;
    }
  }

  // ⭐ ACTUALIZAR MÓDULO ⭐
  async updateModule(accessToken, moduleId, moduleData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(moduleData),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error actualizando módulo:", error);
      throw error;
    }
  }

  // ⭐ ELIMINAR MÓDULO ⭐
  async deleteModule(accessToken, moduleId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error eliminando módulo:", error);
      throw error;
    }
  }

  // ⭐ CAMBIAR ESTADO DEL MÓDULO ⭐
  async toggleModuleStatus(accessToken, moduleId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}/toggle-status`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error cambiando estado del módulo:", error);
      throw error;
    }
  }

  // ⭐ OBTENER ACCIONES DISPONIBLES ⭐
  async getAvailableActions(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/available-actions`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error obteniendo acciones disponibles:", error);
      throw error;
    }
  }

  // ⭐ OBTENER CATEGORÍAS ⭐
  async getCategories(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/categories`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error obteniendo categorías:", error);
      throw error;
    }
  }

  // ⭐ INVALIDAR CACHÉ ⭐
  async invalidateCache(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/cache/invalidate`;
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
      console.error("❌ Error invalidando caché:", error);
      throw error;
    }
  }

}

export default ModuleApi;
