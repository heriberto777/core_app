import { ENV } from "../utils/constants";

export class AuthApi {
  baseApi = ENV.BASE_API;

  //   async register(data) {}

  async login(data) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.LOGIN}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      // 📌 Validar respuesta de la API
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.msg || "Error desconocido en la API");
      }

      const result = await response.json();

      // 📌 Validar si la autenticación fue exitosa
      if (!result.state) {
        throw new Error(result.msg || "Error de autenticación");
      }

      return result;
    } catch (error) {
      console.error("Error en login:", error.message);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.REFRESH_ACCESS_TOKEN}`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: refreshToken,
        }),
      };

      const response = await fetch(url, params);
      const result = await response.json();
      if (response.status != 200) throw result;
      return result;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  setAccessToken(token) {
    localStorage.setItem(ENV.JWT.ACCESS, token);
  }

  getAccessToken() {
    return localStorage.getItem(ENV.JWT.ACCESS);
  }
  setRefreshToken(token) {
    return localStorage.setItem(ENV.JWT.REFRESH, token);
  }

  getRefreshToken() {
    return localStorage.getItem(ENV.JWT.REFRESH);
  }

  removeToken() {
    localStorage.removeItem(ENV.JWT.ACCESS);
    localStorage.removeItem(ENV.JWT.REFRESH);
  }
}
