const prisma = require('../../lib/prisma');
const {
  PrismaQuery,
  attachSave,
  countDocuments,
  findOneAndUpdate,
  updateMany
} = require('./prismaMongooseCompat');

const UPDATE_FIELDS = [
  'staffId',
  'loginAt',
  'logoutAt',
  'isActive',
  'isQueuePaused',
  'legacyCurrentQueueJobMongoId',
  'legacyCurrentWalkinJobMongoId',
  'pinnedJobs',
  'pausedJobs',
  'serverVersion',
  'lastSeenAt'
];

class PgQueueSessionRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('queueSession', filter, { projection, updateFields: UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('queueSession', filter, { projection, single: true, updateFields: UPDATE_FIELDS });
  }

  async countDocuments(filter = {}) {
    return countDocuments('queueSession', filter);
  }

  async countActiveNonDeleted() {
    return prisma.queueSession.count({
      where: {
        isActive: true,
        staff: {
          isDeleted: { not: true }
        }
      }
    });
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('queueSession', filter, update, options, UPDATE_FIELDS);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('queueSession', filter, update);
  }

  async create(data) {
    return this.createSession(data);
  }

  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const session = await prisma.queueSession.findUnique({
      where: { id: numericId }
    });
    return attachSave(session, 'queueSession', UPDATE_FIELDS);
  }

  async createSession(data) {
    const session = await prisma.queueSession.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        staffId: Number(data.staffId),
        loginAt: data.loginAt ? new Date(data.loginAt) : undefined,
        logoutAt: data.logoutAt ? new Date(data.logoutAt) : null,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined,
        isQueuePaused: data.isQueuePaused !== undefined ? Boolean(data.isQueuePaused) : undefined,
        legacyCurrentQueueJobMongoId: data.legacyCurrentQueueJobMongoId || null,
        legacyCurrentWalkinJobMongoId: data.legacyCurrentWalkinJobMongoId || null,
        pinnedJobs: data.pinnedJobs !== undefined ? data.pinnedJobs : undefined,
        pausedJobs: data.pausedJobs !== undefined ? data.pausedJobs : undefined,
        serverVersion: data.serverVersion || undefined,
        lastSeenAt: data.lastSeenAt ? new Date(data.lastSeenAt) : null,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      }
    });
    return attachSave(session, 'queueSession', UPDATE_FIELDS);
  }

  async getActiveSessionByStaff(staffId) {
    const numericStaffId = Number(staffId);
    if (isNaN(numericStaffId)) return null;

    const session = await prisma.queueSession.findFirst({
      where: {
        staffId: numericStaffId,
        isActive: true
      }
    });
    return attachSave(session, 'queueSession', UPDATE_FIELDS);
  }

  async pauseQueue(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const session = await prisma.queueSession.update({
        where: { id: numericId },
        data: { isQueuePaused: true }
      });
      return attachSave(session, 'queueSession', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async resumeQueue(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const session = await prisma.queueSession.update({
        where: { id: numericId },
        data: { isQueuePaused: false }
      });
      return attachSave(session, 'queueSession', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async updateLastSeen(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const session = await prisma.queueSession.update({
        where: { id: numericId },
        data: { lastSeenAt: new Date() }
      });
      return attachSave(session, 'queueSession', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async logoutSession(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const session = await prisma.queueSession.update({
        where: { id: numericId },
        data: {
          isActive: false,
          logoutAt: new Date()
        }
      });
      return attachSave(session, 'queueSession', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async deleteSession(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const session = await prisma.queueSession.delete({
        where: { id: numericId }
      });
      return attachSave(session, 'queueSession', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getActiveSessions() {
    const sessions = await prisma.queueSession.findMany({
      where: { isActive: true }
    });
    return sessions.map((session) => attachSave(session, 'queueSession', UPDATE_FIELDS));
  }
}

module.exports = new PgQueueSessionRepository();
