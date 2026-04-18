require('dotenv').config();
const mongoose = require('mongoose');
const statsService = require('./services/statsService');

async function fixStats() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Recalculating stats...');
  await statsService.recalculate();
  console.log('Done.');
  mongoose.disconnect();
}
fixStats().catch(console.error);
