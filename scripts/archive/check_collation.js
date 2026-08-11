
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        await DatabaseServiceAdapter.initialize();
        await DatabaseServiceAdapter.withConnection("server1", async (connection) => {
            const query = `
                SELECT DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS Collation;
            `;
            const result = await DatabaseServiceAdapter.query(connection, query, {});
            console.log("Collation de la base de datos:", result.recordset[0].Collation);
        });
    } catch (error) {
        console.error(error);
    } finally {
        await DatabaseServiceAdapter.shutdown();
        process.exit(0);
    }
}

test();
