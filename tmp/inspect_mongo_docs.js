const { MongoClient } = require('mongodb');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Despatch_System';

async function main() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db();
    const collections = await db.listCollections().toArray();
    
    for (const colInfo of collections) {
      const col = db.collection(colInfo.name);
      const doc = await col.findOne({});
      if (doc) {
        console.log(`\n=================== ${colInfo.name} ===================`);
        console.log(JSON.stringify(doc, null, 2));
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
