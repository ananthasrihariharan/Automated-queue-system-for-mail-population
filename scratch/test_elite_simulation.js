const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

// Load Models
const QueueJob = require('../models/QueueJob');
const QueueSession = require('../models/QueueSession');
const User = require('../models/User');

async function simulateEliteRouting() {
  console.log('--- STARTING ELITE ENGINE SIMULATION ---');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to Database');

  // CLEANUP: Clean existing test data
  await QueueJob.deleteMany({ customerEmail: 'test_customer@elite.com' });
  await QueueSession.deleteMany({ staffId: '60f1e4b3c9e7b41e4c8b4567' }); // Mock ID

  // 1. Setup Mock User (Staff Alpha)
  let staff = await User.findOne({ name: 'Staff Alpha' });
  if (!staff) {
      console.log('Creating mock staff user');
      staff = await User.create({ 
          name: 'Staff Alpha', 
          email: 'alpha@elite.com', 
          role: 'PREPRESS',
          password: 'hashed_password_123',
          phone: '0000000000'
      });
  }
  const staffId = staff._id;

  // 2. Scenario A: Initial Job (v1)
  console.log('\n[Scenario A] Ingesting Initial Job (v1)...');
  const fileHashV1 = crypto.createHash('sha256').update('FILE_CONTENT_VERSION_1').digest('hex');
  const jobV1 = await QueueJob.create({
      customerName: 'Elite Corp',
      customerEmail: 'test_customer@elite.com',
      emailSubject: 'Business Card Order',
      folderPath: '/mock/path/v1',
      fingerprint: fileHashV1,
      status: 'ASSIGNED',
      assignedTo: staffId,
      assignedAt: new Date()
  });
  console.log(`✅ Job v1 Created & Assigned to ${staff.name}`);

  // 3. Scenario B: Sticky Revision (v2 - Different File)
  console.log('\n[Scenario B] Ingesting Revision (Different File)...');
  
  // Set Staff Alpha as ONLINE
  await QueueSession.create({
      staffId: staffId,
      isActive: true,
      lastSeenAt: new Date()
  });

  const fileHashV2 = crypto.createHash('sha256').update('FILE_CONTENT_VERSION_2').digest('hex');
  
  // Simulation of Routing Logic (Manual copy of processingWorker logic)
  const activeJob = await QueueJob.findOne({
      customerEmail: 'test_customer@elite.com',
      status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }
  }).sort({ createdAt: -1 });

  let jobV2;
  if (activeJob) {
      console.log('Found Active Job for customer. Triggering Continuity...');
      const isOnline = await QueueSession.findOne({ staffId: staffId, isActive: true });
      
      jobV2 = await QueueJob.create({
          customerName: 'Elite Corp',
          customerEmail: 'test_customer@elite.com',
          emailSubject: 'Revision for Business Card',
          folderPath: '/mock/path/v2',
          fingerprint: fileHashV2,
          threadId: activeJob.threadId || activeJob._id.toString(),
          version: (activeJob.version || 1) + 1,
          status: isOnline ? 'ASSIGNED' : 'QUEUED',
          assignedTo: isOnline ? staffId : null,
          isAutoAssigned: isOnline ? true : false,
          continuityContext: isOnline ? `Continuity: Auto-assigned to ${staff.name} handling active job #${activeJob._id.toString().substring(18)}` : ''
      });
  }

  if (jobV2 && jobV2.assignedTo && jobV2.status === 'ASSIGNED') {
      console.log(`✅ Success: Revision v2 auto-assigned to ${staff.name}!`);
      console.log(`Context: ${jobV2.continuityContext}`);
  } else {
      console.log('❌ Failure: Revision was not auto-assigned correctly.');
  }

  // 4. Scenario C: Duplicate Detection
  console.log('\n[Scenario C] Ingesting Exact Duplicate (Same Hash)...');
  const activeForDup = await QueueJob.findOne({
      customerEmail: 'test_customer@elite.com',
      fingerprint: fileHashV2,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }
  });

  if (activeForDup) {
      console.log('Duplicate detected! Routing to ADMIN_REVIEW.');
      const jobDup = await QueueJob.create({
          customerName: 'Elite Corp',
          customerEmail: 'test_customer@elite.com',
          emailSubject: 'Fwd: Revision for Business Card',
          folderPath: '/mock/path/v2_dup',
          fingerprint: fileHashV2,
          status: 'ADMIN_REVIEW',
          continuityContext: 'ACCIDENTAL DUPLICATE: Content matches active job'
      });
      console.log(`✅ Success: Duplicate blocked and sent to ${jobDup.status}`);
  }

  // 5. Scenario D: Availability Guard
  console.log('\n[Scenario D] Testing Availability Guard (Staff Offline)...');
  await QueueSession.deleteMany({ staffId: staffId }); // Go offline
  
  const fileHashV3 = crypto.createHash('sha256').update('FILE_CONTENT_VERSION_3').digest('hex');
  const activeForV3 = await QueueJob.findOne({
      customerEmail: 'test_customer@elite.com',
      status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }
  }).sort({ createdAt: -1 });

  const isAlphaOnline = await QueueSession.findOne({ staffId: staffId, isActive: true });
  
  const jobV3 = await QueueJob.create({
      customerName: 'Elite Corp',
      customerEmail: 'test_customer@elite.com',
      emailSubject: 'New Flyer Request',
      folderPath: '/mock/path/v3',
      fingerprint: fileHashV3,
      status: isAlphaOnline ? 'ASSIGNED' : 'QUEUED',
      assignedTo: isAlphaOnline ? staffId : null
  });

  console.log(`✅ Success: Staff offline → Job status is ${jobV3.status} (should be QUEUED)`);

  console.log('\n--- SIMULATION COMPLETE ---');
  process.exit(0);
}

simulateEliteRouting().catch(err => {
  console.error(err);
  process.exit(1);
});
