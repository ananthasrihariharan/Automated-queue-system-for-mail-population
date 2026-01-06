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
    packingMode: {
      type: String,
      enum: ['SINGLE', 'MULTIPLE', 'MIXED'],
      default: null
    },
    packingOverride: {
      overridden: { type: Boolean, default: false },
      reason: String,
      overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      overriddenAt: Date
    },

    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID', 'ADMIN_APPROVED'],
      default: 'UNPAID',
      index: true
    },

    jobStatus: {
      type: String,
      enum: ['PENDING', 'CREATED', 'PACKED', 'DISPATCHED'],
      default: 'PENDING',
      index: true
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
      required: true,
      index: true
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

JobSchema.pre('save', function (next) {
  if (this.parcels && this.parcels.length > 0) {
    const allDispatched = this.parcels.every(p => p.status === 'DISPATCHED')
    const anyPackedOrDispatched = this.parcels.some(p => p.status === 'PACKED' || p.status === 'DISPATCHED')
    const allPackedOrDispatched = this.parcels.every(p => p.status === 'PACKED' || p.status === 'DISPATCHED')

    if (allDispatched) {
      this.jobStatus = 'DISPATCHED'
    } else if (allPackedOrDispatched) {
      this.jobStatus = 'PACKED'
    } else if (this.jobStatus !== 'CREATED' && this.jobStatus !== 'PENDING') {
      // If none of the above, but was previously PACKED/DISPATCHED, revert to PENDING
      this.jobStatus = 'PENDING'
    }
  } else if (this.jobStatus !== 'CREATED') {
    this.jobStatus = 'PENDING'
  }
  next()
})

module.exports = mongoose.model('Job', JobSchema)
