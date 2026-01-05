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
      enum: ['SINGLE', 'MULTIPLE'],
      default: 'SINGLE'
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

    dispatchedAt: Date,

    rackLocation: {
      type: String
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    adminApprovalNote: {
      type: String
    },
    adminApprovedAt: {
      type: Date
    },
    paymentHandledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dispatchedBy: {
      type: mongoose.Schema.Types.ObjectId, // Top-level final dispatch user
      ref: 'User'
    },
    parcels: [
      {
        parcelNo: Number,
        itemIndexes: [Number],   // item numbers selected
        receiverType: {
          type: String,
          enum: ['SELF', 'OTHER']
        },
        receiverName: String,
        receiverPhone: String,
        qrCode: String,
        status: {
          type: String,
          enum: ['PENDING', 'PACKED', 'DISPATCHED'],
          default: 'PENDING'
        },
        packedAt: Date,
        dispatchedAt: Date,
        dispatchedBy: String,
        rack: String,
        rackLocation: String
      }
    ],
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },

    customerPhone: {
      type: String,
      required: true
    },

    customerConfirmedAt: Date,
    approvalRequested: {
      type: Boolean,
      default: false
    }

  },
  {
    timestamps: true
  }
)

module.exports = mongoose.model('Job', JobSchema)
