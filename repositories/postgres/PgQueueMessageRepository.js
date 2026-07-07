const prisma = require('../../lib/prisma');
const { PrismaQuery, countDocuments, findOneAndUpdate, findByIdAndUpdate, deleteMany, updateMany } = require('./prismaMongooseCompat');

const QUEUE_MESSAGE_UPDATE_FIELDS = [
  'legacyMongoId',
  'senderId',
  'senderName',
  'recipientId',
  'body',
  'type',
  'legacyJobMongoId',
  'timestamp'
];

class PgQueueMessageRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('queueMessage', filter, { projection, updateFields: QUEUE_MESSAGE_UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('queueMessage', filter, { projection, single: true, updateFields: QUEUE_MESSAGE_UPDATE_FIELDS });
  }

  async countDocuments(filter = {}) {
    return countDocuments('queueMessage', filter);
  }

  async create(data) {
    return this.createMessage(data);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('queueMessage', filter, update, options, QUEUE_MESSAGE_UPDATE_FIELDS);
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    return findByIdAndUpdate('queueMessage', id, update, options, QUEUE_MESSAGE_UPDATE_FIELDS);
  }

  async deleteMany(filter = {}) {
    return deleteMany('queueMessage', filter);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('queueMessage', filter, update);
  }

  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    return prisma.queueMessage.findUnique({
      where: { id: numericId }
    });
  }

  async createMessage(data) {
    if (data.type !== 'DIRECT' && data.type !== 'BROADCAST') {
      throw new Error(`Invalid message type: ${data.type}`);
    }

    const senderVal = data.senderId !== undefined ? data.senderId : data.sender;
    const jobVal = data.legacyJobMongoId !== undefined ? data.legacyJobMongoId : data.jobId;

    return prisma.queueMessage.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        senderId: Number(senderVal),
        senderName: String(data.senderName),
        recipientId: String(data.recipientId),
        body: String(data.body),
        type: data.type,
        legacyJobMongoId: jobVal ? String(jobVal) : null,
        timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      }
    });
  }

  async getMessagesBySender(senderId) {
    const numericSenderId = Number(senderId);
    if (isNaN(numericSenderId)) return [];

    return prisma.queueMessage.findMany({
      where: { senderId: numericSenderId }
    });
  }

  async getMessagesByRecipient(recipientId) {
    if (recipientId === undefined || recipientId === null) return [];
    return prisma.queueMessage.findMany({
      where: { recipientId: String(recipientId) }
    });
  }

  async getBroadcastMessages() {
    return prisma.queueMessage.findMany({
      where: { type: 'BROADCAST' }
    });
  }

  async getMessagesByType(type) {
    if (type !== 'DIRECT' && type !== 'BROADCAST') return [];
    return prisma.queueMessage.findMany({
      where: { type }
    });
  }

  async deleteMessage(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.queueMessage.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getRecentMessages(limit) {
    const numericLimit = Number(limit);
    if (isNaN(numericLimit) || numericLimit <= 0) return [];

    return prisma.queueMessage.findMany({
      orderBy: { timestamp: 'desc' },
      take: numericLimit
    });
  }
}

module.exports = new PgQueueMessageRepository();
