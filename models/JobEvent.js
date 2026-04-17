const mongoose = require('mongoose')

const JobEventSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueJob',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    actionType: {
      type: String,
      required: true,
      enum: ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'RESUMED', 'COMPLETED', 'REASSIGNED', 'MERGED', 'DUPLICATE_FLAGGED', 'JUNK_FLAGGED'],
      index: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: false }
)

module.exports = mongoose.model('JobEvent', JobEventSchema)
