require('dotenv').config();
const mongoose = require('mongoose');

async function simulateJobCompletion() {
  await mongoose.connect(process.env.MONGO_URI);
  const QueueJob = require('./models/QueueJob');
  const User = require('./models/User');

  // get a user
  const user = await User.findOne({});
  if (!user) { console.log('no user'); return; }

  // create a dummy job
  const job = await QueueJob.create({
    status: 'COMPLETED',
    assignedTo: user._id,
    completedAt: new Date(),
    assignedAt: new Date(Date.now() - 5000)
  });

  console.log('Created dummy completed job:', job._id);

  // Check leaderboard
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const leaderboard = await QueueJob.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        completedAt: { $gte: startOfDay },
        assignedTo: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$assignedTo',
        count: { $sum: 1 },
      }
    }
  ]);

  console.log('Leaderboard:', leaderboard);
  
  await QueueJob.findByIdAndDelete(job._id);
  mongoose.disconnect();
}
simulateJobCompletion().catch(console.error);
