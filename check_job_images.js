const mongoose = require('mongoose');
const Job = require('./models/Job');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const job = await Job.findOne({ itemScreenshots: { $exists: true, $not: { $size: 0 } } });
        if (job) {
            console.log('JOB_DATA:', JSON.stringify({
                jobId: job.jobId,
                itemScreenshots: job.itemScreenshots
            }, null, 2));
        } else {
            console.log('NO_JOB_WITH_IMAGES_FOUND');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
