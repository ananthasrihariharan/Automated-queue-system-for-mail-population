const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System');
  const QueueJob = require('./models/QueueJob');
  const reviewJobs = await QueueJob.find({ status: { $in: ['ADMIN_REVIEW', 'JUNK'] } });
  
  const counts = {};
  for (const j of reviewJobs) {
      counts[j.folderPath] = (counts[j.folderPath] || 0) + 1;
  }
  
  let multiCount = 0;
  for (const path in counts) {
     if (counts[path] > 1) {
         console.log(path, '=>', counts[path], 'jobs');
         multiCount++;
     }
  }
  console.log('Total folders with multiple jobs:', multiCount);
  await mongoose.disconnect();
}

run();
