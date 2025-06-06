import { ENV } from "../index";

export class User {
  baseApi = ENV.BASE_API;

  async getMe(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}/user/me`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
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
      return result;
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
      return result;
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

      if (response.status != 200) throw result;
      return result;
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

      if (response.status !== 200 && response.status !== 201) {
        throw result;
      }

      return result;
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

      if (response.status !== 200) {
        throw result;
      }

      return result;
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

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      return error;
    }
  }
}
