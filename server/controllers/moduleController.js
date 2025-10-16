const ModuleConfig = require("../models/moduleConfigModel");
const { validationResult } = require("express-validator");
const logger = require("../services/logger");
const CacheService = require("../services/cacheService");

class ModuleController {
  // ⭐ OBTENER TODOS LOS MÓDULOS ⭐
  async getAllModules(req, res) {
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

      console.log("Obteniendo datos ", req.body);

      // Construir filtro
      const filter = {};

      if (category && category !== "all") {
        filter["uiConfig.category"] = category;
      }

      if (active !== "all") {
        filter.isActive = active === "true";
      }

      if (includeSystem === "false") {
        filter.isSystem = { $ne: true };
      }

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { displayName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      // Configurar paginación
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      // Ejecutar consulta
      const [modules, total] = await Promise.all([
        ModuleConfig.find(filter)
          .populate("createdBy lastModifiedBy", "name lastname email")
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit)),
        ModuleConfig.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: modules,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit),
        },
      });
    } catch (error) {
      logger.error("Error al obtener módulos:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener módulos",
        error: error.message,
      });
    }
  }

  // ⭐ OBTENER MÓDULO POR ID ⭐
  async getModuleById(req, res) {
    try {
      const { id } = req.params;

      const module = await ModuleConfig.findById(id).populate(
        "createdBy lastModifiedBy",
        "name lastname email"
      );

      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Módulo no encontrado",
        });
      }

      res.json({
        success: true,
        data: module,
      });
    } catch (error) {
      logger.error("Error al obtener módulo:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener módulo",
        error: error.message,
      });
    }
  }

  // ⭐ CREAR MÓDULO ⭐
  async createModule(req, res) {
    try {
      // Validar datos de entrada
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Datos de entrada inválidos",
          errors: errors.array(),
        });
      }

      const moduleData = {
        ...req.body,
        createdBy: req.user.user_id,
        lastModifiedBy: req.user.user_id,
      };

      // Verificar que no exista un módulo con el mismo nombre
      const existingModule = await ModuleConfig.findOne({
        name: moduleData.name.toLowerCase(),
      });

      if (existingModule) {
        return res.status(400).json({
          success: false,
          message: "Ya existe un módulo con ese nombre",
        });
      }

      // Crear módulo
      const module = new ModuleConfig(moduleData);
      await module.save();

      // Poblar datos relacionados
      await module.populate("createdBy lastModifiedBy", "name lastname email");

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Módulo '${module.displayName}' creado por ${req.user.email}`
      );

      res.status(201).json({
        success: true,
        message: "Módulo creado exitosamente",
        data: module,
      });
    } catch (error) {
      logger.error("Error al crear módulo:", error);
      res.status(400).json({
        success: false,
        message: "Error al crear módulo",
        error: error.message,
      });
    }
  }

  // ⭐ ACTUALIZAR MÓDULO ⭐
  async updateModule(req, res) {
    try {
      const { id } = req.params;

      // Validar datos de entrada
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Datos de entrada inválidos",
          errors: errors.array(),
        });
      }

      const updateData = {
        ...req.body,
        lastModifiedBy: req.user.user_id,
        updatedAt: new Date(),
      };

      // Buscar módulo
      const existingModule = await ModuleConfig.findById(id);
      if (!existingModule) {
        return res.status(404).json({
          success: false,
          message: "Módulo no encontrado",
        });
      }

      // Verificar si es módulo del sistema y el usuario no es admin
      if (existingModule.isSystem && !req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "No se pueden modificar módulos del sistema",
        });
      }

      // Si se cambia el nombre, verificar que no exista otro con el mismo nombre
      if (updateData.name && updateData.name !== existingModule.name) {
        const nameExists = await ModuleConfig.findOne({
          name: updateData.name.toLowerCase(),
          _id: { $ne: id },
        });

        if (nameExists) {
          return res.status(400).json({
            success: false,
            message: "Ya existe un módulo con ese nombre",
          });
        }
      }

      // Actualizar módulo
      const module = await ModuleConfig.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).populate("createdBy lastModifiedBy", "name lastname email");

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Módulo '${module.displayName}' actualizado por ${req.user.email}`
      );

      res.json({
        success: true,
        message: "Módulo actualizado exitosamente",
        data: module,
      });
    } catch (error) {
      logger.error("Error al actualizar módulo:", error);
      res.status(400).json({
        success: false,
        message: "Error al actualizar módulo",
        error: error.message,
      });
    }
  }

  // ⭐ ELIMINAR MÓDULO ⭐
  async deleteModule(req, res) {
    try {
      const { id } = req.params;

      const module = await ModuleConfig.findById(id);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Módulo no encontrado",
        });
      }

      // No permitir eliminar módulos del sistema
      if (module.isSystem) {
        return res.status(403).json({
          success: false,
          message: "No se pueden eliminar módulos del sistema",
        });
      }

      // Verificar si el módulo está siendo usado por algún rol
      const rolesUsingModule = await this.checkModuleUsage(module.resource);
      if (rolesUsingModule.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "No se puede eliminar el módulo porque está siendo usado por roles activos",
          data: { rolesUsingModule },
        });
      }

      await ModuleConfig.findByIdAndDelete(id);

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Módulo '${module.displayName}' eliminado por ${req.user.email}`
      );

      res.json({
        success: true,
        message: "Módulo eliminado exitosamente",
      });
    } catch (error) {
      logger.error("Error al eliminar módulo:", error);
      res.status(500).json({
        success: false,
        message: "Error al eliminar módulo",
        error: error.message,
      });
    }
  }

  // ⭐ OBTENER CONFIGURACIÓN PARA EL FRONTEND ⭐
  async getModulesConfig(req, res) {
    try {
      // Intentar obtener desde caché
      const cacheKey = "modules_config";
      let cachedConfig = await CacheService.get(cacheKey);

      if (cachedConfig) {
        return res.json({
          success: true,
          data: cachedConfig,
          cached: true,
          lastUpdated: cachedConfig.lastUpdated,
        });
      }

      // Si no está en caché, generar configuración
      const modules = await ModuleConfig.find({ isActive: true })
        .sort({ "uiConfig.category": 1, "uiConfig.order": 1 })
        .select("-__v -createdAt -updatedAt -createdBy -lastModifiedBy");

      // Convertir a formato optimizado para el frontend
      const moduleMap = {};
      const routePermissions = {};
      const uiConfig = {};
      const categorizedModules = {
        operational: [],
        administrative: [],
        analytical: [],
        configuration: [],
      };

      modules.forEach((module) => {
        // Mapa de módulos para getModulePermissions
        moduleMap[module.name] = {
          resource: module.resource,
          actions: module.actions.map((action) => action.name),
          defaultActions: module.actions
            .filter((action) => action.isDefault)
            .map((action) => action.name),
          requireAdmin: module.restrictions.requireAdmin,
          minimumRole: module.restrictions.minimumRole,
          contextRules: module.restrictions.contextRules,
        };

        // Configuración de rutas
        module.routes.forEach((route) => {
          routePermissions[route.path] = {
            resource: module.resource,
            action: route.requiredAction || "read",
            requireAdmin: module.restrictions.requireAdmin,
            method: route.method || "GET",
          };
        });

        // Configuración de UI
        uiConfig[module.name] = {
          ...module.uiConfig,
          displayName: module.displayName,
          description: module.description,
        };

        // Agrupar por categoría
        const category = module.uiConfig.category || "operational";
        if (categorizedModules[category]) {
          categorizedModules[category].push({
            name: module.name,
            displayName: module.displayName,
            description: module.description,
            ...module.uiConfig,
          });
        }
      });

      const config = {
        moduleMap,
        routePermissions,
        uiConfig,
        categorizedModules,
        lastUpdated: new Date(),
        totalModules: modules.length,
      };

      // Guardar en caché por 1 hora
      await CacheService.set(cacheKey, config, 3600);

      res.json({
        success: true,
        data: config,
        cached: false,
      });
    } catch (error) {
      logger.error("Error al obtener configuración de módulos:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener configuración de módulos",
        error: error.message,
      });
    }
  }

  // ⭐ CAMBIAR ESTADO DEL MÓDULO ⭐
  async toggleModuleStatus(req, res) {
    try {
      const { id } = req.params;

      const module = await ModuleConfig.findById(id);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Módulo no encontrado",
        });
      }

      // No permitir desactivar módulos del sistema críticos
      if (module.isSystem && module.name === "dashboard" && module.isActive) {
        return res.status(403).json({
          success: false,
          message: "No se puede desactivar el módulo dashboard",
        });
      }

      module.isActive = !module.isActive;
      module.lastModifiedBy = req.user.user_id;
      await module.save();

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Módulo '${module.displayName}' ${
          module.isActive ? "activado" : "desactivado"
        } por ${req.user.email}`
      );

      res.json({
        success: true,
        message: `Módulo ${
          module.isActive ? "activado" : "desactivado"
        } exitosamente`,
        data: { isActive: module.isActive },
      });
    } catch (error) {
      logger.error("Error al cambiar estado del módulo:", error);
      res.status(500).json({
        success: false,
        message: "Error al cambiar estado del módulo",
        error: error.message,
      });
    }
  }

  // ⭐ OBTENER ACCIONES DISPONIBLES ⭐
  async getAvailableActions(req, res) {
    try {
      const actions = [
        {
          name: "create",
          displayName: "Crear",
          description: "Crear nuevos elementos",
        },
        {
          name: "read",
          displayName: "Leer",
          description: "Visualizar elementos",
        },
        {
          name: "update",
          displayName: "Actualizar",
          description: "Modificar elementos existentes",
        },
        {
          name: "delete",
          displayName: "Eliminar",
          description: "Eliminar elementos",
        },
        {
          name: "execute",
          displayName: "Ejecutar",
          description: "Ejecutar procesos o tareas",
        },
        {
          name: "manage",
          displayName: "Gestionar",
          description: "Control total sobre el módulo",
        },
        {
          name: "export",
          displayName: "Exportar",
          description: "Exportar datos",
        },
        {
          name: "import",
          displayName: "Importar",
          description: "Importar datos",
        },
        {
          name: "approve",
          displayName: "Aprobar",
          description: "Aprobar o rechazar elementos",
        },
      ];

      res.json({
        success: true,
        data: actions,
      });
    } catch (error) {
      logger.error("Error al obtener acciones disponibles:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener acciones disponibles",
        error: error.message,
      });
    }
  }

  // ⭐ OBTENER CATEGORÍAS ⭐
  async getCategories(req, res) {
    try {
      const categories = [
        {
          name: "operational",
          displayName: "Operativo",
          description: "Módulos para operaciones diarias",
          color: "#007bff",
        },
        {
          name: "administrative",
          displayName: "Administrativo",
          description: "Módulos de administración del sistema",
          color: "#dc3545",
        },
        {
          name: "analytical",
          displayName: "Análisis",
          description: "Módulos de reportes y análisis",
          color: "#28a745",
        },
        {
          name: "configuration",
          displayName: "Configuración",
          description: "Módulos de configuración del sistema",
          color: "#ffc107",
        },
      ];

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      logger.error("Error al obtener categorías:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener categorías",
        error: error.message,
      });
    }
  }

  // ⭐ BUSCAR MÓDULOS ⭐
  async searchModules(req, res) {
    try {
      const { term } = req.params;
      const { limit = 10, includeInactive = false } = req.query;

      const filter = {
        $or: [
          { name: { $regex: term, $options: "i" } },
          { displayName: { $regex: term, $options: "i" } },
          { description: { $regex: term, $options: "i" } },
          { resource: { $regex: term, $options: "i" } },
        ],
      };

      if (!includeInactive) {
        filter.isActive = true;
      }

      const modules = await ModuleConfig.find(filter)
        .limit(parseInt(limit))
        .select(
          "name displayName description resource uiConfig isActive isSystem"
        )
        .sort({ displayName: 1 });

      res.json({
        success: true,
        data: modules,
        count: modules.length,
        searchTerm: term,
      });
    } catch (error) {
      logger.error("Error al buscar módulos:", error);
      res.status(500).json({
        success: false,
        message: "Error al buscar módulos",
        error: error.message,
      });
    }
  }

  // ⭐ DUPLICAR MÓDULO ⭐
  async duplicateModule(req, res) {
    try {
      const { id } = req.params;
      const { newName, newDisplayName } = req.body;

      const originalModule = await ModuleConfig.findById(id);
      if (!originalModule) {
        return res.status(404).json({
          success: false,
          message: "Módulo original no encontrado",
        });
      }

      // Verificar que el nuevo nombre no exista
      const existingModule = await ModuleConfig.findOne({
        name: newName.toLowerCase(),
      });

      if (existingModule) {
        return res.status(400).json({
          success: false,
          message: "Ya existe un módulo con ese nombre",
        });
      }

      // Crear copia del módulo
      const moduleData = originalModule.toObject();
      delete moduleData._id;
      delete moduleData.createdAt;
      delete moduleData.updatedAt;

      moduleData.name = newName.toLowerCase();
      moduleData.displayName = newDisplayName;
      moduleData.isSystem = false; // Las copias nunca son del sistema
      moduleData.createdBy = req.user.user_id;
      moduleData.lastModifiedBy = req.user.user_id;

      const newModule = new ModuleConfig(moduleData);
      await newModule.save();

      await newModule.populate(
        "createdBy lastModifiedBy",
        "name lastname email"
      );

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Módulo '${originalModule.displayName}' duplicado como '${newDisplayName}' por ${req.user.email}`
      );

      res.status(201).json({
        success: true,
        message: "Módulo duplicado exitosamente",
        data: newModule,
      });
    } catch (error) {
      logger.error("Error al duplicar módulo:", error);
      res.status(400).json({
        success: false,
        message: "Error al duplicar módulo",
        error: error.message,
      });
    }
  }

  // ⭐ INVALIDAR CACHÉ ⭐
  async invalidateCache(req, res) {
    try {
      await this.invalidateModuleCache();

      res.json({
        success: true,
        message: "Caché de módulos invalidado exitosamente",
      });
    } catch (error) {
      logger.error("Error al invalidar caché:", error);
      res.status(500).json({
        success: false,
        message: "Error al invalidar caché",
        error: error.message,
      });
    }
  }

  // ⭐ INICIALIZAR MÓDULOS DEL SISTEMA ⭐
  async initializeSystemModules(req, res) {
    try {
      const systemModules = await this.getSystemModulesDefinition();
      const results = [];

      for (const moduleData of systemModules) {
        const existingModule = await ModuleConfig.findOne({
          name: moduleData.name,
        });

        if (!existingModule) {
          const module = new ModuleConfig({
            ...moduleData,
            createdBy: req.user.user_id,
            lastModifiedBy: req.user.user_id,
          });

          await module.save();
          results.push({
            action: "created",
            module: module.displayName,
          });
        } else {
          results.push({
            action: "exists",
            module: existingModule.displayName,
          });
        }
      }

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(`Módulos del sistema inicializados por ${req.user.email}`);

      res.json({
        success: true,
        message: "Módulos del sistema inicializados exitosamente",
        data: results,
      });
    } catch (error) {
      logger.error("Error al inicializar módulos del sistema:", error);
      res.status(500).json({
        success: false,
        message: "Error al inicializar módulos del sistema",
        error: error.message,
      });
    }
  }

  // ⭐ FUNCIONES AUXILIARES PRIVADAS ⭐
  async invalidateModuleCache() {
    const cacheKeys = [
      "modules_config",
      "modules_list",
      "modules_routes",
      "modules_ui_config",
    ];

    for (const key of cacheKeys) {
      await CacheService.delete(key);
    }

    logger.info("Caché de módulos invalidado");
  }

  async checkModuleUsage(resource) {
    // Verificar si algún rol está usando este recurso
    const Role = require("../models/roleModel");
    const rolesUsingModule = await Role.find({
      "permissions.resource": resource,
      isActive: true,
    }).select("name displayName");

    return rolesUsingModule;
  }

  async getSystemModulesDefinition() {
    // Definición de módulos del sistema
    return [
      {
        name: "dashboard",
        displayName: "Panel de Control",
        description: "Panel principal con resumen del sistema",
        resource: "analytics",
        actions: [
          { name: "read", displayName: "Ver Dashboard", isDefault: true },
        ],
        routes: [{ path: "/dashboard", requiredAction: "read", isMain: true }],
        uiConfig: {
          icon: "FaTachometerAlt",
          color: "#007bff",
          category: "operational",
          order: 1,
          showInMenu: true,
          showInDashboard: false,
        },
        restrictions: {
          requireAdmin: false,
          minimumRole: "user",
        },
        isSystem: true,
        isActive: true,
      },
      {
        name: "tasks",
        displayName: "Gestión de Tareas",
        description: "Módulo para gestionar tareas de transferencia",
        resource: "tasks",
        actions: [
          { name: "read", displayName: "Ver Tareas", isDefault: true },
          { name: "create", displayName: "Crear Tareas", isDefault: false },
          { name: "update", displayName: "Editar Tareas", isDefault: false },
          { name: "delete", displayName: "Eliminar Tareas", isDefault: false },
          { name: "execute", displayName: "Ejecutar Tareas", isDefault: true },
          { name: "manage", displayName: "Gestionar Tareas", isDefault: false },
        ],
        routes: [
          { path: "/tasks", requiredAction: "read", isMain: true },
          { path: "/transfers", requiredAction: "read", isMain: false },
        ],
        uiConfig: {
          icon: "FaTasks",
          color: "#28a745",
          category: "operational",
          order: 2,
          showInMenu: true,
          showInDashboard: true,
        },
        restrictions: {
          requireAdmin: false,
          minimumRole: "user",
          contextRules: [
            {
              type: "own_content",
              actions: ["update", "delete"],
              condition: "user_is_creator",
            },
            {
              type: "not_running",
              actions: ["delete", "update"],
              condition: "status_not_running",
            },
          ],
        },
        isSystem: true,
        isActive: true,
      },
      // Agregar más módulos del sistema según necesidad...
    ];
  }

  async updateModuleActions(req, res) {
    try {
      const { id } = req.params;
      const { actions } = req.body;

      // Validar datos de entrada
      if (!actions || !Array.isArray(actions)) {
        return res.status(400).json({
          success: false,
          message: "Las acciones deben ser un array válido",
        });
      }

      // Validar estructura de acciones
      for (const action of actions) {
        if (!action.name || !action.displayName) {
          return res.status(400).json({
            success: false,
            message: "Cada acción debe tener name y displayName",
          });
        }

        // Validar que el nombre de la acción sea válido
        const validActions = [
          "create",
          "read",
          "update",
          "delete",
          "execute",
          "manage",
          "export",
          "import",
          "approve",
        ];
        if (!validActions.includes(action.name)) {
          return res.status(400).json({
            success: false,
            message: `Acción '${action.name}' no es válida`,
          });
        }
      }

      // Buscar y actualizar módulo
      const module = await ModuleConfig.findById(id);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Módulo no encontrado",
        });
      }

      // Verificar si es módulo del sistema y el usuario no es admin
      if (module.isSystem && !req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "No se pueden modificar acciones de módulos del sistema",
        });
      }

      // Actualizar acciones
      module.actions = actions;
      module.lastModifiedBy = req.user.user_id;
      await module.save();

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Acciones del módulo '${module.displayName}' actualizadas por ${req.user.email}`
      );

      res.json({
        success: true,
        message: "Acciones del módulo actualizadas exitosamente",
        data: module,
      });
    } catch (error) {
      logger.error("Error actualizando acciones del módulo:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar acciones del módulo",
        error: error.message,
      });
    }
  }

  // ⭐ ACTUALIZAR RUTAS DE MÓDULO ⭐
  async updateModuleRoutes(req, res) {
    try {
      const { id } = req.params;
      const { routes } = req.body;

      // Validar datos de entrada
      if (!routes || !Array.isArray(routes)) {
        return res.status(400).json({
          success: false,
          message: "Las rutas deben ser un array válido",
        });
      }

      // Validar estructura de rutas
      for (const route of routes) {
        if (!route.path) {
          return res.status(400).json({
            success: false,
            message: "Cada ruta debe tener un path",
          });
        }

        // Validar formato del path
        if (!route.path.startsWith("/")) {
          return res.status(400).json({
            success: false,
            message: "El path debe comenzar con /",
          });
        }

        // Validar método HTTP si está presente
        if (
          route.method &&
          !["GET", "POST", "PUT", "DELETE", "PATCH"].includes(route.method)
        ) {
          return res.status(400).json({
            success: false,
            message: `Método HTTP '${route.method}' no es válido`,
          });
        }
      }

      // Buscar y actualizar módulo
      const module = await ModuleConfig.findById(id);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Módulo no encontrado",
        });
      }

      // Verificar si es módulo del sistema y el usuario no es admin
      if (module.isSystem && !req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "No se pueden modificar rutas de módulos del sistema",
        });
      }

      // Actualizar rutas
      module.routes = routes;
      module.lastModifiedBy = req.user.user_id;
      await module.save();

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Rutas del módulo '${module.displayName}' actualizadas por ${req.user.email}`
      );

      res.json({
        success: true,
        message: "Rutas del módulo actualizadas exitosamente",
        data: module,
      });
    } catch (error) {
      logger.error("Error actualizando rutas del módulo:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar rutas del módulo",
        error: error.message,
      });
    }
  }

  // ⭐ ACTUALIZAR CONFIGURACIÓN UI DEL MÓDULO ⭐
  async updateModuleUIConfig(req, res) {
    try {
      const { id } = req.params;
      const { uiConfig } = req.body;

      // Validar datos de entrada
      if (!uiConfig || typeof uiConfig !== "object") {
        return res.status(400).json({
          success: false,
          message: "La configuración UI debe ser un objeto válido",
        });
      }

      // Validar campos específicos
      if (uiConfig.color && !/^#[0-9A-F]{6}$/i.test(uiConfig.color)) {
        return res.status(400).json({
          success: false,
          message: "El color debe ser un código hexadecimal válido",
        });
      }

      if (
        uiConfig.category &&
        ![
          "operational",
          "administrative",
          "analytical",
          "configuration",
        ].includes(uiConfig.category)
      ) {
        return res.status(400).json({
          success: false,
          message: "Categoría no válida",
        });
      }

      if (
        uiConfig.order &&
        (isNaN(uiConfig.order) || uiConfig.order < 0 || uiConfig.order > 1000)
      ) {
        return res.status(400).json({
          success: false,
          message: "El orden debe ser un número entre 0 y 1000",
        });
      }

      // Buscar y actualizar módulo
      const module = await ModuleConfig.findById(id);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Módulo no encontrado",
        });
      }

      // Actualizar configuración UI
      module.uiConfig = { ...module.uiConfig, ...uiConfig };
      module.lastModifiedBy = req.user.user_id;
      await module.save();

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Configuración UI del módulo '${module.displayName}' actualizada por ${req.user.email}`
      );

      res.json({
        success: true,
        message: "Configuración UI del módulo actualizada exitosamente",
        data: module,
      });
    } catch (error) {
      logger.error("Error actualizando configuración UI:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar configuración UI del módulo",
        error: error.message,
      });
    }
  }

  // ⭐ ACTUALIZAR RESTRICCIONES DEL MÓDULO ⭐
  async updateModuleRestrictions(req, res) {
    try {
      const { id } = req.params;
      const { restrictions } = req.body;

      // Validar datos de entrada
      if (!restrictions || typeof restrictions !== "object") {
        return res.status(400).json({
          success: false,
          message: "Las restricciones deben ser un objeto válido",
        });
      }

      // Validar campos específicos
      if (
        restrictions.minimumRole &&
        !["guest", "user", "editor", "manager", "admin"].includes(
          restrictions.minimumRole
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Rol mínimo no válido",
        });
      }

      if (
        restrictions.contextRules &&
        !Array.isArray(restrictions.contextRules)
      ) {
        return res.status(400).json({
          success: false,
          message: "Las reglas contextuales deben ser un array",
        });
      }

      // Buscar y actualizar módulo
      const module = await ModuleConfig.findById(id);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Módulo no encontrado",
        });
      }

      // Verificar si es módulo del sistema crítico
      if (
        module.isSystem &&
        module.name === "dashboard" &&
        restrictions.requireAdmin
      ) {
        return res.status(403).json({
          success: false,
          message: "No se puede requerir admin para el módulo dashboard",
        });
      }

      // Actualizar restricciones
      module.restrictions = { ...module.restrictions, ...restrictions };
      module.lastModifiedBy = req.user.user_id;
      await module.save();

      // Invalidar caché
      await this.invalidateModuleCache();

      logger.info(
        `Restricciones del módulo '${module.displayName}' actualizadas por ${req.user.email}`
      );

      res.json({
        success: true,
        message: "Restricciones del módulo actualizadas exitosamente",
        data: module,
      });
    } catch (error) {
      logger.error("Error actualizando restricciones:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar restricciones del módulo",
        error: error.message,
      });
    }
  }

  // ⭐ EXPORTAR MÓDULOS ⭐
  async exportModules(req, res) {
    try {
      const { format } = req.params;
      const { includeSystem = "true", category = "all" } = req.query;

      // Construir filtro
      const filter = { isActive: true };

      if (includeSystem === "false") {
        filter.isSystem = { $ne: true };
      }

      if (category !== "all") {
        filter["uiConfig.category"] = category;
      }

      // Obtener módulos
      const modules = await ModuleConfig.find(filter)
        .select("-__v -createdAt -updatedAt -createdBy -lastModifiedBy")
        .sort({ "uiConfig.category": 1, "uiConfig.order": 1 });

      // Preparar datos para exportación
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          totalModules: modules.length,
          exportedBy: req.user.email,
          format: format,
          filters: {
            includeSystem: includeSystem === "true",
            category: category,
          },
        },
        modules: modules,
      };

      // Responder según el formato
      switch (format) {
        case "json":
          res.json({
            success: true,
            data: exportData,
          });
          break;

        case "csv":
          // Convertir a CSV
          const csvData = await this.convertModulesToCSV(modules);
          res.setHeader("Content-Type", "text/csv");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename=modules-${Date.now()}.csv`
          );
          res.send(csvData);
          break;

        default:
          return res.status(400).json({
            success: false,
            message: "Formato de exportación no soportado",
          });
      }

      logger.info(
        `Módulos exportados en formato ${format} por ${req.user.email}`
      );
    } catch (error) {
      logger.error("Error exportando módulos:", error);
      res.status(500).json({
        success: false,
        message: "Error al exportar módulos",
        error: error.message,
      });
    }
  }

  // ⭐ IMPORTAR MÓDULOS ⭐
  async importModules(req, res) {
    try {
      const { modules, overwrite = false } = req.body;

      // Validar datos de entrada
      if (!modules || !Array.isArray(modules)) {
        return res.status(400).json({
          success: false,
          message: "Los módulos deben ser un array válido",
        });
      }

      const results = {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        details: [],
      };

      for (const moduleData of modules) {
        try {
          // Validar estructura del módulo
          if (
            !moduleData.name ||
            !moduleData.displayName ||
            !moduleData.resource
          ) {
            results.errors.push({
              module: moduleData.name || "Desconocido",
              error: "Campos requeridos faltantes: name, displayName, resource",
            });
            continue;
          }

          // Verificar si ya existe
          const existingModule = await ModuleConfig.findOne({
            name: moduleData.name,
          });

          if (existingModule) {
            if (existingModule.isSystem && !req.user.isAdmin) {
              results.errors.push({
                module: moduleData.name,
                error: "No se pueden modificar módulos del sistema",
              });
              continue;
            }

            if (!overwrite) {
              results.skipped++;
              results.details.push({
                module: moduleData.name,
                action: "skipped",
                reason: "Ya existe y overwrite es false",
              });
              continue;
            }

            // Actualizar módulo existente
            const updateData = {
              ...moduleData,
              lastModifiedBy: req.user.user_id,
              isSystem: existingModule.isSystem, // Preservar flag de sistema
            };

            await ModuleConfig.findByIdAndUpdate(
              existingModule._id,
              updateData
            );
            results.updated++;
            results.details.push({
              module: moduleData.name,
              action: "updated",
            });
          } else {
            // Crear nuevo módulo
            const newModuleData = {
              ...moduleData,
              createdBy: req.user.user_id,
              lastModifiedBy: req.user.user_id,
              isSystem: false, // Los módulos importados no son del sistema
            };

            const newModule = new ModuleConfig(newModuleData);
            await newModule.save();
            results.imported++;
            results.details.push({
              module: moduleData.name,
              action: "imported",
            });
          }
        } catch (moduleError) {
          results.errors.push({
            module: moduleData.name || "Desconocido",
            error: moduleError.message,
          });
        }
      }

      // Invalidar caché si hubo cambios
      if (results.imported > 0 || results.updated > 0) {
        await this.invalidateModuleCache();
      }

      logger.info(
        `Importación de módulos completada por ${req.user.email}: ${results.imported} importados, ${results.updated} actualizados, ${results.skipped} omitidos, ${results.errors.length} errores`
      );

      const statusCode = results.errors.length > 0 ? 207 : 200; // 207 Multi-Status si hay errores parciales

      res.status(statusCode).json({
        success: results.errors.length === 0,
        message: `Importación completada: ${results.imported} importados, ${results.updated} actualizados`,
        data: results,
      });
    } catch (error) {
      logger.error("Error importando módulos:", error);
      res.status(500).json({
        success: false,
        message: "Error al importar módulos",
        error: error.message,
      });
    }
  }

  // ⭐ VALIDAR INTEGRIDAD DEL SISTEMA ⭐
  async validateSystemIntegrity(req, res) {
    try {
      const validationResults = {
        systemModules: {
          required: ["dashboard", "tasks", "users", "roles", "profile"],
          found: [],
          missing: [],
          issues: [],
        },
        permissions: {
          resources: new Set(),
          actions: new Set(),
          issues: [],
        },
        routes: {
          total: 0,
          duplicates: [],
          conflicts: [],
        },
        overall: {
          isValid: true,
          score: 0,
          issues: [],
        },
      };

      // Obtener todos los módulos activos
      const modules = await ModuleConfig.find({ isActive: true });

      // ⭐ VALIDAR MÓDULOS DEL SISTEMA ⭐
      const foundSystemModules = modules
        .filter((m) => m.isSystem)
        .map((m) => m.name);
      validationResults.systemModules.found = foundSystemModules;
      validationResults.systemModules.missing =
        validationResults.systemModules.required.filter(
          (name) => !foundSystemModules.includes(name)
        );

      // ⭐ VALIDAR PERMISOS ⭐
      modules.forEach((module) => {
        validationResults.permissions.resources.add(module.resource);

        if (!module.actions || module.actions.length === 0) {
          validationResults.permissions.issues.push({
            module: module.name,
            issue: "No tiene acciones configuradas",
          });
        }

        module.actions?.forEach((action) => {
          validationResults.permissions.actions.add(action.name);
        });

        // Verificar que tenga al menos acción 'read'
        if (!module.actions?.some((a) => a.name === "read")) {
          validationResults.permissions.issues.push({
            module: module.name,
            issue: "No tiene acción de lectura (read)",
          });
        }
      });

      // ⭐ VALIDAR RUTAS ⭐
      const allRoutes = [];
      modules.forEach((module) => {
        module.routes?.forEach((route) => {
          allRoutes.push({
            module: module.name,
            path: route.path,
            method: route.method || "GET",
          });
        });
      });

      validationResults.routes.total = allRoutes.length;

      // Buscar rutas duplicadas
      const routeMap = new Map();
      allRoutes.forEach((route) => {
        const key = `${route.method}:${route.path}`;
        if (routeMap.has(key)) {
          validationResults.routes.duplicates.push({
            path: route.path,
            method: route.method,
            modules: [routeMap.get(key).module, route.module],
          });
        } else {
          routeMap.set(key, route);
        }
      });

      // ⭐ VERIFICAR INTEGRIDAD CON BASE DE DATOS ⭐
      try {
        // Verificar que los recursos existen en roles
        const Role = require("../models/roleModel");
        const roles = await Role.find({ isActive: true });

        const usedResources = new Set();
        roles.forEach((role) => {
          role.permissions?.forEach((permission) => {
            usedResources.add(permission.resource);
          });
        });

        // Recursos definidos en módulos pero no usados en roles
        const unusedResources = [
          ...validationResults.permissions.resources,
        ].filter((resource) => !usedResources.has(resource));

        if (unusedResources.length > 0) {
          validationResults.overall.issues.push({
            type: "warning",
            message: `Recursos definidos en módulos pero no usados en roles: ${unusedResources.join(
              ", "
            )}`,
          });
        }
      } catch (dbError) {
        validationResults.overall.issues.push({
          type: "error",
          message: `Error verificando integridad con BD: ${dbError.message}`,
        });
      }

      // ⭐ CALCULAR PUNTUACIÓN GENERAL ⭐
      let score = 100;

      // Penalizaciones
      score -= validationResults.systemModules.missing.length * 20; // -20 por cada módulo faltante
      score -= validationResults.permissions.issues.length * 10; // -10 por cada problema de permisos
      score -= validationResults.routes.duplicates.length * 15; // -15 por cada ruta duplicada
      score -=
        validationResults.overall.issues.filter((i) => i.type === "error")
          .length * 25; // -25 por error crítico
      score -=
        validationResults.overall.issues.filter((i) => i.type === "warning")
          .length * 5; // -5 por warning

      validationResults.overall.score = Math.max(0, score);
      validationResults.overall.isValid = score >= 80; // Sistema válido si score >= 80

      // Convertir Sets a Arrays para JSON
      validationResults.permissions.resources = [
        ...validationResults.permissions.resources,
      ];
      validationResults.permissions.actions = [
        ...validationResults.permissions.actions,
      ];

      logger.info(
        `Validación de integridad ejecutada por ${req.user.email}: Score ${validationResults.overall.score}/100`
      );

      res.json({
        success: true,
        message: `Validación completada. Score: ${validationResults.overall.score}/100`,
        data: validationResults,
      });
    } catch (error) {
      logger.error("Error validando integridad del sistema:", error);
      res.status(500).json({
        success: false,
        message: "Error al validar integridad del sistema",
        error: error.message,
      });
    }
  }

  // ⭐ FUNCIÓN AUXILIAR PARA CONVERTIR A CSV ⭐
  async convertModulesToCSV(modules) {
    const headers = [
      "name",
      "displayName",
      "description",
      "resource",
      "category",
      "isActive",
      "isSystem",
      "actions",
      "routesCount",
    ];

    const rows = modules.map((module) => [
      module.name,
      module.displayName,
      module.description || "",
      module.resource,
      module.uiConfig?.category || "",
      module.isActive,
      module.isSystem,
      module.actions?.map((a) => a.name).join(";") || "",
      module.routes?.length || 0,
    ]);

    return [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
  }
}

module.exports = new ModuleController();
