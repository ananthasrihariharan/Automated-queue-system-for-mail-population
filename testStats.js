require('dotenv').config();
const mongoose = require('mongoose');

async function testStats() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const QueueStats = require('./models/QueueStats');
  const QueueJob = require('./models/QueueJob');
  const User = require('./models/User'); // if needed
  
  const stats = await QueueStats.findOne({});
  console.log('--- Stats Table ---');
  console.log(stats);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  console.log('\n--- Date Info ---');
  console.log('Now:', new Date());
  console.log('startOfDay:', startOfDay);

  const countToday = await QueueJob.countDocuments({
    status: 'COMPLETED',
    completedAt: { $gte: startOfDay }
  });
  
  console.log('\nJobs completed after', startOfDay, ' =>', countToday);

  // find any completed job
  const recentJobs = await QueueJob.find({ status: 'COMPLETED' }).sort({ completedAt: -1 }).limit(3);
  console.log('\n--- Most recently completed jobs ---');
  recentJobs.forEach(j => console.log('Job:', j._id, '| CompletedAt:', j.completedAt));

  mongoose.disconnect();
}

testStats().catch(console.error);
