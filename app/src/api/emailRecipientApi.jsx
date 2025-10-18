import { ENV } from "../utils/index";

export class EmailRecipientApi {
  baseApi = ENV.BASE_API;

  /**
   * Obtiene todos los destinatarios de correo
   */
  async getRecipients(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_RECIPIENTS}`;
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

  /**
   * Crea un nuevo destinatario de correo
   */
  async createRecipient(accessToken, datos) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_RECIPIENTS}`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(datos),
      };

      console.log(`🚀 Enviando petición a: ${url}`);

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) {
        switch (response.status) {
          case 400:
            throw new Error(
              result.message || "Datos inválidos para crear el destinatario."
            );
          case 500:
            throw new Error("💥 Error interno en el servidor.");
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${
                result.message || "Sin detalles"
              }`
            );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Error al crear destinatario:", error.message);
      throw error;
    }
  }

  /**
   * Actualiza un destinatario existente
   */
  async updateRecipient(accessToken, id, datos) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_RECIPIENTS}/${id}`;
      const params = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(datos),
      };

      console.log(`🚀 Enviando petición a: ${url}`);

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error(`🚫 Destinatario no encontrado (ID: ${id})`);
          case 400:
            throw new Error(
              result.message ||
                "Datos inválidos para actualizar el destinatario."
            );
          case 500:
            throw new Error("💥 Error interno en el servidor.");
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${
                result.message || "Sin detalles"
              }`
            );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Error al actualizar destinatario:", error.message);
      throw error;
    }
  }

  /**
   * Elimina un destinatario
   */
  async deleteRecipient(accessToken, id) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_RECIPIENTS}/${id}`;
      const params = {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🚀 Enviando petición de eliminación a: ${url}`);

      const response = await fetch(url, params);

      // Si es 204 No Content, devuelve true directamente
      if (response.status === 204) {
        return true;
      }

      // En otro caso, intenta procesar la respuesta JSON
      const result = await response.json();

      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error(`🚫 Destinatario no encontrado (ID: ${id})`);
          case 500:
            throw new Error("💥 Error interno en el servidor.");
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${
                result.message || "Sin detalles"
              }`
            );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Error al eliminar destinatario:", error.message);
      throw error;
    }
  }

  /**
   * Activa/desactiva el envío de correos a un destinatario
   */
  async toggleSendStatus(accessToken, id) {
    console.log("🚀 Iniciando toggleSendStatus", id);
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_RECIPIENTS}/toggle-send/${id}`;
      const params = {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🚀 Enviando petición de toggle a: ${url}`);

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error(`🚫 Destinatario no encontrado (ID: ${id})`);
          case 500:
            throw new Error("💥 Error interno en el servidor.");
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${
                result.message || "Sin detalles"
              }`
            );
        }
      }

      return result;
    } catch (error) {
      console.error(
        "❌ Error al cambiar estado del destinatario:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Inicializa destinatarios por defecto
   */
  async initializeDefaults(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_RECIPIENTS}/initialize-defaults`;
      const params = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🚀 Enviando petición para inicializar por defecto: ${url}`);

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          `❌ Error al inicializar destinatarios por defecto: ${
            result.message || "Sin detalles"
          }`
        );
      }

      return result;
    } catch (error) {
      console.error(
        "❌ Error al inicializar destinatarios por defecto:",
        error.message
      );
      throw error;
    }
  }
}
