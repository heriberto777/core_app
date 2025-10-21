// diagnose-production-error.js
const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");

async function diagnoseProductionError() {
  console.log("Diagnosticando error de producción...\n");

  try {
    // Test 1: Verificar que DatabaseServiceAdapter funciona
    console.log("1. Testing DatabaseServiceAdapter inicialización...");
    await DatabaseServiceAdapter.initialize();
    console.log("   ✅ DatabaseServiceAdapter inicializado");

    // Test 2: Obtener estadísticas de pools
    console.log("\n2. Verificando estado de pools...");
    const stats = DatabaseServiceAdapter.getConnectionStats();
    console.log("   Pools disponibles:", Object.keys(stats.pools));

    Object.entries(stats.pools).forEach(([serverKey, poolStats]) => {
      console.log(`   ${serverKey}:`, {
        size: poolStats.size,
        available: poolStats.available,
        borrowed: poolStats.borrowed,
        pending: poolStats.pending,
      });
    });

    // Test 3: Probar conexión directa
    console.log("\n3. Testing conexión directa...");
    const connection = await DatabaseServiceAdapter.getConnection("server1");
    console.log("   Tipo de conexión:", typeof connection);
    console.log("   Tiene execSql:", typeof connection?.execSql);
    console.log(
      "   Conexión válida:",
      connection !== null && connection !== undefined
    );

    if (connection) {
      await DatabaseServiceAdapter.releaseConnection(connection);
      console.log("   ✅ Conexión liberada correctamente");
    }

    // Test 4: Simular getDocuments workflow
    console.log("\n4. Testing workflow getDocuments...");

    // Simular el flujo que falla
    const testMapping = {
      sourceServer: "server1",
      tableConfigs: [
        {
          sourceTable: "INFORMATION_SCHEMA.TABLES",
          isDetailTable: false,
        },
      ],
    };

    let testConnection = null;
    try {
      testConnection = await DatabaseServiceAdapter.getConnection(
        testMapping.sourceServer
      );
      console.log("   Conexión obtenida para test:", testConnection !== null);

      if (testConnection === null) {
        console.log("   ❌ PROBLEMA: getConnection devolvió null");
        return;
      }

      // Test query
      const result = await DatabaseServiceAdapter.query(
        testConnection,
        "SELECT TOP 1 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES"
      );
      console.log("   ✅ Query ejecutada, filas:", result.recordset.length);
    } finally {
      if (testConnection) {
        await DatabaseServiceAdapter.releaseConnection(testConnection);
      }
    }

    console.log("\n✅ Diagnóstico completado sin errores");
  } catch (error) {
    console.error("\n❌ ERROR ENCONTRADO:", error.message);
    console.error("Stack:", error.stack);

    // Información adicional para debugging
    console.log("\nInformación adicional:");
    console.log("- Node.js versión:", process.version);
    console.log("- Platform:", process.platform);
    console.log(
      "- Memoria usada:",
      Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      "MB"
    );
  }
}

diagnoseProductionError().catch(console.error);
