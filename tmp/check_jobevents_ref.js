const { MongoClient } = require('mongodb');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Despatch_System';

async function main() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db();
    
    const events = await db.collection('jobevents').find({}).limit(10).toArray();
    console.log('Sample Job Events with references:');
    for (const ev of events) {
      const qj = ev.jobId ? await db.collection('queuejobs').findOne({ _id: ev.jobId }) : null;
      const j = ev.jobId ? await db.collection('jobs').findOne({ _id: ev.jobId }) : null;
      console.log(`Event ID: ${ev._id}, jobId: ${ev.jobId}, IsQueueJob: ${!!qj}, IsJob: ${!!j}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
