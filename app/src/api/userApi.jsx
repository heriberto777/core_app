import { ENV } from "../utils/index";

export class User {
  baseApi = ENV.BASE_API;

  async getMe(accessToken) {
    try {
      console.log("🔍 UserApi.getMe iniciado");
      console.log(
        "🎫 Token recibido:",
        accessToken ? `${accessToken.substring(0, 50)}...` : "❌ VACÍO"
      );

      if (!accessToken) {
        throw new Error("Token de acceso requerido");
      }

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/user/me`;

      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`, // ⭐ VERIFICAR FORMATO ⭐
        },
      };

      const response = await fetch(url, params);
      console.log("📡 Respuesta status:", response.status);
      console.log("📡 Respuesta ok:", response.ok);

      const result = await response.json();
      console.log("📥 Respuesta completa:", result);

      if (response.status !== 200) {
        console.error("❌ Error en getMe:", result);
        throw result;
      }

      console.log("✅ getMe exitoso:", result);
      return result.data || result;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
  async getUserValidate(accessToken, datos) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.USER}/validate/`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(datos),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status != 200) throw result;
      return result.data || result;
    } catch (error) {
      console.log(error);
    }
  }

  async getUsers(accessToken, datos) {
    // console.log(datos);
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/lists`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(datos),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      console.log(result);

      if (response.status != 200) throw result;
      return result.data || result;
    } catch (error) {
      console.log(error);
    }
  }

  async createUser(accessToken, data) {
    try {
      const formData = new FormData();

      console.log(data.fileAvatar);

      // Agrega todos los campos del formulario al FormData
      Object.keys(data).forEach((key) => {
        formData.append(key, data[key]);
        // console.log(key, data[key]);
      });

      // Agrega el archivo del avatar si existe
      if (data.fileAvatar) {
        formData.append("avatar", data.fileAvatar);
      }

      // Mostrar el contenido de formData en la consola
      // for (let [key, value] of formData.entries()) {
      //   console.log(`${key}:`, value);
      // }

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/user/create`;
      const params = {
        method: "POST",
        headers: {
          // "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      };

      const response = await fetch(url, params);
      const result = await response.json();

      return result.data || result;
    } catch (error) {
      return error;
    }
  }

  async updateUser(accessToken, idUser, userData) {
    try {
      console.log("🔄 Actualizando usuario...");

      const formData = new FormData();

      // Agregar todos los campos normales
      Object.keys(userData).forEach((key) => {
        if (key !== "fileAvatar") {
          // Excluir el archivo para manejarlo por separado
          formData.append(key, userData[key]);
        }
      });

      // ⭐ AGREGAR EL ARCHIVO CON EL NOMBRE CORRECTO 'avatar' ⭐
      if (userData.fileAvatar) {
        formData.append("avatar", userData.fileAvatar);
        console.log(
          "📎 Archivo agregado al FormData:",
          userData.fileAvatar.name
        );
      }

      // Debug: Ver contenido del FormData
      console.log("📦 Contenido del FormData:");
      for (let [key, value] of formData.entries()) {
        console.log(
          `${key}:`,
          value instanceof File ? `Archivo: ${value.name}` : value
        );
      }

      const url = `${ENV.BASE_API}/${ENV.API_ROUTERS.USERS}/user/update/${idUser}`;
      const params = {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // ⭐ NO incluir Content-Type, dejar que el navegador lo maneje automáticamente
        },
        body: formData,
      };

      const response = await fetch(url, params);
      const result = await response.json();

      return result.data || result;
    } catch (error) {
      console.error("❌ Error en updateUser:", error);
      return error;
    }
  }

  async deleteUser(accessToken, userId) {
    try {
      console.log("🗑️ Eliminando usuario:", userId);

      const url = `${ENV.BASE_API}/${ENV.API_ROUTERS.USERS}/user/delete/${userId}`;
      const params = {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      return result.data || result;
    } catch (error) {
      console.error("❌ Error en deleteUser:", error);
      return error;
    }
  }

  async ActiveInactiveUser(accessToken, idUser, userData) {
    try {
      console.log("Eliminando", userData);

      const url = `${ENV.BASE_API}/${ENV.API_ROUTERS.USERS}/user/active/${idUser}`;
      const params = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(userData), // Convertir userData a JSON
      };

      const response = await fetch(url, params);
      const result = await response.json();

      return result.data || result;
    } catch (error) {
      return error;
    }
  }

  // ⭐ NUEVA FUNCIÓN: getUsersWithRoles ⭐
  async getUsersWithRoles(accessToken, datos) {
    try {
      console.log("🔍 UserApi.getUsersWithRoles iniciado:", datos);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/with-roles`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(datos),
      };

      console.log("📤 Enviando request a:", url);

      const response = await fetch(url, params);
      const result = await response.json();

      console.log("📥 Respuesta getUsersWithRoles:", response.status, result);

      if (response.status != 200) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error en getUsersWithRoles:", error);
      return error;
    }
  }

  // ⭐ NUEVA FUNCIÓN: updateUserRoles ⭐
  async updateUserRoles(accessToken, userId, roles) {
    try {
      console.log(
        "👤 Actualizando roles del usuario:",
        userId,
        "Nuevos roles:",
        roles
      );

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/${userId}/roles`;
      const params = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roles }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error actualizando roles:", error);
      return error;
    }
  }

  // ⭐ NUEVA FUNCIÓN: getUserPermissions ⭐
  async getUserPermissions(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/user/permissions`;
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
      return result.data || result;
    } catch (error) {
      console.error("❌ Error obteniendo permisos:", error);
      return error;
    }
  }

  // Obtener usuario por ID
  async getUserById(accessToken, userId) {
    try {
      console.log("👤 Obteniendo usuario por ID:", userId);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/user/${userId}`;
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
      return result.data || result;
    } catch (error) {
      console.error("❌ Error obteniendo usuario por ID:", error);
      throw error;
    }
  }

  // Búsqueda avanzada de usuarios
  async searchUsers(accessToken, searchOptions = {}) {
    try {
      const {
        search = "",
        roleId = null,
        active = true,
        page = 1,
        pageSize = 10,
      } = searchOptions;

      console.log("🔍 Búsqueda avanzada de usuarios:", searchOptions);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/search`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          search,
          roleId,
          active,
          page,
          pageSize,
        }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error en búsqueda avanzada:", error);
      throw error;
    }
  }

  // Obtener estadísticas de usuarios
  async getUserStats(accessToken) {
    try {
      console.log("📊 Obteniendo estadísticas de usuarios...");

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/stats`;
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
      return result.data || result;
    } catch (error) {
      console.error("❌ Error obteniendo estadísticas de usuarios:", error);
      throw error;
    }
  }

  // Asignación masiva de roles a múltiples usuarios
  async assignRolesToUsers(accessToken, userIds, roleIds) {
    try {
      console.log("👥 Asignación masiva de roles:", { userIds, roleIds });

      const results = [];

      // Procesar cada usuario
      for (const userId of userIds) {
        try {
          // Obtener roles actuales
          const userResponse = await this.getUserById(accessToken, userId);
          const currentRoles =
            userResponse.data?.roles?.map((r) => r._id) || [];

          // Combinar roles (evitar duplicados)
          const newRoles = [...new Set([...currentRoles, ...roleIds])];

          // Actualizar usuario
          const updateResult = await this.updateUserRoles(
            accessToken,
            userId,
            newRoles
          );

          results.push({
            userId,
            success: true,
            data: updateResult,
          });
        } catch (error) {
          results.push({
            userId,
            success: false,
            error: error.message,
          });
        }
      }

      return {
        success: true,
        data: results,
        summary: {
          total: userIds.length,
          successful: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        },
      };
    } catch (error) {
      console.error("❌ Error en asignación masiva:", error);
      throw error;
    }
  }

  // Obtener usuarios sin roles
  async getUsersWithoutRoles(accessToken, options = {}) {
    try {
      const { page = 1, pageSize = 10 } = options;

      console.log("👥 Obteniendo usuarios sin roles...");

      const searchOptions = {
        search: "",
        roleId: null,
        active: true,
        page,
        pageSize,
      };

      // Usar búsqueda avanzada para filtrar usuarios sin roles
      const response = await this.searchUsers(accessToken, searchOptions);

      // Filtrar usuarios que no tengan roles asignados
      if (response) {
        const usersWithoutRoles = (response.users || response).filter(
          (user) => !user.roles || user.roles.length === 0
        );

        return {
          ...response,
          data: usersWithoutRoles,
          originalTotal: response.pagination?.totalUsers || 0,
          filteredTotal: usersWithoutRoles.length,
        };
      }

      return response;
    } catch (error) {
      console.error("❌ Error obteniendo usuarios sin roles:", error);
      throw error;
    }
  }

  // Validar permisos de usuario
  async validateUserPermissions(accessToken, userId, requiredPermissions) {
    try {
      console.log("🔐 Validando permisos de usuario:", {
        userId,
        requiredPermissions,
      });

      const userResponse = await this.getUserById(accessToken, userId);
      if (!userResponse) {
        throw new Error("Usuario no encontrado");
      }

      const user = userResponse.data;

      // Si es admin, tiene todos los permisos
      if (user.isAdmin) {
        return {
          success: true,
          hasAllPermissions: true,
          permissions: requiredPermissions.map((p) => ({
            ...p,
            granted: true,
          })),
        };
      }

      // Verificar cada permiso requerido
      const permissionChecks = requiredPermissions.map(
        ({ resource, action }) => {
          let granted = false;

          // Verificar en roles
          if (user.roles) {
            for (const role of user.roles) {
              if (role.permissions) {
                const permission = role.permissions.find(
                  (p) => p.resource === resource
                );
                if (
                  permission &&
                  (permission.actions.includes(action) ||
                    permission.actions.includes("manage"))
                ) {
                  granted = true;
                  break;
                }
              }
            }
          }

          // Verificar permisos específicos del usuario
          if (!granted && user.permissions) {
            const userPermission = user.permissions.find(
              (p) => p.resource === resource
            );
            if (
              userPermission &&
              (userPermission.actions.includes(action) ||
                userPermission.actions.includes("manage"))
            ) {
              granted = true;
            }
          }

          return { resource, action, granted };
        }
      );

      const hasAllPermissions = permissionChecks.every(
        (check) => check.granted
      );

      return {
        success: true,
        hasAllPermissions,
        permissions: permissionChecks,
        summary: {
          total: requiredPermissions.length,
          granted: permissionChecks.filter((p) => p.granted).length,
          denied: permissionChecks.filter((p) => !p.granted).length,
        },
      };
    } catch (error) {
      console.error("❌ Error validando permisos:", error);
      throw error;
    }
  }

  // Actualizar permisos específicos de un usuario
  async updateUserSpecificPermissions(accessToken, userId, permissions) {
    try {
      console.log("🔐 Actualizando permisos específicos:", {
        userId,
        permissions,
      });

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/${userId}/permissions`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ permissions }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error actualizando permisos específicos:", error);
      throw error;
    }
  }

  // Obtener todos los permisos consolidados de un usuario
  async getUserAllPermissions(accessToken, userId) {
    try {
      console.log("🔐 Obteniendo permisos consolidados del usuario:", userId);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/${userId}/all-permissions`;
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
      return result.data || result;
    } catch (error) {
      console.error("❌ Error obteniendo permisos consolidados:", error);
      throw error;
    }
  }

  // Obtener recursos disponibles para permisos
  async getAvailableResourcesForPermissions(accessToken) {
    try {
      const roleApi = new (await import("../index")).roleApi();
      const response = await roleApi.getAvailableResources(accessToken);
      return response;
    } catch (error) {
      console.error("❌ Error obteniendo recursos disponibles:", error);
      throw error;
    }
  }

  async validateRoleSystem(accessToken) {
    try {
      //  const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/${userId}/all-permissions`;
      const response = await fetch(
        `${this.baseApi}/${ENV.API_ROUTERS.USERS}/system/validate`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al validar sistema");
      }

      return data;
    } catch (error) {
      console.error("❌ Error en validateRoleSystem:", error);
      throw error;
    }
  }
}
