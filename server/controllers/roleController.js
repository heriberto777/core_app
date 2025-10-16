// controllers/roleController.js
"use strict";

const mongoose = require("mongoose");
const Role = require("../models/roleModel");
const User = require("../models/userModel");

// ⭐ OBTENER TODOS LOS ROLES ⭐
async function getRoles(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      includeInactive = false,
    } = req.body;

    console.log("📋 Obteniendo roles - Página:", page, "Límite:", limit);

    // Construir filtros
    const filters = {};

    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (!includeInactive) {
      filters.isActive = true;
    }

    // Paginación
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Ejecutar consultas
    const [roles, totalRoles] = await Promise.all([
      Role.find(filters)
        .populate("createdBy", "name lastname email")
        .populate("updatedBy", "name lastname email")
        .sort({ isSystem: -1, displayName: 1 })
        .skip(skip)
        .limit(limitNumber),
      Role.countDocuments(filters),
    ]);

    // Agregar información adicional a cada rol
    const rolesWithInfo = await Promise.all(
      roles.map(async (role) => {
        const userCount = await User.countDocuments({ roles: role._id });
        return {
          ...role.toObject(),
          userCount,
          permissionCount: role.permissions?.length || 0,
          canDelete: !role.isSystem && userCount === 0,
          canEdit: !role.isSystem,
        };
      })
    );

    const totalPages = Math.ceil(totalRoles / limitNumber);

    res.status(200).json({
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
    console.error("❌ Error obteniendo roles:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener roles",
      error: error.message,
    });
  }
}

// ⭐ OBTENER ROL POR ID ⭐
async function getRoleById(req, res) {
  try {
    const { id } = req.params;

    console.log("📋 Obteniendo rol por ID:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de rol inválido",
      });
    }

    const role = await Role.findById(id)
      .populate("createdBy", "name lastname email")
      .populate("updatedBy", "name lastname email");

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado",
      });
    }

    // Obtener usuarios con este rol
    const usersWithRole = await User.find({ roles: id })
      .select("name lastname email activo")
      .limit(10);

    const totalUsersWithRole = await User.countDocuments({ roles: id });

    const roleWithInfo = {
      ...role.toObject(),
      userCount: totalUsersWithRole,
      usersWithRole,
      canDelete: !role.isSystem && totalUsersWithRole === 0,
      canEdit: !role.isSystem,
    };

    res.status(200).json({
      success: true,
      data: roleWithInfo,
    });
  } catch (error) {
    console.error("❌ Error obteniendo rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener rol",
      error: error.message,
    });
  }
}

// ⭐ CREAR NUEVO ROL ⭐
async function createRole(req, res) {
  try {
    const { name, displayName, description, permissions } = req.body;

    console.log("📝 Creando nuevo rol:", displayName);

    // Validaciones básicas
    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        message: "Nombre y nombre para mostrar son requeridos",
      });
    }

    // Validar formato del nombre
    if (!/^[a-z0-9-_]+$/.test(name)) {
      return res.status(400).json({
        success: false,
        message:
          "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos",
      });
    }

    // Verificar que no exista un rol con el mismo nombre
    const existingRole = await Role.findOne({
      $or: [{ name }, { displayName }],
    });

    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "Ya existe un rol con ese nombre",
      });
    }

    // Validar permisos
    if (!permissions || permissions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe asignar al menos un permiso al rol",
      });
    }

    // Validar estructura de permisos
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

    // Crear el rol
    const newRole = new Role({
      name: name.toLowerCase().trim(),
      displayName: displayName.trim(),
      description: description?.trim() || "",
      permissions,
      isSystem: false,
      isActive: true,
      createdBy: req.user.user_id || req.user._id,
    });

    await newRole.save();

    const createdRole = await Role.findById(newRole._id).populate(
      "createdBy",
      "name lastname email"
    );

    console.log("✅ Rol creado:", createdRole.displayName);

    res.status(201).json({
      success: true,
      message: "Rol creado exitosamente",
      data: createdRole,
    });
  } catch (error) {
    console.error("❌ Error creando rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear rol",
      error: error.message,
    });
  }
}

