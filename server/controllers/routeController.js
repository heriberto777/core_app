const RouteConfig = require("../models/modelRouteConfig");
const cacheService = require("../services/cacheService");
const logger = require("../services/logger");

const CACHE_KEYS = {
  ALL_ROUTES: "all_routes",
  ACTIVE_ROUTES: "active_routes",
  USER_ROUTES: (userId) => `user_routes_${userId}`,
  ROUTE_BY_PATH: (path) => `route_${path.replace(/\//g, "_")}`,
};

const CACHE_TTL = {
  ROUTES: 600, // 10 minutos
  USER_ROUTES: 300, // 5 minutos
};

// ⭐ OBTENER TODAS LAS RUTAS ⭐
async function getRoutes(req, res) {
  try {
    const { category, isActive, showInMenu } = req.query;

    const filters = {};
    if (category) filters.category = category;
    if (isActive !== undefined) filters.isActive = isActive === "true";
    if (showInMenu !== undefined) filters.showInMenu = showInMenu === "true";

    const cacheKey = `routes_${JSON.stringify(filters)}`;

    const routes = await cacheService.getOrSet(
      cacheKey,
      async () => {
        return await RouteConfig.find(filters)
          .sort({ category: 1, priority: 1 })
          .lean();
      },
      CACHE_TTL.ROUTES
    );

    res.json({
      success: true,
      data: routes,
    });
  } catch (error) {
    logger.error("Error obteniendo rutas:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener rutas",
      error: error.message,
    });
  }
}

// ⭐ OBTENER RUTAS ACCESIBLES PARA UN USUARIO ⭐
async function getUserAccessibleRoutes(req, res) {
  try {
    const userId = req.user.user_id || req.user._id;
    const { includeRestricted = false } = req.query;

    const cacheKey = CACHE_KEYS.USER_ROUTES(userId);

    const accessibleRoutes = await cacheService.getOrSet(
      cacheKey,
      async () => {
        // Obtener todas las rutas activas
        const allRoutes = await RouteConfig.find({
          isActive: true,
        })
          .sort({ category: 1, priority: 1 })
          .lean();

        // Obtener permisos del usuario (desde el request ya validado)
        const userPermissions = req.user.permissions || [];
        const isAdmin = req.user.isAdmin || false;

        const accessibleRoutes = [];

        for (const route of allRoutes) {
          let hasAccess = false;

          // Verificar si es siempre accesible
          if (route.isAlwaysAccessible) {
            hasAccess = true;
          }
          // Verificar si requiere admin y el usuario es admin
          else if (route.requiresAdmin && !isAdmin) {
            hasAccess = false;
          }
          // Verificar permisos específicos
          else {
            // Si es admin, tiene acceso a todo
            if (isAdmin) {
              hasAccess = true;
            } else {
              // Verificar si tiene el permiso requerido para el recurso
              hasAccess = userPermissions.some(
                (permission) =>
                  permission.resource === route.resource &&
                  (permission.actions.includes(route.requiredAction) ||
                    permission.actions.includes("manage"))
              );
            }
          }

          if (hasAccess) {
            accessibleRoutes.push({
              ...route,
              hasAccess: true,
              accessReason: route.isAlwaysAccessible
                ? "always_accessible"
                : isAdmin
                ? "admin_access"
                : "permission_granted",
            });
          } else if (includeRestricted) {
            accessibleRoutes.push({
              ...route,
              hasAccess: false,
              accessReason: "access_denied",
            });
          }
        }

        return accessibleRoutes;
      },
      CACHE_TTL.USER_ROUTES
    );

    res.json({
      success: true,
      data: {
        routes: accessibleRoutes,
        totalRoutes: accessibleRoutes.length,
        accessibleCount: accessibleRoutes.filter((r) => r.hasAccess).length,
        categories: [...new Set(accessibleRoutes.map((r) => r.category))],
      },
    });
  } catch (error) {
    logger.error("Error obteniendo rutas de usuario:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener rutas accesibles",
      error: error.message,
    });
  }
}

