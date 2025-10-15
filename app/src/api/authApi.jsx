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
      console.log("📡 Respuesta HTTP ok:", response.ok);

      // 📌 Validar respuesta de la API
      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Error HTTP:", errorData);
        throw new Error(errorData.msg || "Error desconocido en la API");
      }

      const result = await response.json();

      // ⭐ LOGS DETALLADOS DE LA RESPUESTA ⭐
      console.log("📥 RESPUESTA COMPLETA RECIBIDA:");
      console.log("- state:", result.state);
      console.log("- msg:", result.msg);
      console.log("- accessToken presente:", !!result.accessToken);
      console.log("- accessToken tipo:", typeof result.accessToken);
      console.log(
        "- accessToken primeros 50 chars:",
        result.accessToken
          ? result.accessToken.substring(0, 50) + "..."
          : "❌ VACÍO"
      );
      console.log("- refreshToken presente:", !!result.refreshToken);
      console.log("- refreshToken tipo:", typeof result.refreshToken);
      console.log("- user presente:", !!result.user);

      // 📌 Validar si la autenticación fue exitosa
      if (!result.state) {
        console.error("❌ Estado de autenticación falso:", result.msg);
        throw new Error(result.msg || "Error de autenticación");
      }

      // ⭐ VALIDAR QUE LOS TOKENS EXISTEN ⭐
      if (!result.accessToken) {
        console.error("❌ accessToken no recibido en la respuesta");
        throw new Error("Token de acceso no recibido del servidor");
      }

      if (!result.refreshToken) {
        console.error("❌ refreshToken no recibido en la respuesta");
        throw new Error("Token de refresh no recibido del servidor");
      }

      // ⭐ VALIDAR FORMATO DE TOKENS ⭐
      if (
        typeof result.accessToken !== "string" ||
        result.accessToken.split(".").length !== 3
      ) {
        console.error(
          "❌ accessToken con formato inválido:",
          result.accessToken
        );
        throw new Error("Token de acceso con formato inválido");
      }

      if (
        typeof result.refreshToken !== "string" ||
        result.refreshToken.split(".").length !== 3
      ) {
        console.error(
          "❌ refreshToken con formato inválido:",
          result.refreshToken
        );
        throw new Error("Token de refresh con formato inválido");
      }

      console.log("✅ AuthApi.login completado exitosamente");
      return result;
    } catch (error) {
      console.error("❌ Error en AuthApi.login:", error.message);
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
