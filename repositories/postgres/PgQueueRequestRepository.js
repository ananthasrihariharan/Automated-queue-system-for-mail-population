const prisma = require('../../lib/prisma');
const { PrismaQuery, attachSave, findOneAndUpdate, updateMany } = require('./prismaMongooseCompat');

const UPDATE_FIELDS = [
  'status',
  'adminAction',
  'requestedById',
  'legacyJobMongoId',
  'legacyResultJobMongoId'
];

class PgQueueRequestRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('queueRequest', filter, { projection, updateFields: UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('queueRequest', filter, { projection, single: true, updateFields: UPDATE_FIELDS });
  }

  findById(id, projection = null) {
    const numericId = Number(id);
    if (isNaN(numericId)) {
      return new PrismaQuery('queueRequest', { legacyMongoId: String(id) }, { projection, single: true, updateFields: UPDATE_FIELDS });
    }
    return new PrismaQuery('queueRequest', { id: numericId }, { projection, single: true, updateFields: UPDATE_FIELDS });
  }

  async create(data) {
    const createData = {
      type: data.type,
      description: String(data.description || ''),
      requestedById: Number(data.requestedBy || data.requestedById),
      legacyJobMongoId: data.jobId != null ? String(data.jobId) : (data.legacyJobMongoId || null),
      status: data.status || 'PENDING',
      adminAction: data.adminAction || '',
      legacyResultJobMongoId: data.resultJobId != null ? String(data.resultJobId) : (data.legacyResultJobMongoId || null)
    };
    const row = await prisma.queueRequest.create({ data: createData });
    return attachSave(row, 'queueRequest', UPDATE_FIELDS);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('queueRequest', filter, update, options, UPDATE_FIELDS);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('queueRequest', filter, update);
  }
  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    return prisma.queueRequest.findUnique({
      where: { id: numericId }
    });
  }

  async createRequest(data) {
    if (data.type !== 'WALKIN' && data.type !== 'REASSIGN') {
      throw new Error(`Invalid type: ${data.type}`);
    }

    const status = data.status || 'PENDING';
    if (status !== 'PENDING' && status !== 'APPROVED' && status !== 'REJECTED') {
      throw new Error(`Invalid status: ${status}`);
    }

    return prisma.queueRequest.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        type: data.type,
        description: String(data.description),
        requestedById: Number(data.requestedById),
        legacyJobMongoId: data.legacyJobMongoId || null,
        status: status,
        adminAction: data.adminAction || '',
        legacyResultJobMongoId: data.legacyResultJobMongoId || null,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      }
    });
  }

  async getRequestsByUser(userId) {
    const numericUserId = Number(userId);
    if (isNaN(numericUserId)) return [];

    return prisma.queueRequest.findMany({
      where: { requestedById: numericUserId }
    });
  }

  async getPendingRequests() {
    return prisma.queueRequest.findMany({
      where: { status: 'PENDING' }
    });
  }

  async approveRequest(id, adminAction) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.queueRequest.update({
        where: { id: numericId },
        data: {
          status: 'APPROVED',
          adminAction: adminAction || ''
        }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async rejectRequest(id, adminAction) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.queueRequest.update({
        where: { id: numericId },
        data: {
          status: 'REJECTED',
          adminAction: adminAction || ''
        }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async deleteRequest(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.queueRequest.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getRequestsByType(type) {
    if (type !== 'WALKIN' && type !== 'REASSIGN') return [];
    return prisma.queueRequest.findMany({
      where: { type }
    });
  }
}

module.exports = new PgQueueRequestRepository();
