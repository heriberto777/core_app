import React from "react";
import styled from "styled-components";
import { usePermissions } from "../../index";
import { FaLock, FaBan } from "react-icons/fa";

const LockedContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: ${({ theme }) => theme.bg2}40;
  border-radius: 8px;
  border: 1px dashed ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.textSecondary};
  min-height: ${({ $minHeight }) => $minHeight || '100px'};
`;

const LockedIcon = styled(FaLock)`
  font-size: 24px;
  margin-bottom: 10px;
  color: ${({ theme }) => theme.textSecondary};
  opacity: 0.5;
`;

const LockedText = styled.span`
  font-size: 13px;
  font-weight: 500;
`;

const LockedTooltip = styled.div`
  font-size: 11px;
  margin-top: 6px;
  opacity: 0.7;
`;

const ForbiddenContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  background: ${({ theme }) => theme.dangerBg}30;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.danger}30;
  color: ${({ theme }) => theme.danger};
`;

const ForbiddenIcon = styled(FaBan)`
  font-size: 32px;
  margin-bottom: 10px;
`;

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
  const { hasPermission, hasRole, hasLegacyRole, isAdmin, loading } = usePermissions();

  if (loading) {
    return (
      <LockedContainer $minHeight={minHeight}>
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
      <LockedContainer $minHeight={minHeight}>
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
