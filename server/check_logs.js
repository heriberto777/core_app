const mongoose = require('mongoose');
const Log = require('./models/loggerModel');
require('dotenv').config();

async function checkLogs() {
  try {
    const MONGO_URI = process.env.MONGO_URI || `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    console.log('Connecting to:', MONGO_URI.replace(/:[^:]*@/, ':****@'));
    
    await mongoose.connect(MONGO_URI, { authSource: 'admin' });
    console.log('Connected to MongoDB');

    const totalLogs = await Log.countDocuments();
    console.log('Total logs in collection:', totalLogs);

    const latestLogs = await Log.find().sort({ timestamp: -1 }).limit(5);
    console.log('Latest 5 logs:');
    latestLogs.forEach(log => {
      console.log(`[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message.substring(0, 100)}`);
    });

    const oldestLogs = await Log.find().sort({ timestamp: 1 }).limit(5);
    console.log('Oldest 5 logs:');
    oldestLogs.forEach(log => {
      console.log(`[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message.substring(0, 100)}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkLogs();
