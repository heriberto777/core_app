// scripts/setup.js
const {
  connectToDatabase,
  disconnectFromDatabase,
  checkDatabaseHealth,
} = require("../utils/database");
const { initializeSystem, checkSystemInitialization } = require("./initRoles");
const {
  convertExistingAdminUser,
  listExistingUsers,
} = require("./convertAdminUser");
const { initializeSystemModules } = require("./initializeModules");

async function setup() {
  try {
    console.log("🚀 CONFIGURANDO SISTEMA COMPLETO...");
    console.log("====================================");

    // ⭐ PASO 1: VERIFICAR Y CONECTAR A LA BASE DE DATOS ⭐
    console.log("\n📊 Paso 1: Verificando conexión a la base de datos...");
    await connectToDatabase();

    const healthCheck = await checkDatabaseHealth();
    if (!healthCheck.healthy) {
      throw new Error(`Base de datos no saludable: ${healthCheck.message}`);
    }
    console.log("✅ Base de datos conectada y funcionando correctamente");

    // ⭐ PASO 2: VERIFICAR ESTADO ACTUAL DEL SISTEMA ⭐
    console.log("\n🔍 Paso 2: Verificando estado actual del sistema...");
    const systemStatus = await checkSystemInitialization();
    console.log(
      `   🎭 Roles inicializados: ${
        systemStatus.rolesInitialized ? "Sí" : "No"
      }`
    );
    console.log(
      `   👤 Usuarios admin existen: ${
        systemStatus.adminUsersExist ? "Sí" : "No"
      }`
    );
    console.log(
      `   🟢 Sistema listo: ${systemStatus.systemReady ? "Sí" : "No"}`
    );

    // ⭐ PASO 3: ACTUALIZAR ESQUEMA DE USUARIOS EXISTENTES ⭐
    console.log("\n📝 Paso 3: Actualizando esquema de usuarios...");
    const User = require("../models/userModel");
    const updateResult = await User.updateMany(
      {
        $or: [
          { roles: { $exists: false } },
          { permissions: { $exists: false } },
          { isAdmin: { $exists: false } },
        ],
      },
      {
        $set: {
          roles: [],
          permissions: [],
          isAdmin: false,
        },
      }
    );
    console.log(
      `✅ ${updateResult.modifiedCount} usuarios actualizados con nuevos campos`
    );

    // ⭐ PASO 4: INICIALIZAR ROLES DEL SISTEMA ⭐
    console.log("\n🎭 Paso 4: Inicializando roles del sistema...");
    const roleResult = await initializeSystem();
    if (roleResult.success) {
      console.log(
        `✅ Roles inicializados: ${roleResult.created} creados, ${roleResult.updated} actualizados`
      );
    } else {
      throw new Error("Error inicializando roles del sistema");
    }

    // ⭐ PASO 5: INICIALIZAR MÓDULOS DEL SISTEMA ⭐
    console.log("\n🧩 Paso 5: Inicializando módulos del sistema...");
    const moduleResult = await initializeSystemModules();
    if (moduleResult.success) {
      console.log(
        `✅ Módulos inicializados: ${moduleResult.created} creados, ${moduleResult.updated} actualizados`
      );
    } else {
      throw new Error("Error inicializando módulos del sistema");
    }

    // ⭐ PASO 6: CONFIGURAR USUARIO ADMINISTRADOR ⭐
    console.log("\n👤 Paso 6: Configurando usuario administrador...");

    // Listar usuarios existentes para información
    const existingUsers = await listExistingUsers();

    // Intentar convertir usuario existente o crear uno nuevo
    const adminResult = await convertExistingAdminUser();
    if (adminResult.success) {
      console.log(`✅ Usuario administrador: ${adminResult.message}`);
      console.log(`📧 Email: ${adminResult.user.email}`);
      if (adminResult.wasCreated) {
        console.log("🔑 Password por defecto: admin123");
        console.log(
          "⚠️ IMPORTANTE: Cambia la contraseña después del primer login"
        );
      }
    } else {
      throw new Error("Error configurando usuario administrador");
    }

    // ⭐ PASO 7: VERIFICACIÓN FINAL ⭐
    console.log("\n🔍 Paso 7: Verificación final del sistema...");
    const finalStatus = await checkSystemInitialization();

    if (!finalStatus.systemReady) {
      throw new Error("El sistema no está completamente configurado");
    }

    // ⭐ RESUMEN FINAL ⭐
    console.log("\n🎉 ¡CONFIGURACIÓN COMPLETADA EXITOSAMENTE!");
    console.log("==========================================");
    console.log("✅ Base de datos conectada y saludable");
    console.log("✅ Esquema de usuarios actualizado");
    console.log("✅ Roles del sistema inicializados:");
    console.log("   📋 superadmin: Control total del sistema");
    console.log("   📋 admin: Administrador general");
    console.log("   📋 coordinador: Coordina operaciones");
    console.log("   📋 operador: Maneja tareas y cargas");
    console.log("   📋 analista: Análisis y reportes");
    console.log("   📋 supervisor: Supervisa operaciones");
    console.log("   📋 employee: Acceso básico");
    console.log("   📋 viewer: Solo lectura");
    console.log("✅ Módulos del sistema inicializados:");
    console.log("   🧩 dashboard: Panel de control");
    console.log("   🧩 tasks: Gestión de tareas");
    console.log("   🧩 loads: Gestión de cargas");
    console.log("   🧩 documents: Gestión de documentos");
    console.log("   🧩 reports: Reportes y análisis");
    console.log("   🧩 analytics: Estadísticas avanzadas");
    console.log("   🧩 history: Historial del sistema");
    console.log("   🧩 users: Gestión de usuarios (admin)");
    console.log("   🧩 roles: Gestión de roles (admin)");
    console.log("   🧩 modules: Gestión de módulos (admin)");
    console.log("   🧩 settings: Configuraciones");
    console.log("   🧩 profile: Perfil de usuario");
    console.log(
      `✅ Usuario administrador configurado: ${adminResult.user.email}`
    );
    console.log("✅ Sistema completamente funcional");
    console.log("\n🚀 ¡El sistema está listo para usar!");

    // Información adicional
    console.log("\n📋 INFORMACIÓN ADICIONAL:");
    console.log("─────────────────────────");
    console.log("🔧 Para gestionar módulos dinámicamente:");
    console.log("   → Accede a /modules en el panel de administración");
    console.log("🎭 Para gestionar roles y permisos:");
    console.log("   → Accede a /roles en el panel de administración");
    console.log("👥 Para gestionar usuarios:");
    console.log("   → Accede a /users en el panel de administración");
    console.log("⚙️ Configuración avanzada:");
    console.log("   → Las APIs están disponibles en /api/v1/modules");
    console.log("   → La configuración se actualiza dinámicamente");
    console.log("   → El caché se invalida automáticamente");
  } catch (error) {
    console.error("\n❌ ERROR EN LA CONFIGURACIÓN:");
    console.error("===============================");
    console.error(`💥 ${error.message}`);
    console.error(`📍 Stack: ${error.stack}`);

    // Intentar desconectar limpiamente
    try {
      await disconnectFromDatabase();
    } catch (disconnectError) {
      console.error(
        "❌ Error adicional desconectando:",
        disconnectError.message
      );
    }

    process.exit(1);
  } finally {
    // Desconectar de la base de datos
    try {
      await disconnectFromDatabase();
      console.log("\n🔌 Desconectado de la base de datos");
    } catch (disconnectError) {
      console.error("⚠️ Error desconectando:", disconnectError.message);
    }
  }
}

