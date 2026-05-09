const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const QueueJob = require('../models/QueueJob');

async function test() {
  console.log('URI:', process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  
  const countBefore = await QueueJob.countDocuments({});
  console.log('COUNT BEFORE:', countBefore);

  const testJob = new QueueJob({
    customerName: 'ANTIGRAVITY TEST',
    customerEmail: 'test@antigravity.io',
    emailSubject: 'TEST JOB',
    status: 'QUEUED',
    type: 'EMAIL',
    createdAt: new Date()
  });

  await testJob.save();
  console.log('JOB SAVED:', testJob._id);

  const countAfter = await QueueJob.countDocuments({});
  console.log('COUNT AFTER:', countAfter);

  const found = await QueueJob.findById(testJob._id);
  console.log('FOUND IN DB:', found ? 'YES' : 'NO');

  process.exit(0);
}

test();
