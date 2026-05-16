require('dotenv').config();
const mongoose = require('mongoose');
const QueueJob = require('./models/QueueJob');

async function checkJobs() {
  await mongoose.connect(process.env.MONGO_URI);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const jobsCompletedToday = await QueueJob.find({
    status: 'COMPLETED',
    completedAt: { $gte: startOfDay }
  }).select('customerName completedAt assignedTo').lean();
  
  console.log('Total QueueJobs COMPLETED today:', jobsCompletedToday.length);
  jobsCompletedToday.forEach(j => {
    console.log('Job:', {
      customer: j.customerName,
      completedAt: j.completedAt,
      assignedTo: j.assignedTo
    });
  });
  
  mongoose.disconnect();
}
checkJobs().catch(console.error);
