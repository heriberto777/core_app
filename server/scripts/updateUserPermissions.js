const User = require("../models/userModel");
const ModuleConfig = require("../models/moduleConfigModel");
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

async function updateUserPermissionsForNewModule(moduleName, resourceName) {
  try {
    console.log(`🔄 Actualizando permisos para el módulo: ${moduleName}`);

    await connectToDatabase();

    // Verificar que el módulo existe
    const moduleExists = await ModuleConfig.findOne({
      name: moduleName,
      isActive: true,
    });

    if (!moduleExists) {
      console.log(`❌ Módulo '${moduleName}' no encontrado o inactivo`);
      return;
    }

    // Obtener usuarios que deberían tener acceso al nuevo módulo
    const usersToUpdate = await User.find({
      $or: [
        { role: { $in: ["admin", "superadmin"] } },
        { isAdmin: true },
        { "permissions.resource": "modules", "permissions.actions": "manage" },
      ],
    });

    console.log(
      `👥 Encontrados ${usersToUpdate.length} usuarios para actualizar`
    );

    let updatedCount = 0;

    for (const user of usersToUpdate) {
      // Verificar si ya tiene permisos para este recurso
      const existingPermissionIndex = user.permissions.findIndex(
        (p) => p.resource === resourceName
      );

      if (existingPermissionIndex >= 0) {
        console.log(
          `ℹ️ Usuario ${user.email} ya tiene permisos para ${resourceName}`
        );
        continue;
      }

      // Agregar permisos completos para el nuevo módulo
      const newPermission = {
        resource: resourceName,
        actions: ["manage"], // O las acciones específicas que necesites
      };

      user.permissions.push(newPermission);
      await user.save();

      console.log(
        `✅ Usuario ${user.email} actualizado con permisos para ${resourceName}`
      );
      updatedCount++;
    }

    console.log(
      `🎉 Actualizados ${updatedCount} usuarios con permisos para ${moduleName}`
    );
  } catch (error) {
    console.error("❌ Error actualizando permisos:", error);
  } finally {
    await disconnectFromDatabase();
  }
}

// Función para ejecutar desde línea de comandos
async function main() {
  const moduleName = process.argv[2];
  const resourceName = process.argv[3];

  if (!moduleName || !resourceName) {
    console.log(
      "📋 Uso: node updateUserPermissions.js <nombreModulo> <nombreRecurso>"
    );
    console.log(
      "📋 Ejemplo: node updateUserPermissions.js inventory inventory"
    );
    process.exit(1);
  }

  await updateUserPermissionsForNewModule(moduleName, resourceName);
}

if (require.main === module) {
  main();
}

module.exports = { updateUserPermissionsForNewModule };
