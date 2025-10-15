// notificationService.js
export class NotificationService {
  constructor() {
    this.enabled = false;
    this.permission = Notification.permission;
    this.initialize();
  }

  // Inicializar el servicio
  initialize() {
    // Verificar si el navegador soporta notificaciones
    if ("Notification" in window) {
      this.permission = Notification.permission;
      this.enabled = this.permission === "granted";
    }
  }

  // Solicitar permiso para mostrar notificaciones
  async requestPermission() {
    if ("Notification" in window) {
      try {
        const permission = await Notification.requestPermission();
        this.permission = permission;
        this.enabled = permission === "granted";
        return permission;
      } catch (error) {
        console.error("Error al solicitar permiso de notificaciones:", error);
        return "denied";
      }
    }
    return "denied";
  }

  // Verificar si las notificaciones están habilitadas
  isEnabled() {
    return this.enabled;
  }

  // Mostrar una notificación
  showNotification(title, options = {}) {
    if (!this.enabled) {
      console.warn("Las notificaciones no están habilitadas");
      return false;
    }

    try {
      const notification = new Notification(title, {
        icon: "/favicon.ico",
        ...options,
      });

      // Manejar clics en la notificación
      if (options.onClick) {
        notification.onclick = options.onClick;
      }

      return true;
    } catch (error) {
      console.error("Error al mostrar notificación:", error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
