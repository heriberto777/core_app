// hooks/usePermissions.jsx - Versión 100% dinámica basada en datos del backend
import { useMemo, useCallback } from "react";
import { useAuth } from "./useAuth";

export const usePermissions = () => {
  const { user, accessToken } = useAuth();

  // ⭐ DATOS DINÁMICOS DEL BACKEND ⭐
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

  // ⭐ MAPEO DE RUTAS DINÁMICO (100% BASADO EN MÓDULOS DEL BACKEND) ⭐
  const routeToResourceMap = useMemo(() => {
    const dynamicMap = {};

    // Construir mapeo dinámico basado en módulos del backend
    modulesSummary.forEach((module) => {
      // Si el módulo tiene rutas definidas, usarlas
      if (module.routes && Array.isArray(module.routes)) {
        module.routes.forEach((route) => {
          if (route.path) {
            dynamicMap[route.path] = module.resource;
          }
        });
      } else {
        // Generar ruta por defecto basada en el nombre del módulo
        const defaultPath = `/${module.name}`;
        dynamicMap[defaultPath] = module.resource;
      }
    });

    // Agregar módulos adicionales que no estén en modulesSummary
    availableModules.forEach((module) => {
      if (module.routes && Array.isArray(module.routes)) {
        module.routes.forEach((route) => {
          if (route.path && !dynamicMap[route.path]) {
            dynamicMap[route.path] = module.resource;
          }
        });
      } else if (!dynamicMap[`/${module.name}`]) {
        dynamicMap[`/${module.name}`] = module.resource;
      }
    });

    // Agregar rutas basadas en permisos consolidados si no existen
    consolidatedPermissions.forEach((permission) => {
      const defaultPath = `/${permission.resource}`;
      if (!dynamicMap[defaultPath]) {
        dynamicMap[defaultPath] = permission.resource;
      }
    });

    return dynamicMap;
  }, [modulesSummary, availableModules, consolidatedPermissions]);

  // ⭐ RUTAS SIEMPRE ACCESIBLES (DINÁMICO BASADO EN MÓDULOS) ⭐
  const alwaysAccessibleRoutes = useMemo(() => {
    const alwaysAccessible = [];

    // Buscar módulos marcados como siempre accesibles
    modulesSummary.forEach((module) => {
      if (
        module.isAlwaysAccessible ||
        module.restrictions?.isAlwaysAccessible
      ) {
        if (module.routes && Array.isArray(module.routes)) {
          module.routes.forEach((route) => {
            if (route.path) {
              alwaysAccessible.push(route.path);
            }
          });
        } else {
          alwaysAccessible.push(`/${module.name}`);
        }
      }
    });

    // Agregar rutas de perfil por defecto si no están definidas
    if (
      !alwaysAccessible.some(
        (route) => route.includes("perfil") || route.includes("profile")
      )
    ) {
      alwaysAccessible.push("/perfil", "/profile");
    }

    // Dashboard siempre accesible si no está definido
    if (!alwaysAccessible.includes("/dashboard")) {
      alwaysAccessible.push("/dashboard");
    }

    return alwaysAccessible;
  }, [modulesSummary]);

  // ⭐ RUTAS PRIORITARIAS (DINÁMICO BASADO EN ORDEN DE MÓDULOS) ⭐
  const priorityRoutes = useMemo(() => {
    const routes = [];

    // Ordenar módulos por prioridad/order definido en el backend
    const sortedModules = [...modulesSummary]
      .filter((module) => module.hasAccess && module.showInMenu !== false)
      .sort((a, b) => {
        const orderA = a.uiConfig?.order || a.priority || 999;
        const orderB = b.uiConfig?.order || b.priority || 999;
        return orderA - orderB;
      });

    sortedModules.forEach((module) => {
      if (module.routes && Array.isArray(module.routes)) {
        module.routes.forEach((route) => {
          if (route.path && route.isMain !== false) {
            routes.push({
              route: route.path,
              resource: module.resource,
              priority: module.uiConfig?.order || module.priority || 999,
              category: module.category,
            });
          }
        });
      } else {
        routes.push({
          route: `/${module.name}`,
          resource: module.resource,
          priority: module.uiConfig?.order || module.priority || 999,
          category: module.category,
        });
      }
    });

    return routes;
  }, [modulesSummary]);

  // ⭐ RUTAS ADMINISTRATIVAS (DINÁMICO BASADO EN RESTRICCIONES) ⭐
  const adminRoutes = useMemo(() => {
    const routes = [];

    modulesSummary.forEach((module) => {
      if (module.restrictions?.requireAdmin || module.requiresAdmin) {
        if (module.routes && Array.isArray(module.routes)) {
          module.routes.forEach((route) => {
            if (route.path) {
              routes.push(route.path);
            }
          });
        } else {
          routes.push(`/${module.name}`);
        }
      }
    });

    return routes;
  }, [modulesSummary]);

  // ⭐ VERIFICAR SI TIENE PERMISO ESPECÍFICO ⭐
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

  // ⭐ VERIFICAR MÚLTIPLES PERMISOS ⭐
  const hasAnyPermission = useCallback(
    (permissionChecks) => {
      if (!Array.isArray(permissionChecks)) return false;
      return permissionChecks.some(({ resource, action }) =>
        hasPermission(resource, action)
      );
    },
    [hasPermission]
  );

  const hasAllPermissions = useCallback(
    (permissionChecks) => {
      if (!Array.isArray(permissionChecks)) return false;
      return permissionChecks.every(({ resource, action }) =>
        hasPermission(resource, action)
      );
    },
    [hasPermission]
  );

  // ⭐ VERIFICAR ROLES ⭐
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

  // ⭐ VERIFICAR ROLES LEGACY ⭐
  const hasLegacyRole = useCallback(
    (roleName) => {
      if (!user?.role) return false;
      return Array.isArray(user.role)
        ? user.role.includes(roleName)
        : user.role === roleName;
    },
    [user?.role]
  );

  // ⭐ OBTENER PERMISOS DE MÓDULO ESPECÍFICO (100% DINÁMICO) ⭐
  const getModulePermissions = useCallback(
    (moduleName) => {
      // Buscar en modulesSummary primero (información más completa)
      const moduleInfo = modulesSummary.find(
        (m) => m.name === moduleName || m.resource === moduleName
      );

      if (moduleInfo) {
        return {
          canAccess: moduleInfo.hasAccess,
          actions: moduleInfo.permissions || [],
          availableActions: moduleInfo.availableActions || [],
          canCreate: moduleInfo.permissions?.includes("create") || false,
          canRead: moduleInfo.permissions?.includes("read") || false,
          canUpdate: moduleInfo.permissions?.includes("update") || false,
          canDelete: moduleInfo.permissions?.includes("delete") || false,
          canExecute: moduleInfo.permissions?.includes("execute") || false,
          canManage: moduleInfo.permissions?.includes("manage") || false,
          moduleName: moduleInfo.displayName || moduleInfo.name,
          category: moduleInfo.category,
          icon: moduleInfo.uiConfig?.icon,
          color: moduleInfo.uiConfig?.color,
          showInMenu: moduleInfo.showInMenu,
          showInDashboard: moduleInfo.showInDashboard,
          priority: moduleInfo.uiConfig?.order || moduleInfo.priority,
        };
      }

      // Fallback: buscar en availableModules
      const availableModule = availableModules.find(
        (m) => m.name === moduleName || m.resource === moduleName
      );

      if (availableModule) {
        return {
          canAccess: availableModule.hasAccess,
          actions: availableModule.permissions || [],
          availableActions: availableModule.availableActions || [],
          canCreate: availableModule.permissions?.includes("create") || false,
          canRead: availableModule.permissions?.includes("read") || false,
          canUpdate: availableModule.permissions?.includes("update") || false,
          canDelete: availableModule.permissions?.includes("delete") || false,
          canExecute: availableModule.permissions?.includes("execute") || false,
          canManage: availableModule.permissions?.includes("manage") || false,
          moduleName: availableModule.displayName || availableModule.name,
          category: availableModule.category,
        };
      }

      // Fallback final: buscar en permisos consolidados
      const permission = consolidatedPermissions.find(
        (p) => p.resource === moduleName
      );

      if (permission) {
        return {
          canAccess: true,
          actions: permission.actions || [],
          availableActions: permission.actions || [],
          canCreate: permission.actions?.includes("create") || false,
          canRead: permission.actions?.includes("read") || false,
          canUpdate: permission.actions?.includes("update") || false,
          canDelete: permission.actions?.includes("delete") || false,
          canExecute: permission.actions?.includes("execute") || false,
          canManage: permission.actions?.includes("manage") || false,
          moduleName: permission.moduleName || permission.resource,
          category: permission.category || "unknown",
        };
      }

      // Sin acceso
      return {
        canAccess: false,
        actions: [],
        availableActions: [],
        canCreate: false,
        canRead: false,
        canUpdate: false,
        canDelete: false,
        canExecute: false,
        canManage: false,
        moduleName: moduleName,
        category: "unknown",
      };
    },
    [modulesSummary, availableModules, consolidatedPermissions]
  );

  // ⭐ VERIFICAR ACCESO A RUTAS (100% DINÁMICO) ⭐
  const canAccessRoute = useCallback(
    (routePath) => {
      // Rutas que siempre son accesibles (definidas dinámicamente)
      if (alwaysAccessibleRoutes.includes(routePath)) return true;

      // Obtener recurso asociado a la ruta (mapeo dinámico)
      const resource = routeToResourceMap[routePath];
      if (!resource) {
        console.warn(`⚠️ Ruta no mapeada dinámicamente: ${routePath}`);
        return false;
      }

      // Para rutas administrativas, verificar también que sea admin
      if (adminRoutes.includes(routePath) && !isAdmin) {
        return false;
      }

      return hasPermission(resource, "read");
    },
    [
      alwaysAccessibleRoutes,
      routeToResourceMap,
      adminRoutes,
      isAdmin,
      hasPermission,
    ]
  );

  // ⭐ OBTENER RUTA POR DEFECTO (100% DINÁMICO BASADO EN PRIORIDADES) ⭐
  const getDefaultRoute = useCallback(() => {
    // Buscar la primera ruta prioritaria accesible (orden dinámico del backend)
    for (const { route } of priorityRoutes) {
      if (canAccessRoute(route)) {
        return route;
      }
    }

    // Fallback: buscar cualquier ruta accesible
    const accessibleRoutes = Object.keys(routeToResourceMap).filter(
      (route) =>
        canAccessRoute(route) && !alwaysAccessibleRoutes.includes(route)
    );

    if (accessibleRoutes.length > 0) {
      return accessibleRoutes[0];
    }

    // Por defecto, dashboard (siempre accesible)
    return "/dashboard";
  }, [
    priorityRoutes,
    canAccessRoute,
    routeToResourceMap,
    alwaysAccessibleRoutes,
  ]);

  // ⭐ OBTENER RUTAS ACCESIBLES (100% DINÁMICO) ⭐
  const getAccessibleRoutes = useCallback(() => {
    return Object.keys(routeToResourceMap).filter((route) =>
      canAccessRoute(route)
    );
  }, [routeToResourceMap, canAccessRoute]);

  // ⭐ OBTENER RUTAS POR CATEGORÍA (DINÁMICO) ⭐
  const getRoutesByCategory = useCallback(() => {
    const categories = {};

    Object.keys(routeToResourceMap).forEach((routePath) => {
      if (canAccessRoute(routePath)) {
        const moduleInfo = modulesSummary.find(
          (m) =>
            m.routes?.some((r) => r.path === routePath) ||
            `/${m.name}` === routePath
        );

        const category = moduleInfo?.category || "general";
        if (!categories[category]) {
          categories[category] = [];
        }

        categories[category].push({
          path: routePath,
          resource: routeToResourceMap[routePath],
          displayName: moduleInfo?.displayName || routePath,
          icon: moduleInfo?.uiConfig?.icon,
          color: moduleInfo?.uiConfig?.color,
          priority: moduleInfo?.uiConfig?.order || moduleInfo?.priority || 999,
        });
      }
    });

    // Ordenar rutas dentro de cada categoría por prioridad
    Object.keys(categories).forEach((category) => {
      categories[category].sort(
        (a, b) => (a.priority || 999) - (b.priority || 999)
      );
    });

    return categories;
  }, [routeToResourceMap, canAccessRoute, modulesSummary]);

  // ⭐ OBTENER PERMISOS POR CATEGORÍA (DINÁMICO) ⭐
  const getPermissionsByCategory = useCallback(() => {
    const categories = {};

    consolidatedPermissions.forEach((permission) => {
      const category = permission.category || "general";
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(permission);
    });

    return categories;
  }, [consolidatedPermissions]);

  // ⭐ VERIFICAR SI PUEDE REALIZAR ACCIÓN EN MÓDULO ⭐
  const canPerformAction = useCallback(
    (moduleName, action) => {
      const modulePermissions = getModulePermissions(moduleName);
      return (
        modulePermissions.canAccess &&
        (modulePermissions.actions.includes(action) ||
          modulePermissions.actions.includes("manage"))
      );
    },
    [getModulePermissions]
  );

  // ⭐ OBTENER RESUMEN DE PERMISOS (DINÁMICO) ⭐
  const getPermissionsSummary = useCallback(() => {
    const accessibleRoutes = getAccessibleRoutes();
    const routesByCategory = getRoutesByCategory();

    return {
      isAdmin,
      totalModules: modulesSummary.length,
      accessibleModules: modulesSummary.filter((m) => m.hasAccess).length,
      totalPermissions: consolidatedPermissions.length,
      rolesCount: userRoles.length,
      specificPermissionsCount: specificPermissions.length,
      categories: Object.keys(getPermissionsByCategory()),
      accessibleRoutes: accessibleRoutes.length,
      defaultRoute: getDefaultRoute(),
      routesByCategory: routesByCategory,
      adminRoutes: adminRoutes.length,
      alwaysAccessibleRoutes: alwaysAccessibleRoutes.length,
    };
  }, [
    isAdmin,
    modulesSummary,
    consolidatedPermissions,
    userRoles,
    specificPermissions,
    getPermissionsByCategory,
    getAccessibleRoutes,
    getDefaultRoute,
    getRoutesByCategory,
    adminRoutes,
    alwaysAccessibleRoutes,
  ]);

  return {
    // ⭐ DATOS DINÁMICOS DEL BACKEND ⭐
    user,
    accessToken,
    isAdmin,
    consolidatedPermissions,
    userRoles,
    specificPermissions,
    modulesSummary,
    availableModules,

    // ⭐ MAPEOS DINÁMICOS CALCULADOS ⭐
    routeToResourceMap,
    alwaysAccessibleRoutes,
    priorityRoutes,
    adminRoutes,

    // ⭐ FUNCIONES DE VERIFICACIÓN BÁSICAS ⭐
    hasPermission,
    hasRole,
    hasLegacyRole,
    hasAnyPermission,
    hasAllPermissions,

    // ⭐ FUNCIONES DE MÓDULOS (DINÁMICAS) ⭐
    getModulePermissions,
    canPerformAction,

    // ⭐ FUNCIONES DE RUTAS (100% DINÁMICAS) ⭐
    canAccessRoute,
    getDefaultRoute,
    getAccessibleRoutes,
    getRoutesByCategory,

    // ⭐ UTILIDADES AVANZADAS (DINÁMICAS) ⭐
    getPermissionsByCategory,
    getPermissionsSummary,

    // ⭐ FUNCIONES DE CONVENIENCIA ⭐
    canCreate: (resource) => hasPermission(resource, "create"),
    canRead: (resource) => hasPermission(resource, "read"),
    canUpdate: (resource) => hasPermission(resource, "update"),
    canDelete: (resource) => hasPermission(resource, "delete"),
    canManage: (resource) => hasPermission(resource, "manage"),
    canExecute: (resource) => hasPermission(resource, "execute"),
  };
};