// ⭐ ACTUALIZAR ROL ⭐
async function updateRole(req, res) {
  try {
    const { id } = req.params;
    const { name, displayName, description, permissions } = req.body;

    console.log("📝 Actualizando rol:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de rol inválido",
      });
    }

    const existingRole = await Role.findById(id);
    if (!existingRole) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado",
      });
    }

    // No permitir editar roles del sistema
    if (existingRole.isSystem) {
      return res.status(400).json({
        success: false,
        message: "No se pueden editar roles del sistema",
      });
    }

    // Validaciones
    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        message: "Nombre y nombre para mostrar son requeridos",
      });
    }

    // Validar formato del nombre
    if (!/^[a-z0-9-_]+$/.test(name)) {
      return res.status(400).json({
        success: false,
        message:
          "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos",
      });
    }

    // Verificar que no exista otro rol con el mismo nombre
    const duplicateRole = await Role.findOne({
      _id: { $ne: id },
      $or: [{ name }, { displayName }],
    });

    if (duplicateRole) {
      return res.status(400).json({
        success: false,
        message: "Ya existe otro rol con ese nombre",
      });
    }

    // Validar permisos si se proporcionan
    if (permissions) {
      if (permissions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Debe asignar al menos un permiso al rol",
        });
      }

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

    // Actualizar rol
    const updateData = {
      name: name.toLowerCase().trim(),
      displayName: displayName.trim(),
      description: description?.trim() || "",
      updatedBy: req.user.user_id || req.user._id,
    };

    if (permissions) {
      updateData.permissions = permissions;
    }

    const updatedRole = await Role.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("createdBy", "name lastname email")
      .populate("updatedBy", "name lastname email");

    console.log("✅ Rol actualizado:", updatedRole.displayName);

    res.status(200).json({
      success: true,
      message: "Rol actualizado exitosamente",
      data: updatedRole,
    });
  } catch (error) {
    console.error("❌ Error actualizando rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar rol",
      error: error.message,
    });
  }
}

// ⭐ ELIMINAR ROL ⭐
async function deleteRole(req, res) {
  try {
    const { id } = req.params;

    console.log("🗑️ Eliminando rol:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de rol inválido",
      });
    }

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado",
      });
    }

    // No permitir eliminar roles del sistema
    if (role.isSystem) {
      return res.status(400).json({
        success: false,
        message: "No se pueden eliminar roles del sistema",
      });
    }

    // Verificar que no haya usuarios con este rol
    const usersWithRole = await User.countDocuments({ roles: id });
    if (usersWithRole > 0) {
      return res.status(400).json({
        success: false,
        message: `No se puede eliminar el rol. ${usersWithRole} usuario(s) tienen este rol asignado`,
      });
    }

    await Role.findByIdAndDelete(id);

    console.log("✅ Rol eliminado:", role.displayName);

    res.status(200).json({
      success: true,
      message: "Rol eliminado exitosamente",
      data: { deletedRole: role.displayName },
    });
  } catch (error) {
    console.error("❌ Error eliminando rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar rol",
      error: error.message,
    });
  }
}

// ⭐ CAMBIAR ESTADO DE ROL ⭐
async function toggleRoleStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    console.log("🔄 Cambiando estado de rol:", id, "a:", isActive);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de rol inválido",
      });
    }

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado",
      });
    }

    // No permitir desactivar roles del sistema
    if (role.isSystem && !isActive) {
      return res.status(400).json({
        success: false,
        message: "No se pueden desactivar roles del sistema",
      });
    }

    const updatedRole = await Role.findByIdAndUpdate(
      id,
      {
        isActive: isActive,
        updatedBy: req.user.user_id || req.user._id,
      },
      { new: true }
    );

    console.log(
      `✅ Rol ${isActive ? "activado" : "desactivado"}:`,
      updatedRole.displayName
    );

    res.status(200).json({
      success: true,
      message: `Rol ${isActive ? "activado" : "desactivado"} exitosamente`,
      data: updatedRole,
    });
  } catch (error) {
    console.error("❌ Error cambiando estado de rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al cambiar estado del rol",
      error: error.message,
    });
  }
}

