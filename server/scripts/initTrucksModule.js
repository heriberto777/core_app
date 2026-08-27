/**
 * Registra el módulo "trucks" (Gestión de Camiones) para que aparezca en el
 * menú lateral y en la Matriz de Permisos de Roles.
 * Ejecutar una sola vez: npm run init-trucks-module
 */
const ModuleConfig = require("../models/moduleConfigModel");
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

async function initTrucksModule() {
  try {
    console.log("🚀 Registrando módulo 'trucks'...");
    await connectToDatabase();

    const moduleData = {
      name: "trucks",
      displayName: "Gestión de Camiones",
      description:
        "Maestro propio de camiones y repartidor asignado — reemplaza la dependencia de CATELLI.trucks",
      resource: "trucks",
      actions: [
        {
          name: "read",
          displayName: "Ver Camiones",
          description: "Visualizar camiones existentes",
          isDefault: true,
        },
        {
          name: "create",
          displayName: "Crear Camiones",
          description: "Dar de alta nuevos camiones",
          isDefault: false,
        },
        {
          name: "update",
          displayName: "Editar Camiones",
          description: "Modificar camiones existentes (activar/desactivar incluido)",
          isDefault: false,
        },
      ],
      routes: [
        { path: "/camiones", method: "GET", requiredAction: "read", isMain: true },
      ],
      uiConfig: {
        icon: "FaTruck",
        color: "#0E7C86",
        category: "operational",
        order: 21,
        showInMenu: true,
        showInDashboard: false,
      },
      restrictions: {
        requireAdmin: false,
        minimumRole: "user",
        contextRules: [],
      },
      isSystem: true,
      isActive: true,
      version: "1.0.0",
    };

    const existingModule = await ModuleConfig.findOne({ name: moduleData.name });

    if (existingModule) {
      if (existingModule.version !== moduleData.version) {
        await ModuleConfig.findByIdAndUpdate(existingModule._id, {
          ...moduleData,
          lastModifiedBy: null,
        });
        console.log(`✅ Módulo '${moduleData.displayName}' actualizado`);
      } else {
        console.log(`ℹ️ Módulo '${moduleData.displayName}' ya existe`);
      }
    } else {
      const newModule = new ModuleConfig({
        ...moduleData,
        createdBy: null,
        lastModifiedBy: null,
      });
      await newModule.save();
      console.log(`✅ Módulo '${moduleData.displayName}' creado`);
    }

    console.log("🎉 Listo.");
    return { success: true };
  } catch (error) {
    console.error("❌ Error registrando el módulo 'trucks':", error);
    throw error;
  } finally {
    await disconnectFromDatabase();
  }
}

if (require.main === module) {
  initTrucksModule()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = initTrucksModule;
