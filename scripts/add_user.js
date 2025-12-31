const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const args = process.argv.slice(2);
const name = args[0];
const phone = args[1];
const role = args[2] || 'PREPRESS';

if (!name || !phone) {
    console.log('Usage: node scripts/add_user.js <Name> <Phone> [Role]');
    process.exit(1);
}

const run = async () => {
    try {
        console.log('Connecting...');
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('Connected to DB');

        const existing = await User.findOne({ phone });
        if (existing) {
            console.log(`User with phone ${phone} already exists.`);
            process.exit(0);
        }

        const user = await User.create({
            name,
            phone,
            role,
            isActive: true
        });

        console.log('User created successfully:', user);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
