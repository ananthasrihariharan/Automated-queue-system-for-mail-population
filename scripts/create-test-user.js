const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const existing = await User.findOne({ phone: '9999999999' });
        if (existing) {
            existing.password = 'password123';
            existing.roles = ['ADMIN', 'PREPRESS'];
            await existing.save();
            console.log('Test user updated');
        } else {
            await User.create({
                name: 'Antigravity Test',
                phone: '9999999999',
                password: 'password123',
                roles: ['ADMIN', 'PREPRESS'],
                isActive: true
            });
            console.log('Test user created');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
