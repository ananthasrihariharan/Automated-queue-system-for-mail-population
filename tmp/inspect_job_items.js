const { MongoClient } = require('mongodb');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Despatch_System';

async function main() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db();
    const job = await db.collection('jobs').findOne({ items: { $exists: true, $not: { $size: 0 } } });
    if (job) {
      console.log('Found Job with items:');
      console.log(JSON.stringify(job, null, 2));
    } else {
      console.log('No jobs found with items, searching for any job...');
      const anyJob = await db.collection('jobs').findOne({});
      console.log(JSON.stringify(anyJob, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
