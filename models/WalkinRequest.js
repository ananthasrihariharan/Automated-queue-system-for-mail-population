const mongoose = require('mongoose')

const WalkinRequestSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true
    },

    adminAction: { type: String, default: '' },

    // Links to the QueueJob created after approval
    queueJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueJob',
      default: null
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('WalkinRequest', WalkinRequestSchema)
