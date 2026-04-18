require('dotenv').config();
const mongoose = require('mongoose');

async function checkDB() {
  await mongoose.connect(process.env.MONGO_URI);
  const QueueJob = require('./models/QueueJob');
  const counts = await QueueJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  console.log('Statuses:', counts);
  const comp = await QueueJob.findOne({ status: 'COMPLETED' }, { completedAt: 1 }).sort({ completedAt: -1 });
  console.log('Most recent COMPLETED job:', comp);
  mongoose.disconnect();
}
checkDB().catch(console.error);
