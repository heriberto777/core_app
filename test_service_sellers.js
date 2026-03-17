
const LoadsService = require('./server/services/loadsService');
const DatabaseServiceAdapter = require('./server/services/DatabaseServiceAdapter');

async function test() {
    try {
        console.log("Inicializando cargadores...");
        // Intentar llamar a getSellers a través del servicio
        const result = await LoadsService.getSellers();
        console.log("Resultado de LoadsService.getSellers():", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("ERROR CAPTURADO EN EL TEST:");
        console.error(error);
        if (error.errors) {
            console.log("Errores internos (AggregateError):");
            error.errors.forEach((e, i) => console.log(`${i + 1}: ${e.message}`));
        }
    } finally {
        await DatabaseServiceAdapter.shutdown();
        process.exit(0);
    }
}

test();
