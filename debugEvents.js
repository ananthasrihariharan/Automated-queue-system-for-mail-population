require('dotenv').config();
const mongoose = require('mongoose');
const JobEvent = require('./models/JobEvent');

async function debugLeaderboard() {
  await mongoose.connect(process.env.MONGO_URI);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const allCompletedToday = await JobEvent.find({
    actionType: 'COMPLETED',
    timestamp: { $gte: startOfDay }
  }).lean();
  
  console.log('Total COMPLETED events today:', allCompletedToday.length);
  allCompletedToday.forEach(e => {
    console.log('Event:', {
      jobId: e.jobId,
      userId: e.userId,
      staffIdInDetails: e.details?.staffId,
      action: e.details?.action
    });
  });
  
  mongoose.disconnect();
}
debugLeaderboard().catch(console.error);
