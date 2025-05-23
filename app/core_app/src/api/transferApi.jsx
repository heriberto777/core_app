import { ENV } from "../index";

export class TransferApi {
  baseApi = ENV.BASE_API;
  constructor() {
    // Mapas para seguimiento de cancelaciones en progreso
    this.cancellationInProgress = new Map();
    this.statusCheckIntervals = new Map();
  }

  async getTasks(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}`;
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
  async upsertTransferTask(accessToken, datos) {
    console.log(datos);
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/addEdit`;
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
      throw error;
    }
  }

  /**
   * 📌 Ejecutar una tarea manualmente
   */
  async executeTask(accessToken, taskId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/execute/${taskId}`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🚀 Enviando petición a: ${url}`);

      const response = await fetch(url, params);
      const result = await response.json();

      console.log("📌 Respuesta del backend:", response.status, result);

      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error(`🚫 Tarea no encontrada (ID: ${taskId})`);
          case 400:
            throw new Error(
              result.message || "🚫 No se pudo ejecutar la tarea."
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

      return result; // ✅ Devolver el resultado en caso de éxito
    } catch (error) {
      console.error("❌ Error ejecutando tarea manual:", error.message);
      throw error; // Re-lanza el error para que el frontend lo maneje
    }
  }

  // Actualización para TransferApi.jsx
  async addTimeTransfer(accessToken, datos) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/config/horas`;
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
      return error;
    }
  }

  async getSchuledTime(accessToken) {
    console.log("##### TIME ######");
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/config/horas`;
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

  async getTaskStatus(accessToken) {
    console.log("##### TIME ######");
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/config/task-status`;
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
   * 📌 Ejecutar la tarea Loads_detaill y Orders
   */
  async executeLoadTask(accessToken, fecha, vendors, taskId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/run-loads/${taskId}`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          parametros: { date: fecha, vendors: vendors },
        }),
      };

      console.log(`🚀 Enviando petición a: ${url}`);

      const response = await fetch(url, params);
      console.log("Response recibido:", response);

      let result;
      if (typeof response.json === "function") {
        result = await response.json();
      } else {
        // Si no existe response.json, intentar obtener el texto y parsearlo manualmente.
        const text = await response.text();
        try {
          result = JSON.parse(text);
        } catch (err) {
          console.error("Error al parsear JSON:", err, text);
          throw new Error("La respuesta del servidor no es JSON.");
        }
      }

      console.log("📌 Respuesta del backend:", response.status, result);

      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error(`🚫 Tarea no encontrada (ID: ${taskId})`);
          case 400:
            throw new Error(
              result.message || "🚫 No se pudo ejecutar la tarea."
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

      return result; // ✅ Devolver el resultado en caso de éxito
    } catch (error) {
      console.error("❌ Error ejecutando tarea manual:", error.message);
      throw error; // Re-lanza el error para que el frontend lo maneje
    }
  }

  /**
   * 📌 Ejecutar la tarea  insertar Orders
   */
  async executeInsertOrders(accessToken, salesData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/insertOrders`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ salesData }),
      };

      console.log(`🚀 Enviando petición a: ${url}`);

      const response = await fetch(url, params);
      console.log("Response recibido:", response);

      let result;
      if (typeof response.json === "function") {
        result = await response.json();
      } else {
        // Si no existe response.json, intentar obtener el texto y parsearlo manualmente.
        const text = await response.text();
        try {
          result = JSON.parse(text);
        } catch (err) {
          console.error("Error al parsear JSON:", err, text);
          throw new Error("La respuesta del servidor no es JSON.");
        }
      }

      console.log("📌 Respuesta del backend:", response.status, result);

      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error(`🚫 Tarea no encontrada (ID: ${taskId})`);
          case 400:
            throw new Error(
              result.message || "🚫 No se pudo ejecutar la tarea."
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

      return result; // ✅ Devolver el resultado en caso de éxito
    } catch (error) {
      console.error("❌ Error ejecutando tarea manual:", error.message);
      throw error; // Re-lanza el error para que el frontend lo maneje
    }
  }

  /**
   * 📌 Ejecutar la tarea  insertar Loads_Detaill
   */
  async executeInsertLoads(accessToken, route, loadId, salesData, bodega) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/insertLoads`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ route, loadId, salesData, bodega }),
      };

      console.log(`🚀 Enviando petición a: ${url}`);

      const response = await fetch(url, params);
      console.log("Response recibido:", response);

      let result;
      if (typeof response.json === "function") {
        result = await response.json();
      } else {
        // Si no existe response.json, intentar obtener el texto y parsearlo manualmente.
        const text = await response.text();
        try {
          result = JSON.parse(text);
        } catch (err) {
          console.error("Error al parsear JSON:", err, text);
          throw new Error("La respuesta del servidor no es JSON.");
        }
      }

      console.log("📌 Respuesta del backend:", response.status, result);

      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error(`🚫 Tarea no encontrada (ID: ${taskId})`);
          case 400:
            throw new Error(
              result.message || "🚫 No se pudo ejecutar la tarea."
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

      return result; // ✅ Devolver el resultado en caso de éxito
    } catch (error) {
      console.error("❌ Error ejecutando tarea manual:", error.message);
      throw error; // Re-lanza el error para que el frontend lo maneje
    }
  }

  /**
   * 📌 Ejecutar la tarea  insertar Loads_Detaill
   */
  async executeInsertTrapaso(
    accessToken,
    route,
    loadId,
    salesData,
    bodega_destino
  ) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/insertTrapaso`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ route, loadId, salesData, bodega_destino }),
      };

      console.log(`🚀 Enviando petición a: ${url}`);

      const response = await fetch(url, params);
      console.log("Response recibido:", response);

      let result;
      if (typeof response.json === "function") {
        result = await response.json();
      } else {
        // Si no existe response.json, intentar obtener el texto y parsearlo manualmente.
        const text = await response.text();
        try {
          result = JSON.parse(text);
        } catch (err) {
          console.error("Error al parsear JSON:", err, text);
          throw new Error("La respuesta del servidor no es JSON.");
        }
      }

      console.log("📌 Respuesta del backend:", response.status, result);

      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error(`🚫 Tarea no encontrada (ID: ${taskId})`);
          case 400:
            throw new Error(
              result.message || "🚫 No se pudo ejecutar la tarea."
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

      return result; // ✅ Devolver el resultado en caso de éxito
    } catch (error) {
      console.error("❌ Error ejecutando tarea manual:", error.message);
      throw error; // Re-lanza el error para que el frontend lo maneje
    }
  }

  /* Obtener el ultimo consecutivo */
  async getLoadConsecutivo(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/load/lastLoad`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      console.log(result);

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  // En TransferApi.js
  async getTaskHistory(accessToken, taskId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/task-history/${taskId}`;
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
      console.error("Error al obtener historial de tarea:", error);
      throw error;
    }
  }

  // Método mejorado para cancelar tareas
  async cancelTask(accessToken, taskId, options = {}) {
    try {
      // Verificar si ya está en proceso de cancelación
      if (this.cancellationInProgress.has(taskId)) {
        return {
          success: false,
          message: "La tarea ya está siendo cancelada",
        };
      }

      // Marcar como en proceso de cancelación
      this.cancellationInProgress.set(taskId, true);

      // Updated URL to match the correct endpoint in transferTaskRoutes.js
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/cancel/${taskId}`;

      const params = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          force: options.force || false,
          reason: options.reason || "Cancelado por el usuario",
        }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) {
        this.cancellationInProgress.delete(taskId);
        throw result;
      }

      // Iniciar monitoreo del estado de cancelación
      if (options.onStatusChange) {
        this.startCancellationMonitoring(
          accessToken,
          taskId,
          options.onStatusChange
        );
      }

      return result;
    } catch (error) {
      this.cancellationInProgress.delete(taskId);
      console.error("Error al cancelar tarea:", error);
      throw error;
    }
  }

  // Método para verificar el estado de cancelación
  async getCancellationStatus(accessToken, taskId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.CANCELLATION}/tasks/${taskId}/status`;

      const params = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener estado de cancelación:", error);
      throw error;
    }
  }

  // Método para obtener todas las tareas activas cancelables
  async getActiveCancelableTasks(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.CANCELLATION}/active`;

      const params = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener tareas activas:", error);
      throw error;
    }
  }

  // Método para cancelar todas las tareas activas
  async cancelAllTasks(accessToken, options = {}) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.CANCELLATION}/cancel-all`;

      const params = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          force: options.force || false,
          reason: options.reason || "Cancelación masiva",
        }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("Error al cancelar todas las tareas:", error);
      throw error;
    }
  }

  // Método privado para monitorear el estado de cancelación
  startCancellationMonitoring(accessToken, taskId, onStatusChange) {
    // Limpiar cualquier monitoreo anterior para esta tarea
    if (this.statusCheckIntervals.has(taskId)) {
      clearInterval(this.statusCheckIntervals.get(taskId));
    }

    // Verificar estado cada 2 segundos
    const intervalId = setInterval(async () => {
      try {
        const status = await this.getCancellationStatus(accessToken, taskId);

        // Si la tarea ya no está activa, detener monitoreo
        if (!status.data.isActiveProcess) {
          clearInterval(intervalId);
          this.statusCheckIntervals.delete(taskId);
          this.cancellationInProgress.delete(taskId);
        }

        // Notificar cambio de estado
        onStatusChange(status);
      } catch (error) {
        console.error(`Error al monitorear estado de tarea ${taskId}:`, error);
        // Mantener el monitoreo a pesar del error, a menos que sea crítico
        if (error.response?.status === 404) {
          clearInterval(intervalId);
          this.statusCheckIntervals.delete(taskId);
          this.cancellationInProgress.delete(taskId);
        }
      }
    }, 2000);

    this.statusCheckIntervals.set(taskId, intervalId);
  }

  // Método para limpiar recursos
  cleanup() {
    // Limpiar todos los intervalos
    for (const intervalId of this.statusCheckIntervals.values()) {
      clearInterval(intervalId);
    }
    this.statusCheckIntervals.clear();
    this.cancellationInProgress.clear();
  }

  // Agregar este método en TransferApi.jsx
  async getVendedores(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/vendedores`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;

      return result;
    } catch (error) {
      console.error("Error al obtener vendedores:", error);
      throw error;
    }
  }

  /**
   * Obtiene el historial de transferencias con filtros opcionales
   * @param {string} accessToken - Token de acceso
   * @param {Object} filters - Filtros opcionales (dateFrom, dateTo, status, etc.)
   * @returns {Promise<Object>} - Resultado de la operación con historial y estadísticas
   */
  async getTransferHistory(accessToken, filters = {}) {
    try {
      // Obtener resúmenes de ejecuciones recientes
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/task-summaries/recent`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      console.log("Respuesta de historial:", result);

      // Comprobar la estructura de la respuesta para manejarla correctamente
      let history = [];
      let completedToday = 0;
      let failedToday = 0;

      // Si la respuesta ya incluye estadísticas, usarlas directamente
      if (result.success && result.history) {
        history = result.history;
        completedToday = result.completedToday || 0;
        failedToday = result.failedToday || 0;
      }
      // Si la respuesta es un array, calcular estadísticas
      else if (Array.isArray(result)) {
        history = result;

        // Calculamos estadísticas relevantes
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Calculamos cuántas transferencias se completaron y fallaron hoy
        completedToday = history.filter((item) => {
          const itemDate = new Date(item.date);
          return (
            itemDate >= today &&
            itemDate < tomorrow &&
            item.status === "completed"
          );
        }).length;

        failedToday = history.filter((item) => {
          const itemDate = new Date(item.date);
          return (
            itemDate >= today &&
            itemDate < tomorrow &&
            (item.status === "failed" ||
              item.status === "error" ||
              item.status === "cancelled")
          );
        }).length;
      }

      return {
        success: true,
        history,
        completedToday,
        failedToday,
      };
    } catch (error) {
      console.error("Error al obtener historial de transferencias:", error);
      // Retornamos un objeto con datos simulados en caso de error
      return {
        success: false,
        history: [],
        completedToday: 0,
        failedToday: 0,
        error: error.message,
      };
    }
  }

  // javascriptCopy;
  /**
   * Verifica el estado de conexión de los servidores
   */
  async checkServerStatus(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/server-status/server`;
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
      console.error("Error al verificar estado de servidores:", error);
      // Datos simulados en caso de error
      return {
        success: false,
        server1: { status: "unknown", responseTime: 0 },
        server2: { status: "unknown", responseTime: 0 },
        mongodb: { status: "unknown" },
        error: error.message,
      };
    }
  }

  async getTransferStats(accessToken, filters = {}) {
    try {
      // Construir URL con filtros
      let url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER_STAST}`;

      // Añadir parámetros de consulta si existen
      const queryParams = [];
      if (filters.timeRange) queryParams.push(`timeRange=${filters.timeRange}`);
      if (filters.taskId) queryParams.push(`taskId=${filters.taskId}`);

      // Añadir parámetros a la URL
      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }

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
      console.error("Error al obtener estadísticas:", error);
      throw error;
    }
  }

  // Añade estos métodos a tu clase TransferApi

  /**
   * Obtiene un listado de logs con filtrado y paginación
   * @param {string} accessToken - Token de autenticación
   * @param {Object} filters - Filtros (level, source, dateFrom, dateTo, search, limit, page)
   * @returns {Promise<Object>} - Resultado con logs y estadísticas
   */
  async getLogs(accessToken, filters = {}) {
    try {
      // Construir URL con queryParams
      const queryParams = new URLSearchParams();

      // Añadir cada filtro como parámetro si existe
      if (filters.level && filters.level !== "all")
        queryParams.append("level", filters.level);
      if (filters.source && filters.source !== "all")
        queryParams.append("source", filters.source);
      if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);
      if (filters.search) queryParams.append("search", filters.search);
      if (filters.limit) queryParams.append("limit", filters.limit);
      if (filters.page) queryParams.append("page", filters.page);

      // Construir URL final
      //  const url = `${this.baseApi}/${ENV.API_ROUTERS.LOG}/transfer/vendedores`;
      const url = `${this.baseApi}/logs${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;

      // Configurar parámetros de la petición
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🔍 Obteniendo logs desde: ${url}`);

      // Realizar petición
      const response = await fetch(url, params);
      const result = await response.json();

      // Verificar respuesta
      if (!response.ok) throw result;

      return result;
    } catch (error) {
      console.error("Error al obtener logs:", error);
      throw error;
    }
  }

  /**
   * Obtiene un resumen de logs para el dashboard
   * @param {string} accessToken - Token de autenticación
   * @returns {Promise<Object>} - Resumen de estadísticas de logs
   */
  async getLogsSummary(accessToken) {
    try {
      const url = `${this.baseApi}/logs/summary`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`📊 Obteniendo resumen de logs`);

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;

      return result;
    } catch (error) {
      console.error("Error al obtener resumen de logs:", error);
      throw error;
    }
  }

  /**
   * Obtiene detalle de un log específico
   * @param {string} accessToken - Token de autenticación
   * @param {string} logId - ID del log a consultar
   * @returns {Promise<Object>} - Detalle del log
   */
  async getLogDetail(accessToken, logId) {
    try {
      const url = `${this.baseApi}/logs/detail/${logId}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`🔍 Obteniendo detalle de log: ${logId}`);

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;

      return result;
    } catch (error) {
      console.error(`Error al obtener detalle del log ${logId}:`, error);
      throw error;
    }
  }

  /**
   * Elimina logs antiguos según el período especificado
   * @param {string} accessToken - Token de autenticación
   * @param {number} olderThan - Días de antigüedad para eliminar
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async cleanOldLogs(accessToken, olderThan = 30) {
    try {
      const url = `${this.baseApi}/logs/clean`;
      const params = {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ olderThan }),
      };

      console.log(`🗑️ Eliminando logs más antiguos que ${olderThan} días`);

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;

      return result;
    } catch (error) {
      console.error("Error al limpiar logs antiguos:", error);
      throw error;
    }
  }

  /**
   * Obtiene las fuentes y niveles disponibles para filtrado
   * @param {string} accessToken - Token de autenticación
   * @returns {Promise<Object>} - Fuentes y niveles disponibles
   */
  async getLogSources(accessToken) {
    try {
      const url = `${this.baseApi}/logs/sources`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      console.log(`📋 Obteniendo fuentes de logs`);

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;

      return result;
    } catch (error) {
      console.error("Error al obtener fuentes de logs:", error);
      throw error;
    }
  }

  /**
   * Obtiene los pedidos según los filtros especificados
   * @param {string} accessToken - Token de autenticación
   * @param {Object} filters - Filtros para la consulta
   * @returns {Promise<Array>} - Lista de pedidos
   */
  async getOrders(accessToken, filters = {}) {
    try {
      // Construir URL con parámetros de consulta
      let url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/orders`;
      const queryParams = [];

      if (filters.dateFrom) queryParams.push(`dateFrom=${filters.dateFrom}`);
      if (filters.dateTo) queryParams.push(`dateTo=${filters.dateTo}`);
      if (filters.status && filters.status !== "all")
        queryParams.push(`status=${filters.status}`);
      if (filters.warehouse && filters.warehouse !== "all")
        queryParams.push(`warehouse=${filters.warehouse}`);
      if (filters.showProcessed) queryParams.push(`showProcessed=true`);

      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }

      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result.data || [];
    } catch (error) {
      console.error("Error al obtener pedidos:", error);
      throw error;
    }
  }

  /**
   * Obtiene los detalles de un pedido específico
   * @param {string} accessToken - Token de autenticación
   * @param {string} orderId - ID del pedido
   * @returns {Promise<Object>} - Detalles del pedido
   */
  async getOrderDetails(accessToken, orderId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/orders/${orderId}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result.data || { items: [] };
    } catch (error) {
      console.error(`Error al obtener detalles del pedido ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Procesa los pedidos seleccionados
   * @param {string} accessToken - Token de autenticación
   * @param {Object} data - Datos con lista de pedidos e información de la tarea
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async processOrders(accessToken, data) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/orders/process`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(data),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error("Error al procesar pedidos:", error);
      throw error;
    }
  }

  /**
   * Obtiene las bodegas disponibles para filtrar
   * @param {string} accessToken - Token de autenticación
   * @returns {Promise<Array>} - Lista de bodegas
   */
  async getWarehouses(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/warehouses`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result.data || [];
    } catch (error) {
      console.error("Error al obtener bodegas:", error);
      return []; // Retornar array vacío en lugar de propagar el error
    }
  }

  /**
   * Exporta los pedidos a Excel
   * @param {string} accessToken - Token de autenticación
   * @param {Object} data - Configuración de exportación
   * @returns {Promise<Blob>} - Datos del Excel
   */
  async exportOrders(accessToken, data) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/orders/export`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(data),
      };

      const response = await fetch(url, params);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al exportar los pedidos");
      }

      return await response.blob();
    } catch (error) {
      console.error("Error al exportar pedidos:", error);
      throw error;
    }
  }

  // Métodos para gestión de configuraciones de mapeo
  async getMappings(accessToken) {
    try {
      const url = `${this.baseApi}/mappings`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result.data;
    } catch (error) {
      console.error("Error al obtener configuraciones de mapeo:", error);
      throw error;
    }
  }

  async getMappingById(accessToken, mappingId) {
    try {
      const url = `${this.baseApi}/mappings/${mappingId}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result.data;
    } catch (error) {
      console.error("Error al obtener configuración de mapeo:", error);
      throw error;
    }
  }

  async createMapping(accessToken, mappingData) {
    try {
      // Asegurarnos de que la configuración consecutiva tenga todas las propiedades necesarias
      if (
        mappingData.consecutiveConfig &&
        mappingData.consecutiveConfig.enabled
      ) {
        mappingData.consecutiveConfig = {
          enabled: mappingData.consecutiveConfig.enabled || false,
          fieldName: mappingData.consecutiveConfig.fieldName || "",
          detailFieldName: mappingData.consecutiveConfig.detailFieldName || "",
          lastValue: Number(mappingData.consecutiveConfig.lastValue || 0),
          prefix: mappingData.consecutiveConfig.prefix || "",
          pattern: mappingData.consecutiveConfig.pattern || "",
          updateAfterTransfer:
            mappingData.consecutiveConfig.updateAfterTransfer !== false,
          applyToTables: mappingData.consecutiveConfig.applyToTables || [],
        };
      }
      const url = `${this.baseApi}/mappings`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(mappingData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 201) throw result;

      return result;
    } catch (error) {
      console.error("Error al crear configuración de mapeo:", error);
      throw error;
    }
  }

  async updateMapping(accessToken, mappingId, mappingData) {
    try {
      //validación
      if (
        mappingData.consecutiveConfig &&
        mappingData.consecutiveConfig.enabled
      ) {
        mappingData.consecutiveConfig = {
          enabled: mappingData.consecutiveConfig.enabled || false,
          fieldName: mappingData.consecutiveConfig.fieldName || "",
          detailFieldName: mappingData.consecutiveConfig.detailFieldName || "",
          lastValue: Number(mappingData.consecutiveConfig.lastValue || 0),
          prefix: mappingData.consecutiveConfig.prefix || "",
          pattern: mappingData.consecutiveConfig.pattern || "",
          updateAfterTransfer:
            mappingData.consecutiveConfig.updateAfterTransfer !== false,
          applyToTables: mappingData.consecutiveConfig.applyToTables || [],
        };
      }

      const url = `${this.baseApi}/mappings/${mappingId}`;
      const params = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(mappingData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error("Error al actualizar configuración de mapeo:", error);
      throw error;
    }
  }

  // async resetConsecutive(accessToken, mappingId, value = 0) {
  //   try {
  //     const url = `${this.baseApi}/mappings/${mappingId}/reset-consecutive?value=${value}`;
  //     const params = {
  //       method: "GET", // O POST si prefieres
  //       headers: {
  //         Authorization: `Bearer ${accessToken}`,
  //       },
  //     };

  //     const response = await fetch(url, params);
  //     const result = await response.json();

  //     if (response.status !== 200) throw result;

  //     return result;
  //   } catch (error) {
  //     console.error("Error al resetear consecutivo:", error);
  //     throw error;
  //   }
  // }

  async deleteMapping(accessToken, mappingId) {
    try {
      const url = `${this.baseApi}/mappings/${mappingId}`;
      const params = {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error("Error al eliminar configuración de mapeo:", error);
      throw error;
    }
  }

  // Métodos para trabajar con documentos según el mapeo
  async getDocumentsByMapping(accessToken, mappingId, filters = {}) {
    try {
      // Construir URL con parámetros de consulta
      let url = `${this.baseApi}/mappings/${mappingId}/documents`;
      const queryParams = [];

      if (filters.dateFrom) queryParams.push(`dateFrom=${filters.dateFrom}`);
      if (filters.dateTo) queryParams.push(`dateTo=${filters.dateTo}`);
      if (filters.status && filters.status !== "all")
        queryParams.push(`status=${filters.status}`);
      if (filters.warehouse && filters.warehouse !== "all")
        queryParams.push(`warehouse=${filters.warehouse}`);
      if (filters.showProcessed) queryParams.push(`showProcessed=true`);

      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }

      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result.data || [];
    } catch (error) {
      console.error("Error al obtener documentos por mapeo:", error);
      throw error;
    }
  }

  async getDocumentDetailsByMapping(accessToken, mappingId, documentId) {
    try {
      const url = `${this.baseApi}/mappings/${mappingId}/documents/${documentId}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result.data || { details: {} };
    } catch (error) {
      console.error("Error al obtener detalles del documento:", error);
      throw error;
    }
  }

  async processDocumentsByMapping(accessToken, mappingId, documentIds) {
    try {
      const url = `${this.baseApi}/mappings/${mappingId}/process`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ documentIds }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error("Error al procesar documentos:", error);
      throw error;
    }
  }
  async getCustomerData(accessToken, filters = {}) {
    try {
      // Construir URL con parámetros de consulta
      let url = `${this.baseApi}/customers`;
      const queryParams = [];

      if (filters.dateFrom) queryParams.push(`dateFrom=${filters.dateFrom}`);
      if (filters.dateTo) queryParams.push(`dateTo=${filters.dateTo}`);
      if (filters.status && filters.status !== "all")
        queryParams.push(`status=${filters.status}`);
      if (filters.search) queryParams.push(`search=${filters.search}`);

      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }

      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result.data || [];
    } catch (error) {
      console.error("Error al obtener datos de clientes:", error);
      throw error;
    }
  }

  async updateCustomerData(accessToken, customerData) {
    try {
      const url = `${this.baseApi}/customers/update`;
      const params = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(customerData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      throw error;
    }
  }

  /**
   * Actualiza solo la configuración de consecutivos para un mapeo específico
   */
  async updateConsecutiveConfig(accessToken, mappingId, consecutiveConfig) {
    try {
      const url = `${this.baseApi}/mappings/${mappingId}/consecutive`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(consecutiveConfig),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error(
        "Error al actualizar configuración de consecutivos:",
        error
      );
      throw error;
    }
  }

  // /**
  //  * Reinicia el consecutivo a un valor específico
  //  */
  // async resetConsecutive(accessToken, mappingId, value = 0) {
  //   try {
  //     const url = `${this.baseApi}/mappings/${mappingId}/reset-consecutive?value=${value}`;
  //     const params = {
  //       headers: {
  //         Authorization: `Bearer ${accessToken}`,
  //       },
  //     };

  //     const response = await fetch(url, params);
  //     const result = await response.json();

  //     if (response.status !== 200) throw result;

  //     return result;
  //   } catch (error) {
  //     console.error("Error al resetear consecutivo:", error);
  //     throw error;
  //   }
  // }

  /**
   * Obtiene todos los consecutivos
   * @param {string} accessToken - Token de acceso
   * @param {Object} filters - Filtros opcionales
   * @returns {Promise<Object>} Resultado con lista de consecutivos
   */
  async getConsecutives(accessToken, filters = {}) {
    try {
      // Construir queryParams
      const queryParams = new URLSearchParams();
      if (filters.active !== undefined) {
        queryParams.append("active", filters.active);
      }
      if (filters.entityType && filters.entityId) {
        queryParams.append("entityType", filters.entityType);
        queryParams.append("entityId", filters.entityId);
      }

      const url = `${this.baseApi}/consecutives${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener consecutivos:", error);
      throw error;
    }
  }

  /**
   * Obtiene un consecutivo por ID
   * @param {string} accessToken - Token de acceso
   * @param {string} id - ID del consecutivo
   * @returns {Promise<Object>} Resultado con datos del consecutivo
   */
  async getConsecutiveById(accessToken, id) {
    try {
      const url = `${this.baseApi}/consecutives/${id}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener consecutivo:", error);
      throw error;
    }
  }

  /**
   * Crea un nuevo consecutivo
   * @param {string} accessToken - Token de acceso
   * @param {Object} consecutiveData - Datos del consecutivo
   * @returns {Promise<Object>} Resultado de la operación
   */
  async createConsecutive(accessToken, consecutiveData) {
    try {
      const url = `${this.baseApi}/consecutives`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(consecutiveData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al crear consecutivo:", error);
      throw error;
    }
  }

  /**
   * Actualiza un consecutivo existente
   * @param {string} accessToken - Token de acceso
   * @param {string} id - ID del consecutivo
   * @param {Object} consecutiveData - Datos a actualizar
   * @returns {Promise<Object>} Resultado de la operación
   */
  async updateConsecutive(accessToken, id, consecutiveData) {
    try {
      const url = `${this.baseApi}/consecutives/${id}`;
      const params = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(consecutiveData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al actualizar consecutivo:", error);
      throw error;
    }
  }

  /**
   * Elimina un consecutivo
   * @param {string} accessToken - Token de acceso
   * @param {string} id - ID del consecutivo
   * @returns {Promise<Object>} Resultado de la operación
   */
  async deleteConsecutive(accessToken, id) {
    try {
      const url = `${this.baseApi}/consecutives/${id}`;
      const params = {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al eliminar consecutivo:", error);
      throw error;
    }
  }

  /**
   * Obtiene el siguiente valor de un consecutivo
   * @param {string} accessToken - Token de acceso
   * @param {string} id - ID del consecutivo
   * @param {Object} options - Opciones adicionales (segment, companyId)
   * @returns {Promise<Object>} Resultado con el siguiente valor
   */
  async getNextConsecutiveValue(accessToken, id, options = {}) {
    try {
      // Construir queryParams
      const queryParams = new URLSearchParams();
      if (options.segment) {
        queryParams.append("segment", options.segment);
      }
      if (options.companyId) {
        queryParams.append("companyId", options.companyId);
      }

      const url = `${this.baseApi}/consecutives/${id}/next${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;
      const params = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener siguiente valor consecutivo:", error);
      throw error;
    }
  }

  /**
   * Reinicia un consecutivo a un valor específico
   * @param {string} accessToken - Token de acceso
   * @param {string} id - ID del consecutivo
   * @param {number} value - Valor inicial
   * @param {string} segment - Segmento opcional
   * @returns {Promise<Object>} Resultado de la operación
   */
  async resetConsecutive(accessToken, id, value = 0, segment = null) {
    try {
      // Construir queryParams
      const queryParams = new URLSearchParams();
      queryParams.append("value", value);
      if (segment) {
        queryParams.append("segment", segment);
      }

      const url = `${
        this.baseApi
      }/consecutives/${id}/reset?${queryParams.toString()}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al reiniciar consecutivo:", error);
      throw error;
    }
  }

  /**
   * Asigna un consecutivo a una entidad
   * @param {string} accessToken - Token de acceso
   * @param {string} id - ID del consecutivo
   * @param {Object} assignment - Datos de asignación
   * @returns {Promise<Object>} Resultado de la operación
   */
  async assignConsecutive(accessToken, id, assignment) {
    try {
      const url = `${this.baseApi}/consecutives/${id}/assign`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(assignment),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al asignar consecutivo:", error);
      throw error;
    }
  }

  /**
   * Obtiene los consecutivos asignados a una entidad específica
   * @param {string} accessToken - Token de acceso
   * @param {string} entityType - Tipo de entidad (mapping, user, company, etc.)
   * @param {string} entityId - ID de la entidad
   * @returns {Promise<Object>} Resultado con lista de consecutivos asignados
   */
  async getConsecutivesByEntity(accessToken, entityType, entityId) {
    try {
      const url = `${this.baseApi}/consecutives/entity/${entityType}/${entityId}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error(
        `Error al obtener consecutivos para entidad (${entityType}/${entityId}):`,
        error
      );
      throw error;
    }
  }

  // Agregar métodos para manejar reservas en transferApi.jsx
  async reserveConsecutiveValues(
    accessToken,
    consecutiveId,
    quantity,
    options = {}
  ) {
    try {
      const url = `${this.baseApi}/consecutives/reserve-batch`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          consecutiveId,
          quantity,
          segment: options.segment,
          reservedBy: options.reservedBy || "web_client",
        }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al reservar valores consecutivos:", error);
      throw error;
    }
  }

  async commitConsecutiveReservation(
    accessToken,
    consecutiveId,
    reservationId,
    values
  ) {
    try {
      const url = `${this.baseApi}/consecutives/commit-reservation`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          consecutiveId,
          reservationId,
          values,
        }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al confirmar reserva:", error);
      throw error;
    }
  }

  async cancelConsecutiveReservation(
    accessToken,
    consecutiveId,
    reservationId
  ) {
    try {
      const url = `${this.baseApi}/consecutives/cancel-reservation`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          consecutiveId,
          reservationId,
        }),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al cancelar reserva:", error);
      throw error;
    }
  }

  async cleanupExpiredReservations(accessToken) {
    try {
      const url = `${this.baseApi}/consecutives/cleanup-expired-reservations`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al limpiar reservas expiradas:", error);
      throw error;
    }
  }

  /**
   * Obtiene el dashboard de consecutivos
   */
  async getConsecutiveDashboard(accessToken) {
    try {
      const url = `${this.baseApi}/consecutives/dashboard`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener dashboard de consecutivos:", error);
      throw error;
    }
  }

  /**
   * Obtiene métricas de un consecutivo específico
   */
  async getConsecutiveMetrics(accessToken, consecutiveId, timeRange = "24h") {
    try {
      const url = `${this.baseApi}/consecutives/metrics/${consecutiveId}?timeRange=${timeRange}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener métricas de consecutivo:", error);
      throw error;
    }
  }

  /**
   * Hacer una petición GET genérica (método auxiliar)
   */
  async get(endpoint, accessToken) {
    try {
      const url = `${this.baseApi}${endpoint}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error(`Error en petición GET a ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Hacer una petición POST genérica (método auxiliar)
   */
  async post(endpoint, accessToken, data = null) {
    try {
      const url = `${this.baseApi}${endpoint}`;
      const params = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      };

      if (data) {
        params.body = JSON.stringify(data);
      }

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error(`Error en petición POST a ${endpoint}:`, error);
      throw error;
    }
  }

  async getSourceDataByMapping(accessToken, mappingId, documentId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/source-data/${mappingId}/${documentId}`;
      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al obtener datos de origen:", error);
      throw error;
    }
  }

  async updateEntityData(accessToken, updateData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/update-entity-data`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(updateData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (!response.ok) throw result;
      return result;
    } catch (error) {
      console.error("Error al actualizar entidad:", error);
      throw error;
    }
  }

  // Obtener información de vinculación de una tarea
  async getTaskLinkingInfo(accessToken, taskId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/linking-info/${taskId}`;
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
      console.error("Error al obtener info de vinculación:", error);
      throw error;
    }
  }

  // Ejecutar grupo de tareas vinculadas
  async executeLinkedGroup(accessToken, taskId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/execute-linked-group/${taskId}`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;
      return result;
    } catch (error) {
      console.error("Error al ejecutar grupo vinculado:", error);
      throw error;
    }
  }
}
