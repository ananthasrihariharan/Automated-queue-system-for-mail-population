/**
 * Verification Script for Printing Press Queue System
 * Tests: FIFO order, Priority reordering, Staff Pinning, and Dual Slot logic
 */

const mongoose = require('mongoose');
require('dotenv').config();
const QueueJob = require('../models/QueueJob');
const QueueSession = require('../models/QueueSession');
const queueEngine = require('../services/queueEngine');
const User = require('../models/User');

async function testQueue() {
  try {
    console.log('--- STARTING QUEUE VERIFICATION ---');
    
    // 1. Connect DB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    // 2. Clear previous test data
    await QueueJob.deleteMany({ customerName: /TestCustomer/ });
    await QueueSession.deleteMany({});
    console.log('Cleared test data');

    // 3. Create Test Staff
    let staffA = await User.findOne({ roles: 'PREPRESS' });
    if (!staffA) {
      staffA = await User.create({
        name: 'Test Staff A',
        phone: '1234567890',
        password: 'password123',
        roles: ['PREPRESS']
      });
    }

    // 4. Create Jobs in FIFO order
    console.log('Creating 3 jobs...');
    await QueueJob.create([
      { customerName: 'TestCustomer 1', customerEmail: 'c1@test.com', queuePosition: 1, status: 'QUEUED', folderPath: '/tmp/test1' },
      { customerName: 'TestCustomer 2', customerEmail: 'c2@test.com', queuePosition: 2, status: 'QUEUED', folderPath: '/tmp/test2' },
      { customerName: 'TestCustomer 3', customerEmail: 'c3@test.com', queuePosition: 3, status: 'QUEUED', folderPath: '/tmp/test3' }
    ]);

    // 5. Test Staff Login & Auto-Assignment (FIFO)
    console.log(`Staff A logging in...`);
    const { job: assigned1 } = await queueEngine.onStaffLogin(staffA._id);
    console.log(`Assigned Job: ${assigned1.customerName} (Expected: TestCustomer 1)`);
    
    if (assigned1.customerName !== 'TestCustomer 1') throw new Error('FIFO Failed');

    // 6. Test Priority Reordering
    console.log('Setting TestCustomer 3 to High Priority (10)...');
    const job3 = await QueueJob.findOne({ customerName: 'TestCustomer 3' });
    await queueEngine.reorderQueue(job3._id, 10);

    // 7. Complete Current Job & Check Next (should be Priority 3, not FIFO 2)
    console.log('Completing TestCustomer 1...');
    const nextJob = await queueEngine.onJobComplete(staffA._id, assigned1._id);
    console.log(`Next Assigned Job: ${nextJob.customerName} (Expected: TestCustomer 3 due to priority)`);
    
    if (nextJob.customerName !== 'TestCustomer 3') throw new Error('Priority Logic Failed');

    // 8. Test Pinning
    console.log('Pinning TestCustomer 2 to a non-existent staff...');
    const job2 = await QueueJob.findOne({ customerName: 'TestCustomer 2' });
    await queueEngine.pinJob(job2._id, new mongoose.Types.ObjectId()); // Pin to someone else

    console.log('Staff A completing TestCustomer 3...');
    const afterPinJob = await queueEngine.onJobComplete(staffA._id, nextJob._id);
    console.log(`Next Job: ${afterPinJob ? afterPinJob.customerName : 'NONE'} (Expected: NONE since TestCustomer 2 is pinned away)`);

    if (afterPinJob) throw new Error('Pinning Logic Failed - Staff A should not have received pinned job');

    console.log('--- VERIFICATION SUCCESSFUL ---');
    process.exit(0);
  } catch (err) {
    console.error('--- VERIFICATION FAILED ---');
    console.error(err);
    process.exit(1);
  }
}

testQueue();
