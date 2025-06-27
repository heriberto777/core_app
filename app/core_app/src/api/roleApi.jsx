import { ENV } from "../utils/constants";

class RoleApi {
  baseApi = ENV.BASE_API;

  async getRoles(accessToken, datos = {}) {
    try {
      console.log("🚀 RoleApi.getRoles iniciado");
      console.log("🚀 Token", accessToken);
      console.log("📤 URL:", `${this.baseApi}/${ENV.API_ROUTERS.ROLES}`);
      console.log("📤 Datos a enviar:", JSON.stringify(datos, null, 2));

      // ⭐ VALIDAR TOKEN ANTES DE USARLO ⭐
      if (!accessToken || typeof accessToken !== "string") {
        console.error("❌ Token inválido:", {
          token: accessToken,
          type: typeof accessToken,
          isNull: accessToken === null,
          isUndefined: accessToken === undefined,
        });
        throw new Error("Token de acceso inválido o no proporcionado");
      }

      console.log("🔑 Token válido:", `${accessToken.substring(0, 20)}...`);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/get`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(datos),
      };

      console.log("📤 Request params:", {
        method: params.method,
        url,
        headers: params.headers,
        bodyLength: params.body.length,
      });

      const response = await fetch(url, params);

      console.log("📥 Response status:", response.status);
      console.log(
        "📥 Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      let result;
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        result = await response.json();
      } else {
        const textResult = await response.text();
        console.error("❌ Respuesta no es JSON:", textResult.substring(0, 200));
        throw new Error(
          `Respuesta no es JSON: ${textResult.substring(0, 100)}`
        );
      }

      console.log("📥 Result:", result);

      if (response.status !== 200) {
        console.error("❌ Error HTTP:", response.status, result);
        throw new Error(result.message || `HTTP Error ${response.status}`);
      }

      return result;
    } catch (error) {
      console.error("❌ Error en getRoles:", error);
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error("Error de conexión con el servidor");
      }
      throw error;
    }
  }

  async getRoleById(accessToken, roleId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/get/${roleId}`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error obteniendo rol:", error);
      throw error;
    }
  }

  async createRole(accessToken, roleData) {
    try {
      console.log("📝 Creando rol:", roleData);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/create`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(roleData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 201) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error creando rol:", error);
      throw error;
    }
  }

  async updateRole(accessToken, roleId, roleData) {
    try {
      console.log("📝 Actualizando rol:", roleId, roleData);

      // ⭐ CORREGIR URL PARA COINCIDIR CON EL BACKEND ⭐
      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/update/${roleId}`;
      const params = {
        method: "PUT", // ⭐ CAMBIAR A PUT SEGÚN EL BACKEND ⭐
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(roleData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error actualizando rol:", error);
      throw error;
    }
  }

  // ⭐ RENOMBRAR PARA COINCIDIR CON EL BACKEND ⭐
  async toggleRoleStatus(accessToken, roleId, roleData) {
    try {
      console.log("🔄 Cambiando estado del rol:", roleId);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/update/${roleId}/toggle`;
      const params = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ isActive: !roleData }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error cambiando estado del rol:", error);
      throw error;
    }
  }

  async deleteRole(accessToken, roleId) {
    try {
      console.log("🗑️ Eliminando rol:", roleId);

      // ⭐ CORREGIR URL ⭐
      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/delete/${roleId}`;
      const params = {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error eliminando rol:", error);
      throw error;
    }
  }

  // Mejorar assignRole existente
  async assignRole(accessToken, userId, roleId) {
    try {
      console.log("👤 Asignando rol individual:", { userId, roleId });

      // Primero obtener roles actuales del usuario
      const userResponse = await fetch(
        `${this.baseApi}/${ENV.API_ROUTERS.USERS}/user/${userId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!userResponse.ok) {
        throw new Error("Error obteniendo datos del usuario");
      }

      const userData = await userResponse.json();
      const currentRoles = userData.data?.roles?.map((r) => r._id) || [];

      // Agregar nuevo rol si no lo tiene
      const newRoles = currentRoles.includes(roleId)
        ? currentRoles
        : [...currentRoles, roleId];

      // Actualizar roles del usuario
      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/${userId}/roles`;
      const params = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roles: newRoles }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error asignando rol individual:", error);
      throw error;
    }
  }

  // Mejorar removeRole existente
  async removeRole(accessToken, userId, roleId) {
    try {
      console.log("👤 Removiendo rol individual:", { userId, roleId });

      // Obtener roles actuales del usuario
      const userResponse = await fetch(
        `${this.baseApi}/${ENV.API_ROUTERS.USERS}/user/${userId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!userResponse.ok) {
        throw new Error("Error obteniendo datos del usuario");
      }

      const userData = await userResponse.json();
      const currentRoles = userData.data?.roles?.map((r) => r._id) || [];

      // Remover rol específico
      const newRoles = currentRoles.filter((id) => id !== roleId);

      // Actualizar roles del usuario
      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/${userId}/roles`;
      const params = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roles: newRoles }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error removiendo rol individual:", error);
      throw error;
    }
  }

  async getAvailableRoles(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/available`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error obteniendo roles disponibles:", error);
      throw error;
    }
  }

  // ⭐ CORREGIR FUNCIONES DE RECURSOS Y ACCIONES ⭐
  async getAvailableResources(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/resources`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error obteniendo recursos:", error);
      throw error;
    }
  }

  async getAvailableActions(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/actions`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      console.log("🚀 getAvailableActions iniciado", response);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error obteniendo acciones:", error);
      throw error;
    }
  }

  // Duplicar rol
  async duplicateRole(accessToken, roleId, newRoleData) {
    try {
      console.log("📋 Duplicando rol:", roleId, newRoleData);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/duplicate/${roleId}`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(newRoleData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 201) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error duplicando rol:", error);
      throw error;
    }
  }

  // Obtener estadísticas de roles
  async getRoleStats(accessToken) {
    try {
      console.log("📊 Obteniendo estadísticas de roles...");

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/stats`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error obteniendo estadísticas de roles:", error);
      throw error;
    }
  }

  // Asignar múltiples usuarios a un rol
  async assignUsersToRole(accessToken, roleId, userIds) {
    try {
      console.log("👥 Asignando usuarios al rol:", { roleId, userIds });

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/assign-users`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roleId, userIds }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error asignando usuarios al rol:", error);
      throw error;
    }
  }

  // Remover múltiples usuarios de un rol
  async removeUsersFromRole(accessToken, roleId, userIds) {
    try {
      console.log("👥 Removiendo usuarios del rol:", { roleId, userIds });

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/remove-users`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roleId, userIds }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error removiendo usuarios del rol:", error);
      throw error;
    }
  }

  // Obtener usuarios de un rol específico
  async getUsersByRole(roleName, accessToken, options = {}) {
    console.log("👥 Obteniendo usuarios del rol:", roleName);
    try {
      const { page = 1, limit = 10 } = options;

      console.log("👥 Obteniendo usuarios del rol:", roleName);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.ROLES}/by-role/${roleName}`;

      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error obteniendo usuarios del rol:", error);
      throw error;
    }
  }
}

export default RoleApi;
