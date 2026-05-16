const mongoose = require('mongoose');
const QueueJob = require('../models/QueueJob');
const QueueSession = require('../models/QueueSession');
const User = require('../models/User');

async function checkLoad() {
  await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System'); 
  
  const activeSessions = await QueueSession.find({ isActive: true }).populate('staffId');
  console.log(`Found ${activeSessions.length} active sessions.`);
  
  for (const sess of activeSessions) {
    const staffId = sess.staffId._id;
    const staffName = sess.staffId.name;
    
    const [pinned, paused] = await Promise.all([
      QueueJob.find({ pinnedToStaff: staffId, status: 'QUEUED' }),
      QueueJob.find({ assignedTo: staffId, status: 'PAUSED' })
    ]);
    
    console.log(`Staff: ${staffName} (${staffId})`);
    console.log(` - Pinned: ${pinned.length}`);
    console.log(` - Paused: ${paused.length}`);
  }
  
  await mongoose.disconnect();
}

checkLoad().catch(console.error);
