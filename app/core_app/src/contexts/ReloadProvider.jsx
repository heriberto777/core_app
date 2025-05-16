// ReloadProvider.jsx - Versión modificada para evitar recargas completas
import React, { createContext, useState, useCallback, useEffect } from "react";

// Crear contexto
export const ReloadContext = createContext();

export function ReloadProvider({ children }) {
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Función para solicitar recarga de datos sin recargar la página
  const requestReload = useCallback(() => {
    setReloadTrigger((prev) => prev + 1);
  }, []);

  // Prevenir la recarga completa de la página al pulsar F5
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Si es F5 o Ctrl+R
      if (e.key === "F5" || (e.ctrlKey && e.key === "r")) {
        e.preventDefault();
        requestReload();
        return false;
      }
    };

    // Añadir event listeners
    window.addEventListener("keydown", handleBeforeUnload);

    // Limpiar al desmontar
    return () => {
      window.removeEventListener("keydown", handleBeforeUnload);
    };
  }, [requestReload]);

  // Modificar behavior de eventos de formulario para evitar recargas
  useEffect(() => {
    const handleFormSubmit = (e) => {
      // Prevenir el comportamiento por defecto que recarga la página
      e.preventDefault();

      // En lugar de recargar, actualizar el estado
      requestReload();
    };

    // Capturar envíos de formulario
    document.addEventListener("submit", handleFormSubmit);

    return () => {
      document.removeEventListener("submit", handleFormSubmit);
    };
  }, [requestReload]);

  return (
    <ReloadContext.Provider value={{ reloadTrigger, requestReload }}>
      {children}
    </ReloadContext.Provider>
  );
}
