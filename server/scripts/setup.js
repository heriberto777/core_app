// scripts/setup.js - USANDO TU DATABASE.JS EXISTENTE
const {
  connectToDatabase,
  disconnectFromDatabase,
  checkDatabaseHealth,
  gracefulShutdown,
} = require("../utils/database"); // ⭐ CAMBIAR RUTA A config/database
const { initializeSystem, checkSystemInitialization } = require("./initRoles");
const {
  convertExistingAdminUser,
  listExistingUsers,
} = require("./convertAdminUser");
const { initializeSystemModules } = require("./initializeModules");

async function setup() {
  let exitCode = 0;

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

    // ⭐ PASO 3: ACTUALIZAR ESQUEMA DE USUARIOS ⭐
    console.log("\n📝 Paso 3: Actualizando esquema de usuarios...");
    try {
      const User = require("../models/userModel");
      const usersToUpdate = await User.updateMany(
        {},
        {
          $set: {
            isAdmin: { $ifNull: ["$isAdmin", false] },
            activo: { $ifNull: ["$activo", true] },
          },
        }
      );
      console.log(
        `✅ ${usersToUpdate.modifiedCount} usuarios actualizados con nuevos campos`
      );
    } catch (userUpdateError) {
      console.log(
        `⚠️ No se pudieron actualizar usuarios: ${userUpdateError.message}`
      );
    }

    // ⭐ PASO 4: INICIALIZAR ROLES DEL SISTEMA ⭐
    console.log("\n🎭 Paso 4: Inicializando roles del sistema...");
    try {
      const roleResult = await initializeSystem();

      if (roleResult.success) {
        console.log("✅ Roles inicializados exitosamente");
      } else {
        console.log(`⚠️ Roles inicializados con ${roleResult.errors} errores`);
      }
    } catch (roleError) {
      console.error("❌ Error inicializando roles:", roleError.message);
      throw roleError;
    }

    // ⭐ PASO 5: VERIFICAR Y CONVERTIR USUARIOS ADMIN ⭐
    console.log("\n👤 Paso 5: Configurando usuarios administradores...");
    try {
      const adminResult = await convertExistingAdminUser();
      if (adminResult && adminResult.success) {
        console.log("✅ Usuario administrador configurado correctamente");
      }
    } catch (adminError) {
      console.log(`⚠️ Error configurando admin: ${adminError.message}`);
    }

    // ⭐ PASO 6: INICIALIZAR MÓDULOS DEL SISTEMA ⭐
    console.log("\n🧩 Paso 6: Inicializando módulos del sistema...");
    try {
      const moduleResult = await initializeSystemModules();
      if (moduleResult && moduleResult.success) {
        console.log("✅ Módulos inicializados exitosamente");
      }
    } catch (moduleError) {
      console.log(`⚠️ Error inicializando módulos: ${moduleError.message}`);
    }

    // ⭐ PASO 7: VERIFICACIÓN FINAL ⭐
    console.log("\n🔍 Paso 7: Verificación final del sistema...");
    const finalStatus = await checkSystemInitialization();

    console.log("\n📊 ESTADO FINAL DEL SISTEMA:");
    console.log("============================");
    console.log(`🎭 Roles del sistema: ${finalStatus.stats?.systemRoles || 0}`);
    console.log(`👤 Usuarios admin: ${finalStatus.stats?.adminUsers || 0}`);
    console.log(
      `🟢 Sistema operativo: ${finalStatus.systemReady ? "SÍ" : "NO"}`
    );

    if (finalStatus.systemReady) {
      console.log("\n🎉 ¡CONFIGURACIÓN COMPLETADA EXITOSAMENTE!");
      console.log("El sistema está listo para usar");
    } else {
      console.log("\n⚠️ CONFIGURACIÓN INCOMPLETA");
      console.log("Revisa los errores anteriores y ejecuta nuevamente");
      exitCode = 1;
    }

    return {
      success: finalStatus.systemReady,
      status: finalStatus,
    };
  } catch (error) {
    console.error("\n❌ ERROR EN LA CONFIGURACIÓN:");
    console.error("===============================");
    console.error(`💥 ${error.message}`);
    exitCode = 1;
    throw error;
  } finally {
    // ⭐ DESCONEXIÓN SEGURA USANDO TU GRACEFUL SHUTDOWN ⭐
    console.log("\n🔌 Cerrando conexiones...");

    try {
      await gracefulShutdown("SETUP_COMPLETE");
    } catch (shutdownError) {
      console.error("⚠️ Error en cierre limpio:", shutdownError.message);
    }

    // ⭐ SALIDA LIMPIA DEL PROCESO ⭐
    setTimeout(() => {
      console.log("🔄 Saliendo del proceso...");
      process.exit(exitCode);
    }, 1000);
  }
}

// Ejecutar según argumentos
if (require.main === module) {
  const arg = process.argv[2];

  switch (arg) {
    case "--help":
      console.log("🚀 Script de configuración del sistema");
      console.log("=====================================");
      console.log("node setup.js           - Configuración completa");
      console.log("node setup.js --help    - Esta ayuda");
      break;
    default:
      setup().catch((error) => {
        console.error("❌ Setup falló:", error.message);
        process.exit(1);
      });
  }
}

module.exports = { setup };
