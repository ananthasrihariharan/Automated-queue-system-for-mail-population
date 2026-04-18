require('dotenv').config();
const mongoose = require('mongoose');
const JobEvent = require('./models/JobEvent');
const User = require('./models/User');

async function testLeaderboard() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  
  const leaderboard = await JobEvent.aggregate([
    {
      $match: {
        actionType: 'COMPLETED',
        timestamp: { $gte: startOfDay },
        'details.staffId': { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$details.staffId',
        count: { $sum: 1 },
        avgDurationMs: { $avg: 0 }
      }
    },
    { $sort: { count: -1 } }
  ])

  console.log('Raw leaderboard aggregate:', leaderboard);

  const staffIds = leaderboard.map(l => l._id)
  const staffUsers = await User.find({ _id: { $in: staffIds } }).select('name')
  const nameMap = Object.fromEntries(staffUsers.map(u => [String(u._id), u.name]))

  const result = leaderboard.map((entry, idx) => ({
    rank: idx + 1,
    staffId: entry._id,
    name: nameMap[String(entry._id)] || 'Unknown',
    count: entry.count,
    avgDurationMs: Math.round(entry.avgDurationMs || 0)
  }))

  console.log('\nFinal leaderboard output:');
  console.log(result);
  
  mongoose.disconnect();
}

testLeaderboard().catch(console.error);
