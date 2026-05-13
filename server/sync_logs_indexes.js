const mongoose = require('mongoose');
const Log = require('./models/loggerModel');
require('dotenv').config();

async function syncIndexes() {
  try {
    const MONGO_URI = process.env.MONGO_URI || `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    await mongoose.connect(MONGO_URI, { authSource: 'admin' });
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('logs');

    console.log('--- Step 1: Dropping old TTL index ---');
    try {
        // El nombre actual según mi diagnóstico anterior es 'timestamp_1'
        await collection.dropIndex('timestamp_1');
        console.log('✅ Index "timestamp_1" dropped successfully');
    } catch (e) {
        console.log('⚠️ Could not drop index "timestamp_1" (maybe it has a different name):', e.message);
    }

    console.log('--- Step 2: Creating new indexes from Schema ---');
    // Esto creará todos los índices definidos en loggerModel.js, incluyendo el TTL de 30 días
    await Log.createIndexes();
    console.log('✅ New indexes created successfully');

    console.log('--- Step 3: Verifying final state ---');
    const finalIndexes = await collection.indexes();
    console.log('Final Indexes:');
    console.log(JSON.stringify(finalIndexes, null, 2));

    await mongoose.disconnect();
    console.log('--- SYNC COMPLETED ---');
  } catch (error) {
    console.error('❌ Error during index sync:', error);
  }
}

syncIndexes();
