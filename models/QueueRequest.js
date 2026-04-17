const mongoose = require('mongoose')

const QueueRequestSchema = new mongoose.Schema(
  {
    type: { 
      type: String, 
      enum: ['WALKIN', 'REASSIGN'], 
      default: 'WALKIN',
      required: true 
    },

    description: { type: String, required: true }, // Walk-in description or Reassign reason

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Reference to the job being reassigned (if type === REASSIGN)
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueJob',
      default: null
    },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true
    },

    adminAction: { type: String, default: '' }, // Notes from the admin upon decision

    // Reference to the NEW job created if WALKIN is approved
    resultJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueJob',
      default: null
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('QueueRequest', QueueRequestSchema)
