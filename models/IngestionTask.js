const mongoose = require('mongoose')

const IngestionTaskSchema = new mongoose.Schema(
  {
    folderPath: {
      type: String,
      required: true,
      unique: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    error: {
      type: String,
      default: ''
    },
    startedAt: Date,
    completedAt: Date
  },
  { timestamps: true }
)

module.exports = mongoose.model('IngestionTask', IngestionTaskSchema)
