// test-server2.js
const ConnectionCentralService = require("../services/ConnectionCentralService");
const MongoDbService = require("../services/mongoDbService");

async function testServer2() {
  try {
    console.log("🔍 Iniciando prueba de conexión a server2...\n");

    // Conectar a MongoDB primero
    console.log("📡 Conectando a MongoDB...");
    const mongoConnected = await MongoDbService.connect();

    if (!mongoConnected) {
      console.error("❌ No se pudo conectar a MongoDB");
      process.exit(1);
    }
    console.log("✅ MongoDB conectado\n");

    // Probar conexión a server2
    console.log("🔍 Probando conexión a server2...");
    const startTime = Date.now();

    const result = await ConnectionCentralService.diagnoseConnection("server2");

    const totalTime = Date.now() - startTime;
    console.log(`\n⏱️  Tiempo total: ${totalTime}ms\n`);

    if (result.success) {
      console.log("✅ CONEXIÓN EXITOSA a server2!");
      console.log("📊 Detalles:");
      console.log(`   - Mensaje: ${result.message}`);
      if (result.data) {
        console.log(`   - Servidor: ${result.data.ServerName || "N/A"}`);
        console.log(`   - Base de datos: ${result.data.Database || "N/A"}`);
      }
    } else {
      console.log("❌ CONEXIÓN FALLÓ a server2");
      console.log("📊 Detalles del error:");
      console.log(`   - Error: ${result.error}`);
      console.log(`   - Fase: ${result.phase || "N/A"}`);
      console.log(`   - Código: ${result.code || "N/A"}`);
    }

    // Cerrar conexiones
    console.log("\n🔄 Cerrando conexiones...");
    await ConnectionCentralService.closePool("server2");
    await MongoDbService.disconnect();
    console.log("✅ Conexiones cerradas");
  } catch (error) {
    console.error("💥 Error durante la prueba:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    process.exit(0);
  }
}

// Ejecutar la prueba
testServer2();
