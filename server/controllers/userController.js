// controllers/userController.js
const User = require("../models/userModel");
const Role = require("../models/roleModel");
const ModuleConfig = require("../models/moduleConfigModel");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
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
      logger.info(`📋 Módulos activos cargados de DB: ${modules.length}`);
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
        if (typeof action === "object" && action.name) return action.name;
        return typeof action === "string" ? action : "read";
      });
    } else {
      availableActions = ["create", "read", "update", "delete"];
    }

    if (!availableActions.includes("manage")) availableActions.push("manage");

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

  adminPermissions.push({
    resource: "system",
    actions: ["manage", "configure", "monitor", "backup", "restore"],
    moduleName: "Sistema General",
    category: "system",
    source: "admin",
  });

  return adminPermissions;
}

// ⭐ OBTENER ACCIONES COMUNES SEGÚN EL TIPO DE MÓDULO ⭐
function getCommonActionsForModule(module) {
  const categoryActions = {
    administrative: ["create", "read", "update", "delete", "manage", "configure"],
    operational: ["create", "read", "update", "delete", "execute", "process"],
    analysis: ["read", "export", "generate", "analyze"],
    security: ["manage", "audit", "monitor"],
    system: ["configure", "manage", "monitor"],
  };

  return categoryActions[module.category] || ["create", "read", "update", "delete"];
}

// ⭐ CÁLCULO DINÁMICO DE PERMISOS PARA USUARIOS NO ADMIN ⭐
async function calculateUserPermissionsDynamic(user, activeModules) {
  const consolidatedPermissions = new Map();
  const permissionSources = [];
  const accessibleModules = [];
  const modulesSummary = [];

  // Recolectar todos los permisos posibles
  const sourceList = [];
  if (user.permissions?.length > 0) {
    sourceList.push({ type: "direct", name: "Permisos Directos", permissions: user.permissions });
  }

  if (user.roles?.length > 0) {
    user.roles.forEach((role) => {
      if (role.isActive) {
        sourceList.push({ type: "role", name: role.displayName || role.name, permissions: role.permissions || [] });
      }
    });
  }

  // Consolidar
  sourceList.forEach((source) => {
    source.permissions.forEach((perm) => {
      if (!consolidatedPermissions.has(perm.resource)) {
        consolidatedPermissions.set(perm.resource, new Set());
      }
      perm.actions.forEach((action) => consolidatedPermissions.get(perm.resource).add(action));
    });
    permissionSources.push({ source: source.name, type: source.type, count: source.permissions.length });
  });

  // Mapear con módulos activos
  activeModules.forEach((module) => {
    const userActions = consolidatedPermissions.get(module.resource);
    const hasAccess = !!userActions && userActions.size > 0;
    const userPermissions = hasAccess ? Array.from(userActions) : [];

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
      hasAccess,
      permissions: userPermissions,
      availableActions: module.actions?.map((a) => (typeof a === "object" ? a.name : a)) || [],
    });
  });

  const consolidatedArray = Array.from(consolidatedPermissions.entries()).map(([resource, actions]) => {
    const relatedModule = activeModules.find((m) => m.resource === resource);
    return {
      resource,
      actions: Array.from(actions).sort(),
      moduleName: relatedModule ? relatedModule.displayName || relatedModule.name : resource,
      category: relatedModule?.category || "unknown",
      isModuleActive: !!relatedModule,
    };
  });

  return { consolidatedPermissions: consolidatedArray, permissionSources, accessibleModules, modulesSummary };
}

// ⭐ INVALIDAR CACHE DE USUARIO ⭐
async function invalidateUserCache(userId) {
  try {
    await cacheService.delete(CACHE_KEYS.USER_PERMISSIONS(userId));
    await cacheService.delete(CACHE_KEYS.USER_PROFILE(userId));
    await cacheService.delete(CACHE_KEYS.USER_ROLES(userId));
    logger.debug(`Cache invalidado para usuario: ${userId}`);
  } catch (error) {
    logger.error(`Error invalidando cache de usuario ${userId} en invalidateUserCache:`, error);
  }
}

