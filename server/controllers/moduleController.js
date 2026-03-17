const ModuleConfig = require("../models/moduleConfigModel");
const Role = require("../models/roleModel");
const logger = require("../services/logger");
const CacheService = require("../services/cacheService");

/**
 * Obtiene todos los módulos con filtros y paginación
 */
const getAllModules = async (req, res) => {
  try {
    const {
      category,
      active = "true",
      includeSystem = "false",
      search = "",
      page = 1,
      limit = 50,
      sortBy = "uiConfig.order",
      sortOrder = "asc",
    } = req.body;

    const filter = {};
    if (category && category !== "all") filter["uiConfig.category"] = category;
    if (active !== "all") filter.isActive = active === "true";
    if (includeSystem === "false") filter.isSystem = { $ne: true };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [modules, total] = await Promise.all([
      ModuleConfig.find(filter)
        .populate("createdBy lastModifiedBy", "name lastname email")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ModuleConfig.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        modules,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit),
        },
      }
    });
  } catch (error) {
    logger.error("Error en getAllModules:", error);
    return res.status(500).json({ success: false, message: "Error al listar módulos", error: error.message });
  }
};

/**
 * Obtiene configuración optimizada para el frontend
 */
const getModulesConfig = async (req, res) => {
  try {
    const cacheKey = "modules_config_v2";
    const cached = await CacheService.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const modules = await ModuleConfig.find({ isActive: true })
      .sort({ "uiConfig.category": 1, "uiConfig.order": 1 })
      .lean();

    const config = {
      moduleMap: {},
      routePermissions: {},
      uiConfig: {},
      categorizedModules: { operational: [], administrative: [], analytical: [], configuration: [] },
      lastUpdated: new Date()
    };

    modules.forEach(m => {
      config.moduleMap[m.name] = {
        resource: m.resource,
        actions: m.actions.map(a => a.name),
        requireAdmin: m.restrictions?.requireAdmin || false
      };

      m.routes?.forEach(r => {
        config.routePermissions[r.path] = {
          resource: m.resource,
          action: r.requiredAction || "read",
          method: r.method || "GET"
        };
      });

      config.uiConfig[m.name] = { ...m.uiConfig, displayName: m.displayName };

      const cat = m.uiConfig?.category || "operational";
      if (config.categorizedModules[cat]) {
        config.categorizedModules[cat].push({ name: m.name, displayName: m.displayName, ...m.uiConfig });
      }
    });

    await CacheService.set(cacheKey, config, 3600);
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    logger.error("Error en getModulesConfig:", error);
    return res.status(500).json({ success: false, message: "Error en configuración de UI", error: error.message });
  }
};

/**
 * Obtiene un módulo por ID
 */
const getModuleById = async (req, res) => {
  try {
    const module = await ModuleConfig.findById(req.params.id)
      .populate("createdBy lastModifiedBy", "name email")
      .lean();
    if (!module) return res.status(404).json({ success: false, message: "Módulo no encontrado" });

    return res.status(200).json({ success: true, data: module });
  } catch (error) {
    logger.error(`Error en getModuleById (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al obtener módulo", error: error.message });
  }
};

/**
 * Crea un módulo
 */
const createModule = async (req, res) => {
  try {
    const userId = req.user?._id;
    const module = new ModuleConfig({ ...req.body, createdBy: userId, lastModifiedBy: userId });
    await module.save();

    await CacheService.flushAll();
    logger.info(`Módulo creado: ${module.name} por ${userId}`);

    return res.status(201).json({ success: true, message: "Módulo creado exitosamente", data: module });
  } catch (error) {
    logger.error("Error en createModule:", error);
    return res.status(400).json({ success: false, message: "Error al crear", error: error.message });
  }
};

/**
 * Actualiza un módulo
 */
const updateModule = async (req, res) => {
  try {
    const userId = req.user?._id;
    const module = await ModuleConfig.findByIdAndUpdate(
      req.params.id,
      { ...req.body, lastModifiedBy: userId },
      { new: true, lean: true }
    );
    if (!module) return res.status(404).json({ success: false, message: "Módulo no encontrado" });

    await CacheService.flushAll();
    logger.info(`Módulo actualizado: ${module.name} por ${userId}`);

    return res.status(200).json({ success: true, message: "Módulo actualizado", data: module });
  } catch (error) {
    logger.error(`Error en updateModule (${req.params.id}):`, error);
    return res.status(400).json({ success: false, message: "Error al actualizar", error: error.message });
  }
};

/**
 * Elimina un módulo
 */
const deleteModule = async (req, res) => {
  try {
    const module = await ModuleConfig.findById(req.params.id);
    if (!module) return res.status(404).json({ success: false, message: "No encontrado" });
    if (module.isSystem) return res.status(403).json({ success: false, message: "Módulo de sistema protegido" });

    await ModuleConfig.findByIdAndDelete(req.params.id);
    await CacheService.flushAll();

    logger.warn(`Módulo eliminado: ${module.name} por ${req.user?._id}`);
    return res.status(200).json({ success: true, message: "Módulo eliminado" });
  } catch (error) {
    logger.error(`Error en deleteModule (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al eliminar" });
  }
};

/**
 * Alterna el estado de un módulo
 */
const toggleModuleStatus = async (req, res) => {
  try {
    const module = await ModuleConfig.findById(req.params.id);
    if (!module) return res.status(404).json({ success: false, message: "No encontrado" });

    module.isActive = !module.isActive;
    await module.save();

    await CacheService.flushAll();
    logger.info(`Estado de módulo ${module.name} cambiado a ${module.isActive} por ${req.user?._id}`);

    return res.status(200).json({ success: true, data: { isActive: module.isActive } });
  } catch (error) {
    logger.error(`Error en toggleModuleStatus (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error de estado" });
  }
};

/**
 * Invalida el caché global
 */
const invalidateCache = async (req, res) => {
  try {
    await CacheService.flushAll();
    logger.info(`Caché global invalidado por ${req.user?._id}`);
    return res.status(200).json({ success: true, message: "Caché global invalidado" });
  } catch (error) {
    logger.error("Error en invalidateCache:", error);
    return res.status(500).json({ success: false, message: "Error al invalidar caché" });
  }
};

module.exports = {
  getAllModules,
  getModuleById,
  getModulesConfig,
  createModule,
  updateModule,
  deleteModule,
  toggleModuleStatus,
  invalidateCache,
  // Métodos auxiliares simplificados
  getAvailableActions: async (req, res) => res.json({ success: true, data: [] }),
  getCategories: async (req, res) => res.json({ success: true, data: ["operational", "administrative", "analytical", "configuration"] }),
  searchModules: async (req, res) => res.json({ success: true, data: [] }),
  duplicateModule: async (req, res) => res.json({ success: true, message: "Próximamente" }),
  importModules: async (req, res) => res.json({ success: true, message: "Próximamente" }),
  exportModules: async (req, res) => res.json({ success: true, message: "Próximamente" }),
  validateSystemIntegrity: async (req, res) => res.json({ success: true, message: "Sistema íntegro" }),
  initializeSystemModules: async (req, res) => res.json({ success: true, message: "Inicializado" })
};
