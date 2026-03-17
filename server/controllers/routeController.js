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

/**
 * Obtener todas las rutas con filtros
 */
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
      async () => RouteConfig.find(filters).sort({ category: 1, priority: 1 }).lean(),
      CACHE_TTL.ROUTES
    );

    return res.status(200).json({
      success: true,
      message: "Configuraciones de ruta obtenidas correctamente",
      data: routes,
    });
  } catch (error) {
    logger.error("Error en getRoutes:", error);
    return res.status(500).json({ success: false, message: "Error al obtener rutas", error: error.message });
  }
}

/**
 * Obtener rutas accesibles para el usuario actual
 */
async function getUserAccessibleRoutes(req, res) {
  try {
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";
    const { includeRestricted = false } = req.query;
    const cacheKey = CACHE_KEYS.USER_ROUTES(userId);

    const accessibleRoutes = await cacheService.getOrSet(
      cacheKey,
      async () => {
        const allRoutes = await RouteConfig.find({ isActive: true }).sort({ category: 1, priority: 1 }).lean();
        const userPermissions = req.user.permissions || [];
        const isAdmin = req.user.isAdmin || false;

        const results = [];
        for (const route of allRoutes) {
          let hasAccess = false;
          let reason = "access_denied";

          if (route.isAlwaysAccessible) {
            hasAccess = true;
            reason = "always_accessible";
          } else if (isAdmin) {
            hasAccess = true;
            reason = "admin_access";
          } else if (route.requiresAdmin) {
            hasAccess = false;
          } else {
            hasAccess = userPermissions.some(p =>
              p.resource === route.resource &&
              (p.actions.includes(route.requiredAction) || p.actions.includes("manage"))
            );
            if (hasAccess) reason = "permission_granted";
          }

          if (hasAccess || includeRestricted) {
            results.push({ ...route, hasAccess, accessReason: reason });
          }
        }
        return results;
      },
      CACHE_TTL.USER_ROUTES
    );

    return res.status(200).json({
      success: true,
      message: "Rutas accesibles obtenidas correctamente",
      data: {
        routes: accessibleRoutes,
        totalRoutes: accessibleRoutes.length,
        accessibleCount: accessibleRoutes.filter(r => r.hasAccess).length,
        categories: [...new Set(accessibleRoutes.map(r => r.category))],
      },
    });
  } catch (error) {
    logger.error("Error en getUserAccessibleRoutes:", error);
    return res.status(500).json({ success: false, message: "Error al obtener rutas accesibles", error: error.message });
  }
}

/**
 * Crear nueva ruta
 */
async function createRoute(req, res) {
  try {
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";
    const existingRoute = await RouteConfig.findOne({ path: req.body.path }).lean();

    if (existingRoute) return res.status(400).json({ success: false, message: "La ruta ya existe" });

    const newRoute = new RouteConfig(req.body);
    await newRoute.save();

    await invalidateRouteCaches();
    logger.info(`Ruta creada: ${newRoute.path} por ${userId}`);

    return res.status(201).json({
      success: true,
      message: "Ruta creada exitosamente",
      data: newRoute,
    });
  } catch (error) {
    logger.error("Error en createRoute:", error);
    return res.status(500).json({ success: false, message: "Error al crear ruta", error: error.message });
  }
}

/**
 * Actualizar ruta
 */
async function updateRoute(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    const updatedRoute = await RouteConfig.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

    if (!updatedRoute) return res.status(404).json({ success: false, message: "Ruta no encontrada" });

    await invalidateRouteCaches();
    logger.info(`Ruta actualizada: ${updatedRoute.path} por ${userId}`);

    return res.status(200).json({
      success: true,
      message: "Ruta actualizada exitosamente",
      data: updatedRoute,
    });
  } catch (error) {
    logger.error(`Error en updateRoute (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al actualizar ruta", error: error.message });
  }
}

/**
 * Obtener ruta por defecto para el usuario
 */
async function getUserDefaultRoute(req, res) {
  try {
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    const defaultRoute = await cacheService.getOrSet(
      `default_route_${userId}`,
      async () => {
        const accessibleRoutes = await RouteConfig.find({ isActive: true, showInMenu: true }).sort({ priority: 1 }).lean();
        const userPermissions = req.user.permissions || [];
        const isAdmin = req.user.isAdmin || false;

        for (const route of accessibleRoutes) {
          if (route.path === "/dashboard") continue;

          let hasAccess = false;
          if (route.isAlwaysAccessible || isAdmin) {
            hasAccess = true;
          } else if (!route.requiresAdmin) {
            hasAccess = userPermissions.some(p =>
              p.resource === route.resource &&
              (p.actions.includes(route.requiredAction) || p.actions.includes("manage"))
            );
          }

          if (hasAccess) return route.path;
        }
        return "/dashboard";
      },
      CACHE_TTL.USER_ROUTES
    );

    return res.status(200).json({
      success: true,
      message: "Ruta por defecto obtenida",
      data: { defaultRoute, reason: defaultRoute === "/dashboard" ? "fallback" : "priority_based" },
    });
  } catch (error) {
    logger.error("Error en getUserDefaultRoute:", error);
    return res.status(500).json({ success: false, message: "Error al obtener ruta por defecto", error: error.message });
  }
}

/**
 * Invalida caches de rutas
 */
async function invalidateRouteCaches() {
  try {
    await cacheService.invalidatePattern("routes_");
    await cacheService.invalidatePattern("user_routes_");
    await cacheService.invalidatePattern("default_route_");
    await cacheService.delete(CACHE_KEYS.ALL_ROUTES);
    await cacheService.delete(CACHE_KEYS.ACTIVE_ROUTES);
    logger.info("Caches de rutas invalidados globalmente");
  } catch (error) {
    logger.error("Error en invalidateRouteCaches:", error);
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
