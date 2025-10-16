const RouteConfig = require("../models/modelRouteConfig");
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");
const logger = require("../services/logger");

const defaultRoutes = [
  // ⭐ RUTAS SIEMPRE ACCESIBLES ⭐
  {
    path: "/dashboard",
    name: "dashboard",
    displayName: "Panel de Control",
    description: "Panel principal del sistema",
    resource: "dashboard",
    requiredAction: "read",
    category: "operational",
    isAlwaysAccessible: true,
    requiresAdmin: false,
    priority: 1,
    icon: "FaHome",
    color: "#3b82f6",
    showInMenu: true,
    showInDashboard: false,
    isSystem: true,
  },
  {
    path: "/perfil",
    name: "profile",
    displayName: "Mi Perfil",
    description: "Gestión del perfil personal",
    resource: "profile",
    requiredAction: "read",
    category: "profile",
    isAlwaysAccessible: true,
    requiresAdmin: false,
    priority: 999,
    icon: "FaUser",
    color: "#6b7280",
    showInMenu: true,
    showInDashboard: false,
    isSystem: true,
  },

  // ⭐ RUTAS OPERACIONALES ⭐
  {
    path: "/tasks",
    name: "tasks",
    displayName: "Gestión de Tareas",
    description: "Administrar y ejecutar tareas del sistema",
    resource: "tasks",
    requiredAction: "read",
    category: "operational",
    isAlwaysAccessible: false,
    requiresAdmin: false,
    priority: 10,
    icon: "FaTasks",
    color: "#10b981",
    showInMenu: true,
    showInDashboard: true,
    isSystem: true,
  },
  {
    path: "/loads",
    name: "loads",
    displayName: "Gestión de Cargas",
    description: "Administrar cargas y transferencias",
    resource: "loads",
    requiredAction: "read",
    category: "operational",
    isAlwaysAccessible: false,
    requiresAdmin: false,
    priority: 20,
    icon: "FaBoxes",
    color: "#f59e0b",
    showInMenu: true,
    showInDashboard: true,
    isSystem: true,
  },
  {
    path: "/documents",
    name: "documents",
    displayName: "Gestión de Documentos",
    description: "Administrar documentos del sistema",
    resource: "documents",
    requiredAction: "read",
    category: "operational",
    isAlwaysAccessible: false,
    requiresAdmin: false,
    priority: 30,
    icon: "FaFileAlt",
    color: "#8b5cf6",
    showInMenu: true,
    showInDashboard: true,
    isSystem: true,
  },

  // ⭐ RUTAS ANALÍTICAS ⭐
  {
    path: "/summaries",
    name: "reports",
    displayName: "Reportes y Resúmenes",
    description: "Generar y visualizar reportes",
    resource: "reports",
    requiredAction: "read",
    category: "analytical",
    isAlwaysAccessible: false,
    requiresAdmin: false,
    priority: 40,
    icon: "FaChartBar",
    color: "#ef4444",
    showInMenu: true,
    showInDashboard: true,
    isSystem: true,
  },
  {
    path: "/analytics",
    name: "analytics",
    displayName: "Análisis Avanzado",
    description: "Análisis estadístico y métricas",
    resource: "analytics",
    requiredAction: "read",
    category: "analytical",
    isAlwaysAccessible: false,
    requiresAdmin: false,
    priority: 50,
    icon: "FaChartLine",
    color: "#06b6d4",
    showInMenu: true,
    showInDashboard: true,
    isSystem: true,
  },
  {
    path: "/history",
    name: "history",
    displayName: "Historial del Sistema",
    description: "Consultar historial de operaciones",
    resource: "history",
    requiredAction: "read",
    category: "analytical",
    isAlwaysAccessible: false,
    requiresAdmin: false,
    priority: 60,
    icon: "FaHistory",
    color: "#6b7280",
    showInMenu: true,
    showInDashboard: false,
    isSystem: true,
  },

  // ⭐ RUTAS ADMINISTRATIVAS ⭐
  {
    path: "/users",
    name: "users",
    displayName: "Gestión de Usuarios",
    description: "Administrar usuarios del sistema",
    resource: "users",
    requiredAction: "read",
    category: "administrative",
    isAlwaysAccessible: false,
    requiresAdmin: true,
    priority: 70,
    icon: "FaUsers",
    color: "#dc2626",
    showInMenu: true,
    showInDashboard: false,
    isSystem: true,
  },
  {
    path: "/roles",
    name: "roles",
    displayName: "Gestión de Roles",
    description: "Administrar roles y permisos",
    resource: "roles",
    requiredAction: "read",
    category: "administrative",
    isAlwaysAccessible: false,
    requiresAdmin: true,
    priority: 80,
    icon: "FaShieldAlt",
    color: "#dc2626",
    showInMenu: true,
    showInDashboard: false,
    isSystem: true,
  },
  {
    path: "/modules",
    name: "modules",
    displayName: "Gestión de Módulos",
    description: "Configurar módulos del sistema",
    resource: "modules",
    requiredAction: "read",
    category: "administrative",
    isAlwaysAccessible: false,
    requiresAdmin: true,
    priority: 90,
    icon: "FaPuzzlePiece",
    color: "#dc2626",
    showInMenu: true,
    showInDashboard: false,
    isSystem: true,
  },

  // ⭐ RUTAS DEL SISTEMA ⭐
  {
    path: "/configuraciones",
    name: "settings",
    displayName: "Configuraciones",
    description: "Configuraciones del sistema",
    resource: "settings",
    requiredAction: "read",
    category: "system",
    isAlwaysAccessible: false,
    requiresAdmin: false,
    priority: 95,
    icon: "FaCog",
    color: "#6b7280",
    showInMenu: true,
    showInDashboard: false,
    isSystem: true,
  },
];

