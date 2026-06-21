/**
 * usePermissions.jsx — Orquestador (Retrocompatible)
 *
 * Este hook combina los 3 hooks especializados en una API unificada,
 * manteniendo la firma exacta que usa AdminRouter.jsx y el resto de la app.
 *
 * Hooks internos:
 *   - useBasePermissions  → datos del usuario, hasPermission, hasRole
 *   - useModulePermissions → getModulePermissions, canPerformAction
 *   - useRouteAccess       → canAccessRoute, getDefaultRoute, routeToResourceMap
 *
 * Si necesitas solo una parte del sistema, importa el hook específico directamente.
 */
import { useCallback } from "react";
import { useBasePermissions } from "./useBasePermissions";
import { useModulePermissions } from "./useModulePermissions";
import { useRouteAccess } from "./useRouteAccess";

export const usePermissions = () => {
  const base = useBasePermissions();
  const modules = useModulePermissions();
  const routes = useRouteAccess();

  /**
   * Resumen de permisos del usuario — útil para dashboards de perfil y debug.
   */
  const getPermissionsSummary = useCallback(() => {
    const accessibleRoutes = routes.getAccessibleRoutes();
    const routesByCategory = routes.getRoutesByCategory();
    const permsByCategory = modules.getPermissionsByCategory();

    return {
      isAdmin: base.isAdmin,
      totalModules: base.modulesSummary.length,
      accessibleModules: base.modulesSummary.filter((m) => m.hasAccess).length,
      totalPermissions: base.consolidatedPermissions.length,
      rolesCount: base.userRoles.length,
      specificPermissionsCount: base.specificPermissions.length,
      categories: Object.keys(permsByCategory),
      accessibleRoutes: accessibleRoutes.length,
      defaultRoute: routes.getDefaultRoute(),
      routesByCategory,
      adminRoutes: routes.adminRoutes.length,
      alwaysAccessibleRoutes: routes.alwaysAccessibleRoutes.length,
    };
  }, [base, modules, routes]);

  return {
    // ── Datos del usuario ──────────────────────────────────────────────────
    user: base.user,
    accessToken: base.accessToken,
    isAdmin: base.isAdmin,
    consolidatedPermissions: base.consolidatedPermissions,
    userRoles: base.userRoles,
    specificPermissions: base.specificPermissions,
    modulesSummary: base.modulesSummary,
    availableModules: base.availableModules,

    // ── Mapeos de rutas ────────────────────────────────────────────────────
    routeToResourceMap: routes.routeToResourceMap,
    alwaysAccessibleRoutes: routes.alwaysAccessibleRoutes,
    priorityRoutes: routes.priorityRoutes,
    adminRoutes: routes.adminRoutes,

    // ── Verificación de permisos básicos ───────────────────────────────────
    hasPermission: base.hasPermission,
    hasRole: base.hasRole,
    hasLegacyRole: base.hasLegacyRole,
    hasAnyPermission: base.hasAnyPermission,
    hasAllPermissions: base.hasAllPermissions,

    // ── Permisos de módulos ────────────────────────────────────────────────
    getModulePermissions: modules.getModulePermissions,
    canPerformAction: modules.canPerformAction,

    // ── Acceso a rutas ─────────────────────────────────────────────────────
    canAccessRoute: routes.canAccessRoute,
    getDefaultRoute: routes.getDefaultRoute,
    getAccessibleRoutes: routes.getAccessibleRoutes,
    getRoutesByCategory: routes.getRoutesByCategory,

    // ── Utilidades ─────────────────────────────────────────────────────────
    getPermissionsByCategory: modules.getPermissionsByCategory,
    getPermissionsSummary,

    // ── Shortcuts de conveniencia ──────────────────────────────────────────
    canCreate: modules.canCreate,
    canRead: modules.canRead,
    canUpdate: modules.canUpdate,
    canDelete: modules.canDelete,
    canManage: modules.canManage,
    canExecute: modules.canExecute,
  };
};
