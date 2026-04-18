const QueueStats = require('../models/QueueStats')
const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')

/**
 * StatsService — Manages pre-calculated queue metrics
 * Ensures atomic updates and provides a safety recalculate method.
 */
class StatsService {
  /**
   * Increment a specific stat field
   */
  async increment(field, amount = 1) {
    try {
      await QueueStats.findOneAndUpdate(
        {},
        { $inc: { [field]: amount }, $set: { lastUpdated: new Date() } },
        { upsert: true }
      )
    } catch (err) {
      console.error(`[StatsService] Increment failed for ${field}:`, err.message)
    }
  }

  /**
   * Decrement a specific stat field (prevents negative values natively)
   */
  async decrement(field, amount = 1) {
    try {
      await QueueStats.findOneAndUpdate(
        {},
        [
          {
            $set: {
              [field]: { $max: [0, { $subtract: [{ $ifNull: [`$${field}`, 0] }, amount] }] },
              lastUpdated: new Date()
            }
          }
        ]
      )
    } catch (err) {
      console.error(`[StatsService] Decrement failed for ${field}:`, err.message)
    }
  }

  /**
   * Atomic move: Decr one field, Incr another (prevents negatives)
   */
  async move(fromField, toField, amount = 1) {
    try {
      await QueueStats.findOneAndUpdate(
        {},
        [
          {
            $set: {
              [fromField]: { $max: [0, { $subtract: [{ $ifNull: [`$${fromField}`, 0] }, amount] }] },
              [toField]: { $add: [{ $ifNull: [`$${toField}`, 0] }, amount] },
              lastUpdated: new Date()
            }
          }
        ],
        { upsert: true }
      )
    } catch (err) {
      console.error(`[StatsService] Move failed from ${fromField} to ${toField}:`, err.message)
      this.recalculate()
    }
  }

  /**
   * Handle "Completed Today" logic resiliently using Job Events
   * so points persist even if the Admin purges jobs for disk space
   */
  async markJobCompleted() {
    try {
      const now = new Date()
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)
      
      const JobEvent = require('../models/JobEvent')
      const count = await JobEvent.countDocuments({ 
        actionType: 'COMPLETED', 
        timestamp: { $gte: startOfDay },
        'details.action': { $ne: 'ADMIN_DELETED' }
      })

      await QueueStats.findOneAndUpdate(
        {},
        { $set: { completedToday: count, lastUpdated: now } },
        { upsert: true }
      )
    } catch (err) {
      console.error('[StatsService] markJobCompleted failed:', err.message)
    }
  }

  /**
   * Full reconstruction of stats from ground truth.
   * Run on startup or during manual audit.
   */
  async recalculate() {
    console.log('[StatsService] Recalculating all metrics...')
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)

    try {
      const [
        queued,
        assigned,
        paused,
        completedToday,
        adminReview,
        junk,
        activeSessions
      ] = await Promise.all([
        QueueJob.countDocuments({ status: 'QUEUED' }),
        QueueJob.countDocuments({ status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }),
        QueueJob.countDocuments({ status: 'PAUSED' }),
        require('../models/JobEvent').countDocuments({ actionType: 'COMPLETED', timestamp: { $gte: startOfDay }, 'details.action': { $ne: 'ADMIN_DELETED' } }),
        QueueJob.countDocuments({ status: 'ADMIN_REVIEW' }),
        QueueJob.countDocuments({ status: 'JUNK' }),
        QueueSession.countDocuments({ isActive: true })
      ])

      await QueueStats.findOneAndUpdate(
        {},
        {
          queued,
          assigned,
          paused,
          completedToday,
          adminReview,
          junk,
          totalInProgress: assigned,
          activeSessions,
          lastUpdated: now
        },
        { upsert: true }
      )
      console.log('[StatsService] Recalculation complete.')
    } catch (err) {
      console.error('[StatsService] Recalculation failed:', err.message)
    }
  }
}

module.exports = new StatsService()
