// controllers/userController.js
const User = require("../models/userModel");
const Role = require("../models/roleModel");
const ModuleConfig = require("../models/moduleConfigModel");
const mongoose = require("mongoose");
const cacheService = require("../services/cacheService");
const logger = require("../services/logger");

// ⭐ CONSTANTES PARA CACHE ⭐
const CACHE_KEYS = {
  USER_PERMISSIONS: (userId) => `user_permissions_${userId}`,
  ACTIVE_MODULES: "active_modules",
  USER_PROFILE: (userId) => `user_profile_${userId}`,
  USER_ROLES: (userId) => `user_roles_${userId}`,
};

const CACHE_TTL = {
  USER_PERMISSIONS: 300, // 5 minutos
  MODULES: 600, // 10 minutos
  USER_PROFILE: 900, // 15 minutos
};

// ⭐ OBTENER MÓDULOS ACTIVOS CON CACHE ⭐
async function getActiveModules() {
  return await cacheService.getOrSet(
    CACHE_KEYS.ACTIVE_MODULES,
    async () => {
      const modules = await ModuleConfig.find({ isActive: true })
        .select("name resource actions displayName category version")
        .lean();
      logger.info(`📋 Módulos activos cargados desde DB: ${modules.length}`);
      return modules;
    },
    CACHE_TTL.MODULES
  );
}

// ⭐ GENERAR PERMISOS DE ADMIN DINÁMICAMENTE ⭐
function generateDynamicAdminPermissions(activeModules) {
  const adminPermissions = [];

  activeModules.forEach((module) => {
    let availableActions = [];

    if (module.actions && Array.isArray(module.actions)) {
      availableActions = module.actions.map((action) => {
        if (typeof action === "object" && action.name) {
          return action.name;
        }
        return typeof action === "string" ? action : "read";
      });
    } else {
      availableActions = ["create", "read", "update", "delete"];
    }

    if (!availableActions.includes("manage")) {
      availableActions.push("manage");
    }

    const commonActions = getCommonActionsForModule(module);
    availableActions = [...new Set([...availableActions, ...commonActions])];

    adminPermissions.push({
      resource: module.resource,
      actions: availableActions.sort(),
      moduleName: module.displayName || module.name,
      category: module.category || "general",
      source: "admin",
      moduleVersion: module.version || "1.0.0",
    });
  });

  const systemPermissions = [
    {
      resource: "system",
      actions: ["manage", "configure", "monitor", "backup", "restore"],
      moduleName: "Sistema General",
      category: "system",
      source: "admin",
    },
  ];

  return [...adminPermissions, ...systemPermissions];
}

// ⭐ OBTENER ACCIONES COMUNES SEGÚN EL TIPO DE MÓDULO ⭐
function getCommonActionsForModule(module) {
  const categoryActions = {
    administrative: [
      "create",
      "read",
      "update",
      "delete",
      "manage",
      "configure",
    ],
    operational: ["create", "read", "update", "delete", "execute", "process"],
    analysis: ["read", "export", "generate", "analyze"],
    security: ["manage", "audit", "monitor"],
    system: ["configure", "manage", "monitor"],
  };

  return (
    categoryActions[module.category] || ["create", "read", "update", "delete"]
  );
}