// ⭐ INVALIDAR CACHE DE MÓDULOS ⭐
async function invalidateModulesCache() {
  try {
    await cacheService.delete(CACHE_KEYS.ACTIVE_MODULES);
    await cacheService.invalidatePattern("user_permissions_");
    logger.info("Cache de módulos y permisos invalidado");
  } catch (error) {
    logger.error("Error invalidando cache de módulos en invalidateModulesCache:", error);
  }
}

// =====================================================
// ⭐ CONTROLADORES PRINCIPALES ⭐
// =====================================================

async function getMe(req, res) {
  try {
    const userId = req.user?.user_id || req.user?._id;
    const user = await cacheService.getOrSet(
      CACHE_KEYS.USER_PROFILE(userId),
      async () => {
        const userData = await User.findById(userId)
          .select("-password")
          .populate("roles", "name displayName description isActive")
          .lean();
        if (!userData) throw new Error("Usuario no encontrado");
        return userData;
      },
      CACHE_TTL.USER_PROFILE
    );

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    logger.error("Error en getMe:", error);
    return res.status(500).json({ success: false, message: "Error al obtener perfil del usuario" });
  }
}

async function getUserPermissions(req, res) {
  try {
    const userId = req.user?.user_id || req.user?._id;
    const cachedData = await cacheService.get(CACHE_KEYS.USER_PERMISSIONS(userId));
    if (cachedData) return res.status(200).json({ success: true, data: { ...cachedData, fromCache: true } });

    const user = await User.findById(userId)
      .populate("roles", "name displayName permissions isActive")
      .select("-password")
      .lean();

    if (!user) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    const activeModules = await getActiveModules();
    let responseData;

    if (user.isAdmin) {
      const adminPermissions = generateDynamicAdminPermissions(activeModules);
      responseData = {
        isAdmin: true,
        roles: user.roles || [],
        permissions: adminPermissions,
        consolidatedPermissions: adminPermissions,
        availableModules: activeModules.length,
        modulesSummary: activeModules.map((m) => ({ name: m.name, resource: m.resource, displayName: m.displayName, category: m.category })),
        lastUpdated: new Date(),
      };
    } else {
      const permissionData = await calculateUserPermissionsDynamic(user, activeModules);
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

    await cacheService.set(CACHE_KEYS.USER_PERMISSIONS(userId), responseData, CACHE_TTL.USER_PERMISSIONS);
    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    logger.error("Error en getUserPermissions:", error);
    return res.status(500).json({ success: false, message: "Error al obtener permisos del usuario" });
  }
}

async function getUsers(req, res) {
  try {
    const { page = 1, limit = 20, search = "", role = "", activo = "" } = req.body;
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const filters = {};
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (role) filters.roles = { $in: Array.isArray(role) ? role : [role] };
    if (activo !== "") filters.activo = activo === "true" || activo === true;

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
    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: { currentPage: pageNumber, totalPages, totalUsers, hasNextPage: pageNumber < totalPages, hasPrevPage: pageNumber > 1 }
      },
    });
  } catch (error) {
    logger.error("Error en getUsers:", error);
    return res.status(500).json({ success: false, message: "Error al obtener usuarios" });
  }
}

