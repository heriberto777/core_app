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

  // ⭐ OBTENER MÓDULO POR ID ⭐
  async getModuleById(accessToken, moduleId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}`;
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
      console.error("❌ Error obteniendo módulo:", error);
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

  // ⭐ DUPLICAR MÓDULO ⭐
  async duplicateModule(accessToken, moduleId, duplicateData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}/duplicate`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(duplicateData),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error duplicando módulo:", error);
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

  // ⭐ BUSCAR MÓDULOS ⭐
  async searchModules(accessToken, searchTerm, options = {}) {
    try {
      const queryParams = new URLSearchParams({
        limit: options.limit || 10,
        includeInactive: options.includeInactive || false,
      }).toString();

      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE
        }/search/${encodeURIComponent(searchTerm)}?${queryParams}`;
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
      console.error("❌ Error buscando módulos:", error);
      throw error;
    }
  }

  // ⭐ OBTENER CONFIGURACIÓN PARA EL FRONTEND ⭐
  async getModulesConfig(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/config`;
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
      console.error("❌ Error obteniendo configuración de módulos:", error);
      throw error;
    }
  }

  // ⭐ ACTUALIZAR ACCIONES DE MÓDULO ⭐
  async updateModuleActions(accessToken, moduleId, actions) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}/actions`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ actions }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error actualizando acciones del módulo:", error);
      throw error;
    }
  }

  // ⭐ ACTUALIZAR RUTAS DE MÓDULO ⭐
  async updateModuleRoutes(accessToken, moduleId, routes) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}/routes`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ routes }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error actualizando rutas del módulo:", error);
      throw error;
    }
  }

  // ⭐ ACTUALIZAR CONFIGURACIÓN UI DEL MÓDULO ⭐
  async updateModuleUIConfig(accessToken, moduleId, uiConfig) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}/ui-config`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uiConfig }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error actualizando configuración UI:", error);
      throw error;
    }
  }

  // ⭐ ACTUALIZAR RESTRICCIONES DEL MÓDULO ⭐
  async updateModuleRestrictions(accessToken, moduleId, restrictions) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/${moduleId}/restrictions`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ restrictions }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error actualizando restricciones:", error);
      throw error;
    }
  }

  // ⭐ EXPORTAR MÓDULOS ⭐
  async exportModules(accessToken, format = "json") {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/export/${format}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const result = await response.json();
        throw result;
      }

      // Para formatos de archivo
      if (format !== "json") {
        return response.blob();
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("❌ Error exportando módulos:", error);
      throw error;
    }
  }

  // ⭐ IMPORTAR MÓDULOS ⭐
  async importModules(accessToken, modulesData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/import`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ modules: modulesData }),
      });

      const result = await response.json();
      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error importando módulos:", error);
      throw error;
    }
  }

  // ⭐ VALIDAR INTEGRIDAD DEL SISTEMA ⭐
  async validateSystemIntegrity(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/system/validate`;
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
      console.error("❌ Error validando integridad del sistema:", error);
      throw error;
    }
  }

  // ⭐ INICIALIZAR MÓDULOS DEL SISTEMA ⭐
  async initializeSystemModules(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.MODULE}/system/initialize`;
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
      console.error("❌ Error inicializando módulos del sistema:", error);
      throw error;
    }
  }
}

export default ModuleApi;
