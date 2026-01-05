const mongoose = require('mongoose');
const Job = require('./models/Job');
require('dotenv').config();

// Fix deprecation warning
mongoose.set('strictQuery', false);

async function checkDispatched() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const dispatchedJobs = await Job.find({ jobStatus: 'DISPATCHED' }).limit(5);
        console.log(`Found ${dispatchedJobs.length} dispatched jobs`);

        dispatchedJobs.forEach(job => {
            console.log(`Job ${job.jobId}: Status=${job.jobStatus}, DispatchedAt=${job.dispatchedAt}`);
            if (job.parcels && job.parcels.length > 0) {
                job.parcels.forEach(p => {
                    console.log(`  Parcel ${p.parcelNo}: Status=${p.status}, DispatchedAt=${p.dispatchedAt}`);
                });
            }
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkDispatched();
