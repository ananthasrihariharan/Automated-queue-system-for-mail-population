const mongoose = require('mongoose');
require('dotenv').config();

async function debugIngestion() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const IngestionTask = require('../models/IngestionTask');
  const QueueJob = require('../models/QueueJob');

  const tasks = await IngestionTask.find().sort({ createdAt: -1 }).limit(10);
  console.log('\n--- Recent Ingestion Tasks ---');
  tasks.forEach(t => {
    console.log(`Folder: ${t.folderPath}\nStatus: ${t.status}\nAttempts: ${t.attempts}\nError: ${t.error || 'None'}\nCreated: ${t.createdAt}\n`);
  });

  const jobs = await QueueJob.find().sort({ createdAt: -1 }).limit(10);
  console.log('\n--- Recent Queue Jobs ---');
  jobs.forEach(j => {
    console.log(`Subject: ${j.emailSubject}\nStatus: ${j.status}\nCreated: ${j.createdAt}\n`);
  });

  process.exit(0);
}

debugIngestion().catch(err => {
  console.error(err);
  process.exit(1);
});