// ⭐ CALCULAR PERMISOS DINÁMICAMENTE PARA USUARIOS NO ADMIN ⭐
async function calculateUserPermissionsDynamic(user, activeModules) {
  const consolidatedPermissions = new Map();
  const permissionSources = [];
  const accessibleModules = [];
  const modulesSummary = [];

  // Procesar permisos de roles
  if (user.roles && user.roles.length > 0) {
    user.roles.forEach((role) => {
      if (role.isActive && role.permissions) {
        role.permissions.forEach((perm) => {
          const existing = consolidatedPermissions.get(perm.resource) || [];
          const merged = [...new Set([...existing, ...perm.actions])];
          consolidatedPermissions.set(perm.resource, merged);
        });

        permissionSources.push({
          source: role.displayName,
          type: "role",
          permissions: role.permissions,
          isActive: role.isActive,
        });
      }
    });
  }

  // Procesar permisos específicos del usuario
  if (user.permissions && user.permissions.length > 0) {
    user.permissions.forEach((perm) => {
      const existing = consolidatedPermissions.get(perm.resource) || [];
      const merged = [...new Set([...existing, ...perm.actions])];
      consolidatedPermissions.set(perm.resource, merged);
    });

    permissionSources.push({
      source: "Permisos Específicos",
      type: "specific",
      permissions: user.permissions,
    });
  }

  // Mapear con módulos activos y crear resumen
  activeModules.forEach((module) => {
    const userPermissions = consolidatedPermissions.get(module.resource);
    const hasAccess = userPermissions && userPermissions.length > 0;

    if (hasAccess) {
      accessibleModules.push({
        name: module.name,
        resource: module.resource,
        displayName: module.displayName,
        permissions: userPermissions,
        category: module.category,
      });
    }

    modulesSummary.push({
      name: module.name,
      resource: module.resource,
      displayName: module.displayName,
      category: module.category,
      hasAccess: hasAccess,
      permissions: userPermissions || [],
      availableActions:
        module.actions?.map((a) => (typeof a === "object" ? a.name : a)) || [],
    });
  });

  // Convertir a array final
  const consolidatedArray = Array.from(consolidatedPermissions.entries()).map(
    ([resource, actions]) => {
      const relatedModule = activeModules.find((m) => m.resource === resource);
      return {
        resource,
        actions: actions.sort(),
        moduleName: relatedModule
          ? relatedModule.displayName || relatedModule.name
          : resource,
        category: relatedModule?.category || "unknown",
        isModuleActive: !!relatedModule,
      };
    }
  );

  return {
    consolidatedPermissions: consolidatedArray,
    permissionSources,
    accessibleModules,
    modulesSummary,
  };
}

// ⭐ INVALIDAR CACHE DE USUARIO ⭐
async function invalidateUserCache(userId) {
  try {
    await cacheService.delete(CACHE_KEYS.USER_PERMISSIONS(userId));
    await cacheService.delete(CACHE_KEYS.USER_PROFILE(userId));
    await cacheService.delete(CACHE_KEYS.USER_ROLES(userId));
    logger.info(`🗑️ Cache invalidado para usuario: ${userId}`);
  } catch (error) {
    logger.error(`Error invalidando cache de usuario ${userId}:`, error);
  }
}

// ⭐ INVALIDAR CACHE DE MÓDULOS ⭐
async function invalidateModulesCache() {
  try {
    await cacheService.delete(CACHE_KEYS.ACTIVE_MODULES);
    await cacheService.invalidatePattern("user_permissions_");
    logger.info("🗑️ Cache de módulos y permisos invalidado");
  } catch (error) {
    logger.error("Error invalidando cache de módulos:", error);
  }
}

// =====================================================
// ⭐ CONTROLADORES PRINCIPALES ⭐
// =====================================================

// ⭐ OBTENER PERFIL DEL USUARIO ACTUAL ⭐
async function getMe(req, res) {
  try {
    const userId = req.user.user_id || req.user._id;

    const user = await cacheService.getOrSet(
      CACHE_KEYS.USER_PROFILE(userId),
      async () => {
        const userData = await User.findById(userId)
          .select("-password")
          .populate("roles", "name displayName description isActive")
          .lean();

        if (!userData) {
          throw new Error("Usuario no encontrado");
        }

        return userData;
      },
      CACHE_TTL.USER_PROFILE
    );

    res.status(200).json({
      success: true,
      data: user,
      fromCache: await cacheService.has(CACHE_KEYS.USER_PROFILE(userId)),
    });
  } catch (error) {
    logger.error("❌ Error obteniendo perfil:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener perfil del usuario",
      error: error.message,
    });
  }
}