async function initializeRoutes() {
  let isConnected = false;

  try {
    console.log("🛣️ Inicializando configuración de rutas...");

    // ⭐ CONECTAR A LA BASE DE DATOS ⭐
    await connectToDatabase();
    isConnected = true;
    console.log("🔗 Conexión a la base de datos establecida para rutas");

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const routeData of defaultRoutes) {
      try {
        const existingRoute = await RouteConfig.findOne({
          path: routeData.path,
        });

        if (!existingRoute) {
          const newRoute = new RouteConfig(routeData);
          await newRoute.save();
          console.log(
            `✅ Ruta creada: ${routeData.path} - ${routeData.displayName}`
          );
          createdCount++;
        } else {
          // Actualizar solo si es una ruta del sistema y hay cambios
          if (existingRoute.isSystem) {
            const fieldsToUpdate = [
              "displayName",
              "description",
              "resource",
              "requiredAction",
              "category",
              "isAlwaysAccessible",
              "requiresAdmin",
              "priority",
              "icon",
              "color",
              "showInMenu",
              "showInDashboard",
            ];

            const hasChanges = fieldsToUpdate.some((field) => {
              const existingValue = existingRoute[field];
              const newValue = routeData[field];
              return JSON.stringify(existingValue) !== JSON.stringify(newValue);
            });

            if (hasChanges) {
              await RouteConfig.findByIdAndUpdate(
                existingRoute._id,
                {
                  ...routeData,
                  updatedAt: new Date(),
                },
                { runValidators: true }
              );
              console.log(
                `🔄 Ruta actualizada: ${routeData.path} - ${routeData.displayName}`
              );
              updatedCount++;
            } else {
              console.log(`ℹ️ Ruta sin cambios: ${routeData.path}`);
              skippedCount++;
            }
          } else {
            console.log(
              `⚠️ Ruta personalizada no actualizada: ${routeData.path}`
            );
            skippedCount++;
          }
        }
      } catch (routeError) {
        console.error(
          `❌ Error procesando ruta ${routeData.path}:`,
          routeError.message
        );
      }
    }

    // ⭐ ESTADÍSTICAS FINALES ⭐
    console.log("\n📊 RESUMEN DE INICIALIZACIÓN DE RUTAS:");
    console.log("==========================================");
    console.log(`✅ Rutas creadas: ${createdCount}`);
    console.log(`🔄 Rutas actualizadas: ${updatedCount}`);
    console.log(`ℹ️ Rutas sin cambios: ${skippedCount}`);
    console.log(`📋 Total procesadas: ${defaultRoutes.length}`);

    // ⭐ VERIFICAR INTEGRIDAD ⭐
    const totalRoutesInDB = await RouteConfig.countDocuments();
    const activeRoutesInDB = await RouteConfig.countDocuments({
      isActive: true,
    });

    console.log(`🗄️ Total en base de datos: ${totalRoutesInDB}`);
    console.log(`🟢 Rutas activas: ${activeRoutesInDB}`);
    console.log("✅ Configuración de rutas completada exitosamente");

    return {
      success: true,
      stats: {
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        total: defaultRoutes.length,
        totalInDB: totalRoutesInDB,
        activeInDB: activeRoutesInDB,
      },
    };
  } catch (error) {
    console.error("\n❌ ERROR EN INICIALIZACIÓN DE RUTAS:");
    console.error("=====================================");
    console.error(`💥 ${error.message}`);
    console.error(`📍 Stack: ${error.stack}`);

    return {
      success: false,
      error: error.message,
    };
  } finally {
    // ⭐ DESCONECTAR DE LA BASE DE DATOS ⭐
    if (isConnected) {
      try {
        await disconnectFromDatabase();
        console.log("🔌 Conexión a la base de datos cerrada");
      } catch (disconnectError) {
        console.error("❌ Error cerrando conexión:", disconnectError.message);
      }
    }
  }
}

// ⭐ FUNCIÓN PARA EJECUTAR DESDE LÍNEA DE COMANDOS ⭐
async function main() {
  console.log(
    "🚀 Ejecutando inicialización de rutas desde línea de comandos..."
  );

  const result = await initializeRoutes();

  if (result.success) {
    console.log("\n🎉 ¡Inicialización completada exitosamente!");
    process.exit(0);
  } else {
    console.log("\n💥 Inicialización falló");
    process.exit(1);
  }
}

// Permitir ejecución directa desde línea de comandos
if (require.main === module) {
  main();
}

module.exports = {
  initializeRoutes,
  defaultRoutes,
};
