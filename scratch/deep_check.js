const axios = require('axios');

async function deepCheck() {
  const API_URL = 'http://localhost:66/api/admin/queue/sessions';
  // We need an internal token or we can bypass auth if we run this on the server with a special header
  // But since we are on the server, let's just try to hit it. 
  // Actually, the routes have 'auth' middleware.
  // Let's check the database directly again but using the EXACT logic from admin-queue.js.
  
  const mongoose = require('mongoose');
  const QueueJob = require('../models/QueueJob');
  const QueueSession = require('../models/QueueSession');
  const User = require('../models/User');
  
  await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System');
  
  const sessions = await QueueSession.find({ isActive: true }).populate('staffId').lean();
  console.log(`Found ${sessions.length} active sessions.`);
  
  for (const s of sessions) {
    const rawStaffId = s.staffId?._id || s.staffId;
    if (!rawStaffId) continue;
    
    const staffIdObj = new mongoose.Types.ObjectId(rawStaffId.toString());
    const [pinned, paused] = await Promise.all([
      QueueJob.find({ pinnedToStaff: staffIdObj, status: 'QUEUED' }).countDocuments(),
      QueueJob.find({ assignedTo: staffIdObj, status: 'PAUSED' }).countDocuments()
    ]);
    
    console.log(`Staff: ${s.staffId?.name || 'Unknown'}`);
    console.log(` - Pinned Count: ${pinned}`);
    console.log(` - Paused Count: ${paused}`);
    
    if (pinned > 0 || paused > 0) {
      console.log(` ✅ SUCCESS: Workload detected for ${s.staffId?.name}`);
    } else {
      console.log(` ℹ️ IDLE: No workload detected for ${s.staffId?.name}`);
    }
  }
  
  await mongoose.disconnect();
}

deepCheck().catch(console.error);
