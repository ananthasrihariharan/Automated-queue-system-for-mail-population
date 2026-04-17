const mongoose = require('mongoose')

const QueueMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    senderName: {
      type: String,
      required: true
    },
    recipientId: {
      type: String, // User ID or 'ALL'
      required: true,
      index: true
    },
    body: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['DIRECT', 'BROADCAST'],
      required: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueJob',
      default: null,
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
)

// Index for daily cleanup queries
// (Removed duplicate timestamp index as it is already declared in the schema)

module.exports = mongoose.model('QueueMessage', QueueMessageSchema)
