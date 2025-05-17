import React, { createContext, useState } from "react";

// Crear el contexto
export const ReloadContext = createContext();

// Crear un proveedor para el contexto
export const ReloadProvider = ({ children }) => {
  const [reload, setReload] = useState(false);

  return (
    <ReloadContext.Provider value={{ reload, setReload }}>
      {children}
    </ReloadContext.Provider>
  );
};
