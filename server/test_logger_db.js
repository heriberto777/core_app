require('dotenv').config();
const logger = require('./services/logger');
const MongoDbService = require('./services/mongoDbService');

async function testLogging() {
  try {
    console.log('--- TEST LOGGING START ---');
    
    // Conectar MongoDB primero
    await MongoDbService.connect();
    console.log('MongoDB connection status:', MongoDbService.isConnected());

    // Esperar un poco para que el transporte se inicialice
    console.log('Waiting 3 seconds for logger to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = logger.getDiagnostics();
    console.log('Logger Diagnostics:', JSON.stringify(diagnostics, null, 2));

    console.log('Sending test log...');
    logger.info('TEST LOG FROM DIAGNOSTIC SCRIPT', { 
        test: true, 
        timestamp: new Date().toISOString() 
    });

    console.log('Waiting 5 seconds for batch processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('--- TEST LOGGING END ---');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testLogging();
