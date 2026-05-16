require('dotenv').config();
const mongoose = require('mongoose');
const IngestionTask = require('./models/IngestionTask');

async function checkTasks() {
  await mongoose.connect(process.env.MONGO_URI);
  const tasks = await IngestionTask.find({
    folderPath: /Vbk/i
  }).sort({ createdAt: -1 }).limit(5).lean();
  
  console.log('Recent Vbk Ingestion Tasks:');
  tasks.forEach(t => {
    console.log('Task:', {
      _id: t._id,
      status: t.status,
      folderPath: t.folderPath,
      createdAt: t.createdAt
    });
  });
  
  mongoose.disconnect();
}
checkTasks().catch(console.error);
