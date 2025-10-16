// scripts/updateRolesWithModules.js
const Role = require("../models/roleModel");
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

async function updateRolesWithModulesPermission() {
  try {
    console.log("🎭 Actualizando roles con permisos de módulos...");

    // Conectar a la base de datos
    await connectToDatabase();

    // ⭐ DEFINIR PERMISOS PARA EL MÓDULO MODULES ⭐
    const modulesPermission = {
      resource: "modules",
      actions: ["create", "read", "update", "delete", "manage"],
    };

    // ⭐ ROLES QUE DEBEN TENER ACCESO COMPLETO A MÓDULOS ⭐
    const adminRoles = ["superadmin", "admin"];

    // ⭐ ROLES QUE DEBEN TENER ACCESO DE SOLO LECTURA ⭐
    const readOnlyRoles = ["coordinador", "supervisor"];

    let updatedCount = 0;
    let skippedCount = 0;

    // Actualizar roles con acceso completo
    for (const roleName of adminRoles) {
      const role = await Role.findOne({ name: roleName });

      if (!role) {
        console.log(`⚠️ Rol '${roleName}' no encontrado`);
        continue;
      }

      // Verificar si ya tiene el permiso
      const hasModulesPermission = role.permissions.some(
        (p) => p.resource === "modules"
      );

      if (hasModulesPermission) {
        console.log(`ℹ️ Rol '${roleName}' ya tiene permisos de módulos`);
        skippedCount++;
        continue;
      }

      // Agregar permiso completo
      role.permissions.push(modulesPermission);
      await role.save();

      console.log(
        `✅ Rol '${roleName}' actualizado con permisos completos de módulos`
      );
      updatedCount++;
    }

    // Actualizar roles con acceso de solo lectura
    for (const roleName of readOnlyRoles) {
      const role = await Role.findOne({ name: roleName });

      if (!role) {
        console.log(`⚠️ Rol '${roleName}' no encontrado`);
        continue;
      }

      // Verificar si ya tiene el permiso
      const hasModulesPermission = role.permissions.some(
        (p) => p.resource === "modules"
      );

      if (hasModulesPermission) {
        console.log(`ℹ️ Rol '${roleName}' ya tiene permisos de módulos`);
        skippedCount++;
        continue;
      }

      // Agregar permiso de solo lectura
      role.permissions.push({
        resource: "modules",
        actions: ["read"],
      });
      await role.save();

      console.log(
        `✅ Rol '${roleName}' actualizado con permisos de lectura de módulos`
      );
      updatedCount++;
    }

    console.log("\n📊 Resumen de actualización:");
    console.log(`   ✅ Roles actualizados: ${updatedCount}`);
    console.log(`   ℹ️ Roles omitidos: ${skippedCount}`);
    console.log("\n🎉 Actualización de roles completada");

    return {
      success: true,
      updated: updatedCount,
      skipped: skippedCount,
    };
  } catch (error) {
    console.error("❌ Error actualizando roles:", error.message);
    throw error;
  } finally {
    await disconnectFromDatabase();
  }
}

// ⭐ FUNCIÓN PARA VERIFICAR PERMISOS ACTUALES ⭐
async function checkCurrentModulesPermissions() {
  try {
    console.log("🔍 Verificando permisos actuales de módulos...");

    await connectToDatabase();

    const roles = await Role.find({ isActive: true }).select(
      "name displayName permissions"
    );

    console.log("\n📋 Estado actual de permisos de módulos:");
    console.log("==========================================");

    for (const role of roles) {
      const modulesPermission = role.permissions.find(
        (p) => p.resource === "modules"
      );

      if (modulesPermission) {
        console.log(
          `✅ ${role.displayName} (${
            role.name
          }): ${modulesPermission.actions.join(", ")}`
        );
      } else {
        console.log(
          `❌ ${role.displayName} (${role.name}): Sin permisos de módulos`
        );
      }
    }
  } catch (error) {
    console.error("❌ Error verificando permisos:", error.message);
  } finally {
    await disconnectFromDatabase();
  }
}

// ⭐ FUNCIÓN PARA REMOVER PERMISOS DE MÓDULOS (SI NECESARIO) ⭐
async function removeModulesPermissions() {
  try {
    console.log("🗑️ Removiendo permisos de módulos...");

    await connectToDatabase();

    const result = await Role.updateMany(
      { "permissions.resource": "modules" },
      { $pull: { permissions: { resource: "modules" } } }
    );

    console.log(
      `✅ Permisos de módulos removidos de ${result.modifiedCount} roles`
    );
  } catch (error) {
    console.error("❌ Error removiendo permisos:", error.message);
  } finally {
    await disconnectFromDatabase();
  }
}

// Ejecutar según argumentos
if (require.main === module) {
  const arg = process.argv[2];

  switch (arg) {
    case "--check":
      checkCurrentModulesPermissions();
      break;
    case "--remove":
      removeModulesPermissions();
      break;
    case "--help":
      console.log("🎭 Script de actualización de permisos de módulos");
      console.log("=================================================");
      console.log("node updateRolesWithModules.js         - Actualizar roles");
      console.log(
        "node updateRolesWithModules.js --check - Verificar estado actual"
      );
      console.log("node updateRolesWithModules.js --remove - Remover permisos");
      console.log("node updateRolesWithModules.js --help  - Esta ayuda");
      break;
    default:
      updateRolesWithModulesPermission()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
  }
}

module.exports = {
  updateRolesWithModulesPermission,
  checkCurrentModulesPermissions,
  removeModulesPermissions,
};