// ⭐ CREAR NUEVA RUTA ⭐
async function createRoute(req, res) {
  try {
    const routeData = req.body;

    // Verificar que la ruta no exista
    const existingRoute = await RouteConfig.findOne({ path: routeData.path });
    if (existingRoute) {
      return res.status(400).json({
        success: false,
        message: "La ruta ya existe",
      });
    }

    const newRoute = new RouteConfig(routeData);
    await newRoute.save();

    // Invalidar caches
    await invalidateRouteCaches();

    logger.info(`✅ Ruta creada: ${newRoute.path}`, {
      userId: req.user._id,
      routeId: newRoute._id,
    });

    res.status(201).json({
      success: true,
      message: "Ruta creada exitosamente",
      data: newRoute,
    });
  } catch (error) {
    logger.error("Error creando ruta:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear ruta",
      error: error.message,
    });
  }
}

// ⭐ ACTUALIZAR RUTA ⭐
async function updateRoute(req, res) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedRoute = await RouteConfig.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedRoute) {
      return res.status(404).json({
        success: false,
        message: "Ruta no encontrada",
      });
    }

    // Invalidar caches
    await invalidateRouteCaches();

    logger.info(`✅ Ruta actualizada: ${updatedRoute.path}`, {
      userId: req.user._id,
      routeId: updatedRoute._id,
    });

    res.json({
      success: true,
      message: "Ruta actualizada exitosamente",
      data: updatedRoute,
    });
  } catch (error) {
    logger.error("Error actualizando ruta:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar ruta",
      error: error.message,
    });
  }
}

// ⭐ OBTENER RUTA POR DEFECTO PARA USUARIO ⭐
async function getUserDefaultRoute(req, res) {
  try {
    const userId = req.user.user_id || req.user._id;

    const defaultRoute = await cacheService.getOrSet(
      `default_route_${userId}`,
      async () => {
        // Obtener rutas accesibles ordenadas por prioridad
        const accessibleRoutes = await RouteConfig.find({
          isActive: true,
          showInMenu: true,
        })
          .sort({ priority: 1 })
          .lean();

        const userPermissions = req.user.permissions || [];
        const isAdmin = req.user.isAdmin || false;

        for (const route of accessibleRoutes) {
          // Saltar dashboard (será el fallback)
          if (route.path === "/dashboard") continue;

          let hasAccess = false;

          if (route.isAlwaysAccessible) {
            hasAccess = true;
          } else if (route.requiresAdmin && !isAdmin) {
            hasAccess = false;
          } else if (isAdmin) {
            hasAccess = true;
          } else {
            hasAccess = userPermissions.some(
              (permission) =>
                permission.resource === route.resource &&
                (permission.actions.includes(route.requiredAction) ||
                  permission.actions.includes("manage"))
            );
          }

          if (hasAccess) {
            return route.path;
          }
        }

        // Fallback al dashboard
        return "/dashboard";
      },
      CACHE_TTL.USER_ROUTES
    );

    res.json({
      success: true,
      data: {
        defaultRoute: defaultRoute,
        reason: defaultRoute === "/dashboard" ? "fallback" : "priority_based",
      },
    });
  } catch (error) {
    logger.error("Error obteniendo ruta por defecto:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener ruta por defecto",
      error: error.message,
    });
  }
}

// ⭐ INVALIDAR CACHES DE RUTAS ⭐
async function invalidateRouteCaches() {
  try {
    await cacheService.invalidatePattern("routes_");
    await cacheService.invalidatePattern("user_routes_");
    await cacheService.invalidatePattern("default_route_");
    await cacheService.delete(CACHE_KEYS.ALL_ROUTES);
    await cacheService.delete(CACHE_KEYS.ACTIVE_ROUTES);

    logger.info("🗑️ Caches de rutas invalidados");
  } catch (error) {
    logger.error("Error invalidando caches de rutas:", error);
  }
}

module.exports = {
  getRoutes,
  getUserAccessibleRoutes,
  createRoute,
  updateRoute,
  getUserDefaultRoute,
  invalidateRouteCaches,
};
