// scripts/initRoles.js
const User = require("../models/userModel");
const Role = require("../models/roleModel");

// ⭐ IMPORTAR CONFIGURACIÓN DE BD ⭐
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

const initializeSystem = async () => {
  try {
    console.log("🎭 Inicializando sistema de roles...");

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
            ],
          },
          {
            resource: "loads",
            actions: ["create", "read", "update", "delete", "manage"],
          },
          {
            resource: "reports",
            actions: ["create", "read", "update", "delete"],
          },
          { resource: "analytics", actions: ["read"] },
          {
            resource: "documents",
            actions: ["create", "read", "update", "delete"],
          },
          { resource: "history", actions: ["read"] },
          { resource: "settings", actions: ["read", "update"] },
          { resource: "profile", actions: ["read", "update"] },
          {
            resource: "modules",
            actions: ["create", "read", "update", "delete", "manage"],
          },
        ],
        isSystem: true,
        isActive: true,
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
          { resource: "roles", actions: ["read", "update"] },
          {
            resource: "tasks",
            actions: ["create", "read", "update", "delete", "execute"],
          },
          {
            resource: "loads",
            actions: ["create", "read", "update", "delete"],
          },
          { resource: "reports", actions: ["create", "read", "update"] },
          { resource: "analytics", actions: ["read"] },
          {
            resource: "documents",
            actions: ["create", "read", "update", "delete"],
          },
          { resource: "history", actions: ["read"] },
          { resource: "settings", actions: ["read", "update"] },
          { resource: "profile", actions: ["read", "update"] },
          { resource: "modules", actions: ["read", "update"] },
        ],
        isSystem: true,
        isActive: true,
      },

      {
        name: "coordinador",
        displayName: "Coordinador de Operaciones",
        description: "Coordina tareas y cargas",
        permissions: [
          { resource: "tasks", actions: ["create", "read", "update"] },
          { resource: "loads", actions: ["create", "read", "update"] },
          { resource: "reports", actions: ["create", "read"] },
          { resource: "documents", actions: ["create", "read", "update"] },
          { resource: "history", actions: ["read"] },
          { resource: "profile", actions: ["read", "update"] },
          { resource: "modules", actions: ["read", "update"] },
        ],
        isSystem: true,
        isActive: true,
      },

      {
        name: "operador",
        displayName: "Operador",
        description: "Maneja tareas y cargas asignadas",
        permissions: [
          { resource: "tasks", actions: ["read", "update"] },
          { resource: "loads", actions: ["read", "update"] },
          { resource: "reports", actions: ["read"] },
          { resource: "documents", actions: ["read", "create"] },
          { resource: "history", actions: ["read"] },
          { resource: "profile", actions: ["read", "update"] },
        ],
        isSystem: true,
        isActive: true,
      },

      {
        name: "analista",
        displayName: "Analista de Datos",
        description: "Análisis de datos y reportes",
        permissions: [
          { resource: "reports", actions: ["create", "read", "update"] },
          { resource: "analytics", actions: ["read"] },
          { resource: "documents", actions: ["read"] },
          { resource: "history", actions: ["read"] },
          { resource: "profile", actions: ["read", "update"] },
        ],
        isSystem: true,
        isActive: true,
      },

      {
        name: "supervisor",
        displayName: "Supervisor",
        description: "Supervisa operaciones del sistema",
        permissions: [
          { resource: "tasks", actions: ["read", "execute"] },
          { resource: "loads", actions: ["read"] },
          { resource: "reports", actions: ["read"] },
          { resource: "analytics", actions: ["read"] },
          { resource: "documents", actions: ["read"] },
          { resource: "history", actions: ["read"] },
          { resource: "profile", actions: ["read", "update"] },
        ],
        isSystem: true,
        isActive: true,
      },

      {
        name: "employee",
        displayName: "Empleado",
        description: "Acceso básico al sistema",
        permissions: [
          { resource: "tasks", actions: ["read"] },
          { resource: "loads", actions: ["read"] },
          { resource: "reports", actions: ["read"] },
          { resource: "documents", actions: ["read"] },
          { resource: "profile", actions: ["read", "update"] },
        ],
        isSystem: true,
        isActive: true,
      },

      {
        name: "viewer",
        displayName: "Visualizador",
        description: "Solo lectura del sistema",
        permissions: [
          { resource: "tasks", actions: ["read"] },
          { resource: "loads", actions: ["read"] },
          { resource: "reports", actions: ["read"] },
          { resource: "analytics", actions: ["read"] },
          { resource: "documents", actions: ["read"] },
          { resource: "history", actions: ["read"] },
          { resource: "profile", actions: ["read", "update"] },
        ],
        isSystem: true,
        isActive: true,
      },
    ];

    let createdCount = 0;
    let updatedCount = 0;
    let existingCount = 0;

    for (const roleData of systemRoles) {
      const existingRole = await Role.findOne({ name: roleData.name });

      if (existingRole) {
        // Actualizar role existente si es del sistema
        if (existingRole.isSystem) {
          await Role.findByIdAndUpdate(existingRole._id, {
            ...roleData,
            updatedAt: new Date(),
          });
          updatedCount++;
          console.log(`🔄 Rol '${roleData.displayName}' actualizado`);
        } else {
          existingCount++;
          console.log(
            `ℹ️ Rol '${roleData.displayName}' ya existe (personalizado)`
          );
        }
      } else {
        // Crear nuevo rol
        const newRole = new Role(roleData);
        await newRole.save();
        createdCount++;
        console.log(`✅ Rol '${roleData.displayName}' creado`);
      }
    }

    console.log("\n📊 Resumen de inicialización de roles:");
    console.log(`   ✅ Creados: ${createdCount}`);
    console.log(`   🔄 Actualizados: ${updatedCount}`);
    console.log(`   ℹ️ Existentes: ${existingCount}`);
    console.log(`   📁 Total procesados: ${systemRoles.length}`);

    return {
      success: true,
      created: createdCount,
      updated: updatedCount,
      existing: existingCount,
      total: systemRoles.length,
    };
  } catch (error) {
    console.error("❌ Error inicializando roles:", error);
    throw error;
  }
};

// ⭐ FUNCIÓN PARA VERIFICAR SI EL SISTEMA ESTÁ INICIALIZADO ⭐
const checkSystemInitialization = async () => {
  try {
    const roleCount = await Role.countDocuments({ isSystem: true });
    const userCount = await User.countDocuments({ isAdmin: true });

    return {
      rolesInitialized: roleCount > 0,
      adminUsersExist: userCount > 0,
      systemReady: roleCount > 0 && userCount > 0,
    };
  } catch (error) {
    console.error("❌ Error verificando inicialización del sistema:", error);
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
