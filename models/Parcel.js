const mongoose = require('mongoose');

const parcelSchema = new mongoose.Schema({
    parcelId: {
        type: String,
        required: true,
        unique: true
    },
    jobId: {
        type: String, // Storing as string to match job's jobId, usually better to use ObjectId ref but code suggests string matching
        required: true
    },
    itemCount: {
        type: Number,
        required: true
    },
    receiverType: {
        type: String,
        enum: ['SELF', 'OTHER'],
        required: true
    },
    receiverName: {
        type: String,
        required: true
    },
    receiverPhone: {
        type: String,
        required: true
    },
    qrPayload: {
        type: Object
    }
}, { timestamps: true });

module.exports = mongoose.model('Parcel', parcelSchema);
