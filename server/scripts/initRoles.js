// scripts/initRoles.js
const User = require("../models/userModel");
const Role = require("../models/roleModel");

const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

const initializeSystem = async () => {
  try {
    console.log("🎭 Inicializando sistema de roles...");

    // ⭐ LIMPIAR ROLES EXISTENTES DUPLICADOS ⭐
    console.log("🧹 Limpiando roles duplicados...");
    const duplicateRoles = await Role.aggregate([
      { $group: { _id: "$name", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    for (const duplicate of duplicateRoles) {
      const idsToDelete = duplicate.ids.slice(1); // Mantener el primero
      await Role.deleteMany({ _id: { $in: idsToDelete } });
      console.log(
        `🗑️ Eliminados ${idsToDelete.length} roles duplicados: ${duplicate._id}`
      );
    }

    // ⭐ DEFINICIÓN DE ROLES DEL SISTEMA ⭐
    const systemRoles = [
      {
        name: "superadmin",
        displayName: "Super Administrador",
        description: "Control total del sistema",
        permissions: [
          {
            resource: "users",
            actions: ["create", "read", "update", "delete", "manage"],
          },
          {
            resource: "roles",
            actions: ["create", "read", "update", "delete", "manage"],
          },
          {
            resource: "tasks",
            actions: [
              "create",
              "read",
              "update",
              "delete",
              "execute",
              "manage",
              "assign",
              "approve",
            ],
          },
          {
            resource: "loads",
            actions: ["create", "read", "update", "delete", "manage"],
          },
          {
            resource: "reports",
            actions: ["create", "read", "update", "delete", "export"],
          },
          {
            resource: "analytics",
            actions: ["read", "export"],
          },
          {
            resource: "documents",
            actions: ["create", "read", "update", "delete", "manage"],
          },
          {
            resource: "history",
            actions: ["read", "export"],
          },
          {
            resource: "settings",
            actions: ["read", "update", "manage"],
          },
          {
            resource: "profile",
            actions: ["read", "update"],
          },
          {
            resource: "modules",
            actions: ["create", "read", "update", "delete", "manage"],
          },
        ],
        isSystem: true,
        isActive: true,
        priority: 10,
      },

      {
        name: "admin",
        displayName: "Administrador",
        description: "Administrador general del sistema",
        permissions: [
          {
            resource: "users",
            actions: ["create", "read", "update", "delete"],
          },
          {
            resource: "roles",
            actions: ["read", "update"],
          },
          {
            resource: "tasks",
            actions: [
              "create",
              "read",
              "update",
              "delete",
              "execute",
              "assign",
            ],
          },
          {
            resource: "loads",
            actions: ["create", "read", "update", "delete"],
          },
          {
            resource: "reports",
            actions: ["create", "read", "update", "export"],
          },
          {
            resource: "analytics",
            actions: ["read"],
          },
          {
            resource: "documents",
            actions: ["create", "read", "update", "delete"],
          },
          {
            resource: "history",
            actions: ["read"],
          },
          {
            resource: "settings",
            actions: ["read", "update"],
          },
          {
            resource: "profile",
            actions: ["read", "update"],
          },
          {
            resource: "modules",
            actions: ["read", "update"],
          },
        ],
        isSystem: true,
        isActive: true,
        priority: 9,
      },

      {
        name: "coordinador",
        displayName: "Coordinador de Operaciones",
        description: "Coordina tareas y cargas",
        permissions: [
          {
            resource: "tasks",
            actions: ["create", "read", "update", "assign"],
          },
          {
            resource: "loads",
            actions: ["create", "read", "update"],
          },
          {
            resource: "reports",
            actions: ["create", "read", "update"],
          },
          {
            resource: "documents",
            actions: ["create", "read", "update"],
          },
          {
            resource: "history",
            actions: ["read"],
          },
          {
            resource: "profile",
            actions: ["read", "update"],
          },
          {
            resource: "modules",
            actions: ["read"],
          },
        ],
        isSystem: true,
        isActive: true,
        priority: 7,
      },

      {
        name: "supervisor",
        displayName: "Supervisor",
        description: "Supervisa operaciones del sistema",
        permissions: [
          {
            resource: "tasks",
            actions: ["read", "update", "execute", "approve"], // ✅ "execute" ahora válido
          },
          {
            resource: "loads",
            actions: ["read", "update"],
          },
          {
            resource: "reports",
            actions: ["read", "create"],
          },
          {
            resource: "analytics",
            actions: ["read"],
          },
          {
            resource: "documents",
            actions: ["read", "update"],
          },
          {
            resource: "history",
            actions: ["read"],
          },
          {
            resource: "profile",
            actions: ["read", "update"],
          },
        ],
        isSystem: true,
        isActive: true,
        priority: 6,
      },

      {
        name: "operador",
        displayName: "Operador",
        description: "Maneja tareas y cargas asignadas",
        permissions: [
          {
            resource: "tasks",
            actions: ["read", "update", "execute"], // ✅ "execute" ahora válido
          },
          {
            resource: "loads",
            actions: ["read", "update"],
          },
          {
            resource: "reports",
            actions: ["read"],
          },
          {
            resource: "documents",
            actions: ["read", "create"],
          },
          {
            resource: "history",
            actions: ["read"],
          },
          {
            resource: "profile",
            actions: ["read", "update"],
          },
        ],
        isSystem: true,
        isActive: true,
        priority: 5,
      },

      {
        name: "analista",
        displayName: "Analista de Datos",
        description: "Análisis de datos y reportes",
        permissions: [
          {
            resource: "reports",
            actions: ["create", "read", "update", "export"],
          },
          {
            resource: "analytics",
            actions: ["read", "export"],
          },
          {
            resource: "documents",
            actions: ["read"],
          },
          {
            resource: "history",
            actions: ["read"],
          },
          {
            resource: "profile",
            actions: ["read", "update"],
          },
        ],
        isSystem: true,
        isActive: true,
        priority: 4,
      },

      {
        name: "employee",
        displayName: "Empleado",
        description: "Acceso básico al sistema",
        permissions: [
          {
            resource: "tasks",
            actions: ["read"],
          },
          {
            resource: "loads",
            actions: ["read"],
          },
          {
            resource: "reports",
            actions: ["read"],
          },
          {
            resource: "documents",
            actions: ["read"],
          },
          {
            resource: "profile",
            actions: ["read", "update"],
          },
        ],
        isSystem: true,
        isActive: true,
        priority: 2,
      },

      {
        name: "viewer",
        displayName: "Visualizador",
        description: "Solo lectura del sistema",
        permissions: [
          {
            resource: "tasks",
            actions: ["read", "view"],
          },
          {
            resource: "loads",
            actions: ["read", "view"],
          },
          {
            resource: "reports",
            actions: ["read", "view"],
          },
          {
            resource: "analytics",
            actions: ["read", "view"],
          },
          {
            resource: "documents",
            actions: ["read", "view"],
          },
          {
            resource: "history",
            actions: ["read", "view"],
          },
          {
            resource: "profile",
            actions: ["read", "update"],
          },
        ],
        isSystem: true,
        isActive: true,
        priority: 1,
      },
    ];

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    // ⭐ CREAR O ACTUALIZAR ROLES ⭐
    for (const roleData of systemRoles) {
      try {
        console.log(`📝 Procesando rol: ${roleData.name}...`);

        let role = await Role.findOne({ name: roleData.name });

        if (role) {
          // Actualizar rol existente
          Object.assign(role, roleData);
          await role.save();
          console.log(`✅ Rol ${roleData.name} actualizado`);
          updatedCount++;
        } else {
          // Crear nuevo rol
          role = new Role(roleData);
          await role.save();
          console.log(`✅ Rol ${roleData.name} creado`);
          createdCount++;
        }
      } catch (error) {
        console.error(
          `❌ Error procesando rol ${roleData.name}:`,
          error.message
        );
        errorCount++;
      }
    }

    console.log("\n📊 Resumen de inicialización de roles:");
    console.log(`   ✅ Roles creados: ${createdCount}`);
    console.log(`   🔄 Roles actualizados: ${updatedCount}`);
    console.log(`   ❌ Errores: ${errorCount}`);

    const success = errorCount === 0;
    if (success) {
      console.log("🎉 Sistema de roles inicializado correctamente");
    } else {
      console.log("⚠️ Sistema inicializado con algunos errores");
    }

    return {
      success,
      created: createdCount,
      updated: updatedCount,
      errors: errorCount,
    };
  } catch (error) {
    console.error("❌ Error inicializando sistema de roles:", error);
    throw error;
  }
};

// ⭐ FUNCIÓN PARA VERIFICAR ESTADO DEL SISTEMA ⭐
const checkSystemInitialization = async () => {
  try {
    const systemRolesCount = await Role.countDocuments({
      isSystem: true,
      isActive: true,
    });
    const adminUsersCount = await User.countDocuments({ isAdmin: true });

    return {
      rolesInitialized: systemRolesCount >= 5,
      adminUsersExist: adminUsersCount > 0,
      systemReady: systemRolesCount >= 5 && adminUsersCount > 0,
      stats: {
        systemRoles: systemRolesCount,
        adminUsers: adminUsersCount,
      },
    };
  } catch (error) {
    console.error("Error verificando inicialización:", error);
    return {
      rolesInitialized: false,
      adminUsersExist: false,
      systemReady: false,
      error: error.message,
    };
  }
};

module.exports = {
  initializeSystem,
  checkSystemInitialization,
};
