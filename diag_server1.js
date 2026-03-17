
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
  try {
    await DatabaseServiceAdapter.initialize();
    await DatabaseServiceAdapter.withConnection("server1", async (connection) => {
      const query = `
                SELECT TOP 50 PEDIDO, RUBRO4, RUBRO5, ESTADO, FECHA_PEDIDO
                FROM CATELLI.PEDIDO
                ORDER BY FECHA_PEDIDO DESC
            `;
      const result = await DatabaseServiceAdapter.query(connection, query, {});
      console.log("Muestra de RUBRO4 y RUBRO5:");
      result.recordset.forEach(row => {
        console.log(`- Pedido: ${row.PEDIDO}, R4: ${row.RUBRO4}, R5: ${row.RUBRO5}, Est: ${row.ESTADO}, F: ${row.FECHA_PEDIDO}`);
      });
    });
  } catch (error) {
    console.error(error);
  } finally {
    await DatabaseServiceAdapter.shutdown();
    process.exit(0);
  }
}

test();
