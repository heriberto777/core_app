// controllers/roleController.js
"use strict";

const mongoose = require("mongoose");
const Role = require("../models/roleModel");
const User = require("../models/userModel");
const logger = require("../services/logger");

/**
 * Obtiene todos los roles con paginación
 */
async function getRoles(req, res) {
  try {
    const { page = 1, limit = 20, search = "", includeInactive = false } = req.body;
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const filters = {};
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (!includeInactive) filters.isActive = true;

    const [roles, totalRoles] = await Promise.all([
      Role.find(filters)
        .populate("createdBy", "name lastname email")
        .populate("updatedBy", "name lastname email")
        .sort({ isSystem: -1, displayName: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Role.countDocuments(filters),
    ]);

    const rolesWithInfo = await Promise.all(
      roles.map(async (role) => {
        const userCount = await User.countDocuments({ roles: role._id });
        return {
          ...role,
          userCount,
          permissionCount: role.permissions?.length || 0,
          canDelete: !role.isSystem && userCount === 0,
          canEdit: !role.isSystem,
        };
      })
    );

    const totalPages = Math.ceil(totalRoles / limitNumber);

    return res.status(200).json({
      success: true,
      data: {
        roles: rolesWithInfo,
        pagination: {
          currentPage: pageNumber,
          totalPages,
          totalRoles,
          hasNextPage: pageNumber < totalPages,
          hasPrevPage: pageNumber > 1,
          limit: limitNumber,
        },
      },
    });
  } catch (error) {
    logger.error("Error en getRoles:", error);
    return res.status(500).json({ success: false, message: "Error al obtener roles", error: error.message });
  }
}

/**
 * Obtiene rol por ID con información de usuarios asignados
 */
async function getRoleById(req, res) {
  try {
    const { id } = req.params;
    const role = await Role.findById(id)
      .populate("createdBy", "name lastname email")
      .populate("updatedBy", "name lastname email")
      .lean();

    if (!role) return res.status(404).json({ success: false, message: "Rol no encontrado" });

    const totalUsersWithRole = await User.countDocuments({ roles: id });
    const usersWithRole = await User.find({ roles: id }).select("name lastname email activo").limit(10).lean();

    const roleWithInfo = {
      ...role,
      userCount: totalUsersWithRole,
      usersWithRole,
      canDelete: !role.isSystem && totalUsersWithRole === 0,
      canEdit: !role.isSystem,
    };

    return res.status(200).json({ success: true, data: roleWithInfo });
  } catch (error) {
    logger.error(`Error en getRoleById (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al obtener rol", error: error.message });
  }
}

/**
 * Crea un nuevo rol
 */
async function createRole(req, res) {
  try {
    const { name, displayName, description, permissions } = req.body;
    const userId = req.user?.user_id || req.user?._id;
    const roleName = name?.toLowerCase().trim();

    const existingRole = await Role.findOne({
      $or: [{ name: roleName }, { displayName: displayName?.trim() }],
    }).lean();

    if (existingRole) return res.status(409).json({ success: false, message: "Ya existe un rol con ese nombre" });

    const newRole = new Role({
      name: roleName,
      displayName: displayName?.trim(),
      description: description?.trim() || "",
      permissions,
      isSystem: false,
      isActive: true,
      createdBy: userId,
    });

    await newRole.save();
    logger.info(`Rol creado: ${newRole.displayName} por ${userId}`);

    return res.status(201).json({ success: true, message: "Rol creado exitosamente", data: newRole });
  } catch (error) {
    logger.error("Error en createRole:", error);
    return res.status(500).json({ success: false, message: "Error al crear rol", error: error.message });
  }
}

/**
 * Actualiza un rol existente
 */
async function updateRole(req, res) {
  try {
    const { id } = req.params;
    const { name, displayName, description, permissions } = req.body;
    const userId = req.user?.user_id || req.user?._id;

    const role = await Role.findById(id);
    if (!role) return res.status(404).json({ success: false, message: "Rol no encontrado" });

    if (role.isSystem) return res.status(403).json({ success: false, message: "No se pueden editar roles del sistema" });

    const duplicateRole = await Role.findOne({
      _id: { $ne: id },
      $or: [{ name: name?.toLowerCase().trim() }, { displayName: displayName?.trim() }],
    }).lean();

    if (duplicateRole) return res.status(409).json({ success: false, message: "Ya existe otro rol con ese nombre" });

    const updateData = {
      name: name?.toLowerCase().trim() || role.name,
      displayName: displayName?.trim() || role.displayName,
      description: description?.trim() || role.description,
      updatedBy: userId,
      updatedAt: new Date()
    };

    if (permissions) updateData.permissions = permissions;

    const updatedRole = await Role.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }).lean();
    logger.info(`Rol actualizado: ${updatedRole.displayName} por ${userId}`);

    return res.status(200).json({ success: true, message: "Rol actualizado exitosamente", data: updatedRole });
  } catch (error) {
    logger.error(`Error en updateRole (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al actualizar rol", error: error.message });
  }
}

/**
 * Elimina un rol
 */
async function deleteRole(req, res) {
  try {
    const { id } = req.params;
    const role = await Role.findById(id).lean();

    if (!role) return res.status(404).json({ success: false, message: "Rol no encontrado" });
    if (role.isSystem) return res.status(403).json({ success: false, message: "No se pueden eliminar roles del sistema" });

    const usersWithRole = await User.countDocuments({ roles: id });
    if (usersWithRole > 0) return res.status(400).json({ success: false, message: `No se puede eliminar el rol. ${usersWithRole} usuario(s) lo tienen asignado` });

    await Role.findByIdAndDelete(id);
    logger.warn(`Rol eliminado: ${role.displayName} por ${req.user?.user_id || req.user?._id}`);

    return res.status(200).json({ success: true, message: "Rol eliminado exitosamente" });
  } catch (error) {
    logger.error(`Error en deleteRole (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al eliminar rol", error: error.message });
  }
}

/**
 * Cambia el estado de un rol
 */
async function toggleRoleStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const userId = req.user?.user_id || req.user?._id;

    const role = await Role.findById(id).lean();
    if (!role) return res.status(404).json({ success: false, message: "Rol no encontrado" });

    if (role.isSystem && !isActive) return res.status(403).json({ success: false, message: "No se pueden desactivar roles del sistema" });

    const updatedRole = await Role.findByIdAndUpdate(id, { isActive, updatedBy: userId, updatedAt: new Date() }, { new: true }).lean();
    logger.info(`Estado de rol cambiado (${isActive ? "activado" : "desactivado"}): ${updatedRole.displayName} por ${userId}`);

    return res.status(200).json({ success: true, message: `Rol ${isActive ? "activado" : "desactivado"} exitosamente`, data: updatedRole });
  } catch (error) {
    logger.error(`Error en toggleRoleStatus (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error al cambiar estado del rol", error: error.message });
  }
}

/**
 * Asigna usuarios a un rol
 */
async function assignUsersToRole(req, res) {
  try {
    const { roleId, userIds } = req.body;
    const userId = req.user?.user_id || req.user?._id;

    const role = await Role.findById(roleId).lean();
    if (!role) return res.status(404).json({ success: false, message: "Rol no encontrado" });
    if (!role.isActive) return res.status(400).json({ success: false, message: "No se pueden asignar usuarios a un rol inactivo" });

    const result = await User.updateMany(
      { _id: { $in: userIds }, activo: true },
      { $addToSet: { roles: roleId, role: role.name } }
    );

    logger.info(`Rol ${role.name} asignado a ${result.modifiedCount} usuarios por ${userId}`);

    return res.status(200).json({
      success: true,
      message: `Rol asignado exitosamente a ${result.modifiedCount} usuario(s)`,
      data: { usersAssigned: result.modifiedCount }
    });
  } catch (error) {
    logger.error("Error en assignUsersToRole:", error);
    return res.status(500).json({ success: false, message: "Error al asignar usuarios al rol", error: error.message });
  }
}

/**
 * Remueve usuarios de un rol
 */
async function removeUsersFromRole(req, res) {
  try {
    const { roleId, userIds } = req.body;
    const role = await Role.findById(roleId).lean();

    if (!role) return res.status(404).json({ success: false, message: "Rol no encontrado" });

    // Validación crítica: No remover último admin
    if (role.name === "admin" || role.name === "superadmin") {
      const remainingAdmins = await User.countDocuments({ roles: roleId, _id: { $nin: userIds }, activo: true });
      if (remainingAdmins === 0) return res.status(422).json({ success: false, message: "No se puede remover el rol admin del último administrador activo" });
    }

    const result = await User.updateMany({ _id: { $in: userIds } }, { $pull: { roles: roleId, role: role.name } });
    logger.info(`Rol ${role.name} removido de ${result.modifiedCount} usuarios por ${req.user?.user_id || req.user?._id}`);

    return res.status(200).json({ success: true, message: `Rol removido exitosamente de ${result.modifiedCount} usuario(s)` });
  } catch (error) {
    logger.error("Error en removeUsersFromRole:", error);
    return res.status(500).json({ success: false, message: "Error al remover usuarios del rol", error: error.message });
  }
}

/**
 * Duplica un rol existente
 */
async function duplicateRole(req, res) {
  try {
    const { id } = req.params;
    const { newName, newDisplayName } = req.body;
    const userId = req.user?.user_id || req.user?._id;

    const originalRole = await Role.findById(id).lean();
    if (!originalRole) return res.status(404).json({ success: false, message: "Rol original no encontrado" });

    const nName = newName?.toLowerCase().trim();
    const existingRole = await Role.findOne({ $or: [{ name: nName }, { displayName: newDisplayName?.trim() }] }).lean();

    if (existingRole) return res.status(422).json({ success: false, message: "Ya existe un rol con ese nombre" });

    const duplicatedRole = new Role({
      name: nName,
      displayName: newDisplayName?.trim(),
      description: `${originalRole.description} (Copia)`,
      permissions: originalRole.permissions,
      isSystem: false,
      isActive: true,
      createdBy: userId,
    });

    await duplicatedRole.save();
    logger.info(`Rol duplicado de ${originalRole.name} a ${duplicatedRole.name} por ${userId}`);

    return res.status(201).json({ success: true, message: "Rol duplicado exitosamente", data: duplicatedRole });
  } catch (error) {
    logger.error("Error en duplicateRole:", error);
    return res.status(500).json({ success: false, message: "Error al duplicar rol", error: error.message });
  }
}

/**
 * Obtiene estadísticas de roles
 */
async function getRoleStats(req, res) {
  try {
    const [totalRoles, activeRoles, systemRoles] = await Promise.all([
      Role.countDocuments({}),
      Role.countDocuments({ isActive: true }),
      Role.countDocuments({ isSystem: true }),
    ]);

    const roleUsage = await Role.aggregate([
      { $lookup: { from: "users", localField: "_id", foreignField: "roles", as: "users" } },
      { $project: { displayName: 1, userCount: { $size: "$users" } } },
      { $sort: { userCount: -1 } },
      { $limit: 10 },
    ]);

    return res.status(200).json({
      success: true,
      data: { total: totalRoles, active: activeRoles, system: systemRoles, usage: roleUsage, lastUpdated: new Date() }
    });
  } catch (error) {
    logger.error("Error en getRoleStats:", error);
    return res.status(500).json({ success: false, message: "Error al obtener estadísticas", error: error.message });
  }
}

/**
 * Obtiene lista simplificada de roles activos
 */
async function getAvailableRoles(req, res) {
  try {
    const roles = await Role.find({ isActive: true })
      .select("name displayName description isSystem")
      .sort({ displayName: 1 })
      .lean();

    return res.status(200).json({ success: true, data: roles });
  } catch (error) {
    logger.error("Error en getAvailableRoles:", error);
    return res.status(500).json({ success: false, message: "Error al obtener roles disponibles" });
  }
}

/**
 * Retorna los recursos (módulos) disponibles para asignar permisos
 */
async function getAvailableResources(req, res) {
  try {
    const ModuleConfig = require("../models/moduleConfigModel");
    const modules = await ModuleConfig.find({ isActive: true })
      .select("name displayName resource category")
      .sort({ "uiConfig.order": 1, displayName: 1 })
      .lean();

    return res.status(200).json({ success: true, data: modules });
  } catch (error) {
    logger.error("Error en getAvailableResources:", error);
    return res.status(500).json({ success: false, message: "Error al obtener recursos disponibles" });
  }
}

/**
 * Retorna las acciones posibles para los permisos
 */
async function getAvailableActions(req, res) {
  try {
    // Estas acciones son estándar en el sistema
    const actions = [
      { name: "create", displayName: "Crear", description: "Permite crear nuevos registros" },
      { name: "read", displayName: "Leer", description: "Permite visualizar registros" },
      { name: "update", displayName: "Actualizar", description: "Permite modificar registros existentes" },
      { name: "delete", displayName: "Eliminar", description: "Permite borrar registros" },
      { name: "manage", displayName: "Administrar", description: "Control total sobre el módulo" },
      { name: "export", displayName: "Exportar", description: "Permite exportar datos a Excel/PDF" },
      { name: "import", displayName: "Importar", description: "Permite cargar datos masivamente" },
      { name: "approve", displayName: "Aprobar", description: "Permite autorizar procesos" },
      { name: "execute", displayName: "Ejecutar", description: "Permite disparar procesos manuales" }
    ];

    return res.status(200).json({ success: true, data: actions });
  } catch (error) {
    logger.error("Error en getAvailableActions:", error);
    return res.status(500).json({ success: false, message: "Error al obtener acciones disponibles" });
  }
}

/**
 * Lista usuarios que pertenecen a un rol específico
 */
async function getUsersByRole(req, res) {
  try {
    const { roleName } = req.params;
    const role = await Role.findOne({ name: roleName.toLowerCase() }).lean();

    if (!role) {
      return res.status(404).json({ success: false, message: "Rol no encontrado" });
    }

    const users = await User.find({ roles: role._id, activo: true })
      .select("name lastname email avatar activo")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    logger.error(`Error en getUsersByRole (${req.params.roleName}):`, error);
    return res.status(500).json({ success: false, message: "Error al obtener usuarios por rol" });
  }
}

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  toggleRoleStatus,
  assignUsersToRole,
  removeUsersFromRole,
  duplicateRole,
  getRoleStats,
  getAvailableRoles,
  getAvailableResources,
  getAvailableActions,
  getUsersByRole,
};
