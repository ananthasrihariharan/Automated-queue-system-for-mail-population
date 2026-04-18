require('dotenv').config();
const mongoose = require('mongoose');
const QueueJob = require('./models/QueueJob');
const QueueStats = require('./models/QueueStats');

async function verify() {
  await mongoose.connect(process.env.MONGO_URI);
  const realQueued = await QueueJob.countDocuments({ status: 'QUEUED' });
  const stats = await QueueStats.findOne({});
  console.log('Real QUEUED jobs:', realQueued);
  console.log('Stats QUEUED:', stats.queued);
  mongoose.disconnect();
}
verify().catch(console.error);
