
const mongoose = require('mongoose');
const DBConfig = require('./server/models/dbConfigModel');
require('dotenv').config({ path: './server/.env' });

async function listConfigs() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/transfer-control';
        console.log(`Conectando a MongoDB: ${mongoUri}`);
        await mongoose.connect(mongoUri);

        const configs = await DBConfig.find({}).lean();
        console.log(`Encontradas ${configs.length} configuraciones:`);
        configs.forEach(c => {
            console.log(`- Server: ${c.serverName}`);
            console.log(`  Tipo: ${c.type}`);
            console.log(`  Host: ${c.host}`);
            console.log(`  Database: ${c.database}`);
            console.log(`  Instance: ${c.instance}`);
            console.log('');
        });
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

listConfigs();
