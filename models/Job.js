const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    jobId: {
        type: String,
        required: true,
        unique: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    totalItems: {
        type: Number,
        required: true
    },
    itemScreenshots: [{
        type: String
    }],
    packingPreference: {
        type: String,
        enum: ['YES', 'NO', 'PENDING'],
        default: 'PENDING'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
