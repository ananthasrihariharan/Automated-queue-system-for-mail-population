const mongoose = require('mongoose');

async function cleanup() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System');
    const QueueJob = require('../models/QueueJob');
    const IngestionTask = require('../models/IngestionTask');

    // Find jobs where the customerName is "WhatsappJobs" or 
    // where the folderPath is a first-level @whatsapp.local folder (not a subfolder)
    // A first-level WA folder looks like: E:\WhatsappJobs\PHONE@whatsapp.local
    // A real job folder looks like:       E:\WhatsappJobs\PHONE@whatsapp.local\TIMESTAMP_...
    
    const waRoot = process.env.WHATSAPP_WATCH_PATH || 'E:\\WhatsappJobs';
    const path = require('path');

    const allWAJobs = await QueueJob.find({
      folderPath: new RegExp('whatsapp\\.local', 'i')
    });

    let deleted = 0;
    for (const job of allWAJobs) {
      const rel = path.relative(waRoot, job.folderPath);
      const depth = rel.split(path.sep).length;
      
      // depth 1 = E:\WhatsappJobs\PHONE@whatsapp.local (first-level sender folder - WRONG)
      // depth 2 = E:\WhatsappJobs\PHONE@whatsapp.local\TIMESTAMP_job (real job - OK)
      if (depth === 1) {
        console.log(`Deleting ghost job (first-level folder): ${job.folderPath} | Name: ${job.customerName}`);
        
        // Also clean up ingestion tasks for this path
        await IngestionTask.deleteMany({ folderPath: job.folderPath });
        await QueueJob.deleteOne({ _id: job._id });
        deleted++;
      }
    }

    console.log(`\nCleaned up ${deleted} ghost WhatsApp jobs (first-level sender folders).`);
    process.exit(0);
  } catch (err) {
    console.error('Cleanup Error:', err.message);
    process.exit(1);
  }
}

cleanup();
