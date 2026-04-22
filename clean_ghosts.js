const fs = require('fs');
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System');
    const QueueJob = require('./models/QueueJob');
    const jobs = await QueueJob.find({ status: { $in: ['ADMIN_REVIEW', 'QUEUED'] } });
    
    let missingFolders = 0;
    for (const job of jobs) {
       if (!fs.existsSync(job.folderPath)) {
           // Delete the ghost job because its folder was manually wiped
           await QueueJob.findByIdAndDelete(job._id);
           missingFolders++;
       }
    }
    console.log('Cleaned up ' + missingFolders + ' ghost jobs where folders were manually deleted by admins.');
    await mongoose.disconnect();
}

run();
