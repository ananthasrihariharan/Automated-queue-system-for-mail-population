const { MongoClient } = require('mongodb');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Despatch_System';

async function main() {
  const client = new MongoClient(mongoUri);
  try {
    console.log('Connecting to MongoDB:', mongoUri);
    await client.connect();
    console.log('Successfully connected!');
    
    const db = client.db();
    const collections = await db.listCollections().toArray();
    console.log(`\nFound ${collections.length} collections:`);
    
    for (const colInfo of collections) {
      const col = db.collection(colInfo.name);
      const count = await col.countDocuments({});
      console.log(`- ${colInfo.name}: ${count} documents`);
    }
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
  } finally {
    await client.close();
  }
}

main();