// ⭐ OBTENER PERMISOS DEL USUARIO ACTUAL (COMPLETAMENTE DINÁMICO) ⭐
async function getUserPermissions(req, res) {
  try {
    const userId = req.user.user_id || req.user._id;
    logger.info(`🔑 Obteniendo permisos del usuario: ${userId}`);

    // Verificar cache primero
    const cachedData = await cacheService.get(
      CACHE_KEYS.USER_PERMISSIONS(userId)
    );
    if (cachedData) {
      logger.info("📦 Permisos obtenidos del cache para usuario actual");
      return res.status(200).json({
        success: true,
        data: { ...cachedData, fromCache: true, lastUpdated: new Date() },
      });
    }

    const user = await User.findById(userId)
      .populate("roles", "name displayName permissions isActive")
      .select("-password")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // Obtener módulos activos dinámicamente
    const activeModules = await getActiveModules();
    logger.info(`📋 Módulos activos para permisos: ${activeModules.length}`);

    let responseData;

    // Si es admin, generar permisos dinámicamente
    if (user.isAdmin) {
      const adminPermissions = generateDynamicAdminPermissions(activeModules);

      responseData = {
        isAdmin: true,
        roles: user.roles || [],
        permissions: adminPermissions,
        consolidatedPermissions: adminPermissions,
        availableModules: activeModules.length,
        modulesSummary: activeModules.map((m) => ({
          name: m.name,
          resource: m.resource,
          displayName: m.displayName,
          category: m.category,
        })),
        lastUpdated: new Date(),
      };
    } else {
      // Calcular permisos para usuarios no admin
      const permissionData = await calculateUserPermissionsDynamic(
        user,
        activeModules
      );

      responseData = {
        isAdmin: false,
        roles: user.roles || [],
        permissions: user.permissions || [],
        consolidatedPermissions: permissionData.consolidatedPermissions,
        permissionSources: permissionData.permissionSources,
        availableModules: activeModules.length,
        accessibleModules: permissionData.accessibleModules,
        modulesSummary: permissionData.modulesSummary,
        lastUpdated: new Date(),
      };
    }

    // Guardar en cache
    await cacheService.set(
      CACHE_KEYS.USER_PERMISSIONS(userId),
      responseData,
      CACHE_TTL.USER_PERMISSIONS
    );

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logger.error("❌ Error obteniendo permisos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener permisos del usuario",
      error: error.message,
    });
  }
}

// ⭐ OBTENER TODOS LOS PERMISOS DE UN USUARIO ESPECÍFICO ⭐
async function getUserAllPermissions(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario inválido",
      });
    }

    // Verificar cache primero
    const cacheKey = CACHE_KEYS.USER_PERMISSIONS(id);
    const cachedData = await cacheService.get(cacheKey);
    if (cachedData) {
      logger.info(`📦 Permisos obtenidos del cache para usuario: ${id}`);
      return res.status(200).json({
        success: true,
        data: { ...cachedData, fromCache: true },
      });
    }

    const user = await User.findById(id)
      .populate("roles", "name displayName permissions isActive")
      .select("-password")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // Obtener módulos activos dinámicamente
    const activeModules = await getActiveModules();

    let responseData;

    // Si es admin, generar permisos dinámicamente
    if (user.isAdmin) {
      const adminPermissions = generateDynamicAdminPermissions(activeModules);

      responseData = {
        userId: user._id,
        userName: `${user.name} ${user.lastname}`,
        isAdmin: true,
        consolidatedPermissions: adminPermissions,
        rolePermissions: [],
        specificPermissions: user.permissions || [],
        totalResources: adminPermissions.length,
        sources: {
          admin: "Administrador del Sistema",
          modules: `${activeModules.length} módulos activos`,
        },
        availableModules: activeModules.map((m) => ({
          name: m.name,
          resource: m.resource,
          displayName: m.displayName,
        })),
      };
    } else {
      // Calcular permisos consolidados dinámicamente
      const consolidatedData = await calculateUserPermissionsDynamic(
        user,
        activeModules
      );

      responseData = {
        userId: user._id,
        userName: `${user.name} ${user.lastname}`,
        isAdmin: false,
        ...consolidatedData,
        availableModules: activeModules.map((m) => ({
          name: m.name,
          resource: m.resource,
          displayName: m.displayName,
          hasAccess: consolidatedData.consolidatedPermissions.some(
            (p) => p.resource === m.resource
          ),
        })),
      };
    }

    // Guardar en cache
    await cacheService.set(cacheKey, responseData, CACHE_TTL.USER_PERMISSIONS);

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logger.error("❌ Error obteniendo permisos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener permisos del usuario",
      error: error.message,
    });
  }
}

