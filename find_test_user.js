const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const user = await User.findOne({});
        if (user) {
            console.log('USER_FOUND:', JSON.stringify({ name: user.name, phone: user.phone }));
        } else {
            console.log('NO_USER_FOUND');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
