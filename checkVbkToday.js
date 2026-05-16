require('dotenv').config();
const mongoose = require('mongoose');
const QueueJob = require('./models/QueueJob');

async function checkVbkJobsToday() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const jobs = await QueueJob.find({
    customerName: /Vbk/i,
    createdAt: { $gte: startOfDay }
  }).sort({ createdAt: -1 }).lean();
  
  console.log(`Found ${jobs.length} jobs for Vbk today:`);
  jobs.forEach(j => {
    console.log('Job:', {
      _id: j._id,
      status: j.status,
      type: j.type,
      folderPath: j.folderPath,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      assignedTo: j.assignedTo,
      pinnedToStaff: j.pinnedToStaff,
      emailSubject: j.emailSubject,
      mailBody: j.mailBody
    });
  });
  
  mongoose.disconnect();
}
checkVbkJobsToday().catch(console.error);
