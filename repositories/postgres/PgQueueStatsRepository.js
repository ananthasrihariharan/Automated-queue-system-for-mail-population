const prisma = require('../../lib/prisma');
const { PrismaQuery, attachSave, findOneAndUpdate } = require('./prismaMongooseCompat');

const UPDATE_FIELDS = [
  'queued',
  'assigned',
  'paused',
  'completedToday',
  'adminReview',
  'junk',
  'totalInProgress',
  'activeSessions',
  'breachRisk15',
  'breachRisk5',
  'staleJobs',
  'lastUpdated'
];

class PgQueueStatsRepository {
  findOne(filter = {}, projection = null) {
    return new PrismaQuery('queueStats', filter, { projection, single: true, updateFields: UPDATE_FIELDS });
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    if (Array.isArray(update)) {
      return this.applyPipelineUpdate(update, options);
    }
    return findOneAndUpdate('queueStats', filter, update, options, UPDATE_FIELDS);
  }

  async applyPipelineUpdate(pipeline = [], options = {}) {
    let stats = await this.getStats();
    if (!stats) {
      if (!options.upsert && options.upsert !== undefined) return null;
      stats = await this.createStats({});
    }

    const data = {};
    const evaluate = (expression) => {
      if (expression instanceof Date) return expression;
      if (typeof expression === 'string' && expression.startsWith('$')) {
        return stats[expression.slice(1)];
      }
      if (!expression || typeof expression !== 'object') return expression;
      if (expression.$ifNull) {
        const [fieldExpr, fallback] = expression.$ifNull;
        const value = evaluate(fieldExpr);
        return value === null || value === undefined ? fallback : value;
      }
      if (expression.$subtract) {
        const [left, right] = expression.$subtract;
        return Number(evaluate(left) || 0) - Number(evaluate(right) || 0);
      }
      if (expression.$add) {
        const [left, right] = expression.$add;
        return Number(evaluate(left) || 0) + Number(evaluate(right) || 0);
      }
      if (expression.$max) {
        return Math.max(...expression.$max.map((entry) => Number(evaluate(entry) || 0)));
      }
      return expression;
    };

    for (const stage of pipeline) {
      if (!stage.$set) continue;
      for (const [field, expression] of Object.entries(stage.$set)) {
        data[field] = evaluate(expression);
      }
    }

    if (Object.keys(data).length === 0) return stats;
    const updated = await prisma.queueStats.update({
      where: { id: Number(stats.id || stats._id) },
      data
    });
    return attachSave(updated, 'queueStats', UPDATE_FIELDS);
  }

  async create(data) {
    return this.createStats(data);
  }

  async getStats() {
    const stats = await prisma.queueStats.findFirst();
    return attachSave(stats, 'queueStats', UPDATE_FIELDS);
  }

  async createStats(data) {
    const stats = await prisma.queueStats.create({
      data: {
        queued: data.queued !== undefined ? Number(data.queued) : 0,
        assigned: data.assigned !== undefined ? Number(data.assigned) : 0,
        paused: data.paused !== undefined ? Number(data.paused) : 0,
        completedToday: data.completedToday !== undefined ? Number(data.completedToday) : 0,
        adminReview: data.adminReview !== undefined ? Number(data.adminReview) : 0,
        junk: data.junk !== undefined ? Number(data.junk) : 0,
        totalInProgress: data.totalInProgress !== undefined ? Number(data.totalInProgress) : 0,
        activeSessions: data.activeSessions !== undefined ? Number(data.activeSessions) : 0,
        breachRisk15: data.breachRisk15 !== undefined ? Number(data.breachRisk15) : 0,
        breachRisk5: data.breachRisk5 !== undefined ? Number(data.breachRisk5) : 0,
        staleJobs: data.staleJobs !== undefined ? Number(data.staleJobs) : 0,
        lastUpdated: data.lastUpdated ? new Date(data.lastUpdated) : undefined
      }
    });
    return attachSave(stats, 'queueStats', UPDATE_FIELDS);
  }

  async updateStats(id, data) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const updateData = {};
      const fields = [
        'queued', 'assigned', 'paused', 'completedToday', 'adminReview', 
        'junk', 'totalInProgress', 'activeSessions', 'breachRisk15', 
        'breachRisk5', 'staleJobs'
      ];
      for (const field of fields) {
        if (data[field] !== undefined) {
          updateData[field] = Number(data[field]);
        }
      }
      if (data.lastUpdated) {
        updateData.lastUpdated = new Date(data.lastUpdated);
      } else if (Object.keys(updateData).length > 0) {
        updateData.lastUpdated = new Date();
      }

      const stats = await prisma.queueStats.update({
        where: { id: numericId },
        data: updateData
      });
      return attachSave(stats, 'queueStats', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async resetStats(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const stats = await prisma.queueStats.update({
        where: { id: numericId },
        data: {
          queued: 0,
          assigned: 0,
          paused: 0,
          completedToday: 0,
          adminReview: 0,
          junk: 0,
          totalInProgress: 0,
          activeSessions: 0,
          breachRisk15: 0,
          breachRisk5: 0,
          staleJobs: 0,
          lastUpdated: new Date()
        }
      });
      return attachSave(stats, 'queueStats', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async deleteStats(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const stats = await prisma.queueStats.delete({
        where: { id: numericId }
      });
      return attachSave(stats, 'queueStats', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }
}

module.exports = new PgQueueStatsRepository();
