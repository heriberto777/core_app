
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        await DatabaseServiceAdapter.initialize();
        await DatabaseServiceAdapter.withConnection("server1", async (connection) => {
            const query = `
                SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = 'CATELLI' AND TABLE_NAME = 'PEDIDO'
                ORDER BY COLUMN_NAME
            `;
            const result = await DatabaseServiceAdapter.query(connection, query, {});
            console.log("Columnas en CATELLI.PEDIDO:");
            result.recordset.forEach(col => {
                console.log(`- ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
            });

            // Buscar columnas que contengan 'Load' o 'Estado' o 'Proceso'
            console.log("\nColumnas candidatas para rastreo:");
            result.recordset.filter(col =>
                col.COLUMN_NAME.toLowerCase().includes('load') ||
                col.COLUMN_NAME.toLowerCase().includes('estado') ||
                col.COLUMN_NAME.toLowerCase().includes('proceso')
            ).forEach(col => {
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
