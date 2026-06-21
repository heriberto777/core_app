// test-database-service.js (temporal)
const DatabaseService = require('../services/DatabaseService');

async function testInit() {
  try {
    console.log('Inicializando DatabaseService...');
    await DatabaseService.initialize();

    console.log('Estadísticas:', DatabaseService.getStats());

    // Probar obtener una conexión
    const connection = await DatabaseService.getConnection('server1'); // Cambiar por tu serverKey
    console.log('Conexión obtenida:', !!connection);

    await DatabaseService.releaseConnection(connection);
    console.log('Conexión liberada');

    console.log('Test completado exitosamente');
  } catch (error) {
    console.error('Error en test:', error.message);
  }
}

testInit();