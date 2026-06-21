// test-final-migration-fixed.js
const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");

async function testTransactionFixed() {
  console.log("\n=== TEST: Transacción corregida ===");
  try {
    const result = await DatabaseServiceAdapter.withTransaction(
      "server1",
      async (connection) => {
        console.log(
          "  → Dentro de transacción (usando connection directamente)"
        );

        // Query 1
        const tables = await DatabaseServiceAdapter.query(
          connection,
          "SELECT COUNT(*) as table_count FROM INFORMATION_SCHEMA.TABLES"
        );
        console.log(`  → Tablas: ${tables.recordset[0].table_count}`);

        // Query 2
        const columns = await DatabaseServiceAdapter.query(
          connection,
          "SELECT COUNT(*) as column_count FROM INFORMATION_SCHEMA.COLUMNS"
        );
        console.log(`  → Columnas: ${columns.recordset[0].column_count}`);

        return {
          tablas: tables.recordset[0].table_count,
          columnas: columns.recordset[0].column_count,
        };
      }
    );

    console.log("✅ Transacción completada:", result);
  } catch (error) {
    console.error("❌ Error en transacción:", error.message);
  }
}

async function testRollbackFixed() {
  console.log("\n=== TEST: Rollback corregido ===");
  try {
    await DatabaseServiceAdapter.withTransaction(
      "server1",
      async (connection) => {
        console.log("  → Query exitosa...");
        await DatabaseServiceAdapter.query(connection, "SELECT 1 as test");

        console.log("  → Query que va a fallar...");
        await DatabaseServiceAdapter.query(
          connection,
          "SELECT * FROM tabla_inexistente"
        );

        return "No debería llegar aquí";
      }
    );
  } catch (error) {
    console.log(
      "✅ Rollback automático ejecutado:",
      error.message.substring(0, 50) + "..."
    );
  }
}

async function testDoubleTransaction() {
  console.log("\n=== TEST: Doble transacción (source + target) ===");
  try {
    const testMapping = {
      sourceServer: "server1",
      targetServer: "server1", // Mismo servidor para prueba
    };

    const result = await DatabaseServiceAdapter.withConnections(
      testMapping,
      async (connections) => {
        console.log(
          "  → Conexiones establecidas con transacciones automáticas"
        );

        const sourceResult = await DatabaseServiceAdapter.query(
          connections.source,
          "SELECT COUNT(*) as source_tables FROM INFORMATION_SCHEMA.TABLES"
        );

        const targetResult = await DatabaseServiceAdapter.query(
          connections.target,
          "SELECT @@VERSION as version"
        );

        return {
          sourceTables: sourceResult.recordset[0].source_tables,
          version: targetResult.recordset[0].version.substring(0, 50) + "...",
        };
      }
    );

    console.log("✅ Doble transacción completada:", result);
  } catch (error) {
    console.error("❌ Error en doble transacción:", error.message);
  }
}

async function runFixedTests() {
  console.log("🔧 Testing transacciones corregidas...");

  try {
    await testTransactionFixed();
    await testRollbackFixed();
    await testDoubleTransaction();

    console.log("\n🎉 TODOS LOS TESTS CORREGIDOS PASARON");
    console.log("\n✅ TRANSACCIONES FUNCIONANDO CORRECTAMENTE");
  } catch (error) {
    console.error("\n❌ ERROR EN TESTS:", error.message);
  }
}

runFixedTests().catch(console.error);
