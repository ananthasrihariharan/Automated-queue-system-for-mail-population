const mongoose = require('mongoose');
const path = require('path');
const QueueJob = require('../models/QueueJob');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function listReviewJobs() {
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) {
            console.error('MONGO_URI not found in environment');
            process.exit(1);
        }
        await mongoose.connect(uri);
        const jobs = await QueueJob.find({ status: 'ADMIN_REVIEW' })
            .select('customerName emailSubject mailBody createdAt returnReason')
            .sort({ createdAt: -1 });

        console.log('--- ADMIN REVIEW JOBS ---');
        console.log(JSON.stringify(jobs, null, 2));
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listReviewJobs();
