const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const SystemConfig = require('../models/SystemConfig');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        
        const configs = await SystemConfig.find();
        console.log('Current Configs:', JSON.stringify(configs, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
