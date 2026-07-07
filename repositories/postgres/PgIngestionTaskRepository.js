const prisma = require('../../lib/prisma');
const { PrismaQuery, countDocuments, findOneAndUpdate, findByIdAndUpdate, deleteMany, updateMany } = require('./prismaMongooseCompat');

const INGESTION_TASK_UPDATE_FIELDS = [
  'folderPath',
  'status',
  'attempts',
  'error',
  'startedAt',
  'completedAt'
];

class PgIngestionTaskRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('ingestionTask', filter, { projection, updateFields: INGESTION_TASK_UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('ingestionTask', filter, { projection, single: true, updateFields: INGESTION_TASK_UPDATE_FIELDS });
  }

  async countDocuments(filter = {}) {
    return countDocuments('ingestionTask', filter);
  }

  async create(data) {
    return this.createTask(data);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('ingestionTask', filter, update, options, INGESTION_TASK_UPDATE_FIELDS);
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    return findByIdAndUpdate('ingestionTask', id, update, options, INGESTION_TASK_UPDATE_FIELDS);
  }

  async deleteMany(filter = {}) {
    return deleteMany('ingestionTask', filter);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('ingestionTask', filter, update);
  }

  async getTaskByFolder(folderPath) {
    if (!folderPath) return null;
    return prisma.ingestionTask.findUnique({
      where: { folderPath }
    });
  }

  async createTask(data) {
    return prisma.ingestionTask.create({
      data: {
        folderPath: data.folderPath,
        status: data.status || 'PENDING',
        attempts: data.attempts !== undefined ? Number(data.attempts) : 0,
        error: data.error || null,
        startedAt: data.startedAt ? new Date(data.startedAt) : null,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      }
    });
  }

  async updateStatus(id, status) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.ingestionTask.update({
        where: { id: numericId },
        data: { status }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async incrementAttempts(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.ingestionTask.update({
        where: { id: numericId },
        data: {
          attempts: {
            increment: 1
          }
        }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async setError(id, error) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.ingestionTask.update({
        where: { id: numericId },
        data: { error: error || '' }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async markStarted(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.ingestionTask.update({
        where: { id: numericId },
        data: {
          status: 'PROCESSING',
          startedAt: new Date()
        }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async markCompleted(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.ingestionTask.update({
        where: { id: numericId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async deleteTask(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.ingestionTask.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getPendingTasks() {
    return prisma.ingestionTask.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' }
    });
  }

  async getFailedTasks() {
    return prisma.ingestionTask.findMany({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' }
    });
  }
}

module.exports = new PgIngestionTaskRepository();
