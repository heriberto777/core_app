import React from "react";
import { usePermissions } from "../../index";
import { FaLock, FaBan } from "react-icons/fa";

function LockedContainer({ children, minHeight }) {
  return (
    <div 
      className="flex flex-col items-center justify-center p-5 bg-slate-800/40 rounded-lg border border-dashed border-slate-600 text-slate-400"
      style={{ minHeight: minHeight || '100px' }}
    >
      {children}
    </div>
  );
}

function LockedIcon() {
  return <FaLock className="text-2xl mb-2.5 text-slate-400 opacity-50" />;
}

function LockedText({ children }) {
  return <span className="text-[13px] font-medium">{children}</span>;
}

function LockedTooltip({ children }) {
  return <div className="text-[11px] mt-1.5 opacity-70">{children}</div>;
}

function ForbiddenContainer({ children }) {
  return (
    <div className="flex flex-col items-center justify-center p-7.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
      {children}
    </div>
  );
}

function ForbiddenIcon() {
  return <FaBan className="text-3xl mb-2.5" />;
}

const AccessDenied = ({
  children,
  resource,
  action,
  role,
  requireAdmin = false,
  fallback = null,
  showLocked = true,
  lockedMessage = null,
  minHeight,
  tooltip = null,
}) => {
  const { hasPermission, hasRole, isAdmin, loading } = usePermissions();

  if (loading) {
    return (
      <LockedContainer minHeight={minHeight}>
        <LockedIcon />
        <LockedText>Verificando permisos...</LockedText>
      </LockedContainer>
    );
  }

  let hasAccess = true;
  let deniedReason = "";

  if (requireAdmin && !isAdmin) {
    hasAccess = false;
    deniedReason = "Requiere privilegios de administrador";
  } else if (role && !hasRole(role) && !isAdmin) {
    hasAccess = false;
    deniedReason = `Requiere el rol: ${role}`;
  } else if (resource && action && !hasPermission(resource, action)) {
    hasAccess = false;
    deniedReason = `Sin permisos para "${action}" en "${resource}"`;
  }

  if (!hasAccess) {
    if (!showLocked) {
      return fallback || null;
    }

    return (
      <LockedContainer minHeight={minHeight}>
        <LockedIcon />
        <LockedText>{lockedMessage || "Sin acceso"}</LockedText>
        {tooltip && <LockedTooltip>{tooltip}</LockedTooltip>}
        {!tooltip && deniedReason && <LockedTooltip>{deniedReason}</LockedTooltip>}
      </LockedContainer>
    );
  }

  return <>{children}</>;
};

export const AccessControl = {
  /**
   * Oculta el contenido si no tiene permisos (recomendado para botones pequeños)
   */
  Hidden: ({ children, resource, action, role, requireAdmin }) => {
    const { hasPermission, hasRole, isAdmin, loading } = usePermissions();
    
    if (loading) return null;
    
    if (requireAdmin && !isAdmin) return null;
    if (role && !hasRole(role) && !isAdmin) return null;
    if (resource && action && !hasPermission(resource, action)) return null;
    
    return children;
  },

  /**
   * Muestra contenido bloqueado con ícono de candado
   */
  Locked: ({ children, resource, action, role, requireAdmin, fallback, minHeight, tooltip }) => (
    <AccessDenied
      resource={resource}
      action={action}
      role={role}
      requireAdmin={requireAdmin}
      fallback={fallback}
      showLocked={true}
      minHeight={minHeight}
      tooltip={tooltip}
    >
      {children}
    </AccessDenied>
  ),

  /**
   * Muestra fallback si no tiene permisos
   */
  Fallback: ({ children, resource, action, role, requireAdmin, fallback }) => (
    <AccessDenied
      resource={resource}
      action={action}
      role={role}
      requireAdmin={requireAdmin}
      fallback={fallback}
      showLocked={false}
    >
      {children}
    </AccessDenied>
  ),
};

export default AccessDenied;
