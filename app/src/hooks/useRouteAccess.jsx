/**
 * useRouteAccess.jsx
 * Hook especializado: determina qué rutas puede visitar el usuario.
 *
 * Responsabilidad única: construir el mapa de rutas y responder
 * "¿puede el usuario acceder a la ruta X?".
 * Depende de useBasePermissions y useModulePermissions.
 */
import { useMemo, useCallback } from "react";
import { useBasePermissions } from "./useBasePermissions";
import { useModulePermissions } from "./useModulePermissions";

export const useRouteAccess = () => {
    const {
        isAdmin,
        modulesSummary,
        availableModules,
        consolidatedPermissions,
        hasPermission,
    } = useBasePermissions();

    const { getModulePermissions } = useModulePermissions();

    // Mapa dinámico: ruta → resource (construido desde los módulos del backend)
    const routeToResourceMap = useMemo(() => {
        const map = {};

        const addRoutes = (modules) => {
            modules.forEach((module) => {
                if (module.routes && Array.isArray(module.routes)) {
                    module.routes.forEach((route) => {
                        if (route.path && !map[route.path]) {
                            map[route.path] = module.resource;
                        }
                    });
                } else {
                    const defaultPath = `/${module.name}`;
                    if (!map[defaultPath]) map[defaultPath] = module.resource;
                }
            });
        };

        addRoutes(modulesSummary);
        addRoutes(availableModules);

        // Registro manual para rutas operativas nuevas
        if (!map["/universal-manager"]) map["/universal-manager"] = "documents";

        // Fallback: rutas desde permisos consolidados
        consolidatedPermissions.forEach((permission) => {
            const defaultPath = `/${permission.resource}`;
            if (!map[defaultPath]) map[defaultPath] = permission.resource;
        });

        return map;
    }, [modulesSummary, availableModules, consolidatedPermissions]);

    // Rutas siempre accesibles (definidas dinámicamente por el backend)
    const alwaysAccessibleRoutes = useMemo(() => {
        const routes = [];

        modulesSummary.forEach((module) => {
            if (module.isAlwaysAccessible || module.restrictions?.isAlwaysAccessible) {
                if (module.routes && Array.isArray(module.routes)) {
                    module.routes.forEach((route) => {
                        if (route.path) routes.push(route.path);
                    });
                } else {
                    routes.push(`/${module.name}`);
                }
            }
        });

        // Perfil y dashboard siempre accesibles si no está definido en módulos
        if (!routes.some((r) => r.includes("perfil") || r.includes("profile"))) {
            routes.push("/perfil", "/profile");
        }
        if (!routes.includes("/dashboard")) routes.push("/dashboard");

        return routes;
    }, [modulesSummary]);

    // Rutas que requieren admin
    const adminRoutes = useMemo(() => {
        const routes = [];
        modulesSummary.forEach((module) => {
            if (module.restrictions?.requireAdmin || module.requiresAdmin) {
                if (module.routes && Array.isArray(module.routes)) {
                    module.routes.forEach((route) => {
                        if (route.path) routes.push(route.path);
                    });
                } else {
                    routes.push(`/${module.name}`);
                }
            }
        });
        return routes;
    }, [modulesSummary]);

    // Rutas ordenadas por prioridad (para encontrar la ruta default del usuario)
    const priorityRoutes = useMemo(() => {
        const routes = [];
        const sortedModules = [...modulesSummary]
            .filter((m) => m.hasAccess && m.showInMenu !== false)
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

    /** Retorna true si el usuario puede acceder a la ruta dada. */
    const canAccessRoute = useCallback(
        (routePath) => {
            if (alwaysAccessibleRoutes.includes(routePath)) return true;

            const resource = routeToResourceMap[routePath];
            if (!resource) return false;

            if (adminRoutes.includes(routePath) && !isAdmin) return false;

            return hasPermission(resource, "read");
        },
        [alwaysAccessibleRoutes, routeToResourceMap, adminRoutes, isAdmin, hasPermission]
    );

    /** Retorna la primera ruta accesible según prioridad del backend. */
    const getDefaultRoute = useCallback(() => {
        for (const { route } of priorityRoutes) {
            if (canAccessRoute(route)) return route;
        }

        const fallback = Object.keys(routeToResourceMap).find(
            (route) =>
                canAccessRoute(route) && !alwaysAccessibleRoutes.includes(route)
        );

        return fallback || "/dashboard";
    }, [priorityRoutes, canAccessRoute, routeToResourceMap, alwaysAccessibleRoutes]);

    /** Retorna la lista de rutas accesibles para el usuario actual. */
    const getAccessibleRoutes = useCallback(
        () => Object.keys(routeToResourceMap).filter(canAccessRoute),
        [routeToResourceMap, canAccessRoute]
    );

    /** Retorna las rutas accesibles agrupadas por categoría. */
    const getRoutesByCategory = useCallback(() => {
        return Object.keys(routeToResourceMap).reduce((categories, routePath) => {
            if (!canAccessRoute(routePath)) return categories;

            const moduleInfo = modulesSummary.find(
                (m) =>
                    m.routes?.some((r) => r.path === routePath) ||
                    `/${m.name}` === routePath
            );

            const category = moduleInfo?.category || "general";
            if (!categories[category]) categories[category] = [];

            categories[category].push({
                path: routePath,
                resource: routeToResourceMap[routePath],
                displayName: moduleInfo?.displayName || routePath,
                icon: moduleInfo?.uiConfig?.icon,
                color: moduleInfo?.uiConfig?.color,
                priority: moduleInfo?.uiConfig?.order || moduleInfo?.priority || 999,
            });

            // Ordenar dentro de cada categoría
            categories[category].sort((a, b) => (a.priority || 999) - (b.priority || 999));
            return categories;
        }, {});
    }, [routeToResourceMap, canAccessRoute, modulesSummary]);

    return {
        routeToResourceMap,
        alwaysAccessibleRoutes,
        adminRoutes,
        priorityRoutes,
        canAccessRoute,
        getDefaultRoute,
        getAccessibleRoutes,
        getRoutesByCategory,
    };
};
