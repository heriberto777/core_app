
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        await DatabaseServiceAdapter.initialize();
        await DatabaseServiceAdapter.withConnection("server2", async (connection) => {
            const query = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'IMPLT_Orders'";
            const result = await DatabaseServiceAdapter.query(connection, query);
            if (result.recordset && result.recordset.length > 0) {
                console.log("RESULTADO: TABLA_IMPLT_ORDERS_EXISTE");
            } else {
                console.log("RESULTADO: TABLA_IMPLT_ORDERS_NO_EXISTE");
            }
        });
    } catch (e) {
        console.log("RESULTADO: ERROR_" + e.message);
    } finally {
        await DatabaseServiceAdapter.shutdown();
        process.exit(0);
    }
}
test();
