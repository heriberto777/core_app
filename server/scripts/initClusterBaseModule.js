/**
 * Registra el módulo "cluster-base" (Objetivos Base) para que aparezca en el
 * menú lateral y en la Matriz de Permisos de Roles.
 * Ejecutar una sola vez: npm run init-cluster-base-module
 */
const ModuleConfig = require("../models/moduleConfigModel");
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

async function initClusterBaseModule() {
  try {
    console.log("🚀 Registrando módulo 'cluster-base'...");
    await connectToDatabase();

    const moduleData = {
      name: "cluster-base",
      displayName: "Objetivos Base",
      description:
        "Objetivos Bronze/Silver/Gold por organización — maestro propio, editable por admin",
      resource: "cluster-base",
      actions: [
        {
          name: "read",
          displayName: "Ver Objetivos Base",
          description: "Visualizar los objetivos base configurados",
          isDefault: true,
        },
        {
          name: "create",
          displayName: "Crear Objetivos Base",
          description: "Dar de alta objetivos base para una nueva organización",
          isDefault: false,
        },
        {
          name: "update",
          displayName: "Editar Objetivos Base",
          description: "Modificar o eliminar objetivos base existentes",
          isDefault: false,
        },
      ],
      routes: [
        { path: "/objetivos-base", method: "GET", requiredAction: "read", isMain: true },
      ],
      uiConfig: {
        icon: "FaBullseye",
        color: "#B45309",
        category: "operational",
        order: 22,
        showInMenu: true,
        showInDashboard: false,
      },
      restrictions: {
        requireAdmin: true,
        minimumRole: "admin",
        contextRules: [],
      },
      isSystem: true,
      isActive: true,
      version: "1.1.0",
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
    console.error("❌ Error registrando el módulo 'cluster-base':", error);
    throw error;
  } finally {
    await disconnectFromDatabase();
  }
}

if (require.main === module) {
  initClusterBaseModule()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = initClusterBaseModule;
