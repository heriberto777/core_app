// test-migration.js
const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");
const DynamicTransferService = require("../services/DynamicTransferService");

async function testSimpleTransfer() {
  console.log("\n=== TEST: Transferencia simple ===");
  try {
    // Crear un mapping de prueba simple
    const testMapping = {
      sourceServer: "server1",
      targetServer: "server1", // Mismo servidor para prueba
      tableConfigs: [
        {
          name: "test_table",
          sourceTable: "INFORMATION_SCHEMA.TABLES",
          targetTable: "temp_test_table",
          isDetailTable: false,
          primaryKey: "TABLE_NAME",
          fieldMappings: [
            {
              sourceField: "TABLE_NAME",
              targetField: "table_name",
              isRequired: true,
            },
            {
              sourceField: "TABLE_TYPE",
              targetField: "table_type",
              isRequired: false,
            },
          ],
        },
      ],
    };

    console.log("  → Iniciando transferencia de prueba...");

    // Test con withConnections
    const result = await DatabaseServiceAdapter.withConnections(
      testMapping,
      async (connections) => {
        console.log("  → Conexiones establecidas automáticamente");

        // Query de prueba en source
        const sourceData = await DatabaseServiceAdapter.query(
          connections.source,
          "SELECT TOP 3 TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES"
        );
        console.log(
          `  → Datos obtenidos del origen: ${sourceData.recordset.length} filas`
        );

        // Query de prueba en target (mismo servidor)
        const targetData = await DatabaseServiceAdapter.query(
          connections.target,
          "SELECT COUNT(*) as table_count FROM INFORMATION_SCHEMA.TABLES"
        );
        console.log(
          `  → Verificación en destino: ${targetData.recordset[0].table_count} tablas`
        );

        return {
          sourceRows: sourceData.recordset.length,
          targetTables: targetData.recordset[0].table_count,
        };
      }
    );

    console.log("✅ Transferencia completada:", result);
  } catch (error) {
    console.error("❌ Error en transferencia:", error.message);
  }
}

async function testConnectionPooling() {
  console.log("\n=== TEST: Pool de conexiones ===");
  try {
    const promises = [];

    // Ejecutar múltiples operaciones concurrentes
    for (let i = 0; i < 3; i++) {
      promises.push(
        DatabaseServiceAdapter.withTransaction("server1", async (conn, tx) => {
          const result = await DatabaseServiceAdapter.query(
            conn,
            "SELECT @@SPID as session_id, @@VERSION as version"
          );
          return {
            test: i + 1,
            sessionId: result.recordset[0].session_id,
            version: result.recordset[0].version.substring(0, 30) + "...",
          };
        })
      );
    }

    const results = await Promise.all(promises);
    console.log("✅ Operaciones concurrentes:", results.length);

    results.forEach((result, index) => {
      console.log(`  Test ${result.test}: Session ${result.sessionId}`);
    });
  } catch (error) {
    console.error("❌ Error en pooling:", error.message);
  }
}

async function testStats() {
  console.log("\n=== TEST: Estadísticas finales ===");
  const stats = DatabaseServiceAdapter.getConnectionStats();

  console.log("📊 Estadísticas:");
  console.log(`  Conexiones adquiridas: ${stats.global.acquired}`);
  console.log(`  Conexiones liberadas: ${stats.global.released}`);
  console.log(`  Conexiones activas: ${stats.activeConnections}`);
  console.log(`  Errores: ${stats.global.errors}`);

  Object.entries(stats.pools).forEach(([serverKey, poolStats]) => {
    console.log(
      `  Pool ${serverKey}: ${poolStats.size} total, ${poolStats.available} disponibles`
    );
  });
}

async function runMigrationTests() {
  console.log("🔄 Iniciando tests de migración...");

  try {
    await testSimpleTransfer();
    await testConnectionPooling();
    await testStats();

    console.log("\n🎉 Migración completada exitosamente");
    console.log("\n📋 Próximos pasos:");
    console.log("  1. Probar transferencias reales");
    console.log("  2. Verificar rollbacks en errores");
    console.log("  3. Monitorear performance");
  } catch (error) {
    console.error("\n💥 Error en migración:", error.message);
  }
}

runMigrationTests().catch(console.error);
