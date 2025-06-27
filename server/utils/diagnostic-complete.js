// diagnostic-complete.js
const ConnectionCentralService = require("../services/ConnectionCentralService");
const MongoDbService = require("../services/mongoDbService");
const DBConfig = require("../models/dbConfigModel");

async function fullDiagnostic() {
  try {
    console.log("🔍 DIAGNÓSTICO COMPLETO DEL SISTEMA");
    console.log("=====================================\n");

    // 1. Conectar a MongoDB
    console.log("1️⃣  Verificando MongoDB...");
    const mongoConnected = await MongoDbService.connect();

    if (!mongoConnected) {
      console.error("❌ MongoDB: FALLÓ");
      return;
    }
    console.log("✅ MongoDB: OK\n");

    // 2. Verificar configuraciones en MongoDB
    console.log("2️⃣  Verificando configuraciones en MongoDB...");
    try {
      const configs = await DBConfig.find().lean();
      console.log(`📋 Configuraciones encontradas: ${configs.length}`);

      configs.forEach((config) => {
        console.log(`   - ${config.serverName}:`);
        console.log(`     Host: ${config.host}`);
        console.log(`     Instancia: ${config.instance || "N/A"}`);
        console.log(`     Puerto: ${config.port || "N/A"}`);
        console.log(`     Database: ${config.database}`);
        console.log(`     Usuario: ${config.user}`);
      });
      console.log("");
    } catch (configError) {
      console.error("❌ Error cargando configuraciones:", configError.message);
    }

    // 3. Probar server1
    console.log("3️⃣  Probando server1...");
    const server1Result = await testServer("server1");
    console.log("");

    // 4. Probar server2
    console.log("4️⃣  Probando server2...");
    const server2Result = await testServer("server2");
    console.log("");

    // 5. Resumen
    console.log("📊 RESUMEN DE RESULTADOS");
    console.log("========================");
    console.log(`MongoDB: ✅ OK`);
    console.log(`Server1: ${server1Result.success ? "✅ OK" : "❌ FALLÓ"}`);
    console.log(`Server2: ${server2Result.success ? "✅ OK" : "❌ FALLÓ"}`);

    if (!server1Result.success) {
      console.log(`\n❌ Server1 Error: ${server1Result.error}`);
    }

    if (!server2Result.success) {
      console.log(`\n❌ Server2 Error: ${server2Result.error}`);
      console.log(`   Fase: ${server2Result.phase}`);
    }

    // 6. Estadísticas de pools
    console.log("\n📈 ESTADÍSTICAS DE POOLS");
    console.log("========================");
    try {
      const stats = ConnectionCentralService.getConnectionStats();
      console.log(JSON.stringify(stats, null, 2));
    } catch (statsError) {
      console.error("Error obteniendo estadísticas:", statsError.message);
    }
  } catch (error) {
    console.error("💥 Error durante diagnóstico completo:", error.message);
  } finally {
    // Limpiar
    try {
      await ConnectionCentralService.closePools();
      await MongoDbService.disconnect();
    } catch (cleanupError) {
      console.error("Error durante limpieza:", cleanupError.message);
    }
    process.exit(0);
  }
}

async function testServer(serverName) {
  const startTime = Date.now();

  try {
    console.log(`🔍 Conectando a ${serverName}...`);

    const result = await ConnectionCentralService.diagnoseConnection(
      serverName
    );
    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ ${serverName}: CONEXIÓN EXITOSA (${totalTime}ms)`);
      if (result.data) {
        console.log(`   - Servidor SQL: ${result.data.ServerName || "N/A"}`);
        console.log(`   - Base de datos: ${result.data.Database || "N/A"}`);
      }
      return { success: true, time: totalTime };
    } else {
      console.log(`❌ ${serverName}: CONEXIÓN FALLÓ (${totalTime}ms)`);
      console.log(`   - Error: ${result.error}`);
      console.log(`   - Fase: ${result.phase || "N/A"}`);
      return {
        success: false,
        error: result.error,
        phase: result.phase,
        time: totalTime,
      };
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.log(`💥 ${serverName}: ERROR CRÍTICO (${totalTime}ms)`);
    console.log(`   - Error: ${error.message}`);
    return { success: false, error: error.message, time: totalTime };
  }
}

// Ejecutar diagnóstico completo
fullDiagnostic();
