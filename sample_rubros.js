
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        await DatabaseServiceAdapter.initialize();
        await DatabaseServiceAdapter.withConnection("server1", async (connection) => {
            const query = `
                SELECT TOP 100 PEDIDO, RUBRO4, RUBRO5, USUARIO, FECHA_PEDIDO
                FROM CATELLI.PEDIDO
                WHERE RUBRO4 IS NOT NULL OR RUBRO5 IS NOT NULL
                ORDER BY FECHA_PEDIDO DESC
            `;
            const result = await DatabaseServiceAdapter.query(connection, query, {});
            console.log("Muestra de RUBRO4 y RUBRO5:");
            result.recordset.forEach(row => {
                console.log(`- Pedido: ${row.PEDIDO}, R4: ${row.RUBRO4}, R5: ${row.RUBRO5}, User: ${row.USUARIO}, Fecha: ${row.FECHA_PEDIDO}`);
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
