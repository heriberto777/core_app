const RouteAccountsSQLService = require("../services/RouteAccountsSQLService");
const RoutesSQLService = require("../services/RoutesSQLService");
const logger = require("../services/logger");

async function getClients(req, res) {
  try {
    const { seller, routeStatus, routeCode, erpRouteCode, search } = req.query;
    const clients = await RouteAccountsSQLService.getClients({
      seller,
      routeStatus,
      routeCode,
      erpRouteCode,
      search,
    });
    return res.status(200).json({
      success: true,
      message: "Clientes obtenidos correctamente",
      data: clients,
    });
  } catch (error) {
    logger.error("Error en getClients:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener clientes",
      error: error.message,
    });
  }
}

async function getSellersFilter(req, res) {
  try {
    const sellers = await RouteAccountsSQLService.getSellers();
    return res.status(200).json({
      success: true,
      message: "Vendedores obtenidos correctamente",
      data: sellers,
    });
  } catch (error) {
    logger.error("Error en getSellersFilter:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener vendedores",
      error: error.message,
    });
  }
}

async function getRepartidoresFilter(req, res) {
  try {
    const repartidores = await RouteAccountsSQLService.getRepartidores();
    return res.status(200).json({
      success: true,
      message: "Repartidores obtenidos correctamente",
      data: repartidores,
    });
  } catch (error) {
    logger.error("Error en getRepartidoresFilter:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener repartidores",
      error: error.message,
    });
  }
}

async function getErpRoutesFilter(req, res) {
  try {
    const { seller } = req.query;
    const routes = await RouteAccountsSQLService.getErpRoutes(seller);
    return res.status(200).json({
      success: true,
      message: "Rutas del ERP obtenidas correctamente",
      data: routes,
    });
  } catch (error) {
    logger.error("Error en getErpRoutesFilter:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener rutas del ERP",
      error: error.message,
    });
  }
}

async function assignRoute(req, res) {
  try {
    const { clientCodes, codeRoute, codeRepartidor, days, codeFrecuency, codeWeek, organization } = req.body;

    if (!Array.isArray(clientCodes) || clientCodes.length === 0) {
      return res.status(400).json({ success: false, message: "Seleccioná al menos un cliente" });
    }
    if (!codeRoute) {
      return res.status(400).json({ success: false, message: "codeRoute es obligatorio" });
    }
    if (!codeRepartidor) {
      return res.status(400).json({ success: false, message: "codeRepartidor es obligatorio" });
    }
    if (!codeFrecuency) {
      return res.status(400).json({ success: false, message: "codeFrecuency es obligatorio" });
    }
    if (!days || !Object.values(days).some(Boolean)) {
      return res.status(400).json({ success: false, message: "Seleccioná al menos un día de visita" });
    }

    const route = await RoutesSQLService.getRouteByCode(codeRoute);
    if (!route || !route.active) {
      return res.status(400).json({ success: false, message: "La ruta seleccionada no existe o está inactiva" });
    }

    const result = await RouteAccountsSQLService.assignRoute({
      clientCodes,
      codeRoute,
      description: route.description,
      codeRepartidor,
      days,
      codeFrecuency,
      codeWeek,
      organization,
      createdBy: req.user?.email || req.user?.name || null,
    });

    return res.status(200).json({
      success: true,
      message: `Ruta asignada a ${result.assignedCount} cliente(s)`,
      data: result,
    });
  } catch (error) {
    logger.error("Error en assignRoute:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al asignar la ruta",
    });
  }
}

async function removeFromRoute(req, res) {
  try {
    const { clientCodes } = req.body;
    if (!Array.isArray(clientCodes) || clientCodes.length === 0) {
      return res.status(400).json({ success: false, message: "Seleccioná al menos un cliente" });
    }

    const result = await RouteAccountsSQLService.removeFromRoute(clientCodes);
    return res.status(200).json({
      success: true,
      message: `${result.removedCount} cliente(s) removido(s) de su ruta`,
      data: result,
    });
  } catch (error) {
    logger.error("Error en removeFromRoute:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al quitar la ruta",
    });
  }
}

// ─── Ruta de VENTA (Vendedor) — independiente de la de reparto ────────────

async function assignSellerRoute(req, res) {
  try {
    const { clientCodes, codeRoute, days, codeFrecuency, codeWeek, organization } = req.body;

    if (!Array.isArray(clientCodes) || clientCodes.length === 0) {
      return res.status(400).json({ success: false, message: "Seleccioná al menos un cliente" });
    }
    if (!codeRoute) {
      return res.status(400).json({ success: false, message: "codeRoute es obligatorio" });
    }
    if (!codeFrecuency) {
      return res.status(400).json({ success: false, message: "codeFrecuency es obligatorio" });
    }
    if (!days || !Object.values(days).some(Boolean)) {
      return res.status(400).json({ success: false, message: "Seleccioná al menos un día de visita" });
    }

    const route = await RoutesSQLService.getRouteByCode(codeRoute);
    if (!route || !route.active) {
      return res.status(400).json({ success: false, message: "La ruta seleccionada no existe o está inactiva" });
    }

    const result = await RouteAccountsSQLService.assignSellerRoute({
      clientCodes,
      codeRoute,
      description: route.description,
      days,
      codeFrecuency,
      codeWeek,
      organization,
      createdBy: req.user?.email || req.user?.name || null,
    });

    return res.status(200).json({
      success: true,
      message: `Ruta de venta asignada a ${result.assignedCount} cliente(s)`,
      data: result,
    });
  } catch (error) {
    logger.error("Error en assignSellerRoute:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al asignar la ruta de venta",
    });
  }
}

async function removeFromSellerRoute(req, res) {
  try {
    const { clientCodes } = req.body;
    if (!Array.isArray(clientCodes) || clientCodes.length === 0) {
      return res.status(400).json({ success: false, message: "Seleccioná al menos un cliente" });
    }

    const result = await RouteAccountsSQLService.removeFromSellerRoute(clientCodes);
    return res.status(200).json({
      success: true,
      message: `${result.removedCount} cliente(s) removido(s) de su ruta de venta`,
      data: result,
    });
  } catch (error) {
    logger.error("Error en removeFromSellerRoute:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al quitar la ruta de venta",
    });
  }
}

module.exports = {
  getClients,
  getSellersFilter,
  getRepartidoresFilter,
  getErpRoutesFilter,
  assignRoute,
  removeFromRoute,
  assignSellerRoute,
  removeFromSellerRoute,
};
