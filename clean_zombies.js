const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System');
  const QueueJob = require('./models/QueueJob');
  const reviewJobs = await QueueJob.find({ status: { $in: ['ADMIN_REVIEW', 'JUNK'] } }).sort({ createdAt: -1 });
  
  const foldersToKeep = {};
  let deleted = 0;
  
  for (const job of reviewJobs) {
      if (!foldersToKeep[job.folderPath]) {
          foldersToKeep[job.folderPath] = job;
      } else {
          // If we already kept the newest one, delete older duplicates entirely.
          await QueueJob.findByIdAndDelete(job._id);
          deleted++;
      }
  }
  
  console.log('Successfully wiped ' + deleted + ' zombie jobs from the system.');
  await mongoose.disconnect();
}

run();
