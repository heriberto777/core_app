/**
 * useModulePermissions.jsx
 * Hook especializado: consulta los permisos detallados de un módulo específico.
 *
 * Responsabilidad única: responder "¿qué puede hacer el usuario en el módulo X?".
 * Depende de useBasePermissions para los datos base.
 */
import { useCallback } from "react";
import { useBasePermissions } from "./useBasePermissions";

/**
 * Construye el objeto de permisos estándar de un módulo.
 * Extrae la lógica repetida de los tres fallbacks en getModulePermissions.
 */
const buildModulePerms = (permissionsArray, extra = {}) => ({
    canAccess: extra.canAccess ?? true,
    actions: permissionsArray || [],
    availableActions: extra.availableActions || permissionsArray || [],
    canCreate: permissionsArray?.includes("create") || false,
    canRead: permissionsArray?.includes("read") || false,
    canUpdate: permissionsArray?.includes("update") || false,
    canDelete: permissionsArray?.includes("delete") || false,
    canExecute: permissionsArray?.includes("execute") || false,
    canManage: permissionsArray?.includes("manage") || false,
    moduleName: extra.moduleName || extra.name,
    category: extra.category || "unknown",
    icon: extra.icon || null,
    color: extra.color || null,
    showInMenu: extra.showInMenu,
    showInDashboard: extra.showInDashboard,
    priority: extra.priority,
});

const NO_ACCESS = buildModulePerms([], { canAccess: false });

export const useModulePermissions = () => {
    const {
        isAdmin,
        modulesSummary,
        availableModules,
        consolidatedPermissions,
        hasPermission,
    } = useBasePermissions();

    /**
     * Retorna el objeto de permisos detallados de un módulo.
     * Busca en 3 fuentes en orden de prioridad:
     *   1. modulesSummary (info más completa del backend)
     *   2. availableModules (fallback)
     *   3. consolidatedPermissions (fallback final)
     */
    const getModulePermissions = useCallback(
        (moduleName) => {
            if (!moduleName) return NO_ACCESS;

            // 1. modulesSummary — fuente primaria
            const moduleInfo = modulesSummary.find(
                (m) => m.name === moduleName || m.resource === moduleName
            );
            if (moduleInfo) {
                return buildModulePerms(moduleInfo.permissions, {
                    canAccess: moduleInfo.hasAccess,
                    availableActions: moduleInfo.availableActions,
                    moduleName: moduleInfo.displayName || moduleInfo.name,
                    name: moduleInfo.name,
                    category: moduleInfo.category,
                    icon: moduleInfo.uiConfig?.icon,
                    color: moduleInfo.uiConfig?.color,
                    showInMenu: moduleInfo.showInMenu,
                    showInDashboard: moduleInfo.showInDashboard,
                    priority: moduleInfo.uiConfig?.order || moduleInfo.priority,
                });
            }

            // 2. availableModules — fallback
            const availableModule = availableModules.find(
                (m) => m.name === moduleName || m.resource === moduleName
            );
            if (availableModule) {
                return buildModulePerms(availableModule.permissions, {
                    canAccess: availableModule.hasAccess,
                    availableActions: availableModule.availableActions,
                    moduleName: availableModule.displayName || availableModule.name,
                    name: availableModule.name,
                    category: availableModule.category,
                });
            }

            // 3. consolidatedPermissions — fallback final
            const permission = consolidatedPermissions.find(
                (p) => p.resource === moduleName
            );
            if (permission) {
                return buildModulePerms(permission.actions, {
                    moduleName: permission.moduleName || permission.resource,
                    name: permission.resource,
                    category: permission.category,
                });
            }

            return NO_ACCESS;
        },
        [modulesSummary, availableModules, consolidatedPermissions]
    );

    /**
     * Retorna true si el usuario puede ejecutar una acción específica en un módulo.
     */
    const canPerformAction = useCallback(
        (moduleName, action) => {
            const perms = getModulePermissions(moduleName);
            return (
                perms.canAccess &&
                (perms.actions.includes(action) || perms.actions.includes("manage"))
            );
        },
        [getModulePermissions]
    );

    /**
     * Retorna los permisos agrupados por categoría.
     */
    const getPermissionsByCategory = useCallback(() => {
        return consolidatedPermissions.reduce((categories, permission) => {
            const category = permission.category || "general";
            if (!categories[category]) categories[category] = [];
            categories[category].push(permission);
            return categories;
        }, {});
    }, [consolidatedPermissions]);

    return {
        getModulePermissions,
        canPerformAction,
        getPermissionsByCategory,
        // Shortcuts de conveniencia
        canCreate: (resource) => hasPermission(resource, "create"),
        canRead: (resource) => hasPermission(resource, "read"),
        canUpdate: (resource) => hasPermission(resource, "update"),
        canDelete: (resource) => hasPermission(resource, "delete"),
        canManage: (resource) => hasPermission(resource, "manage"),
        canExecute: (resource) => hasPermission(resource, "execute"),
    };
};
