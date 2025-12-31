const mongoose = require('mongoose')

const JobSchema = new mongoose.Schema(
    {
        jobId: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        customerName: {
            type: String,
            required: true,
            trim: true
        },

        totalItems: {
            type: Number,
            required: true,
            min: 1
        },

        itemScreenshots: {
            type: [String],
            required: true,
            default: []
        },

        packingPreference: {
            type: String,
            enum: ['Single Parcel', 'Multiple Parcels'],
            default: 'Single Parcel'
        },

        paymentStatus: {
            type: String,
            enum: ['UNPAID', 'PAID', 'ADMIN_APPROVED'],
            default: 'UNPAID'
        },

        jobStatus: {
            type: String,
            enum: ['CREATED', 'DISPATCHED'],
            default: 'CREATED'
        },

        rackLocation: {
            type: String
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }
    },
    {
        timestamps: true
    }
)

module.exports = mongoose.model('Job', JobSchema)