// ⭐ OBTENER RECURSOS DISPONIBLES ⭐
async function getAvailableResources(req, res) {
  try {
    const resources = [
      {
        id: "users",
        name: "Usuarios",
        description: "Gestión de usuarios del sistema",
        category: "Administración",
        actions: ["create", "read", "update", "delete", "manage"],
      },
      {
        id: "roles",
        name: "Roles",
        description: "Gestión de roles y permisos",
        category: "Administración",
        actions: ["create", "read", "update", "delete", "manage"],
      },
      {
        id: "tasks",
        name: "Tareas",
        description: "Gestión de tareas del sistema",
        category: "Operaciones",
        actions: ["create", "read", "update", "delete", "manage", "execute"],
      },
      {
        id: "loads",
        name: "Cargas",
        description: "Gestión de cargas y transferencias",
        category: "Operaciones",
        actions: ["create", "read", "update", "delete", "manage"],
      },
      {
        id: "reports",
        name: "Reportes",
        description: "Generación y gestión de reportes",
        category: "Análisis",
        actions: ["create", "read", "update", "delete", "manage"],
      },
      {
        id: "analytics",
        name: "Analíticas",
        description: "Análisis estadístico y métricas",
        category: "Análisis",
        actions: ["read", "manage"],
      },
      {
        id: "documents",
        name: "Documentos",
        description: "Gestión de documentos del sistema",
        category: "Operaciones",
        actions: ["create", "read", "update", "delete", "manage"],
      },
      {
        id: "history",
        name: "Historial",
        description: "Historial de operaciones y logs",
        category: "Consultas",
        actions: ["read", "manage"],
      },
      {
        id: "settings",
        name: "Configuraciones",
        description: "Configuraciones del sistema",
        category: "Administración",
        actions: ["create", "read", "update", "delete", "manage"],
      },
      {
        id: "logs",
        name: "Logs",
        description: "Logs y auditoría del sistema",
        category: "Administración",
        actions: ["read", "manage"],
      },
      {
        id: "profile",
        name: "Perfil",
        description: "Perfil y configuración personal",
        category: "Personal",
        actions: ["read", "update"],
      },
    ];

    res.status(200).json({
      success: true,
      data: resources,
    });
  } catch (error) {
    console.error("❌ Error obteniendo recursos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener recursos disponibles",
      error: error.message,
    });
  }
}

// ⭐ OBTENER ACCIONES DISPONIBLES ⭐
async function getAvailableActions(req, res) {
  try {
    const actions = [
      {
        id: "create",
        name: "Crear",
        description: "Crear nuevos elementos",
      },
      {
        id: "read",
        name: "Leer",
        description: "Ver y consultar elementos",
      },
      {
        id: "update",
        name: "Actualizar",
        description: "Modificar elementos existentes",
      },
      {
        id: "delete",
        name: "Eliminar",
        description: "Eliminar elementos",
      },
      {
        id: "manage",
        name: "Gestionar",
        description: "Control total del recurso",
      },
      {
        id: "execute",
        name: "Ejecutar",
        description: "Ejecutar tareas o procesos",
      },
    ];

    res.status(200).json({
      success: true,
      data: actions,
    });
  } catch (error) {
    console.error("❌ Error obteniendo acciones:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener acciones disponibles",
      error: error.message,
    });
  }
}

// ⭐ OBTENER ROLES DISPONIBLES PARA ASIGNACIÓN ⭐
async function getAvailableRoles(req, res) {
  try {
    const roles = await Role.find({ isActive: true })
      .select("name displayName description permissions isSystem")
      .sort({ isSystem: -1, displayName: 1 });

    const rolesWithInfo = roles.map((role) => ({
      ...role.toObject(),
      permissionCount: role.permissions?.length || 0,
    }));

    res.status(200).json({
      success: true,
      data: rolesWithInfo,
    });
  } catch (error) {
    console.error("❌ Error obteniendo roles disponibles:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener roles disponibles",
      error: error.message,
    });
  }
}

