require('dotenv').config();
const mongoose = require('mongoose');
const QueueJob = require('./models/QueueJob');
const JobEvent = require('./models/JobEvent');
const User = require('./models/User');

async function backfillLeaderboard() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  // 1. Find all completed jobs today
  const jobs = await QueueJob.find({
    status: 'COMPLETED',
    completedAt: { $gte: startOfDay }
  }).lean();
  
  console.log(`Found ${jobs.length} completed jobs today.`);
  
  let createdCount = 0;
  for (const job of jobs) {
    // Check if event already exists
    const existing = await JobEvent.findOne({
      jobId: job._id,
      actionType: 'COMPLETED'
    });
    
    if (!existing) {
      console.log(`Backfilling COMPLETED event for Job: ${job._id} (Staff: ${job.assignedTo})`);
      const staff = await User.findById(job.assignedTo).select('name').lean();
      
      await JobEvent.create({
        jobId: job._id,
        userId: job.assignedTo,
        actionType: 'COMPLETED',
        timestamp: job.completedAt || new Date(),
        details: {
            staffId: job.assignedTo,
            staffName: staff?.name || 'Unknown',
            action: 'BACKFILLED'
        }
      });
      createdCount++;
    }
  }
  
  console.log(`Backfilled ${createdCount} events.`);
  mongoose.disconnect();
}

backfillLeaderboard().catch(console.error);
