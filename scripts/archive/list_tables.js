
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        await DatabaseServiceAdapter.initialize();
        await DatabaseServiceAdapter.withConnection("server1", async (connection) => {
            const query = `
                SELECT TABLE_NAME
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = 'CATELLI'
                ORDER BY TABLE_NAME
            `;
            const result = await DatabaseServiceAdapter.query(connection, query, {});
            console.log("Tablas en CATELLI:");
            result.recordset.forEach(t => {
                if (t.TABLE_NAME.includes('PEDIDO')) {
                    console.log(`- ${t.TABLE_NAME}`);
                }
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
