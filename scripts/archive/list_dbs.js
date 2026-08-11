
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        await DatabaseServiceAdapter.initialize();
        await DatabaseServiceAdapter.withConnection("server1", async (connection) => {
            const query = `
                SELECT name FROM sys.databases
                WHERE database_id > 4
            `;
            const result = await DatabaseServiceAdapter.query(connection, query, {});
            console.log("Databases en la instancia:");
            result.recordset.forEach(db => {
                console.log(`- ${db.name}`);
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
