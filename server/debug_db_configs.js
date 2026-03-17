require('dotenv').config();
const mongoose = require('mongoose');
const MongoDbService = require('./services/mongoDbService');
const DBConfig = require('./models/dbConfigModel');

async function checkConfigs() {
    try {
        console.log("Intentando conectar a MongoDB...");
        const connected = await MongoDbService.connect();
        if (!connected) {
            console.error("No se pudo conectar a MongoDB principal.");
            process.exit(1);
        }

        console.log("Consultando coleccion DBConfig...");
        const configs = await DBConfig.find({}).lean();

        console.log("\nConfiguraciones encontradas:");
        console.log("----------------------------");
        configs.forEach(c => {
            console.log(`- Server: ${c.serverName} | Tipo: ${c.type} | Host: ${c.host}`);
        });
        console.log("----------------------------\n");

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error("Error en diagnostico:", error);
        process.exit(1);
    }
}

checkConfigs();