// ⭐ OBTENER USUARIOS (CON PAGINACIÓN) ⭐
async function getUsers(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      role = "",
      activo = "",
    } = req.body;

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Construir filtros
    const filters = {};

    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (role) {
      filters.role = { $in: Array.isArray(role) ? role : [role] };
    }

    if (activo !== "") {
      filters.activo = activo === "true" || activo === true;
    }

    const [users, totalUsers] = await Promise.all([
      User.find(filters)
        .populate("roles", "name displayName description isActive")
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      User.countDocuments(filters),
    ]);

    const totalPages = Math.ceil(totalUsers / limitNumber);

    res.status(200).json({
      success: true,
      data: {
        users: users,
        pagination: {
          currentPage: pageNumber,
          totalPages: totalPages,
          totalUsers: totalUsers,
          hasNextPage: pageNumber < totalPages,
          hasPrevPage: pageNumber > 1,
        },
      },
    });
  } catch (error) {
    logger.error("❌ Error obteniendo usuarios:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener usuarios",
      error: error.message,
    });
  }
}

// ⭐ CREAR USUARIO ⭐
async function createUser(req, res) {
  try {
    const userData = req.body;

    // Verificar si el email ya existe
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado",
      });
    }

    const newUser = new User(userData);
    await newUser.save();

    // Invalidar caches relevantes
    await cacheService.invalidatePattern("user_");

    logger.info(`✅ Usuario creado: ${newUser.email}`, {
      userId: newUser._id,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Usuario creado exitosamente",
      data: newUser,
    });
  } catch (error) {
    logger.error("❌ Error creando usuario:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear usuario",
      error: error.message,
    });
  }
}

// ⭐ ACTUALIZAR USUARIO ⭐
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario inválido",
      });
    }

    // Remover campos sensibles que no se deben actualizar directamente
    delete updateData.password;
    delete updateData._id;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    )
      .populate("roles", "name displayName description isActive")
      .select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // Invalidar caches del usuario
    await invalidateUserCache(id);

    logger.info(`✅ Usuario actualizado: ${updatedUser.email}`, {
      userId: id,
      updatedBy: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Usuario actualizado exitosamente",
      data: updatedUser,
    });
  } catch (error) {
    logger.error("❌ Error actualizando usuario:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar usuario",
      error: error.message,
    });
  }
}

// ⭐ ELIMINAR USUARIO (SOFT DELETE) ⭐
async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario inválido",
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { activo: false, updatedAt: new Date() },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // Invalidar caches del usuario
    await invalidateUserCache(id);

    logger.info(`✅ Usuario desactivado: ${user.email}`, {
      userId: id,
      deletedBy: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Usuario desactivado exitosamente",
      data: user,
    });
  } catch (error) {
    logger.error("❌ Error desactivando usuario:", error);
    res.status(500).json({
      success: false,
      message: "Error al desactivar usuario",
      error: error.message,
    });
  }
}

