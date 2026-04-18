require('dotenv').config();
const mongoose = require('mongoose');
const JobEvent = require('./models/JobEvent');

async function debugStats() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  
  const count = await JobEvent.countDocuments({ 
    actionType: 'COMPLETED', 
    timestamp: { $gte: startOfDay } 
  });
  console.log('Total COMPLETED events today:', count);

  const sampleEvents = await JobEvent.find({ 
    actionType: 'COMPLETED', 
    timestamp: { $gte: startOfDay } 
  }).limit(5).lean();

  console.log('Sample events:', JSON.stringify(sampleEvents, null, 2));

  mongoose.disconnect();
}

debugStats().catch(console.error);
