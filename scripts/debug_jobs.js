const mongoose = require('mongoose');
const Job = require('../models/Job');
const User = require('../models/User');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const jobs = await Job.find({});
        console.log(`Found ${jobs.length} jobs in total.`);

        console.log('--- ALL JOBS ---');
        jobs.forEach(j => {
            console.log(JSON.stringify({
                jobId: j.jobId,
                packing: j.packingPreference,
                status: j.paymentStatus,
                jobStatus: j.jobStatus
            }, null, 2));
        });

        // Test the Dispatch Filter query
        const dispatchJobs = await Job.find(
            { packingPreference: { $in: ['Standard', 'Premium', 'Eco-friendly'] } },
            { jobId: 1, packingPreference: 1 }
        );
        console.log(`\nMatching Dispatch Filter: ${dispatchJobs.length} jobs`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