// ⭐ ACTIVAR/DESACTIVAR USUARIO ⭐
async function ActiveInactiveUser(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario inválido",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    const newStatus = !user.activo;
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { activo: newStatus, updatedAt: new Date() },
      { new: true }
    ).select("-password");

    // Invalidar caches del usuario
    await invalidateUserCache(id);

    logger.info(
      `✅ Usuario ${newStatus ? "activado" : "desactivado"}: ${
        updatedUser.email
      }`,
      {
        userId: id,
        updatedBy: req.user._id,
      }
    );

    res.status(200).json({
      success: true,
      message: `Usuario ${newStatus ? "activado" : "desactivado"} exitosamente`,
      data: updatedUser,
    });
  } catch (error) {
    logger.error("❌ Error cambiando estado de usuario:", error);
    res.status(500).json({
      success: false,
      message: "Error al cambiar estado del usuario",
      error: error.message,
    });
  }
}

// ⭐ BUSCAR USUARIOS ⭐
async function searchUsers(req, res) {
  try {
    const { query, filters = {}, limit = 10 } = req.body;

    const searchFilters = {
      activo: true,
      ...filters,
    };

    if (query) {
      searchFilters.$or = [
        { name: { $regex: query, $options: "i" } },
        { lastname: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ];
    }

    const users = await User.find(searchFilters)
      .populate("roles", "name displayName")
      .select("name lastname email isAdmin activo roles")
      .limit(parseInt(limit, 10))
      .lean();

    res.status(200).json({
      success: true,
      data: {
        users: users,
        total: users.length,
        query: query,
      },
    });
  } catch (error) {
    logger.error("❌ Error buscando usuarios:", error);
    res.status(500).json({
      success: false,
      message: "Error al buscar usuarios",
      error: error.message,
    });
  }
}

// ⭐ ACTUALIZAR ROLES DE USUARIO ⭐
async function updateUserRoles(req, res) {
  try {
    const { id } = req.params;
    const { roles } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario inválido",
      });
    }

    // Validar que los roles existen
    if (roles && roles.length > 0) {
      const validRoles = await Role.find({
        _id: { $in: roles },
        isActive: true,
      });

      if (validRoles.length !== roles.length) {
        return res.status(400).json({
          success: false,
          message: "Algunos roles no son válidos o están inactivos",
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { roles: roles || [], updatedAt: new Date() },
      { new: true }
    )
      .populate("roles", "name displayName description isActive")
      .select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // Invalidar caches del usuario
    await invalidateUserCache(id);

    logger.info(`✅ Roles actualizados para usuario: ${updatedUser.email}`, {
      userId: id,
      newRoles: roles,
      updatedBy: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Roles actualizados exitosamente",
      data: updatedUser,
    });
  } catch (error) {
    logger.error("❌ Error actualizando roles:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar roles",
      error: error.message,
    });
  }
}

// ⭐ ACTUALIZAR PERMISOS ESPECÍFICOS ⭐
async function updateUserSpecificPermissions(req, res) {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario inválido",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // Validar estructura de permisos
    if (permissions && Array.isArray(permissions)) {
      for (const permission of permissions) {
        if (
          !permission.resource ||
          !permission.actions ||
          !Array.isArray(permission.actions)
        ) {
          return res.status(400).json({
            success: false,
            message: "Estructura de permisos inválida",
          });
        }
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { permissions: permissions || [], updatedAt: new Date() },
      { new: true }
    )
      .populate("roles", "name displayName description")
      .select("-password");

    // Invalidar caches del usuario
    await invalidateUserCache(id);

    logger.info(
      `✅ Permisos específicos actualizados para usuario: ${updatedUser.email}`,
      {
        userId: id,
        newPermissions: permissions,
        updatedBy: req.user._id,
      }
    );

    res.status(200).json({
      success: true,
      message: "Permisos específicos actualizados correctamente",
      data: updatedUser,
    });
  } catch (error) {
    logger.error("❌ Error actualizando permisos específicos:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar permisos específicos",
      error: error.message,
    });
  }
}

