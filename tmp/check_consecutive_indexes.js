const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

async function checkIndexes() {
    try {
        const mongoUri = process.env.MONGO_URI || `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?authSource=admin`;
        console.log('Connecting to:', mongoUri.replace(/:([^:@]{1,})@/, ':****@'));

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const collection = mongoose.connection.db.collection('consecutives');
        const indexes = await collection.indexes();
        console.log('Indexes for "consecutives":', JSON.stringify(indexes, null, 2));

        const countNullCode = await collection.countDocuments({ code: null });
        console.log('Documents with code: null:', countNullCode);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkIndexes();
