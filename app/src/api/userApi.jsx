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

      // ⭐ MANEJO ROBUSTO DE RESPUESTA ⭐
      let result;
      const contentType = response.headers.get("content-type");

      try {
        if (contentType && contentType.includes("application/json")) {
          result = await response.json();
        } else {
          const text = await response.text();
          throw new Error(`Respuesta del servidor no es JSON (${response.status}): ${text.substring(0, 100)}...`);
        }
      } catch (parseError) {
        console.error("❌ Error al parsear respuesta de getMe:", parseError);
        throw new Error(`Error en la respuesta del servidor (${response.status}): ${parseError.message}`);
      }

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

      if (!response.ok) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error en createUser:", error);
      throw error;
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

      if (!response.ok) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error en updateUser:", error);
      throw error;
    }
  }

  // Autoservicio: el propio usuario edita su perfil vía PATCH /user/me
  // (no requiere permiso "users", a diferencia de updateUser que sí lo exige).
  async updateOwnProfile(accessToken, userData) {
    try {
      const formData = new FormData();

      Object.keys(userData).forEach((key) => {
        if (key !== "fileAvatar") {
          formData.append(key, userData[key]);
        }
      });

      if (userData.fileAvatar) {
        formData.append("avatar", userData.fileAvatar);
      }

      const url = `${ENV.BASE_API}/${ENV.API_ROUTERS.USERS}/user/me`;
      const params = {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error actualizando perfil propio:", error);
      throw error;
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

      if (!response.ok) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error en deleteUser:", error);
      throw error;
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

      if (!response.ok) throw result;
      return result.data || result;
    } catch (error) {
      console.error("❌ Error en ActiveInactiveUser:", error);
      throw error;
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
      throw error;
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
      throw error;
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

  async changePassword(accessToken, userId, currentPassword, newPassword) {
    try {
      console.log("🔐 Cambiando contraseña para usuario:", userId);

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/user/password/${userId}`;
      const params = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("❌ Error cambiando contraseña:", error);
      throw error;
    }
  }
}