// ⭐ OBTENER USUARIOS CON ROLES ⭐
async function getUsersWithRoles(req, res) {
  try {
    const { page = 1, limit = 20 } = req.body;

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const [users, totalUsers] = await Promise.all([
      User.find({ activo: true })
        .populate("roles", "name displayName description isActive")
        .select("name lastname email roles role isAdmin activo")
        .sort({ name: 1, lastname: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      User.countDocuments({ activo: true }),
    ]);

    const usersWithRoleInfo = users.map((user) => ({
      ...user,
      totalRoles: user.roles?.length || 0,
      roleNames:
        user.roles?.map((role) => role.displayName).join(", ") || "Sin roles",
      hasActiveRoles: user.roles?.some((role) => role.isActive) || false,
    }));

    res.status(200).json({
      success: true,
      data: {
        users: usersWithRoleInfo,
        pagination: {
          currentPage: pageNumber,
          totalPages: Math.ceil(totalUsers / limitNumber),
          totalUsers: totalUsers,
          hasNextPage: pageNumber < Math.ceil(totalUsers / limitNumber),
          hasPrevPage: pageNumber > 1,
        },
      },
    });
  } catch (error) {
    logger.error("❌ Error obteniendo usuarios con roles:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener usuarios con roles",
      error: error.message,
    });
  }
}

// ⭐ OBTENER ESTADÍSTICAS DE USUARIOS (CONTINUACIÓN) ⭐
async function getUserStats(req, res) {
  try {
    const cacheKey = "user_stats";

    const stats = await cacheService.getOrSet(
      cacheKey,
      async () => {
        const [
          totalUsers,
          activeUsers,
          adminUsers,
          usersWithRoles,
          recentUsers,
        ] = await Promise.all([
          User.countDocuments(),
          User.countDocuments({ activo: true }),
          User.countDocuments({ isAdmin: true }),
          User.countDocuments({
            roles: { $exists: true, $not: { $size: 0 } },
          }),
          User.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select("name lastname email createdAt")
            .lean(),
        ]);

        // Estadísticas por roles
        const roleStats = await User.aggregate([
          { $match: { activo: true } },
          { $unwind: { path: "$roles", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "roles",
              localField: "roles",
              foreignField: "_id",
              as: "roleData",
            },
          },
          { $unwind: { path: "$roleData", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: "$roleData.displayName",
              count: { $sum: 1 },
              roleName: { $first: "$roleData.name" },
            },
          },
          { $sort: { count: -1 } },
        ]);

        return {
          overview: {
            total: totalUsers,
            active: activeUsers,
            inactive: totalUsers - activeUsers,
            admins: adminUsers,
            withRoles: usersWithRoles,
            withoutRoles: totalUsers - usersWithRoles,
          },
          roleDistribution: roleStats,
          recentUsers: recentUsers,
          lastUpdated: new Date(),
        };
      },
      300 // 5 minutos de cache
    );

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("❌ Error obteniendo estadísticas:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas de usuarios",
      error: error.message,
    });
  }
}

