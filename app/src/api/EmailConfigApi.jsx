import { ENV } from "../utils/index";

export class EmailConfigApi {
  constructor() {
    this.baseApi = ENV.BASE_API;
  }

  /**
   * Obtiene todas las configuraciones de email
   * @param {string} accessToken - Token de autenticación
   * @returns {Promise<Array>} Lista de configuraciones
   */
  async getConfigs(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}`;
      const params = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🔍 Obteniendo configuraciones de email desde: ${url}`);

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 401:
            throw new Error(
              "🚫 No autorizado para acceder a configuraciones de email"
            );
          case 403:
            throw new Error(
              "🚫 No tiene permisos para ver configuraciones de email"
            );
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("📧 Configuraciones de email obtenidas:", result.length || 0);

      return result.data || result;
    } catch (error) {
      console.error("❌ Error al obtener configuraciones de email:", error);

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Obtiene una configuración específica por ID
   * @param {string} accessToken - Token de autenticación
   * @param {string} id - ID de la configuración
   * @returns {Promise<Object>} Configuración encontrada
   */
  async getConfigById(accessToken, id) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/${id}`;
      const params = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🔍 Obteniendo configuración de email ID: ${id}`);

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 404:
            throw new Error(
              `🚫 Configuración de email no encontrada (ID: ${id})`
            );
          case 401:
            throw new Error(
              "🚫 No autorizado para acceder a esta configuración"
            );
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("📧 Configuración de email obtenida:", result.name);

      return result.data || result;
    } catch (error) {
      console.error(
        `❌ Error al obtener configuración de email ID ${id}:`,
        error
      );

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Crea una nueva configuración de email
   * @param {string} accessToken - Token de autenticación
   * @param {Object} configData - Datos de la configuración
   * @returns {Promise<Object>} Configuración creada
   */
  async createConfig(accessToken, configData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(configData),
      };

      console.log(`🆕 Creando configuración de email: ${configData.name}`);

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 400:
            throw new Error(`🚫 Datos inválidos: ${errorMessage}`);
          case 409:
            throw new Error("🚫 Ya existe una configuración con ese nombre");
          case 401:
            throw new Error("🚫 No autorizado para crear configuraciones");
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("✅ Configuración de email creada:", result.name);

      return result;
    } catch (error) {
      console.error("❌ Error al crear configuración de email:", error);

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Actualiza una configuración de email
   * @param {string} accessToken - Token de autenticación
   * @param {string} id - ID de la configuración
   * @param {Object} configData - Datos a actualizar
   * @returns {Promise<Object>} Configuración actualizada
   */
  async updateConfig(accessToken, id, configData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/${id}`;
      const params = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(configData),
      };

      console.log(`📝 Actualizando configuración de email ID: ${id}`);

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 404:
            throw new Error(`🚫 Configuración no encontrada (ID: ${id})`);
          case 400:
            throw new Error(`🚫 Datos inválidos: ${errorMessage}`);
          case 409:
            throw new Error("🚫 Ya existe una configuración con ese nombre");
          case 401:
            throw new Error("🚫 No autorizado para actualizar configuraciones");
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("✅ Configuración de email actualizada:", result.name);

      return result;
    } catch (error) {
      console.error(`❌ Error al actualizar configuración ID ${id}:`, error);

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Elimina una configuración de email
   * @param {string} accessToken - Token de autenticación
   * @param {string} id - ID de la configuración
   * @returns {Promise<Object>} Resultado de la operación
   */
  async deleteConfig(accessToken, id) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/${id}`;
      const params = {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🗑️ Eliminando configuración de email ID: ${id}`);

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 404:
            throw new Error(`🚫 Configuración no encontrada (ID: ${id})`);
          case 400:
            throw new Error(`🚫 No se puede eliminar: ${errorMessage}`);
          case 401:
            throw new Error("🚫 No autorizado para eliminar configuraciones");
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("✅ Configuración de email eliminada");

      return result;
    } catch (error) {
      console.error(`❌ Error al eliminar configuración ID ${id}:`, error);

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Establece una configuración como predeterminada
   * @param {string} accessToken - Token de autenticación
   * @param {string} id - ID de la configuración
   * @returns {Promise<Object>} Resultado de la operación
   */
  async setAsDefault(accessToken, id) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/${id}/default`;
      const params = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`⭐ Estableciendo configuración por defecto ID: ${id}`);

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 404:
            throw new Error(`🚫 Configuración no encontrada (ID: ${id})`);
          case 400:
            throw new Error(
              `🚫 No se puede establecer como predeterminada: ${errorMessage}`
            );
          case 401:
            throw new Error("🚫 No autorizado para modificar configuraciones");
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("✅ Configuración establecida como predeterminada");

      return result;
    } catch (error) {
      console.error(
        `❌ Error al establecer configuración por defecto ID ${id}:`,
        error
      );

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Prueba una configuración de email enviando un correo de prueba
   * @param {string} accessToken - Token de autenticación
   * @param {string} id - ID de la configuración
   * @param {string} testEmail - Email donde enviar la prueba
   * @returns {Promise<Object>} Resultado de la prueba
   */
  async testConfig(accessToken, id, testEmail) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/${id}/test`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ testEmail }),
      };

      console.log(
        `🧪 Probando configuración de email ID: ${id} -> ${testEmail}`
      );

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 404:
            throw new Error(`🚫 Configuración no encontrada (ID: ${id})`);
          case 400:
            throw new Error(`🚫 Error en la prueba: ${errorMessage}`);
          case 401:
            throw new Error("🚫 No autorizado para probar configuraciones");
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log(
        `✅ Prueba de configuración ${result.success ? "exitosa" : "fallida"}`
      );

      return result;
    } catch (error) {
      console.error(`❌ Error al probar configuración ID ${id}:`, error);

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Inicializa configuraciones por defecto
   * @param {string} accessToken - Token de autenticación
   * @returns {Promise<Object>} Resultado de la operación
   */
  async initializeDefaults(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/initialize`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log("🔧 Inicializando configuraciones de email por defecto");

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 400:
            throw new Error(`🚫 Error en la inicialización: ${errorMessage}`);
          case 401:
            throw new Error(
              "🚫 No autorizado para inicializar configuraciones"
            );
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("✅ Configuraciones por defecto inicializadas");

      return result;
    } catch (error) {
      console.error(
        "❌ Error al inicializar configuraciones por defecto:",
        error
      );

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Alterna el estado activo/inactivo de una configuración
   * @param {string} accessToken - Token de autenticación
   * @param {string} id - ID de la configuración
   * @returns {Promise<Object>} Resultado de la operación
   */
  async toggleStatus(accessToken, id) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/${id}/toggle`;
      const params = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🔄 Alternando estado de configuración ID: ${id}`);

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 404:
            throw new Error(`🚫 Configuración no encontrada (ID: ${id})`);
          case 400:
            throw new Error(
              `🚫 No se puede cambiar el estado: ${errorMessage}`
            );
          case 401:
            throw new Error("🚫 No autorizado para modificar configuraciones");
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log(
        `✅ Estado de configuración cambiado: ${result.config?.isActive ? "Activa" : "Inactiva"
        }`
      );

      return result;
    } catch (error) {
      console.error(
        `❌ Error al alternar estado de configuración ID ${id}:`,
        error
      );

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Obtiene estadísticas de uso de configuraciones de email
   * @param {string} accessToken - Token de autenticación
   * @returns {Promise<Object>} Estadísticas de uso
   */
  async getEmailStats(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/stats`;
      const params = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log("📊 Obteniendo estadísticas de email");

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 401:
            throw new Error("🚫 No autorizado para ver estadísticas");
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("📊 Estadísticas de email obtenidas");

      return result.data || result;
    } catch (error) {
      console.error("❌ Error al obtener estadísticas de email:", error);

      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      // Retornar estadísticas vacías en caso de error
      return {
        success: false,
        stats: {
          totalConfigs: 0,
          activeConfigs: 0,
          emailsSentToday: 0,
          errorRate: 0,
        },
        error: error.message,
      };
    }
  }

  /**
   * Limpia el cache de transporters
   * @param {string} accessToken - Token de autenticación
   * @returns {Promise<Object>} Resultado de la operación
   */
  async clearTransporterCache(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.EMAIL_CONFIG}/clear-cache`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log("🧹 Limpiando cache de transporters");

      const response = await fetch(url, params);

      if (!response.ok) {
        let errorMessage = `Error HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }

        switch (response.status) {
          case 401:
            throw new Error("🚫 No autorizado para limpiar cache");
          case 500:
            throw new Error(`💥 Error interno del servidor: ${errorMessage}`);
          default:
            throw new Error(
              `❌ Error desconocido (${response.status}): ${errorMessage}`
            );
        }
      }

      const result = await response.json();
      console.log("✅ Cache de transporters limpiado");

      return result;
    } catch (error) {
      console.error("❌ Error al limpiar cache de transporters:", error);

      if (error.name === "Typography" && error.message.includes("fetch")) {
        throw new Error(
          "🌐 Error de conexión. Verifique su conexión a internet."
        );
      }

      throw error;
    }
  }

  /**
   * Método auxiliar para validar datos de configuración
   * @param {Object} configData - Datos a validar
   * @returns {Object} Resultado de la validación
   */
  validateConfigData(configData) {
    const errors = [];

    if (!configData.name || configData.name.trim() === "") {
      errors.push("El nombre es obligatorio");
    }

    if (!configData.host || configData.host.trim() === "") {
      errors.push("El host SMTP es obligatorio");
    }

    if (
      !configData.auth ||
      !configData.auth.user ||
      configData.auth.user.trim() === ""
    ) {
      errors.push("El usuario de email es obligatorio");
    }

    if (
      !configData.auth ||
      !configData.auth.pass ||
      configData.auth.pass.trim() === ""
    ) {
      errors.push("La contraseña de email es obligatoria");
    }

    if (!configData.from || configData.from.trim() === "") {
      errors.push("La dirección de envío es obligatoria");
    }

    // Validar formato de email en 'from'
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      configData.from &&
      !emailRegex.test(configData.from.replace(/.*<(.+)>.*/, "$1"))
    ) {
      errors.push("El formato de la dirección de envío no es válido");
    }

    // Validar puerto
    if (
      configData.port &&
      (isNaN(configData.port) || configData.port < 1 || configData.port > 65535)
    ) {
      errors.push("El puerto debe ser un número entre 1 and 65535");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Método de cleanup para limpiar recursos si es necesario
   */
  cleanup() {
    // Si en el futuro necesitas limpiar intervalos o listeners
    console.log("🧹 EmailConfigApi cleanup ejecutado");
  }
}
