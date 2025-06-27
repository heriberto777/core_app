import { ENV } from "./constants";

export class ProgressSseClient {
  baseApi = ENV.BASE_API;

  constructor() {
    this.eventSources = new Map();
    this.eventHandlers = new Map();
    this.reconnectTimeouts = new Map();
    this.maxReconnectAttempts = 5;
    this.reconnectAttempts = new Map();
    this.baseDelay = 3000; // 3 segundos de retraso inicial para reconexión
  }

  /**
   * Subscribirse a eventos de progreso para una tarea específica
   * @param {string} taskId - ID de la tarea
   * @param {object} handlers - Objeto con manejadores de eventos {progress, status, error, connected}
   * @returns {boolean} - True si se creó correctamente
   */
  subscribe(taskId, handlers = {}) {
    if (!taskId) {
      console.error("Se requiere un taskId para suscribirse a eventos");
      return false;
    }

    // Si ya existe una suscripción, cerrarla primero
    this.unsubscribe(taskId);

    try {
      // Crear EventSource para esta tarea usando la ruta definida en progressSse.js
      const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER_PROGRESS}/progress/${taskId}`;

      console.log(`Conectando a SSE: ${url}`);
      const eventSource = new EventSource(url);
      // Restablecer contador de intentos de reconexión
      this.reconnectAttempts.set(taskId, 0);

      // Almacenar los manejadores
      this.eventHandlers.set(taskId, handlers);

      // Evento de apertura de conexión
      eventSource.onopen = () => {
        console.log(`Conexión SSE establecida para tarea ${taskId}`);
        // Restablecer contador de intentos al establecer conexión
        this.reconnectAttempts.set(taskId, 0);
        if (handlers.connected) handlers.connected();
      };

      // Configurar manejador de mensajes según el formato de tu backend
      eventSource.onmessage = (event) => {
        try {
          // Eventos genéricos (que no tienen tipo específico)
          const data = JSON.parse(event.data);
          if (handlers.message) handlers.message(data);
        } catch (error) {
          console.error(`Error al procesar mensaje SSE: ${error.message}`);
        }
      };

      // Evento de progreso (utiliza el nombre de evento definido en tu backend)
      eventSource.addEventListener("progress", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (handlers.progress) handlers.progress(data);
        } catch (error) {
          console.error(`Error al procesar evento progress: ${error.message}`);
        }
      });

      // Evento de estado
      eventSource.addEventListener("status", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (handlers.status) handlers.status(data);
        } catch (error) {
          console.error(`Error al procesar evento status: ${error.message}`);
        }
      });

      // Evento de conexión inicial (específico de tu backend)
      eventSource.addEventListener("connected", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (handlers.connected) handlers.connected(data);
        } catch (error) {
          console.error(`Error al procesar evento connected: ${error.message}`);
        }
      });

      // Manejo de errores y reconexión
      eventSource.onerror = (error) => {
        console.error(`Error en conexión SSE para tarea ${taskId}:`, error);

        if (handlers.error) handlers.error(error);

        // Verificar el estado de la conexión
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log(`Conexión SSE cerrada para tarea ${taskId}`);

          // Limpiar el EventSource actual
          if (this.eventSources.has(taskId)) {
            this.eventSources.get(taskId).close();
            this.eventSources.delete(taskId);
          }

          // Intentar reconectar con backoff exponencial
          const attempts = this.reconnectAttempts.get(taskId) || 0;

          if (attempts < this.maxReconnectAttempts) {
            // Calcular tiempo de espera con backoff exponencial
            const delay = this.baseDelay * Math.pow(2, attempts);
            console.log(
              `Intentando reconectar SSE para tarea ${taskId} en ${delay}ms (intento ${
                attempts + 1
              }/${this.maxReconnectAttempts})`
            );

            // Limpiar timeout anterior si existe
            if (this.reconnectTimeouts.has(taskId)) {
              clearTimeout(this.reconnectTimeouts.get(taskId));
            }

            // Establecer nuevo timeout
            const timeoutId = setTimeout(() => {
              // Incrementar contador de intentos
              this.reconnectAttempts.set(taskId, attempts + 1);

              // Intentar reconectar
              if (this.eventHandlers.has(taskId)) {
                this.subscribe(taskId, this.eventHandlers.get(taskId));
              }

              // Eliminar referencia al timeout
              this.reconnectTimeouts.delete(taskId);
            }, delay);

            this.reconnectTimeouts.set(taskId, timeoutId);
          } else {
            console.warn(
              `Máximo número de intentos de reconexión alcanzado para tarea ${taskId}`
            );
            if (handlers.reconnectFailed) handlers.reconnectFailed();
          }
        }
      };

      // Almacenar el EventSource
      this.eventSources.set(taskId, eventSource);
      return true;
    } catch (error) {
      console.error(`Error al configurar SSE para tarea ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Darse de baja de los eventos de una tarea
   * @param {string} taskId - ID de la tarea
   */
  unsubscribe(taskId) {
    // Limpiar timeout de reconexión si existe
    if (this.reconnectTimeouts.has(taskId)) {
      clearTimeout(this.reconnectTimeouts.get(taskId));
      this.reconnectTimeouts.delete(taskId);
    }

    // Cerrar EventSource si existe
    if (this.eventSources.has(taskId)) {
      const eventSource = this.eventSources.get(taskId);
      eventSource.close();
      this.eventSources.delete(taskId);
      console.log(`Desuscrito de eventos SSE para tarea ${taskId}`);
    }

    // Eliminar manejadores
    this.eventHandlers.delete(taskId);
    this.reconnectAttempts.delete(taskId);
  }

  /**
   * Verifica si ya hay una suscripción activa para una tarea
   * @param {string} taskId - ID de la tarea
   * @returns {boolean} - True si existe suscripción
   */
  isSubscribed(taskId) {
    return this.eventSources.has(taskId);
  }

  /**
   * Obtiene el estado de la conexión para una tarea
   * @param {string} taskId - ID de la tarea
   * @returns {string|null} - Estado de la conexión o null si no existe
   */
  getConnectionState(taskId) {
    if (!this.eventSources.has(taskId)) return null;

    const eventSource = this.eventSources.get(taskId);
    switch (eventSource.readyState) {
      case EventSource.CONNECTING:
        return "connecting";
      case EventSource.OPEN:
        return "open";
      case EventSource.CLOSED:
        return "closed";
      default:
        return "unknown";
    }
  }

  /**
   * Cerrar todas las suscripciones activas
   */
  closeAll() {
    // Limpiar todos los timeouts de reconexión
    this.reconnectTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.reconnectTimeouts.clear();

    // Cerrar todos los EventSources
    this.eventSources.forEach((eventSource, taskId) => {
      eventSource.close();
      console.log(`Cerrada conexión SSE para tarea ${taskId}`);
    });

    this.eventSources.clear();
    this.eventHandlers.clear();
    this.reconnectAttempts.clear();
  }
}

// Crear instancia singleton
export const progressClient = new ProgressSseClient();
