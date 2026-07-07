const prisma = require('../../lib/prisma');

const VALID_ACTION_TYPES = [
  'CREATED',
  'ASSIGNED',
  'IN_PROGRESS',
  'PAUSED',
  'RESUMED',
  'COMPLETED',
  'REASSIGNED',
  'MERGED',
  'DUPLICATE_FLAGGED',
  'JUNK_FLAGGED'
];

class PgJobEventRepository {
  async create(data) {
    return this.createEvent(data);
  }

  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    return prisma.jobEvent.findUnique({
      where: { id: numericId }
    });
  }

  async getByQueueJob(queueJobId) {
    const numericQueueJobId = Number(queueJobId);
    if (isNaN(numericQueueJobId)) return [];

    return prisma.jobEvent.findMany({
      where: { queueJobId: numericQueueJobId },
      orderBy: { timestamp: 'asc' }
    });
  }

  async getByUser(userId) {
    const numericUserId = Number(userId);
    if (isNaN(numericUserId)) return [];

    return prisma.jobEvent.findMany({
      where: { userId: numericUserId },
      orderBy: { timestamp: 'desc' }
    });
  }

  async createEvent(data) {
    if (!VALID_ACTION_TYPES.includes(data.actionType)) {
      throw new Error(`Invalid actionType: ${data.actionType}`);
    }

    return prisma.jobEvent.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        queueJobId: data.queueJobId === undefined || data.queueJobId === null ? null : Number(data.queueJobId),
        legacyQueueJobMongoId: data.legacyQueueJobMongoId || null,
        userId: data.userId === undefined || data.userId === null ? null : Number(data.userId),
        actionType: data.actionType,
        details: data.details !== undefined ? data.details : null,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
      }
    });
  }

  async getByActionType(actionType) {
    if (!VALID_ACTION_TYPES.includes(actionType)) return [];

    return prisma.jobEvent.findMany({
      where: { actionType },
      orderBy: { timestamp: 'desc' }
    });
  }

  async getRecentEvents(limit) {
    const take = Number(limit) || 10;

    return prisma.jobEvent.findMany({
      orderBy: { timestamp: 'desc' },
      take
    });
  }

  async deleteEvent(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.jobEvent.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getAllEvents() {
    return prisma.jobEvent.findMany({
      orderBy: { timestamp: 'desc' }
    });
  }

  async aggregate(pipeline) {
    const matchStep = pipeline.find(step => step.$match);
    if (matchStep) {
      const match = matchStep.$match;
      const timestampFilter = match.timestamp || {};
      const gteDate = timestampFilter.$gte ? new Date(timestampFilter.$gte) : new Date(0);

      const events = await prisma.jobEvent.findMany({
        where: {
          actionType: 'COMPLETED',
          timestamp: { gte: gteDate },
          userId: { not: null }
        },
        select: { userId: true }
      });

      const counts = {};
      for (const event of events) {
        const uid = event.userId;
        counts[uid] = (counts[uid] || 0) + 1;
      }

      const result = Object.entries(counts).map(([uid, count]) => ({
        _id: Number(uid),
        count,
        avgDurationMs: 0
      }));

      result.sort((a, b) => b.count - a.count);
      return result;
    }
    return [];
  }
}

module.exports = new PgJobEventRepository();
