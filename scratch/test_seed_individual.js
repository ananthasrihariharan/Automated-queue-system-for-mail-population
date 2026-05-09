const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const QueueJob = require('../models/QueueJob');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('URI:', process.env.MONGO_URI);

  const testJobs = [
    {
      customerName: 'Aman Deep',
      customerEmail: 'aman@testmail.io',
      emailSubject: 'URGENT: Business Card Design',
      folderPath: 'C:\\InboundJobs\\aman@testmail.io\\2026-05-08_BC_Design',
      status: 'QUEUED',
      type: 'EMAIL'
    },
    {
      customerName: 'Priya Sharma',
      customerEmail: 'priya@testmail.io',
      emailSubject: 'Wedding Invite Revision',
      folderPath: 'C:\\InboundJobs\\priya@testmail.io\\2026-05-08_Wedding_Invite',
      status: 'QUEUED',
      type: 'EMAIL'
    }
  ];

  for (const data of testJobs) {
    try {
      const job = new QueueJob(data);
      await job.save();
      console.log('CREATED:', job._id, job.customerName);
    } catch (err) {
      console.error('FAILED:', data.customerName, err.message);
    }
  }

  const count = await QueueJob.countDocuments({ status: 'QUEUED' });
  console.log('TOTAL QUEUED NOW:', count);
  process.exit(0);
}

seed();
