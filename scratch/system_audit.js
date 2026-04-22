const mongoose = require('mongoose');

async function audit() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System');
    
    const IngestionTask = require('../models/IngestionTask');
    const QueueJob = require('../models/QueueJob');
    const QueueSession = require('../models/QueueSession');
    const User = require('../models/User');

    console.log('--- SYSTEM AUDIT REPORT ---');

    // 1. Ingestion Health
    const failedTasks = await IngestionTask.find({ status: 'FAILED' });
    console.log(`[Ingestion] Failed Tasks: ${failedTasks.length}`);
    failedTasks.forEach(t => console.log(`  - ${t.folderPath}: ${t.error}`));

    const stalledTasks = await IngestionTask.countDocuments({ 
        status: 'PENDING', 
        createdAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } 
    });
    console.log(`[Ingestion] Stalled Pending Tasks (>1hr): ${stalledTasks}`);

    // 2. Assignment Health (Ghost Jobs)
    const assignedJobs = await QueueJob.find({ status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] } }).populate('assignedTo');
    let ghostJobs = 0;
    for (const job of assignedJobs) {
        if (!job.assignedTo) {
            console.log(`[Queue] Ghost Job: #${job._id} is ${job.status} but has NO assignedTo user.`);
            ghostJobs++;
            continue;
        }
        const session = await QueueSession.findOne({ staffId: job.assignedTo._id, isActive: true });
        if (!session) {
            console.log(`[Queue] Rogue Job: #${job._id} is ${job.status} to ${job.assignedTo.name}, but staff has NO active session.`);
            ghostJobs++;
        }
    }
    console.log(`[Queue] Total Inconsistent Assignments: ${ghostJobs}`);

    // 3. Queue Integrity
    const missingMetadata = await QueueJob.countDocuments({ 
        $or: [
            { folderPath: { $exists: false } },
            { customerEmail: '' }
        ],
        type: { $ne: 'WALKIN' }
    });
    console.log(`[Queue] Jobs missing critical metadata: ${missingMetadata}`);

    // 4. Session Health
    const zombieSessions = await QueueSession.countDocuments({ 
        isActive: true, 
        lastPing: { $lt: new Date(Date.now() - 90 * 60 * 1000) } 
    });
    console.log(`[Sessions] Zombie Sessions (Active > 90m without ping): ${zombieSessions}`);

    process.exit(0);
  } catch (err) {
    console.error('Audit Failure:', err.message);
    process.exit(1);
  }
}

audit();
