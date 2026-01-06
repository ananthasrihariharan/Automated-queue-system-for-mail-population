const mongoose = require('mongoose');
const Job = require('../models/Job');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const job = await Job.findOne({ jobId: '5-060126' });
        if (job) {
            console.log('--- JOB DATA ---');
            console.log(JSON.stringify(job, null, 2));
        } else {
            console.log('Job 5-060126 not found');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
