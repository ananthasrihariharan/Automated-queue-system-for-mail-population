const mongoose = require('mongoose')

const QueueSessionSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    loginAt: { type: Date, default: Date.now },
    logoutAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true, index: true },
    isQueuePaused: { type: Boolean, default: false },

    // Two job slots: queue + walk-in (parallel)
    currentQueueJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueJob',
      default: null
    },
    currentWalkinJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueJob',
      default: null
    },
    
    lastSeenAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

// Only one active session per staff
QueueSessionSchema.index({ staffId: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } })

module.exports = mongoose.model('QueueSession', QueueSessionSchema)