// ⭐ ASIGNAR USUARIOS A ROL ⭐
async function assignUsersToRole(req, res) {
  try {
    const { roleId, userIds } = req.body;

    console.log("👥 Asignando usuarios a rol:", roleId);

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({
        success: false,
        message: "ID de rol inválido",
      });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado",
      });
    }

    if (!role.isActive) {
      return res.status(400).json({
        success: false,
        message: "No se pueden asignar usuarios a un rol inactivo",
      });
    }

    // Validar usuarios
    const validUserIds = [];
    for (const userId of userIds) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        continue;
      }

      const user = await User.findById(userId);
      if (user && user.activo) {
        validUserIds.push(userId);
      }
    }

    if (validUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No se encontraron usuarios válidos para asignar",
      });
    }

    // Asignar rol a usuarios
    const result = await User.updateMany(
      { _id: { $in: validUserIds } },
      {
        $addToSet: {
          roles: roleId,
          role: role.name,
        },
      }
    );

    console.log(`✅ Rol asignado a ${result.modifiedCount} usuarios`);

    res.status(200).json({
      success: true,
      message: `Rol asignado exitosamente a ${result.modifiedCount} usuario(s)`,
      data: {
        roleId,
        roleName: role.displayName,
        usersAssigned: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("❌ Error asignando usuarios a rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al asignar usuarios al rol",
      error: error.message,
    });
  }
}

// ⭐ REMOVER USUARIOS DE ROL ⭐
async function removeUsersFromRole(req, res) {
  try {
    const { roleId, userIds } = req.body;

    console.log("👥 Removiendo usuarios de rol:", roleId);

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({
        success: false,
        message: "ID de rol inválido",
      });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado",
      });
    }

    // Validar que no se está removiendo el último admin
    if (role.name === "admin" || role.name === "superadmin") {
      const remainingAdmins = await User.countDocuments({
        roles: roleId,
        _id: { $nin: userIds },
        activo: true,
      });

      if (remainingAdmins === 0) {
        return res.status(400).json({
          success: false,
          message: "No se puede remover el rol admin del último administrador",
        });
      }
    }

    // Remover rol de usuarios
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      {
        $pull: {
          roles: roleId,
          role: role.name,
        },
      }
    );

    console.log(`✅ Rol removido de ${result.modifiedCount} usuarios`);

    res.status(200).json({
      success: true,
      message: `Rol removido exitosamente de ${result.modifiedCount} usuario(s)`,
      data: {
        roleId,
        roleName: role.displayName,
        usersRemoved: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("❌ Error removiendo usuarios de rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al remover usuarios del rol",
      error: error.message,
    });
  }
}

// ⭐ DUPLICAR ROL ⭐
async function duplicateRole(req, res) {
  try {
    const { id } = req.params;
    const { newName, newDisplayName } = req.body;

    console.log("📋 Duplicando rol:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de rol inválido",
      });
    }

    const originalRole = await Role.findById(id);
    if (!originalRole) {
      return res.status(404).json({
        success: false,
        message: "Rol original no encontrado",
      });
    }

    // Validar nombres
    if (!newName || !newDisplayName) {
      return res.status(400).json({
        success: false,
        message: "Nombre y nombre para mostrar son requeridos",
      });
    }

    // Verificar que no existan los nuevos nombres
    const existingRole = await Role.findOne({
      $or: [{ name: newName }, { displayName: newDisplayName }],
    });

    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "Ya existe un rol con ese nombre",
      });
    }

    // Crear rol duplicado
    const duplicatedRole = new Role({
      name: newName.toLowerCase().trim(),
      displayName: newDisplayName.trim(),
      description: `${originalRole.description} (Copia)`,
      permissions: originalRole.permissions,
      isSystem: false,
      isActive: true,
      createdBy: req.user.user_id || req.user._id,
    });

    await duplicatedRole.save();

    const savedRole = await Role.findById(duplicatedRole._id).populate(
      "createdBy",
      "name lastname email"
    );

    console.log("✅ Rol duplicado:", savedRole.displayName);

    res.status(201).json({
      success: true,
      message: "Rol duplicado exitosamente",
      data: savedRole,
    });
  } catch (error) {
    console.error("❌ Error duplicando rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al duplicar rol",
      error: error.message,
    });
  }
}

