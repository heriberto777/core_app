import { ENV } from "../utils/constants";

export class AuthApi {
  baseApi = ENV.BASE_API;

  async login(data) {
  try {
    console.log("🚀 AuthApi.login iniciado con:", data);

    const url = `${this.baseApi}/${ENV.API_ROUTERS.LOGIN}`;
    console.log("🔗 URL de login:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    console.log("📡 Respuesta HTTP status:", response.status);

    // ⭐ MANEJO MEJORADO DE ERRORES HTTP ⭐
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseError) {
        console.error("❌ Error al parsear respuesta de error:", parseError);
        throw new Error(`Error del servidor (${response.status}): ${response.statusText}`);
      }

      console.error("❌ Error HTTP:", errorData);
      throw new Error(errorData.msg || `Error del servidor (${response.status})`);
    }

    const result = await response.json();
    console.log("📥 Respuesta exitosa recibida:", result);

    return result;
  } catch (error) {
    console.error("❌ Error en AuthApi.login:", error);
    // ⭐ IMPORTANTE: Re-lanzar el error para que los niveles superiores lo manejen ⭐
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