async function createUser(req, res) {
  try {
    const userData = req.body;
    const emailLower = userData.email?.toLowerCase().trim();

    const existingUser = await User.findOne({ email: emailLower }).lean();
    if (existingUser) return res.status(409).json({ success: false, message: "El email ya está registrado" });

    // Hashear la contraseña antes de guardar
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(userData.password, salt);

    const newUser = new User({ ...userData, password: hashedPassword, email: emailLower });
    await newUser.save();

    await cacheService.invalidatePattern("user_");
    logger.info(`Usuario creado: ${newUser.email} por ${req.user?.user_id || req.user?._id}`);

    return res.status(201).json({ success: true, message: "Usuario creado exitosamente", data: { _id: newUser._id, name: newUser.name, email: newUser.email } });
  } catch (error) {
    logger.error("Error en createUser:", error);
    return res.status(500).json({ success: false, message: "Error al crear usuario" });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    delete updateData.password;
    delete updateData._id;

    const updatedUser = await User.findByIdAndUpdate(id, { ...updateData, updatedAt: new Date() }, { new: true, runValidators: true })
      .populate("roles", "name displayName description isActive")
      .select("-password")
      .lean();

    if (!updatedUser) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    await invalidateUserCache(id);
    logger.info(`Usuario actualizado: ${updatedUser.email} por ${req.user?.user_id || req.user?._id}`);

    return res.status(200).json({ success: true, message: "Usuario actualizado exitosamente", data: updatedUser });
  } catch (error) {
    logger.error("Error en updateUser:", error);
    return res.status(500).json({ success: false, message: "Error al actualizar usuario" });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndUpdate(id, { activo: false, updatedAt: new Date() }, { new: true }).select("-password").lean();

    if (!user) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    await invalidateUserCache(id);
    logger.warn(`Usuario desactivado: ${user.email} por ${req.user?.user_id || req.user?._id}`);

    return res.status(200).json({ success: true, message: "Usuario desactivado exitosamente", data: user });
  } catch (error) {
    logger.error("Error en deleteUser:", error);
    return res.status(500).json({ success: false, message: "Error al desactivar usuario" });
  }
}

async function ActiveInactiveUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    const newStatus = !user.activo;
    const updatedUser = await User.findByIdAndUpdate(id, { activo: newStatus, updatedAt: new Date() }, { new: true }).select("-password").lean();

    await invalidateUserCache(id);
    logger.info(`Estado de usuario cambiado (${newStatus ? "activado" : "desactivado"}): ${updatedUser.email} por ${req.user?.user_id || req.user?._id}`);

    return res.status(200).json({ success: true, message: `Usuario ${newStatus ? "activado" : "desactivado"} exitosamente`, data: updatedUser });
  } catch (error) {
    logger.error("Error en ActiveInactiveUser:", error);
    return res.status(500).json({ success: false, message: "Error al cambiar estado del usuario" });
  }
}

async function searchUsers(req, res) {
  try {
    const { query, filters = {}, limit = 10 } = req.body;
    const searchFilters = { activo: true, ...filters };

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

    return res.status(200).json({ success: true, data: { users, total: users.length } });
  } catch (error) {
    logger.error("Error en searchUsers:", error);
    return res.status(500).json({ success: false, message: "Error al buscar usuarios" });
  }
}

async function updateUserRoles(req, res) {
  try {
    const { id } = req.params;
    const { roles } = req.body;

    const updatedUser = await User.findByIdAndUpdate(id, { roles: roles || [], updatedAt: new Date() }, { new: true })
      .populate("roles", "name displayName description isActive")
      .select("-password")
      .lean();

    if (!updatedUser) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    await invalidateUserCache(id);
    logger.info(`Roles actualizados para: ${updatedUser.email} por ${req.user?.user_id || req.user?._id}`);

    return res.status(200).json({ success: true, message: "Roles actualizados exitosamente", data: updatedUser });
  } catch (error) {
    logger.error("Error en updateUserRoles:", error);
    return res.status(500).json({ success: false, message: "Error al actualizar roles" });
  }
}

async function updateUserSpecificPermissions(req, res) {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    const updatedUser = await User.findByIdAndUpdate(id, { permissions: permissions || [], updatedAt: new Date() }, { new: true })
      .populate("roles", "name displayName description")
      .select("-password")
      .lean();

    if (!updatedUser) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    await invalidateUserCache(id);
    logger.info(`Permisos específicos actualizados para: ${updatedUser.email} por ${req.user?.user_id || req.user?._id}`);

    return res.status(200).json({ success: true, message: "Permisos específicos actualizados correctamente", data: updatedUser });
  } catch (error) {
    logger.error("Error en updateUserSpecificPermissions:", error);
    return res.status(500).json({ success: false, message: "Error al actualizar permisos específicos" });
  }
}

