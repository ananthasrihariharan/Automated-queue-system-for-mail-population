const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const QueueJob = require('../models/QueueJob');
const User = require('../models/User');

async function debug() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const staff = await User.findOne({ name: 'System Admin' });
  if (!staff) {
    console.log('System Admin not found');
    process.exit(1);
  }
  
  console.log('STAFF:', { id: staff._id, name: staff.name });

  const jobs = await QueueJob.find({
    status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'QUEUED'] },
    $or: [
      { assignedTo: staff._id },
      { pinnedToStaff: staff._id }
    ]
  });

  console.log(`FOUND ${jobs.length} JOBS FOR STAFF`);
  jobs.forEach(j => {
    console.log(`- Job: ${j.customerName}, Status: ${j.status}, AssignedTo: ${j.assignedTo}, PinnedTo: ${j.pinnedToStaff}`);
  });

  process.exit(0);
}

debug();
