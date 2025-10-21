// test-transactions.js
const DatabaseService = require("../services/DatabaseService");

async function testBasicQuery() {
  console.log("\n=== TEST 1: Query básica ===");
  try {
    const result = await DatabaseService.query(
      "server1",
      "SELECT TOP 5 * FROM INFORMATION_SCHEMA.TABLES"
    );
    console.log(`✅ Query ejecutada: ${result.recordset.length} filas`);
    console.log("Primera tabla:", result.recordset[0]?.TABLE_NAME);
  } catch (error) {
    console.error("❌ Error en query básica:", error.message);
  }
}

async function testTransaction() {
  console.log("\n=== TEST 2: Transacción automática ===");
  try {
    const result = await DatabaseService.withTransaction(
      "server1",
      async (connection, transaction) => {
        console.log("  → Dentro de la transacción");

        // Query 1: Obtener info de una tabla
        const tables = await DatabaseService.query(
          connection,
          "SELECT COUNT(*) as table_count FROM INFORMATION_SCHEMA.TABLES"
        );
        console.log(
          `  → Tablas encontradas: ${tables.recordset[0].table_count}`
        );

        // Query 2: Obtener info de columnas
        const columns = await DatabaseService.query(
          connection,
          "SELECT COUNT(*) as column_count FROM INFORMATION_SCHEMA.COLUMNS"
        );
        console.log(
          `  → Columnas encontradas: ${columns.recordset[0].column_count}`
        );

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

async function testTransactionRollback() {
  console.log("\n=== TEST 3: Rollback automático ===");
  try {
    await DatabaseService.withTransaction(
      "server1",
      async (connection, transaction) => {
        console.log("  → Dentro de transacción (va a fallar)");

        // Query que debería funcionar
        const result1 = await DatabaseService.query(
          connection,
          "SELECT 1 as test"
        );
        console.log("  → Query 1 exitosa");

        // Query que va a fallar intencionalmente
        await DatabaseService.query(
          connection,
          "SELECT * FROM tabla_que_no_existe"
        );

        return "No debería llegar aquí";
      }
    );
  } catch (error) {
    console.log(
      "✅ Rollback ejecutado correctamente:",
      error.message.substring(0, 50) + "..."
    );
  }
}

async function testConnectionReuse() {
  console.log("\n=== TEST 4: Reutilización de conexiones ===");
  try {
    const start = Date.now();

    // Ejecutar múltiples queries
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        DatabaseService.query("server1", "SELECT @@VERSION as version")
      );
    }

    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    console.log(`✅ ${results.length} queries concurrentes en ${duration}ms`);
    console.log(
      "Versión SQL Server:",
      results[0].recordset[0].version.substring(0, 50) + "..."
    );
  } catch (error) {
    console.error("❌ Error en queries concurrentes:", error.message);
  }
}

async function testStats() {
  console.log("\n=== TEST 5: Estadísticas ===");
  const stats = DatabaseService.getStats();
  console.log("📊 Estadísticas actuales:");
  console.log(`  Conexiones adquiridas: ${stats.global.acquired}`);
  console.log(`  Conexiones liberadas: ${stats.global.released}`);
  console.log(`  Conexiones activas: ${stats.activeConnections}`);
  console.log(`  Errores: ${stats.global.errors}`);

  console.log("\n📋 Estado de pools:");
  Object.entries(stats.pools).forEach(([serverKey, poolStats]) => {
    console.log(`  ${serverKey}:`);
    console.log(
      `    Total: ${poolStats.size}, Disponibles: ${poolStats.available}`
    );
    console.log(
      `    En uso: ${poolStats.borrowed}, Pendientes: ${poolStats.pending}`
    );
  });
}

async function runAllTests() {
  console.log("🚀 Iniciando pruebas de DatabaseService...");

  try {
    await testBasicQuery();
    await testTransaction();
    await testTransactionRollback();
    await testConnectionReuse();
    await testStats();

    console.log("\n🎉 Todas las pruebas completadas");
  } catch (error) {
    console.error("\n💥 Error general:", error.message);
  }
}

// Ejecutar tests
runAllTests().catch(console.error);