async function getUserStats(req, res) {
  try {
    const stats = await cacheService.getOrSet(
      "user_stats",
      async () => {
        const [totalUsers, activeUsers, adminUsers, usersWithRoles, recentUsers] = await Promise.all([
          User.countDocuments(),
          User.countDocuments({ activo: true }),
          User.countDocuments({ isAdmin: true }),
          User.countDocuments({ roles: { $exists: true, $not: { $size: 0 } } }),
          User.find().sort({ createdAt: -1 }).limit(5).select("name lastname email createdAt").lean(),
        ]);

        const roleStats = await User.aggregate([
          { $match: { activo: true } },
          { $unwind: "$roles" },
          { $lookup: { from: "roles", localField: "roles", foreignField: "_id", as: "roleData" } },
          { $unwind: "$roleData" },
          { $group: { _id: "$roleData.displayName", count: { $sum: 1 }, roleName: { $first: "$roleData.name" } } },
          { $sort: { count: -1 } },
        ]);

        return { overview: { total: totalUsers, active: activeUsers, admins: adminUsers, withRoles: usersWithRoles }, roleDistribution: roleStats, recentUsers, lastUpdated: new Date() };
      },
      300
    );

    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    logger.error("Error en getUserStats:", error);
    return res.status(500).json({ success: false, message: "Error al obtener estadísticas" });
  }
}

/**
 * Alias de getUsers que asegura población de roles (usado por el frontend)
 */
async function getUsersWithRoles(req, res) {
  // Reutilizamos la lógica de getUsers ya que esta ya hace populate de roles
  return getUsers(req, res);
}

/**
 * Obtiene todos los permisos consolidados de un usuario (roles + directos)
 */
async function getUserAllPermissions(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id)
      .populate("roles", "name displayName permissions isActive")
      .select("permissions roles admin")
      .lean();

    if (!user) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    const activeModules = await getActiveModules();
    const permissionData = await calculateUserPermissionsDynamic(user, activeModules);

    return res.status(200).json({
      success: true,
      data: {
        userId: id,
        consolidatedPermissions: permissionData.consolidatedPermissions,
        permissionSources: permissionData.permissionSources,
        accessibleModules: permissionData.accessibleModules
      }
    });
  } catch (error) {
    logger.error(`Error en getUserAllPermissions (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al consolidar permisos" });
  }
}

/**
 * Endpoint de diagnóstico del sistema de roles
 */
async function validateRoleSystem(req, res) {
  try {
    const totalUsers = await User.countDocuments();
    const totalRoles = await Role.countDocuments();
    const activeModules = await getActiveModules();

    const usersWithoutRoles = await User.countDocuments({
      roles: { $exists: true, $size: 0 },
      isAdmin: false
    });

    return res.status(200).json({
      success: true,
      data: {
        status: "healthy",
        stats: {
          totalUsers,
          totalRoles,
          activeModules: activeModules.length,
          usersWithoutRoles
        },
        timestamp: new Date()
      }
    });
  } catch (error) {
    logger.error("Error en validateRoleSystem:", error);
    return res.status(500).json({ success: false, message: "Error en diagnóstico de roles" });
  }
}

async function changePassword(req, res) {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: "La nueva contraseña debe tener al menos 6 caracteres" 
      });
    }
    
    const user = await User.findById(id).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }
    
    if (currentPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: "La contraseña actual es incorrecta" });
      }
    }
    
    // Hashear la nueva contraseña antes de guardar
    const salt = bcrypt.genSaltSync(10);
    user.password = bcrypt.hashSync(newPassword, salt);
    await user.save();
    
    await invalidateUserCache(id);
    logger.info(`Contraseña cambiada para usuario: ${user.email} por ${req.user?.user_id || req.user?._id}`);
    
    return res.status(200).json({ success: true, message: "Contraseña actualizada exitosamente" });
  } catch (error) {
    logger.error("Error en changePassword:", error);
    return res.status(500).json({ success: false, message: "Error al cambiar contraseña" });
  }
}

module.exports = {
  getMe,
  getUserPermissions,
  getUsers,
  getUsersWithRoles,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  ActiveInactiveUser,
  searchUsers,
  updateUserRoles,
  updateUserSpecificPermissions,
  getUserStats,
  getUserAllPermissions,
  validateRoleSystem,
  invalidateUserCache,
  invalidateModulesCache,
};
