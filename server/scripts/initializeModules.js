const ModuleConfig = require("../models/moduleConfigModel");

// ⭐ IMPORTAR CONFIGURACIÓN DE BD ⭐
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

async function initializeSystemModules() {
  try {
    console.log("🚀 Inicializando módulos del sistema...");

    // ⭐ CONECTAR USANDO LA NUEVA CONFIGURACIÓN ⭐
    await connectToDatabase();

    const systemModules = [
      {
        name: "dashboard",
        displayName: "Panel de Control",
        description: "Panel principal con resumen del sistema",
        resource: "analytics",
        actions: [
          {
            name: "read",
            displayName: "Ver Dashboard",
            description: "Acceso al panel principal",
            isDefault: true,
          },
        ],
        routes: [
          {
            path: "/dashboard",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
        ],
        uiConfig: {
          icon: "FaTachometerAlt",
          color: "#007bff",
          category: "operational",
          order: 1,
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
      },
      {
        name: "tasks",
        displayName: "Gestión de Tareas",
        description: "Módulo para gestionar tareas de transferencia de datos",
        resource: "tasks",
        actions: [
          {
            name: "read",
            displayName: "Ver Tareas",
            description: "Visualizar tareas existentes",
            isDefault: true,
          },
          {
            name: "create",
            displayName: "Crear Tareas",
            description: "Crear nuevas tareas",
            isDefault: false,
          },
          {
            name: "update",
            displayName: "Editar Tareas",
            description: "Modificar tareas existentes",
            isDefault: false,
          },
          {
            name: "delete",
            displayName: "Eliminar Tareas",
            description: "Eliminar tareas",
            isDefault: false,
          },
          {
            name: "execute",
            displayName: "Ejecutar Tareas",
            description: "Ejecutar tareas de transferencia",
            isDefault: true,
          },
          {
            name: "manage",
            displayName: "Gestionar Tareas",
            description: "Control total sobre tareas",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/tasks",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
          {
            path: "/transfers",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
        ],
        uiConfig: {
          icon: "FaTasks",
          color: "#28a745",
          category: "operational",
          order: 2,
          showInMenu: true,
          showInDashboard: true,
        },
        restrictions: {
          requireAdmin: false,
          minimumRole: "user",
          contextRules: [
            {
              type: "own_content",
              actions: ["update", "delete"],
              condition: "user_is_creator",
            },
            {
              type: "not_running",
              actions: ["delete", "update"],
              condition: "status_not_running",
            },
          ],
        },
        isSystem: true,
        isActive: true,
        version: "1.0.0",
      },
      {
        name: "loads",
        displayName: "Gestión de Cargas",
        description: "Módulo para gestionar cargas de trabajo",
        resource: "loads",
        actions: [
          {
            name: "read",
            displayName: "Ver Cargas",
            description: "Visualizar cargas",
            isDefault: true,
          },
          {
            name: "create",
            displayName: "Crear Cargas",
            description: "Crear nuevas cargas",
            isDefault: false,
          },
          {
            name: "update",
            displayName: "Editar Cargas",
            description: "Modificar cargas",
            isDefault: false,
          },
          {
            name: "delete",
            displayName: "Eliminar Cargas",
            description: "Eliminar cargas",
            isDefault: false,
          },
          {
            name: "manage",
            displayName: "Gestionar Cargas",
            description: "Control total sobre cargas",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/loads",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
        ],
        uiConfig: {
          icon: "FaBoxes",
          color: "#17a2b8",
          category: "operational",
          order: 3,
          showInMenu: true,
          showInDashboard: true,
        },
        restrictions: {
          requireAdmin: false,
          minimumRole: "user",
          contextRules: [],
        },
        isSystem: true,
        isActive: true,
        version: "1.0.0",
      },
      {
        name: "documents",
        displayName: "Gestión de Documentos",
        description: "Módulo para visualizar y gestionar documentos",
        resource: "documents",
        actions: [
          {
            name: "read",
            displayName: "Ver Documentos",
            description: "Visualizar documentos",
            isDefault: true,
          },
          {
            name: "create",
            displayName: "Crear Documentos",
            description: "Crear nuevos documentos",
            isDefault: false,
          },
          {
            name: "update",
            displayName: "Editar Documentos",
            description: "Modificar documentos",
            isDefault: false,
          },
          {
            name: "delete",
            displayName: "Eliminar Documentos",
            description: "Eliminar documentos",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/documents",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
          {
            path: "/visualization",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
        ],
        uiConfig: {
          icon: "FaFileAlt",
          color: "#6c757d",
          category: "operational",
          order: 4,
          showInMenu: true,
          showInDashboard: true,
        },
        restrictions: {
          requireAdmin: false,
          minimumRole: "user",
          contextRules: [],
        },
        isSystem: true,
        isActive: true,
        version: "1.0.0",
      },
      {
        name: "reports",
        displayName: "Reportes",
        description: "Módulo para generar y visualizar reportes",
        resource: "reports",
        actions: [
          {
            name: "read",
            displayName: "Ver Reportes",
            description: "Visualizar reportes",
            isDefault: true,
          },
          {
            name: "create",
            displayName: "Crear Reportes",
            description: "Generar nuevos reportes",
            isDefault: false,
          },
          {
            name: "update",
            displayName: "Editar Reportes",
            description: "Modificar reportes",
            isDefault: false,
          },
          {
            name: "delete",
            displayName: "Eliminar Reportes",
            description: "Eliminar reportes",
            isDefault: false,
          },
          {
            name: "export",
            displayName: "Exportar Reportes",
            description: "Exportar reportes a diferentes formatos",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/summaries",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
          {
            path: "/reports",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
        ],
        uiConfig: {
          icon: "FaChartBar",
          color: "#20c997",
          category: "analytical",
          order: 1,
          showInMenu: true,
          showInDashboard: true,
        },
        restrictions: {
          requireAdmin: false,
          minimumRole: "user",
          contextRules: [],
        },
        isSystem: true,
        isActive: true,
        version: "1.0.0",
      },
      {
        name: "analytics",
        displayName: "Análisis y Estadísticas",
        description: "Módulo para análisis avanzado y estadísticas",
        resource: "analytics",
        actions: [
          {
            name: "read",
            displayName: "Ver Análisis",
            description: "Visualizar análisis y estadísticas",
            isDefault: true,
          },
          {
            name: "export",
            displayName: "Exportar Datos",
            description: "Exportar datos de análisis",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/analytics",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
          {
            path: "/statistics",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
        ],
        uiConfig: {
          icon: "FaChartLine",
          color: "#6f42c1",
          category: "analytical",
          order: 2,
          showInMenu: true,
          showInDashboard: true,
        },
        restrictions: {
          requireAdmin: false,
          minimumRole: "user",
          contextRules: [],
        },
        isSystem: true,
        isActive: true,
        version: "1.0.0",
      },
      {
        name: "history",
        displayName: "Historial del Sistema",
        description: "Módulo para visualizar el historial de operaciones",
        resource: "history",
        actions: [
          {
            name: "read",
            displayName: "Ver Historial",
            description: "Visualizar historial de operaciones",
            isDefault: true,
          },
          {
            name: "export",
            displayName: "Exportar Historial",
            description: "Exportar datos del historial",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/historys",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
          {
            path: "/history",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
          {
            path: "/logs",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
        ],
        uiConfig: {
          icon: "FaHistory",
          color: "#fd7e14",
          category: "analytical",
          order: 3,
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
      },
      {
        name: "users",
        displayName: "Gestión de Usuarios",
        description: "Módulo para administrar usuarios del sistema",
        resource: "users",
        actions: [
          {
            name: "read",
            displayName: "Ver Usuarios",
            description: "Visualizar usuarios",
            isDefault: true,
          },
          {
            name: "create",
            displayName: "Crear Usuarios",
            description: "Crear nuevos usuarios",
            isDefault: false,
          },
          {
            name: "update",
            displayName: "Editar Usuarios",
            description: "Modificar usuarios",
            isDefault: false,
          },
          {
            name: "delete",
            displayName: "Eliminar Usuarios",
            description: "Eliminar usuarios",
            isDefault: false,
          },
          {
            name: "manage",
            displayName: "Gestionar Usuarios",
            description: "Control total sobre usuarios",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/users",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
        ],
        uiConfig: {
          icon: "FaUsers",
          color: "#dc3545",
          category: "administrative",
          order: 1,
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
        version: "1.0.0",
      },
      {
        name: "roles",
        displayName: "Gestión de Roles",
        description: "Módulo para administrar roles y permisos",
        resource: "roles",
        actions: [
          {
            name: "read",
            displayName: "Ver Roles",
            description: "Visualizar roles",
            isDefault: true,
          },
          {
            name: "create",
            displayName: "Crear Roles",
            description: "Crear nuevos roles",
            isDefault: false,
          },
          {
            name: "update",
            displayName: "Editar Roles",
            description: "Modificar roles",
            isDefault: false,
          },
          {
            name: "delete",
            displayName: "Eliminar Roles",
            description: "Eliminar roles",
            isDefault: false,
          },
          {
            name: "manage",
            displayName: "Gestionar Roles",
            description: "Control total sobre roles",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/roles",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
          {
            path: "/permissions",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
        ],
        uiConfig: {
          icon: "FaShieldAlt",
          color: "#e83e8c",
          category: "administrative",
          order: 2,
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
        version: "1.0.0",
      },
      {
        name: "modules",
        displayName: "Gestión de Módulos",
        description: "Módulo para configurar módulos del sistema dinámicamente",
        resource: "modules",
        actions: [
          {
            name: "read",
            displayName: "Ver Módulos",
            description: "Visualizar configuración de módulos",
            isDefault: true,
          },
          {
            name: "create",
            displayName: "Crear Módulos",
            description: "Crear nuevos módulos",
            isDefault: false,
          },
          {
            name: "update",
            displayName: "Editar Módulos",
            description: "Modificar módulos",
            isDefault: false,
          },
          {
            name: "delete",
            displayName: "Eliminar Módulos",
            description: "Eliminar módulos",
            isDefault: false,
          },
          {
            name: "manage",
            displayName: "Gestionar Módulos",
            description: "Control total sobre módulos",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/modules",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
        ],
        uiConfig: {
          icon: "FaCogs",
          color: "#ffc107",
          category: "administrative",
          order: 3,
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
        version: "1.0.0",
      },
      {
        name: "settings",
        displayName: "Configuraciones",
        description: "Módulo para configurar el sistema",
        resource: "settings",
        actions: [
          {
            name: "read",
            displayName: "Ver Configuraciones",
            description: "Visualizar configuraciones",
            isDefault: true,
          },
          {
            name: "update",
            displayName: "Editar Configuraciones",
            description: "Modificar configuraciones",
            isDefault: false,
          },
        ],
        routes: [
          {
            path: "/configuraciones",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
          {
            path: "/settings",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
          {
            path: "/configuration",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
        ],
        uiConfig: {
          icon: "FaCog",
          color: "#6c757d",
          category: "configuration",
          order: 1,
          showInMenu: true,
          showInDashboard: false,
        },
        restrictions: {
          requireAdmin: false,
          minimumRole: "manager",
          contextRules: [],
        },
        isSystem: true,
        isActive: true,
        version: "1.0.0",
      },
      {
        name: "profile",
        displayName: "Perfil de Usuario",
        description: "Módulo para gestionar el perfil personal",
        resource: "profile",
        actions: [
          {
            name: "read",
            displayName: "Ver Perfil",
            description: "Visualizar perfil personal",
            isDefault: true,
          },
          {
            name: "update",
            displayName: "Editar Perfil",
            description: "Modificar perfil personal",
            isDefault: true,
          },
        ],
        routes: [
          {
            path: "/perfil",
            method: "GET",
            requiredAction: "read",
            isMain: true,
          },
          {
            path: "/profile",
            method: "GET",
            requiredAction: "read",
            isMain: false,
          },
        ],
        uiConfig: {
          icon: "FaUser",
          color: "#17a2b8",
          category: "configuration",
          order: 2,
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
      },
    ];

    let created = 0;
    let updated = 0;
    let existing = 0;

    for (const moduleData of systemModules) {
      const existingModule = await ModuleConfig.findOne({
        name: moduleData.name,
      });

      if (existingModule) {
        if (existingModule.version !== moduleData.version) {
          // Actualizar si la versión es diferente
          await ModuleConfig.findByIdAndUpdate(existingModule._id, {
            ...moduleData,
            lastModifiedBy: null, // Sistema
          });
          updated++;
          console.log(`✅ Módulo '${moduleData.displayName}' actualizado`);
        } else {
          existing++;
          console.log(`ℹ️ Módulo '${moduleData.displayName}' ya existe`);
        }
      } else {
        // Crear nuevo módulo
        const newModule = new ModuleConfig({
          ...moduleData,
          createdBy: null, // Sistema
          lastModifiedBy: null,
        });
        await newModule.save();
        created++;
        console.log(`✅ Módulo '${moduleData.displayName}' creado`);
      }
    }

    console.log("\n🎉 INICIALIZACIÓN DE MÓDULOS COMPLETADA!");
    console.log(`📊 Resumen:`);
    console.log(`   ✅ Creados: ${created}`);
    console.log(`   🔄 Actualizados: ${updated}`);
    console.log(`   ℹ️ Existentes: ${existing}`);
    console.log(`   📁 Total procesados: ${systemModules.length}`);

    return {
      success: true,
      created,
      updated,
      existing,
      total: systemModules.length,
    };
  } catch (error) {
    console.error("❌ Error inicializando módulos:", error);
    throw error;
  }
}

// Ejecutar si el script se llama directamente
if (require.main === module) {
  initializeSystemModules()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

module.exports = { initializeSystemModules };
