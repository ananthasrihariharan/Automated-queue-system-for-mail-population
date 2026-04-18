const mongoose = require('mongoose')

/**
 * QueueStats Model
 * Stores real-time, pre-calculated counts for the dashboard.
 * Optimized for O(1) retrieval.
 */
const QueueStatsSchema = new mongoose.Schema(
  {
    queued: { type: Number, default: 0 },
    assigned: { type: Number, default: 0 },
    paused: { type: Number, default: 0 },
    completedToday: { type: Number, default: 0 },
    adminReview: { type: Number, default: 0 },
    junk: { type: Number, default: 0 },
    totalInProgress: { type: Number, default: 0 },
    activeSessions: { type: Number, default: 0 },
    breachRisk15: { type: Number, default: 0 },
    breachRisk5: { type: Number, default: 0 },
    staleJobs: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { collection: 'queue_stats' }
)

module.exports = mongoose.model('QueueStats', QueueStatsSchema)
