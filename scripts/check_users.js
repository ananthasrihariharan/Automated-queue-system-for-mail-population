const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const run = async () => {
    try {
        console.log('Connecting to:', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('Connected to DB');

        const users = await User.find({});
        console.log(`Found ${users.length} users.`);

        console.log('--- ALL USERS ---');
        users.forEach(u => {
            console.log(JSON.stringify({
                name: u.name,
                phone: u.phone,
                role: u.role,
                isActive: u.isActive
            }, null, 2));
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
