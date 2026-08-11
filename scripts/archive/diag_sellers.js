
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        await DatabaseServiceAdapter.initialize();
        await DatabaseServiceAdapter.withConnection("server1", async (connection) => {
            const query = `
                SELECT
                  VENDEDOR as code,
                  NOMBRE as name,
                  U_BODEGA as assignedWarehouse,
                  U_ESVENDEDOR as isVendedor,
                  ACTIVO as isActive
                FROM CATELLI.VENDEDOR
                WHERE ACTIVO = 'S'
                ORDER BY NOMBRE
            `;
            console.log("Ejecutando query de vendedores...");
            try {
                const result = await DatabaseServiceAdapter.query(connection, query, {});
                console.log("Query exitosa. Vendedores obtenidos:", result.recordset.length);
                if (result.recordset.length > 0) {
                    console.log("Primer registro:", result.recordset[0]);
                }
            } catch (queryError) {
                console.error("ERROR EN QUERY DE VENDEDORES:");
                console.error(queryError);
                if (queryError.errors) {
                    queryError.errors.forEach((e, i) => console.error(`${i + 1}: ${e.message}`));
                }
            }
        });
    } catch (error) {
        console.error("Error diagnóstico vendedores:", error);
    } finally {
        await DatabaseServiceAdapter.shutdown();
        process.exit(0);
    }
}

test();
