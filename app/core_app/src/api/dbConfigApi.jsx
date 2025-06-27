import { ENV } from "../utils/constants";

export class DBConfigApi {
  baseApi = ENV.BASE_API;

  /**
   * Obtener todas las configuraciones de base de datos
   * @param {string} accessToken - Token de acceso
   * @returns {Promise<Array>} - Lista de configuraciones
   */
  async getDBConfigs(accessToken) {
    try {
      const url = `${this.baseApi}/config/db`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || result.message || `HTTP ${response.status}`
        );
      }

      return result;
    } catch (error) {
      console.error("❌ Error al obtener configuraciones DB:", error);
      throw error;
    }
  }

  /**
   * Crear o actualizar configuración de base de datos
   * @param {string} accessToken - Token de acceso
   * @param {Object} configData - Datos de configuración
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async createDBConfig(accessToken, configData) {
    try {
      // Validar que configData sea un objeto válido
      if (!configData || typeof configData !== "object") {
        throw new Error("Datos de configuración inválidos");
      }

      console.log(
        "📤 Enviando datos de configuración:",
        JSON.stringify(configData, null, 2)
      );

      const url = `${this.baseApi}/config/create/db`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(configData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || result.message || `HTTP ${response.status}`
        );
      }

      console.log("✅ Configuración creada/actualizada exitosamente:", result);
      return result;
    } catch (error) {
      console.error("❌ Error al crear configuración DB:", error);
      throw error;
    }
  }

  /**
   * Eliminar configuración de base de datos
   * @param {string} accessToken - Token de acceso
   * @param {string} serverName - Nombre del servidor
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async deleteDBConfig(accessToken, serverName) {
    try {
      const url = `${this.baseApi}/config/delete/db/${encodeURIComponent(
        serverName
      )}`;
      const params = {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || result.message || `HTTP ${response.status}`
        );
      }

      return result;
    } catch (error) {
      console.error("❌ Error al eliminar configuración DB:", error);
      throw error;
    }
  }

  /**
   * Probar conexión con configuración nueva o temporal
   * @param {string} accessToken - Token de acceso
   * @param {Object} configData - Datos de configuración para probar
   * @returns {Promise<Object>} - Resultado de la prueba
   */
  async testConnection(accessToken, configData) {
    try {
      console.log(
        "🧪 Probando conexión con configuración:",
        JSON.stringify(configData, null, 2)
      );

      const url = `${this.baseApi}/config/test/db`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(configData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      // Agregar información sobre el status de la respuesta
      const testResult = {
        success: response.ok,
        status: response.status,
        timestamp: new Date().toISOString(),
        ...result,
      };

      if (response.ok) {
        console.log("✅ Prueba de conexión exitosa:", testResult);
      } else {
        console.warn("⚠️ Prueba de conexión falló:", testResult);
      }

      return testResult;
    } catch (error) {
      console.error("❌ Error al probar conexión:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 🆕 Probar conexión a servidor configurado (server1 o server2)
   * @param {string} accessToken - Token de acceso
   * @param {string} serverName - Nombre del servidor ('server1' o 'server2')
   * @returns {Promise<Object>} - Resultado de la prueba
   */
  async testConfiguredServer(accessToken, serverName) {
    try {
      if (!["server1", "server2"].includes(serverName)) {
        throw new Error("Servidor inválido. Use 'server1' o 'server2'");
      }

      console.log(`🔍 Probando servidor configurado: ${serverName}`);

      const url = `${this.baseApi}/config/test/db/${serverName}`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      const testResult = {
        success: response.ok,
        status: response.status,
        serverName: serverName,
        timestamp: new Date().toISOString(),
        ...result,
      };

      if (response.ok) {
        console.log(`✅ Prueba de ${serverName} exitosa:`, testResult);
      } else {
        console.warn(`⚠️ Prueba de ${serverName} falló:`, testResult);
      }

      return testResult;
    } catch (error) {
      console.error(`❌ Error al probar ${serverName}:`, error);
      return {
        success: false,
        serverName: serverName,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 🆕 Diagnóstico completo del sistema
   * @param {string} accessToken - Token de acceso
   * @returns {Promise<Object>} - Resultado del diagnóstico completo
   */
  async performSystemDiagnostic(accessToken) {
    try {
      console.log("🔍 Iniciando diagnóstico completo del sistema...");

      const url = `${this.baseApi}/health/diagnostic`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      const diagnosticResult = {
        success: response.ok,
        status: response.status,
        timestamp: new Date().toISOString(),
        ...result,
      };

      if (response.ok) {
        console.log("✅ Diagnóstico completo exitoso:", diagnosticResult);
      } else {
        console.warn("⚠️ Diagnóstico completo con issues:", diagnosticResult);
      }

      return diagnosticResult;
    } catch (error) {
      console.error("❌ Error en diagnóstico completo:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 🆕 Probar conexión a server2 específicamente (tu caso de uso)
   * @param {string} accessToken - Token de acceso
   * @returns {Promise<Object>} - Resultado de la prueba de server2
   */
  async testServer2Connection(accessToken) {
    try {
      console.log("🔍 Probando conexión específica a server2...");
      return await this.testConfiguredServer(accessToken, "server2");
    } catch (error) {
      console.error("❌ Error al probar server2:", error);
      return {
        success: false,
        serverName: "server2",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 🆕 Probar conexión con timeout personalizado
   * @param {string} accessToken - Token de acceso
   * @param {Object} configData - Datos de configuración
   * @param {number} timeoutMs - Timeout en milisegundos (default: 120000 = 2 minutos)
   * @returns {Promise<Object>} - Resultado de la prueba
   */
  async testConnectionWithTimeout(accessToken, configData, timeoutMs = 120000) {
    try {
      console.log(
        `🧪 Probando conexión con timeout de ${timeoutMs}ms:`,
        configData
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const url = `${this.baseApi}/config/test/db`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(configData),
        signal: controller.signal,
      };

      try {
        const response = await fetch(url, params);
        clearTimeout(timeoutId);

        const result = await response.json();

        const testResult = {
          success: response.ok,
          status: response.status,
          timestamp: new Date().toISOString(),
          timeout: timeoutMs,
          ...result,
        };

        if (response.ok) {
          console.log("✅ Prueba con timeout exitosa:", testResult);
        } else {
          console.warn("⚠️ Prueba con timeout falló:", testResult);
        }

        return testResult;
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError.name === "AbortError") {
          const timeoutResult = {
            success: false,
            error: `Timeout después de ${timeoutMs}ms`,
            timeout: true,
            timestamp: new Date().toISOString(),
          };
          console.warn("⏰ Timeout en prueba de conexión:", timeoutResult);
          return timeoutResult;
        }

        throw fetchError;
      }
    } catch (error) {
      console.error("❌ Error en prueba con timeout:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        timeout: timeoutMs,
      };
    }
  }

  /**
   * 🆕 Obtener estadísticas de conexiones
   * @param {string} accessToken - Token de acceso
   * @returns {Promise<Object>} - Estadísticas de conexiones
   */
  async getConnectionStats(accessToken) {
    try {
      console.log("📊 Obteniendo estadísticas de conexiones...");

      const url = `${this.baseApi}/health/stats`;
      const params = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || result.message || `HTTP ${response.status}`
        );
      }

      console.log("📈 Estadísticas obtenidas:", result);
      return result;
    } catch (error) {
      console.error("❌ Error al obtener estadísticas:", error);
      throw error;
    }
  }
}
