/**
 * Registra el módulo "routes" (Centro de Operaciones — Gestión de Rutas)
 * para que aparezca en el menú lateral y en la Matriz de Permisos de Roles.
 * Ejecutar una sola vez: npm run init-routes-module
 */
const ModuleConfig = require("../models/moduleConfigModel");
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

async function initRoutesModule() {
  try {
    console.log("🚀 Registrando módulo 'routes'...");
    await connectToDatabase();

    const moduleData = {
      name: "routes",
      displayName: "Gestión de Rutas",
      description:
        "Maestro propio de rutas de reparto/visita — reemplaza la dependencia de erpadmin.RUTA_RT",
      resource: "routes",
      actions: [
        {
          name: "read",
          displayName: "Ver Rutas",
          description: "Visualizar rutas existentes",
          isDefault: true,
        },
        {
          name: "create",
          displayName: "Crear Rutas",
          description: "Dar de alta nuevas rutas",
          isDefault: false,
        },
        {
          name: "update",
          displayName: "Editar Rutas",
          description: "Modificar rutas existentes (activar/desactivar incluido)",
          isDefault: false,
        },
      ],
      routes: [
        { path: "/rutas", method: "GET", requiredAction: "read", isMain: true },
        { path: "/rutas/asignacion", method: "GET", requiredAction: "read", isMain: false },
      ],
      uiConfig: {
        icon: "FaRoute",
        color: "#0E7C86",
        category: "operational",
        order: 20,
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
    console.error("❌ Error registrando el módulo 'routes':", error);
    throw error;
  } finally {
    await disconnectFromDatabase();
  }
}

if (require.main === module) {
  initRoutesModule()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = initRoutesModule;
