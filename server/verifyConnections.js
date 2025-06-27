// verifyConnections.js - Script para verificar que todo funciona
const ConnectionService = require("./services/ConnectionCentralService");
const MongoDbService = require("./services/mongoDbService");

async function verifyAllConnections() {
  try {
    console.log("🔍 ======== VERIFICACIÓN FINAL DE CONEXIONES ========");

    // 1. Verificar MongoDB
    const mongoStatus = MongoDbService.isConnected();
    console.log(
      `📡 MongoDB: ${mongoStatus ? "✅ CONECTADO" : "❌ DESCONECTADO"}`
    );

    // 2. Verificar Server1
    console.log("🧪 Probando Server1...");
    const server1Result = await ConnectionService.diagnoseConnection("server1");
    console.log(
      `🖥️ Server1: ${server1Result.success ? "✅ CONECTADO" : "❌ ERROR"}`
    );
    if (!server1Result.success) {
      console.log(`   Error: ${server1Result.error}`);
    } else if (server1Result.data) {
      console.log(`   Datos: ${JSON.stringify(server1Result.data)}`);
    }

    // 3. Verificar Server2
    console.log("🧪 Probando Server2...");
    const server2Result = await ConnectionService.diagnoseConnection("server2");
    console.log(
      `🖥️ Server2: ${server2Result.success ? "✅ CONECTADO" : "❌ ERROR"}`
    );
    if (!server2Result.success) {
      console.log(`   Error: ${server2Result.error}`);
    } else if (server2Result.data) {
      console.log(`   Datos: ${JSON.stringify(server2Result.data)}`);
    }

    // 4. Test de pool health
    console.log("🏥 Verificando salud de pools...");
    const poolHealth = await ConnectionService.checkPoolsHealth();
    console.log("📊 Estado de pools:");
    Object.entries(poolHealth).forEach(([server, status]) => {
      if (typeof status === "object" && status.healthy !== undefined) {
        console.log(
          `   ${server}: ${status.healthy ? "✅ SALUDABLE" : "❌ PROBLEMAS"}`
        );
        if (!status.healthy && status.error) {
          console.log(`     Error: ${status.error}`);
        }
      }
    });

    // 5. Estadísticas de conexiones
    console.log("📈 Estadísticas de conexiones:");
    const stats = ConnectionService.getConnectionStats();
    console.log(`   Conexiones adquiridas: ${stats.acquired}`);
    console.log(`   Conexiones liberadas: ${stats.released}`);
    console.log(`   Conexiones activas: ${stats.activeCount}`);
    console.log(`   Errores: ${stats.errors}`);

    // 6. Resumen final
    const allSystemsOk =
      mongoStatus && server1Result.success && server2Result.success;
    console.log("\n🎯 ======== RESUMEN FINAL ========");
    console.log(
      `Estado general del sistema: ${
        allSystemsOk
          ? "✅ TODAS LAS CONEXIONES FUNCIONANDO"
          : "⚠️ HAY PROBLEMAS PENDIENTES"
      }`
    );
    console.log(`✅ MongoDB: ${mongoStatus ? "OK" : "ERROR"}`);
    console.log(
      `✅ Server1 (10.0.10.120): ${server1Result.success ? "OK" : "ERROR"}`
    );
    console.log(
      `✅ Server2 (sql-calidad.miami\\calidadstdb): ${
        server2Result.success ? "OK" : "ERROR"
      }`
    );

    if (allSystemsOk) {
      console.log("\n🎉 ¡SISTEMA COMPLETAMENTE FUNCIONAL!");
      console.log("   - Todas las conexiones están establecidas");
      console.log("   - Los pools están saludables");
      console.log("   - El sistema está listo para procesar tareas");
    } else {
      console.log("\n⚠️ Hay problemas pendientes que necesitan atención");
    }

    console.log("========================================\n");

    return allSystemsOk;
  } catch (error) {
    console.error("❌ Error en verificación:", error);
    return false;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  verifyAllConnections().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { verifyAllConnections };
