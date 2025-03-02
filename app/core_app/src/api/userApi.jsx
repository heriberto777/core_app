import { ENV } from "../index";

export class User {
  baseApi = ENV.BASE_API;

  async getMe(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.USER_ME}`;
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
      const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}`;
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

  // async getUsers(accessToken, datos) {
  //   console.log(datos);
  //   try {
  //     const url = `${this.baseApi}/${ENV.API_ROUTERS.USERS}`;
  //     const params = {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/json",
  //         Authorization: `Bearer ${accessToken}`,
  //       },
  //       body: JSON.stringify(datos),
  //     };

  //     const response = await fetch(url, params);
  //     const result = await response.json();

  //     if (response.status != 200) throw result;
  //     return result;
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

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

      const url = `${this.baseApi}/${ENV.API_ROUTERS.USER}`;
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
      console.log("Actualizando");
      const data = userData;
      if (!data.password) {
        delete data.password;
      }

      const formData = new FormData();
      Object.keys(data).forEach((key) => {
        formData.append(key, data[key]);
      });

      if (data.fileAvatar) {
        formData.append("avatar", data.fileAvatar);
      }

      const url = `${ENV.BASE_API}/${ENV.API_ROUTERS.USER}/${idUser}`;
      const params = {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      return error;
    }
  }

  async ActiveInactiveUser(accessToken, idUser, userData) {
    try {
      console.log("Eliminando", userData);

      const url = `${ENV.BASE_API}/${ENV.API_ROUTERS.USER}/active/${idUser}`;
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
