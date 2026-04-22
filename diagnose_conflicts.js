const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System');
  const QueueJob = require('./models/QueueJob');

  // Find customers who have jobs in BOTH QUEUED and ADMIN_REVIEW
  const reviewJobs = await QueueJob.find({ status: 'ADMIN_REVIEW' }).lean();
  const queuedJobs = await QueueJob.find({ status: 'QUEUED' }).lean();

  const reviewEmails = new Map();
  for (const j of reviewJobs) {
    if (j.customerEmail) {
      if (!reviewEmails.has(j.customerEmail)) reviewEmails.set(j.customerEmail, []);
      reviewEmails.get(j.customerEmail).push(j);
    }
  }

  const conflicts = [];
  for (const j of queuedJobs) {
    if (j.customerEmail && reviewEmails.has(j.customerEmail)) {
      conflicts.push({
        customerEmail: j.customerEmail,
        queuedJob: { id: j._id, subject: j.emailSubject, threadId: j.threadId, createdAt: j.createdAt },
        reviewJobs: reviewEmails.get(j.customerEmail).map(r => ({ id: r._id, subject: r.emailSubject, threadId: r.threadId, createdAt: r.createdAt }))
      });
    }
  }

  // Also check for same folderPath in different statuses
  const folderMap = new Map();
  const allLive = await QueueJob.find({ status: { $in: ['QUEUED', 'ADMIN_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED'] } }).lean();
  for (const j of allLive) {
    if (!j.folderPath) continue;
    if (!folderMap.has(j.folderPath)) folderMap.set(j.folderPath, []);
    folderMap.get(j.folderPath).push(j);
  }

  console.log('\n--- CUSTOMERS WITH JOBS IN BOTH QUEUED + ADMIN_REVIEW ---');
  if (conflicts.length === 0) {
    console.log('None found.');
  } else {
    for (const c of conflicts) {
      console.log(`\nCustomer: ${c.customerEmail}`);
      console.log(`  QUEUED: [${c.queuedJob.id}] "${c.queuedJob.subject}" (threadId: ${c.queuedJob.threadId}) - ${c.queuedJob.createdAt}`);
      for (const r of c.reviewJobs) {
        console.log(`  REVIEW: [${r.id}] "${r.subject}" (threadId: ${r.threadId}) - ${r.createdAt}`);
      }
    }
  }

  console.log('\n--- SAME FOLDER IN MULTIPLE STATES ---');
  let dupeCount = 0;
  for (const [fp, jobs] of folderMap.entries()) {
    if (jobs.length > 1) {
      console.log(`\nFolder: ${fp}`);
      for (const j of jobs) {
        console.log(`  [${j._id}] status=${j.status} threadId=${j.threadId}`);
      }
      dupeCount++;
    }
  }
  if (dupeCount === 0) console.log('None found.');

  await mongoose.disconnect();
}

run();
