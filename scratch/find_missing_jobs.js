const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const QueueJob = require('../models/QueueJob');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('CONNECTED TO:', process.env.MONGO_URI);
  
  const allJobs = await QueueJob.find({}).sort({ createdAt: -1 }).limit(10);
  console.log('LATEST 10 JOBS:');
  allJobs.forEach(j => {
    console.log(`- ID: ${j._id}, Status: ${j.status}, Customer: ${j.customerName}, Created: ${j.createdAt}`);
  });

  const queuedCount = await QueueJob.countDocuments({ status: 'QUEUED' });
  console.log('TOTAL QUEUED:', queuedCount);

  process.exit(0);
}

check();
