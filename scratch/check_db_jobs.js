const mongoose = require('mongoose');
require('dotenv').config();
const QueueJob = require('../models/QueueJob');

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const jobs = await QueueJob.find({})
      .select('status customerName assignedTo type createdAt isSuperseded')
      .lean();
    
    const breakdown = {};
    jobs.forEach(j => {
      breakdown[j.status] = (breakdown[j.status] || 0) + 1;
    });

    console.log('TOTAL JOBS:', jobs.length);
    console.log('STATUS BREAKDOWN:', JSON.stringify(breakdown, null, 2));
    
    const completed = jobs.filter(j => j.status === 'COMPLETED');
    if (completed.length > 0) {
      const dates = completed.map(j => (j.createdAt instanceof Date ? j.createdAt : new Date(j.createdAt)).toISOString().split('T')[0]);
      const uniqueDates = [...new Set(dates)].sort();
      console.log('COMPLETED JOBS DATE RANGE:', uniqueDates);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
