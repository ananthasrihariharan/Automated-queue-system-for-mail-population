const mongoose = require('mongoose')

const QueueUnreadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    threadId: {
      type: String, // Normalized thread ID (other user's _id or 'all')
      required: true
    },
    count: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
)

// Ensure uniqueness per user + thread combination
QueueUnreadSchema.index({ userId: 1, threadId: 1 }, { unique: true })

module.exports = mongoose.model('QueueUnread', QueueUnreadSchema)
