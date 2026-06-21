import { ENV } from "../utils/index";

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
          // Intentar leer como texto si no es JSON
          const errorText = await response.text().catch(() => "No se pudo leer el cuerpo de la respuesta");
          throw new Error(
            `Error del servidor (${response.status}): ${errorText || response.statusText}`
          );
        }

        console.error("❌ Error HTTP:", errorData);
        throw new Error(
          errorData.msg || errorData.message || `Error del servidor (${response.status})`
        );
      }

      const result = await response.json();
      return result.data || result;
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

      // Fix #6 — mismo patrón robusto que login(): verificar response.ok antes de parsear
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`Error del servidor (${response.status}): ${errorText}`);
        }
        throw new Error(
          errorData.msg || errorData.message || `Error del servidor (${response.status})`
        );
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
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
