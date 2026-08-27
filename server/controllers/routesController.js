const RoutesSQLService = require("../services/RoutesSQLService");
const logger = require("../services/logger");

async function getRoutes(req, res) {
  try {
    const { active, search } = req.query;
    const routes = await RoutesSQLService.getRoutes({ active, search });
    return res.status(200).json({
      success: true,
      message: "Rutas obtenidas correctamente",
      data: routes,
    });
  } catch (error) {
    logger.error("Error en getRoutes:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener rutas",
      error: error.message,
    });
  }
}

async function getRouteByCode(req, res) {
  try {
    const route = await RoutesSQLService.getRouteByCode(req.params.codeRoute);
    if (!route) {
      return res.status(404).json({ success: false, message: "Ruta no encontrada" });
    }
    return res.status(200).json({
      success: true,
      message: "Ruta obtenida correctamente",
      data: route,
    });
  } catch (error) {
    logger.error("Error en getRouteByCode:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener la ruta",
      error: error.message,
    });
  }
}

async function createRoute(req, res) {
  try {
    const { codeRoute, description } = req.body;
    if (!codeRoute?.trim() || !description?.trim()) {
      return res.status(400).json({
        success: false,
        message: "codeRoute y description son obligatorios",
      });
    }
    const route = await RoutesSQLService.createRoute({
      codeRoute: codeRoute.trim(),
      description: description.trim(),
    });
    return res.status(201).json({
      success: true,
      message: "Ruta creada correctamente",
      data: route,
    });
  } catch (error) {
    logger.error("Error en createRoute:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al crear la ruta",
    });
  }
}

async function updateRoute(req, res) {
  try {
    const { description } = req.body;
    if (!description?.trim()) {
      return res.status(400).json({ success: false, message: "description es obligatorio" });
    }
    const route = await RoutesSQLService.updateRoute(req.params.codeRoute, {
      description: description.trim(),
    });
    return res.status(200).json({
      success: true,
      message: "Ruta actualizada correctamente",
      data: route,
    });
  } catch (error) {
    logger.error("Error en updateRoute:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al actualizar la ruta",
    });
  }
}

async function toggleRouteActive(req, res) {
  try {
    const { active } = req.body;
    const route = await RoutesSQLService.setActive(req.params.codeRoute, !!active);
    return res.status(200).json({
      success: true,
      message: `Ruta ${active ? "activada" : "desactivada"} correctamente`,
      data: route,
    });
  } catch (error) {
    logger.error("Error en toggleRouteActive:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al cambiar el estado de la ruta",
    });
  }
}

module.exports = {
  getRoutes,
  getRouteByCode,
  createRoute,
  updateRoute,
  toggleRouteActive,
};
