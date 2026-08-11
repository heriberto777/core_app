
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        await DatabaseServiceAdapter.initialize();
        await DatabaseServiceAdapter.withConnection("server1", async (connection) => {
            const query = `
                SELECT COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = 'CATELLI' AND TABLE_NAME = 'PEDIDO_LINEA'
                ORDER BY COLUMN_NAME
            `;
            const result = await DatabaseServiceAdapter.query(connection, query, {});
            console.log("Columnas en CATELLI.PEDIDO_LINEA:");
            result.recordset.forEach(col => {
                console.log(`- ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
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
