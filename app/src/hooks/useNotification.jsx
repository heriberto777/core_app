// src/hooks/useNotification.jsx
import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Hook para gestionar notificaciones del sistema
 * Siguiendo el patrón de tus hooks existentes
 */
export const useNotification = () => {
  const [notifications, setNotifications] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  /**
   * Mostrar una nueva notificación
   */
  const showNotification = useCallback(
    (message, type = "info", options = {}) => {
      const {
        duration = 5000, // 5 segundos por defecto
        persistent = false, // Si true, no se auto-oculta
        actionLabel = null,
        onAction = null,
        position = "top-right",
      } = options;

      const id = nextId.current++;

      const notification = {
        id,
        message,
        type, // 'success', 'error', 'warning', 'info'
        duration,
        persistent,
        actionLabel,
        onAction,
        position,
        timestamp: new Date(),
        visible: true,
      };

      setNotifications((prev) => [...prev, notification]);

      // Auto-ocultar si no es persistente
      if (!persistent && duration > 0) {
        const timer = setTimeout(() => {
          hideNotification(id);
        }, duration);

        timers.current.set(id, timer);
      }

      return id;
    },
    []
  );

  /**
   * Ocultar una notificación específica
   */
  const hideNotification = useCallback((id) => {
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id)
    );

    // Limpiar timer si existe
    if (timers.current.has(id)) {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
    }
  }, []);

  /**
   * Limpiar todas las notificaciones
   */
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);

    // Limpiar todos los timers
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
  }, []);

  /**
   * Funciones de conveniencia para tipos específicos
   */
  const showSuccess = useCallback(
    (message, options = {}) => {
      return showNotification(message, "success", options);
    },
    [showNotification]
  );

  const showError = useCallback(
    (message, options = {}) => {
      return showNotification(message, "error", {
        duration: 8000, // Errores duran más tiempo
        ...options,
      });
    },
    [showNotification]
  );

  const showWarning = useCallback(
    (message, options = {}) => {
      return showNotification(message, "warning", options);
    },
    [showNotification]
  );

  const showInfo = useCallback(
    (message, options = {}) => {
      return showNotification(message, "info", options);
    },
    [showNotification]
  );

  /**
   * Limpiar timers al desmontar el componente
   */
  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  return {
    notifications,
    showNotification,
    hideNotification,
    clearAllNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
};

/**
 * Hook para usar notificaciones en contexto
 * Si tienes un contexto de notificaciones global
 */
export const useNotificationContext = () => {
  // Si tienes un contexto de notificaciones, úsalo aquí
  // const context = useContext(NotificationContext);
  // if (!context) {
  //   throw new Error('useNotificationContext must be used within NotificationProvider');
  // }
  // return context;

  // Por ahora, usar el hook local
  return useNotification();
};
