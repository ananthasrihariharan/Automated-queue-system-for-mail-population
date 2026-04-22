const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System');
  const QueueJob = require('./models/QueueJob');

  // Find all live jobs grouped by folderPath
  const allLive = await QueueJob.find({
    status: { $in: ['QUEUED', 'ADMIN_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED'] },
    folderPath: { $nin: [null, ''] }
  }).lean().sort({ createdAt: 1 }); // oldest first

  const folderMap = new Map();
  for (const j of allLive) {
    if (!folderMap.has(j.folderPath)) folderMap.set(j.folderPath, []);
    folderMap.get(j.folderPath).push(j);
  }

  let fixed = 0;
  for (const [fp, jobs] of folderMap.entries()) {
    if (jobs.length <= 1) continue;

    // Sort: active statuses first (ASSIGNED, IN_PROGRESS, PAUSED), then by createdAt desc
    const priority = { 'IN_PROGRESS': 0, 'ASSIGNED': 1, 'PAUSED': 2, 'QUEUED': 3, 'ADMIN_REVIEW': 4 };
    jobs.sort((a, b) => {
      const pa = priority[a.status] ?? 5;
      const pb = priority[b.status] ?? 5;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt) - new Date(a.createdAt); // newest first within same priority
    });

    const winner = jobs[0]; // Keep this one

    // Patch the winner's threadId to itself if null
    if (!winner.threadId) {
      await QueueJob.findByIdAndUpdate(winner._id, { $set: { threadId: winner._id.toString() } });
    }

    // Junk all losers
    for (let i = 1; i < jobs.length; i++) {
      const loser = jobs[i];
      console.log(`  [FIX] Folder: ${fp.split('\\').pop()}`);
      console.log(`    KEEPING  [${winner._id}] status=${winner.status}`);
      console.log(`    JUNKING  [${loser._id}] status=${loser.status}`);
      await QueueJob.findByIdAndUpdate(loser._id, {
        $set: {
          status: 'JUNK',
          isSuperseded: true,
          returnReason: `System Cleanup: Same-folder duplicate (kept ${winner._id})`
        }
      });
      fixed++;
    }
  }

  console.log(`\nDone. Fixed ${fixed} duplicate folder conflicts.`);
  await mongoose.disconnect();
}

run();
