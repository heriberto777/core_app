const TrucksSQLService = require("../services/TrucksSQLService");
const RouteAccountsSQLService = require("../services/RouteAccountsSQLService");
const logger = require("../services/logger");

async function getTrucks(req, res) {
  try {
    const { active, search } = req.query;
    const trucks = await TrucksSQLService.getTrucks({ active, search });
    return res.status(200).json({
      success: true,
      message: "Camiones obtenidos correctamente",
      data: trucks,
    });
  } catch (error) {
    logger.error("Error en getTrucks:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener camiones",
      error: error.message,
    });
  }
}

// Mismo catálogo de repartidores que ya usa Centro de Carga de Rutas — no
// se duplica la consulta, se reutiliza tal cual.
async function getRepartidores(req, res) {
  try {
    const repartidores = await RouteAccountsSQLService.getRepartidores();
    return res.status(200).json({
      success: true,
      message: "Repartidores obtenidos correctamente",
      data: repartidores,
    });
  } catch (error) {
    logger.error("Error en getRepartidores (trucks):", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener repartidores",
      error: error.message,
    });
  }
}

async function createTruck(req, res) {
  try {
    const { code, description, plate, codeSeller, organization } = req.body;
    if (!code?.trim() || !description?.trim()) {
      return res.status(400).json({
        success: false,
        message: "code y description son obligatorios",
      });
    }
    const truck = await TrucksSQLService.createTruck({
      code: code.trim(),
      description: description.trim(),
      plate: plate?.trim() || null,
      codeSeller: codeSeller || null,
      organization,
      createdBy: req.user?.email || req.user?.name || null,
    });
    return res.status(201).json({
      success: true,
      message: "Camión creado correctamente",
      data: truck,
    });
  } catch (error) {
    logger.error("Error en createTruck:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al crear el camión",
    });
  }
}

async function updateTruck(req, res) {
  try {
    const { description, plate, codeSeller, organization } = req.body;
    if (!description?.trim()) {
      return res.status(400).json({ success: false, message: "description es obligatorio" });
    }
    const truck = await TrucksSQLService.updateTruck(req.params.code, {
      description: description.trim(),
      plate: plate?.trim() || null,
      codeSeller: codeSeller || null,
      organization,
    });
    return res.status(200).json({
      success: true,
      message: "Camión actualizado correctamente",
      data: truck,
    });
  } catch (error) {
    logger.error("Error en updateTruck:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al actualizar el camión",
    });
  }
}

async function toggleTruckActive(req, res) {
  try {
    const { active } = req.body;
    const truck = await TrucksSQLService.setActive(req.params.code, !!active);
    return res.status(200).json({
      success: true,
      message: `Camión ${active ? "activado" : "desactivado"} correctamente`,
      data: truck,
    });
  } catch (error) {
    logger.error("Error en toggleTruckActive:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Error al cambiar el estado del camión",
    });
  }
}

module.exports = {
  getTrucks,
  getRepartidores,
  createTruck,
  updateTruck,
  toggleTruckActive,
};