// ⭐ OBTENER ESTADÍSTICAS DE ROLES ⭐
async function getRoleStats(req, res) {
  try {
    console.log("📊 Obteniendo estadísticas de roles...");

    const [totalRoles, activeRoles, inactiveRoles, systemRoles, customRoles] =
      await Promise.all([
        Role.countDocuments({}),
        Role.countDocuments({ isActive: true }),
        Role.countDocuments({ isActive: false }),
        Role.countDocuments({ isSystem: true }),
        Role.countDocuments({ isSystem: false }),
      ]);

    // Estadísticas de uso de roles
    const roleUsage = await Role.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "roles",
          as: "users",
        },
      },
      {
        $project: {
          name: 1,
          displayName: 1,
          isSystem: 1,
          isActive: 1,
          userCount: { $size: "$users" },
        },
      },
      { $sort: { userCount: -1 } },
      { $limit: 10 },
    ]);

    // Roles más populares
    const popularRoles = roleUsage.filter((role) => role.userCount > 0);

    // Roles sin uso
    const unusedRoles = await Role.find({
      _id: { $nin: await User.distinct("roles") },
      isSystem: false,
    }).select("name displayName");

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: totalRoles,
          active: activeRoles,
          inactive: inactiveRoles,
          system: systemRoles,
          custom: customRoles,
        },
        usage: {
          popular: popularRoles,
          unused: unusedRoles,
          totalAssignments: popularRoles.reduce(
            (sum, role) => sum + role.userCount,
            0
          ),
        },
        lastUpdated: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error obteniendo estadísticas de roles:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas de roles",
      error: error.message,
    });
  }
}

// ⭐ OBTENER USUARIOS POR ROL ⭐
async function getUsersByRole(req, res) {
  try {
    const { roleName } = req.params;
    const { page = 1, limit = 20 } = req.query;

    console.log("👥 Obteniendo usuarios por rol:", roleName);

    // Buscar el rol
    const role = await Role.findOne({ name: roleName });
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Rol no encontrado",
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Buscar usuarios con este rol
    const [users, totalUsers] = await Promise.all([
      User.find({ roles: role._id, activo: true })
        .select("-password")
        .populate("roles", "name displayName")
        .sort({ name: 1, lastname: 1 })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments({ roles: role._id, activo: true }),
    ]);

    console.log(
      `✅ ${users.length} usuarios encontrados con el rol ${role.displayName}`
    );

    res.status(200).json({
      success: true,
      data: {
        role: {
          id: role._id,
          name: role.name,
          displayName: role.displayName,
          description: role.description,
        },
        users,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalUsers / limitNum),
          totalUsers,
          usersPerPage: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error obteniendo usuarios por rol:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener usuarios por rol",
      error: error.message,
    });
  }
}

async function updateRolesWithModulesPermission(req, res) {
  try {
    // Solo super admin puede hacer esto
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          "Solo super administradores pueden actualizar permisos del sistema",
      });
    }

    const { roleUpdates } = req.body; // Array de { roleName, permissions }

    const results = [];

    for (const update of roleUpdates) {
      const role = await Role.findOne({ name: update.roleName });

      if (!role) {
        results.push({
          roleName: update.roleName,
          success: false,
          message: "Rol no encontrado",
        });
        continue;
      }

      // Verificar si ya tiene permisos de módulos
      const existingIndex = role.permissions.findIndex(
        (p) => p.resource === "modules"
      );

      if (existingIndex >= 0) {
        // Actualizar permisos existentes
        role.permissions[existingIndex] = {
          resource: "modules",
          actions: update.permissions,
        };
      } else {
        // Agregar nuevos permisos
        role.permissions.push({
          resource: "modules",
          actions: update.permissions,
        });
      }

      await role.save();

      results.push({
        roleName: update.roleName,
        success: true,
        message: "Permisos actualizados exitosamente",
      });
    }

    res.json({
      success: true,
      message: "Actualización de roles completada",
      data: results,
    });
  } catch (error) {
    console.error("Error actualizando roles:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar roles",
      error: error.message,
    });
  }
}

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  toggleRoleStatus,
  getAvailableResources,
  getAvailableActions,
  getAvailableRoles,
  assignUsersToRole,
  removeUsersFromRole,
  duplicateRole,
  getRoleStats,
  getUsersByRole,
  updateRolesWithModulesPermission,
};