// ⭐ FUNCIÓN PARA SETUP RÁPIDO (SOLO MÓDULOS) ⭐
async function quickModuleSetup() {
  try {
    console.log("🧩 CONFIGURACIÓN RÁPIDA DE MÓDULOS...");

    await connectToDatabase();
    const result = await initializeSystemModules();

    if (result.success) {
      console.log("✅ Módulos configurados exitosamente");
    }

    await disconnectFromDatabase();
  } catch (error) {
    console.error("❌ Error en configuración rápida:", error);
    process.exit(1);
  }
}

// ⭐ FUNCIÓN PARA SETUP RÁPIDO (SOLO ROLES) ⭐
async function quickRoleSetup() {
  try {
    console.log("🎭 CONFIGURACIÓN RÁPIDA DE ROLES...");

    await connectToDatabase();
    const result = await initializeSystem();

    if (result.success) {
      console.log("✅ Roles configurados exitosamente");
    }

    await disconnectFromDatabase();
  } catch (error) {
    console.error("❌ Error en configuración rápida:", error);
    process.exit(1);
  }
}

// Ejecutar según argumentos de línea de comandos
if (require.main === module) {
  const arg = process.argv[2];

  switch (arg) {
    case "--modules":
      quickModuleSetup();
      break;
    case "--roles":
      quickRoleSetup();
      break;
    case "--help":
      console.log("🚀 Script de configuración del sistema");
      console.log("=====================================");
      console.log("node setup.js           - Configuración completa");
      console.log("node setup.js --modules - Solo módulos");
      console.log("node setup.js --roles   - Solo roles");
      console.log("node setup.js --help    - Esta ayuda");
      break;
    default:
      setup();
  }
}

module.exports = {
  setup,
  quickModuleSetup,
  quickRoleSetup,
};
