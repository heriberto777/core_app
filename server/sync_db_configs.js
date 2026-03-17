
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const DBConfig = require('./models/dbConfigModel');

const MongoDbService = require('./services/MongoDbService');

async function syncConfigs() {
    try {
        console.log(`Conectando a MongoDB...`);
        const connected = await MongoDbService.connect();
        if (!connected) {
            throw new Error("No se pudo conectar a MongoDB");
        }

        const updates = [
            {
                serverName: 'server1',
                host: process.env.SERVER1_HOST || '10.0.10.120',
                database: process.env.SERVER1_DB || 'EXACTUS',
                user: process.env.SERVER1_USER || 'sa',
                password: process.env.SERVER1_PASS || 'Mercedes@262',
                port: parseInt(process.env.SERVER1_PORT || '1433'),
                instance: process.env.SERVER1_INSTANCE === 'null' ? null : (process.env.SERVER1_INSTANCE || null),
                type: 'mssql'
            },
            {
                serverName: 'server2',
                host: process.env.SERVER2_HOST || '10.0.10.120',
                database: process.env.SERVER2_DB || 'EXACTUS',
                user: process.env.SERVER2_USER || 'sa',
                password: process.env.SERVER2_PASS || 'Mercedes@262',
                port: parseInt(process.env.SERVER2_PORT || '1433'),
                instance: process.env.SERVER2_INSTANCE === 'null' ? null : (process.env.SERVER2_INSTANCE || null),
                type: 'mssql'
            }
        ];

        for (const update of updates) {
            const result = await DBConfig.findOneAndUpdate(
                { serverName: update.serverName },
                { $set: update },
                { upsert: true, new: true }
            );
            console.log(`Configuración sincronizada para ${update.serverName}:`, result.host);
        }

        console.log('Sincronización completada.');
    } catch (error) {
        console.error('Error sincronizando configuraciones:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

syncConfigs();
