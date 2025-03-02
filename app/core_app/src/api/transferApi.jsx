import { ENV } from "../index";

export class TransferApi {
  baseApi = ENV.BASE_API;

  async getTasks(accessToken) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFERS}`;
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

  async addTimeTransfer(accessToken, datos) {
    // console.log(datos);
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.CONFIG_TASK}/horas`;
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
      const url = `${this.baseApi}/${ENV.API_ROUTERS.CONFIG_TASK}/horas`;
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
      const url = `${this.baseApi}/${ENV.API_ROUTERS.CONFIG_TASK}/task-status`;
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
  async executeInsertLoads(accessToken, route, loadId, salesData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/insertLoads`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ route, loadId, salesData }),
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
  async executeInsertTrapaso(accessToken, route, loadId, salesData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/insertTrapaso`;
      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ route, loadId, salesData }),
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
}
