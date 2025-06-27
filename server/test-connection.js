// testConnections.js - Script para ejecutar debug manual
const ConnectionService = require("./services/ConnectionCentralService");
const MongoDbService = require("./services/mongoDbService");

async function runManualDebug() {
  try {
    console.log("🚀 ======== INICIANDO DEBUG MANUAL ========");

    // 1. Conectar a MongoDB si no está conectado
    if (!MongoDbService.isConnected()) {
      console.log("📡 Conectando a MongoDB...");
      await MongoDbService.connect();
    }

    // 2. Debug específico de server2
    console.log("🧪 Ejecutando debug de autenticación server2...");
    const debugResult = await ConnectionService.debugServer2Authentication();
    console.log("📋 Resultado del debug:");
    console.log(JSON.stringify(debugResult, null, 2));

    // 3. Si el debug fue exitoso, probar diagnóstico
    if (debugResult.success) {
      console.log("🎉 Debug exitoso, probando diagnóstico...");
      const diagResult = await ConnectionService.diagnoseConnection("server2");
      console.log("📊 Resultado diagnóstico server2:");
      console.log(JSON.stringify(diagResult, null, 2));
    }

    // 4. Chequeo completo de salud
    console.log("🏥 Ejecutando chequeo completo de salud...");
    const healthCheck = await ConnectionService.performSystemHealthCheck();
    console.log("📊 Estado de salud completo:");
    console.log(JSON.stringify(healthCheck.overall, null, 2));

    console.log("✅ ======== DEBUG MANUAL COMPLETADO ========");

    // Cerrar proceso
    process.exit(0);
  } catch (error) {
    console.error("❌ Error en debug manual:", error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runManualDebug();
}

module.exports = { runManualDebug };
