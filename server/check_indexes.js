const mongoose = require('mongoose');
require('dotenv').config();

async function checkIndexes() {
  try {
    const MONGO_URI = process.env.MONGO_URI || `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    await mongoose.connect(MONGO_URI, { authSource: 'admin' });
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('logs');
    const indexes = await collection.indexes();
    
    console.log('Indexes in "logs" collection:');
    console.log(JSON.stringify(indexes, null, 2));

    // Verificar si hay logs muy antiguos
    const oldestLog = await collection.find().sort({ timestamp: 1 }).limit(1).toArray();
    if (oldestLog.length > 0) {
      console.log('\nOldest log date:', oldestLog[0].timestamp);
      const now = new Date();
      const diffDays = Math.floor((now - oldestLog[0].timestamp) / (1000 * 60 * 60 * 24));
      console.log('Age of oldest log in days:', diffDays);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkIndexes();
