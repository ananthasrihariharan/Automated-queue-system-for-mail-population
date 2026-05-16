const mongoose = require('mongoose');
const QueueJob = require('../models/QueueJob');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const job = await QueueJob.create({
            customerName: 'Audit Test Customer',
            customerEmail: 'audit-test@example.com',
            subject: 'Verification for Find Job Audit',
            status: 'QUEUED',
            type: 'EMAIL',
            folderPath: 'E:\\DESPATCH_SYSTEM\\Despatch_Uploads\\audit-test',
            queuePosition: 1000
        });

        console.log('Dummy job created:', job._id);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
