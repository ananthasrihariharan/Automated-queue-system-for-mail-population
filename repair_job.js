const mongoose = require('mongoose');
require('dotenv').config();

async function repairJob() {
  await mongoose.connect(process.env.MONGO_URI);
  const QueueJob = require('./models/QueueJob');
  
  const job = await QueueJob.findOne({ customerName: 'Hello' }).sort({ createdAt: -1 });
  
  if (job) {
    console.log("Repairing job:", job._id);
    
    // Extract phone from folderPath: E:\Despatch walkins\78246556643\2026-05-11...
    const folderPath = job.folderPath;
    const parts = folderPath.split(/[\\/]/).filter(Boolean);
    const phone = parts[parts.length - 2];
    const subfolder = parts[parts.length - 1];
    
    console.log("Extracted Phone:", phone);
    console.log("Extracted Subfolder:", subfolder);
    
    job.customerPhone = phone;
    job.relativeFolderPath = `${phone}/${subfolder}`;
    
    await job.save();
    console.log("Job repaired successfully.");
  } else {
    console.log("Job not found.");
  }
  process.exit();
}

repairJob();
