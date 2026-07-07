const prisma = require('../../lib/prisma');
const { PrismaQuery, countDocuments, findOneAndUpdate, findByIdAndUpdate, deleteMany, updateMany } = require('./prismaMongooseCompat');

const QUEUE_UNREAD_UPDATE_FIELDS = [
  'legacyMongoId',
  'userId',
  'threadId',
  'count'
];

class PgQueueUnreadRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('queueUnread', filter, { projection, updateFields: QUEUE_UNREAD_UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('queueUnread', filter, { projection, single: true, updateFields: QUEUE_UNREAD_UPDATE_FIELDS });
  }

  async countDocuments(filter = {}) {
    return countDocuments('queueUnread', filter);
  }

  async create(data) {
    return this.createUnread(data);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('queueUnread', filter, update, options, QUEUE_UNREAD_UPDATE_FIELDS);
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    return findByIdAndUpdate('queueUnread', id, update, options, QUEUE_UNREAD_UPDATE_FIELDS);
  }

  async deleteMany(filter = {}) {
    return deleteMany('queueUnread', filter);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('queueUnread', filter, update);
  }

  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    return prisma.queueUnread.findUnique({
      where: { id: numericId }
    });
  }

  async getUnreadByUser(userId) {
    const numericUserId = Number(userId);
    if (isNaN(numericUserId)) return [];

    return prisma.queueUnread.findMany({
      where: { userId: numericUserId }
    });
  }

  async getUnreadByThread(userId, threadId) {
    const numericUserId = Number(userId);
    if (isNaN(numericUserId) || !threadId) return null;

    return prisma.queueUnread.findUnique({
      where: {
        userId_threadId: {
          userId: numericUserId,
          threadId: String(threadId)
        }
      }
    });
  }

  async createUnread(data) {
    return prisma.queueUnread.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        userId: Number(data.userId),
        threadId: String(data.threadId),
        count: data.count !== undefined ? Number(data.count) : 0,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      }
    });
  }

  async incrementCount(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.queueUnread.update({
        where: { id: numericId },
        data: {
          count: {
            increment: 1
          }
        }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async resetCount(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.queueUnread.update({
        where: { id: numericId },
        data: {
          count: 0
        }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async deleteUnread(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.queueUnread.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }
}

module.exports = new PgQueueUnreadRepository();
