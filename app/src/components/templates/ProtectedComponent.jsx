import React from "react";
import { usePermissions } from "../../index";

const ProtectedComponent = ({
  children,
  resource,
  action,
  role,
  legacyRole, // ⭐ PARA COMPATIBILIDAD CON TU SISTEMA ANTERIOR ⭐
  requireAdmin = false,
  fallback = null,
  showFallback = true,
}) => {
  const { hasPermission, hasRole, hasLegacyRole, isAdmin, loading } =
    usePermissions();

  // Mostrar loading si aún está cargando
  if (loading) {
    return <div>Verificando permisos...</div>;
  }

  // Verificar si requiere admin
  if (requireAdmin && !isAdmin) {
    return showFallback
      ? fallback || <div>No tienes permisos para ver este contenido</div>
      : null;
  }

  // ⭐ COMPATIBILIDAD CON ROLES ANTERIORES ⭐
  if (legacyRole && !hasLegacyRole(legacyRole) && !isAdmin) {
    return showFallback
      ? fallback || <div>Necesitas el rol: {legacyRole}</div>
      : null;
  }

  // Verificar rol específico del nuevo sistema
  if (role && !hasRole(role) && !isAdmin) {
    return showFallback
      ? fallback || <div>Necesitas el rol: {role}</div>
      : null;
  }

  // Verificar permiso específico
  if (resource && action && !hasPermission(resource, action)) {
    return showFallback
      ? fallback || (
          <div>
            No tienes permisos para {action} en {resource}
          </div>
        )
      : null;
  }

  // Si pasa todas las verificaciones, mostrar el contenido
  return <>{children}</>;
};

export default ProtectedComponent;
