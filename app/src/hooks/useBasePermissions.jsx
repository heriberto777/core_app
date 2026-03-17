/**
 * useBasePermissions.jsx
 * Hook base: expone los datos de permisos del usuario autenticado.
 * Es el cimiento de useModulePermissions y useRouteAccess.
 *
 * Responsabilidad única: leer y memoizar los datos de permisos del AuthContext.
 */
import { useMemo, useCallback } from "react";
import { useAuth } from "./useAuth";

export const useBasePermissions = () => {
    const { user, accessToken } = useAuth();

    const isAdmin = useMemo(() => user?.isAdmin || false, [user?.isAdmin]);

    const consolidatedPermissions = useMemo(
        () => user?.consolidatedPermissions || [],
        [user?.consolidatedPermissions]
    );

    const userRoles = useMemo(() => user?.roles || [], [user?.roles]);

    const specificPermissions = useMemo(
        () => user?.permissions || [],
        [user?.permissions]
    );

    const modulesSummary = useMemo(
        () => user?.modulesSummary || [],
        [user?.modulesSummary]
    );

    const availableModules = useMemo(
        () => user?.availableModules || [],
        [user?.availableModules]
    );

    /**
     * Verifica si el usuario tiene un permiso específico (resource + action).
     * Si el usuario es admin, siempre retorna true.
     */
    const hasPermission = useCallback(
        (resource, action) => {
            if (!user) return false;
            if (isAdmin) return true;

            return consolidatedPermissions.some(
                (permission) =>
                    permission.resource === resource &&
                    (permission.actions.includes(action) ||
                        permission.actions.includes("manage"))
            );
        },
        [user, isAdmin, consolidatedPermissions]
    );

    /** Retorna true si el usuario tiene AL MENOS UNO de los permisos. */
    const hasAnyPermission = useCallback(
        (permissionChecks) => {
            if (!Array.isArray(permissionChecks)) return false;
            return permissionChecks.some(({ resource, action }) =>
                hasPermission(resource, action)
            );
        },
        [hasPermission]
    );

    /** Retorna true si el usuario tiene TODOS los permisos. */
    const hasAllPermissions = useCallback(
        (permissionChecks) => {
            if (!Array.isArray(permissionChecks)) return false;
            return permissionChecks.every(({ resource, action }) =>
                hasPermission(resource, action)
            );
        },
        [hasPermission]
    );

    /** Verifica si el usuario tiene un rol por nombre o displayName. */
    const hasRole = useCallback(
        (roleName) => {
            if (!user || !userRoles.length) return false;
            return userRoles.some(
                (role) =>
                    (role.name === roleName || role.displayName === roleName) &&
                    role.isActive !== false
            );
        },
        [user, userRoles]
    );

    /** @deprecated — Soporte para campo `role` legacy en el modelo de usuario. */
    const hasLegacyRole = useCallback(
        (roleName) => {
            if (!user?.role) return false;
            return Array.isArray(user.role)
                ? user.role.includes(roleName)
                : user.role === roleName;
        },
        [user?.role]
    );

    return {
        user,
        accessToken,
        isAdmin,
        consolidatedPermissions,
        userRoles,
        specificPermissions,
        modulesSummary,
        availableModules,
        // Funciones de verificación
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        hasRole,
        hasLegacyRole,
    };
};