// ⭐ VALIDAR SISTEMA DE ROLES ⭐
async function validateUserRoleSystem(req, res) {
  try {
    const cacheKey = "role_system_validation";

    const validation = await cacheService.getOrSet(
      cacheKey,
      async () => {
        const [
          totalUsers,
          usersWithoutRoles,
          inactiveRoleUsers,
          orphanedPermissions,
          systemRoles,
          activeModules,
        ] = await Promise.all([
          User.countDocuments({ activo: true }),
          User.countDocuments({
            activo: true,
            $or: [
              { roles: { $exists: false } },
              { roles: { $size: 0 } },
              { roles: null },
            ],
          }),
          User.find({ activo: true })
            .populate("roles")
            .then(
              (users) =>
                users.filter((user) =>
                  user.roles?.some((role) => !role.isActive)
                ).length
            ),
          User.find({
            activo: true,
            permissions: { $exists: true, $not: { $size: 0 } },
          }).countDocuments(),
          Role.countDocuments({ isActive: true }),
          ModuleConfig.countDocuments({ isActive: true }),
        ]);

        const issues = [];
        const recommendations = [];

        // Validaciones
        if (usersWithoutRoles > 0) {
          issues.push({
            type: "warning",
            message: `${usersWithoutRoles} usuarios activos sin roles asignados`,
            impact: "medium",
          });
          recommendations.push("Asignar roles apropiados a usuarios sin roles");
        }

        if (inactiveRoleUsers > 0) {
          issues.push({
            type: "error",
            message: `${inactiveRoleUsers} usuarios con roles inactivos`,
            impact: "high",
          });
          recommendations.push(
            "Actualizar o remover roles inactivos de usuarios"
          );
        }

        const healthScore = Math.max(0, 100 - issues.length * 15);

        return {
          systemHealth: {
            score: healthScore,
            status:
              healthScore >= 80
                ? "healthy"
                : healthScore >= 60
                ? "warning"
                : "critical",
          },
          statistics: {
            totalUsers,
            usersWithoutRoles,
            inactiveRoleUsers,
            orphanedPermissions,
            systemRoles,
            activeModules,
          },
          issues,
          recommendations,
          lastValidation: new Date(),
        };
      },
      600 // 10 minutos de cache
    );

    res.status(200).json({
      success: true,
      data: validation,
    });
  } catch (error) {
    logger.error("❌ Error validando sistema:", error);
    res.status(500).json({
      success: false,
      message: "Error al validar sistema de roles",
      error: error.message,
    });
  }
}

// ⭐ FUNCIONES LEGACY PARA COMPATIBILIDAD ⭐
async function validateisRuta(req, res) {
  try {
    res.status(200).json({
      success: true,
      message: "Ruta validada correctamente",
      data: { isValid: true },
    });
  } catch (error) {
    logger.error("❌ Error validando ruta:", error);
    res.status(500).json({
      success: false,
      message: "Error al validar ruta",
      error: error.message,
    });
  }
}

async function validateuserActive(req, res) {
  try {
    const { userId } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario inválido",
      });
    }

    const user = await User.findById(userId).select("activo").lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userId: userId,
        isActive: user.activo,
        validated: true,
      },
    });
  } catch (error) {
    logger.error("❌ Error validando usuario activo:", error);
    res.status(500).json({
      success: false,
      message: "Error al validar usuario activo",
      error: error.message,
    });
  }
}

// ⭐ FUNCIONES HELPER PARA INVALIDACIÓN DE CACHE ⭐
async function invalidateUserCacheOnModuleChange() {
  try {
    await invalidateModulesCache();
    logger.info("🔄 Cache invalidado por cambio en módulos");
  } catch (error) {
    logger.error("Error invalidando cache por cambio de módulos:", error);
  }
}

async function invalidateUserCacheOnRoleChange(roleId) {
  try {
    // Encontrar usuarios que tienen este rol
    const usersWithRole = await User.find({
      roles: roleId,
    })
      .select("_id")
      .lean();

    // Invalidar cache de cada usuario
    for (const user of usersWithRole) {
      await invalidateUserCache(user._id.toString());
    }

    logger.info(
      `🔄 Cache invalidado para ${usersWithRole.length} usuarios por cambio en rol`
    );
  } catch (error) {
    logger.error("Error invalidando cache por cambio de rol:", error);
  }
}

// =====================================================
// ⭐ EXPORTAR TODAS LAS FUNCIONES ⭐
// =====================================================
module.exports = {
  // Funciones principales
  getMe,
  getUserPermissions,
  getUserAllPermissions,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  ActiveInactiveUser,
  searchUsers,
  updateUserRoles,
  updateUserSpecificPermissions,
  getUsersWithRoles,
  getUserStats,
  validateUserRoleSystem,

  // Funciones legacy
  validateisRuta,
  validateuserActive,

  // Funciones helper para cache
  invalidateUserCache,
  invalidateModulesCache,
  invalidateUserCacheOnModuleChange,
  invalidateUserCacheOnRoleChange,

  // Funciones utilitarias
  getActiveModules,
  generateDynamicAdminPermissions,
  calculateUserPermissionsDynamic,
};
