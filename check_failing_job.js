const mongoose = require('mongoose');
require('dotenv').config();

async function checkJob() {
  await mongoose.connect(process.env.MONGO_URI);
  const QueueJob = require('./models/QueueJob');
  
  // Find the job from the screenshot (Customer Hello)
  const job = await QueueJob.findOne({ customerName: 'Hello' }).sort({ createdAt: -1 });
  
  if (!job) {
    console.log("Job not found in DB.");
  } else {
    console.log("Job Found:");
    console.log("ID:", job._id);
    console.log("Customer:", job.customerName);
    console.log("Phone:", job.customerPhone);
    console.log("Relative Path:", job.relativeFolderPath);
    console.log("Absolute Path (from DB):", job.folderPath);
    console.log("Attachments:", job.attachments);
    
    const path = require('path');
    const fs = require('fs');
    const walkinRoot = process.env.WALKIN_UPLOAD_PATH;
    console.log("\nWalk-in Root:", walkinRoot);
    
    const trialPath = path.join(walkinRoot, job.relativeFolderPath);
    console.log("Checking path:", trialPath);
    console.log("Exists?", fs.existsSync(trialPath));
    
    if (!fs.existsSync(trialPath) && job.customerPhone) {
        const nestedPath = path.join(walkinRoot, job.customerPhone, job.relativeFolderPath);
        console.log("Checking nested path:", nestedPath);
        console.log("Exists?", fs.existsSync(nestedPath));
    }
  }
  process.exit();
}

checkJob();
