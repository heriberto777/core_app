const mongoose = require('mongoose');
require('dotenv').config();

async function checkAllIndexes() {
    try {
        const mongoUri = process.env.MONGO_URI || `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?authSource=admin`;
        console.log('Connecting to:', mongoUri.replace(/:([^:@]{1,})@/, ':****@'));

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const collections = await mongoose.connection.db.listCollections().toArray();

        for (const colInfo of collections) {
            const collection = mongoose.connection.db.collection(colInfo.name);
            const indexes = await collection.indexes();

            const uniqueIndexes = indexes.filter(idx => idx.unique);

            if (uniqueIndexes.length > 0) {
                console.log(`\n--- Collection: ${colInfo.name} ---`);
                uniqueIndexes.forEach(idx => {
                    console.log(`Index Name: ${idx.name}`);
                    console.log(`Key Pattern: ${JSON.stringify(idx.key)}`);
                });
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkAllIndexes();
