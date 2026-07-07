const prisma = require('../../lib/prisma');
const {
  PrismaQuery,
  attachSave,
  countDocuments,
  deleteMany,
  findByIdAndUpdate,
  findOneAndUpdate,
  updateMany
} = require('./prismaMongooseCompat');

const VALID_STATUSES = ['QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'DUPLICATE', 'JUNK', 'ADMIN_REVIEW'];
const VALID_TYPES = ['EMAIL', 'WALKIN', 'WHATSAPP'];
const VALID_COMPLEXITY = ['easy', 'medium', 'complex', null];
const VALID_HOLD_BEHAVIOR = ['RETURN_TO_POOL', 'STAY_HOLD'];
const UPDATE_FIELDS = [
  'emailSubject',
  'customerName',
  'customerEmail',
  'customerPhone',
  'mailBody',
  'folderPath',
  'relativeFolderPath',
  'attachments',
  'attachmentMeta',
  'externalLinks',
  'status',
  'priorityScore',
  'queuePosition',
  'pinnedToStaffId',
  'isHardPinned',
  'assignedToId',
  'assignedAt',
  'completedAt',
  'dueBy',
  'complexityTag',
  'lastPausedById',
  'type',
  'handoffNotes',
  'staffHandoffReason',
  'adminHandoffNotes',
  'reassignedFromId',
  'returnReason',
  'pauseReason',
  'holdUntil',
  'holdBehavior',
  'fingerprint',
  'threadId',
  'version',
  'isAutoAssigned',
  'continuityContext',
  'parentJobId',
  'legacyParentJobMongoId',
  'isSuperseded',
  'auditLog'
];

function toQueuePosition(value) {
  if (value === undefined || value === null) return BigInt(0);
  return typeof value === 'bigint' ? value : BigInt(value);
}

class PgQueueJobRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('queueJob', filter, { projection, updateFields: UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('queueJob', filter, { projection, single: true, updateFields: UPDATE_FIELDS });
  }

  findById(id, projection = null) {
    const numericId = Number(id);
    if (isNaN(numericId)) {
      return new PrismaQuery('queueJob', { legacyMongoId: String(id) }, { projection, single: true, updateFields: UPDATE_FIELDS });
    }
    return new PrismaQuery('queueJob', { id: numericId }, { projection, single: true, updateFields: UPDATE_FIELDS });
  }

  async countDocuments(filter = {}) {
    return countDocuments('queueJob', filter);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('queueJob', filter, update, options, UPDATE_FIELDS);
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    return findByIdAndUpdate('queueJob', id, update, options, UPDATE_FIELDS);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('queueJob', filter, update);
  }

  async deleteMany(filter = {}) {
    return deleteMany('queueJob', filter);
  }

  async create(data) {
    return this.createJob(data);
  }

  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const job = await prisma.queueJob.findUnique({
      where: { id: numericId }
    });
    return attachSave(job, 'queueJob', UPDATE_FIELDS);
  }

  async createJob(data) {
    if (!VALID_STATUSES.includes(data.status)) {
      throw new Error(`Invalid status: ${data.status}`);
    }
    if (!VALID_TYPES.includes(data.type)) {
      throw new Error(`Invalid type: ${data.type}`);
    }
    if (data.complexityTag !== undefined && data.complexityTag !== null && !VALID_COMPLEXITY.includes(data.complexityTag)) {
      throw new Error(`Invalid complexityTag: ${data.complexityTag}`);
    }
    if (data.holdBehavior !== undefined && !VALID_HOLD_BEHAVIOR.includes(data.holdBehavior)) {
      throw new Error(`Invalid holdBehavior: ${data.holdBehavior}`);
    }

    const pinnedToStaffId = data.pinnedToStaffId !== undefined ? data.pinnedToStaffId : data.pinnedToStaff;
    const assignedToId = data.assignedToId !== undefined ? data.assignedToId : data.assignedTo;
    const lastPausedById = data.lastPausedById !== undefined ? data.lastPausedById : data.lastPausedBy;
    const reassignedFromId = data.reassignedFromId !== undefined ? data.reassignedFromId : data.reassignedFrom;
    const parentJobId = data.parentJobId !== undefined ? data.parentJobId : data.parentJob;

    const job = await prisma.queueJob.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        emailSubject: data.emailSubject || null,
        customerName: data.customerName || null,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone || null,
        mailBody: data.mailBody || null,
        folderPath: String(data.folderPath),
        relativeFolderPath: data.relativeFolderPath || null,
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        attachmentMeta: data.attachmentMeta !== undefined ? data.attachmentMeta : undefined,
        externalLinks: data.externalLinks !== undefined ? data.externalLinks : undefined,
        status: data.status,
        priorityScore: data.priorityScore !== undefined ? Number(data.priorityScore) : 0,
        queuePosition: toQueuePosition(data.queuePosition),
        pinnedToStaffId: pinnedToStaffId != null ? Number(pinnedToStaffId) : null,
        isHardPinned: data.isHardPinned !== undefined ? Boolean(data.isHardPinned) : false,
        assignedToId: assignedToId != null ? Number(assignedToId) : null,
        assignedAt: data.assignedAt ? new Date(data.assignedAt) : null,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
        dueBy: data.dueBy ? new Date(data.dueBy) : null,
        complexityTag: data.complexityTag || null,
        lastPausedById: lastPausedById != null ? Number(lastPausedById) : null,
        type: data.type,
        handoffNotes: data.handoffNotes || null,
        staffHandoffReason: data.staffHandoffReason || null,
        adminHandoffNotes: data.adminHandoffNotes || null,
        reassignedFromId: reassignedFromId != null ? Number(reassignedFromId) : null,
        returnReason: data.returnReason || null,
        pauseReason: data.pauseReason || null,
        holdUntil: data.holdUntil ? new Date(data.holdUntil) : null,
        holdBehavior: data.holdBehavior || 'STAY_HOLD',
        fingerprint: data.fingerprint || null,
        threadId: data.threadId || null,
        version: data.version !== undefined ? Number(data.version) : 1,
        isAutoAssigned: data.isAutoAssigned !== undefined ? Boolean(data.isAutoAssigned) : false,
        continuityContext: data.continuityContext || null,
        parentJobId: parentJobId != null ? Number(parentJobId) : null,
        legacyParentJobMongoId: data.legacyParentJobMongoId || null,
        isSuperseded: data.isSuperseded !== undefined ? Boolean(data.isSuperseded) : false,
        auditLog: data.auditLog !== undefined ? data.auditLog : null,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date()
      }
    });
    return attachSave(job, 'queueJob', UPDATE_FIELDS);
  }

  async getByStatus(status) {
    if (!VALID_STATUSES.includes(status)) return [];

    const jobs = await prisma.queueJob.findMany({
      where: { status }
    });
    return jobs.map((job) => attachSave(job, 'queueJob', UPDATE_FIELDS));
  }

  async getByAssignedUser(userId) {
    const numericUserId = Number(userId);
    if (isNaN(numericUserId)) return [];

    const jobs = await prisma.queueJob.findMany({
      where: { assignedToId: numericUserId }
    });
    return jobs.map((job) => attachSave(job, 'queueJob', UPDATE_FIELDS));
  }

  async getByPinnedUser(userId) {
    const numericUserId = Number(userId);
    if (isNaN(numericUserId)) return [];

    const jobs = await prisma.queueJob.findMany({
      where: { pinnedToStaffId: numericUserId }
    });
    return jobs.map((job) => attachSave(job, 'queueJob', UPDATE_FIELDS));
  }

  async updateStatus(id, status) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    try {
      const job = await prisma.queueJob.update({
        where: { id: numericId },
        data: { status }
      });
      return attachSave(job, 'queueJob', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async assignJob(id, userId) {
    const numericId = Number(id);
    const numericUserId = Number(userId);
    if (isNaN(numericId) || isNaN(numericUserId)) return null;

    try {
      const job = await prisma.queueJob.update({
        where: { id: numericId },
        data: {
          assignedToId: numericUserId,
          assignedAt: new Date()
        }
      });
      return attachSave(job, 'queueJob', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async completeJob(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const job = await prisma.queueJob.update({
        where: { id: numericId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });
      return attachSave(job, 'queueJob', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async deleteJob(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const job = await prisma.queueJob.delete({
        where: { id: numericId }
      });
      return attachSave(job, 'queueJob', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getRecentJobs(limit) {
    const take = Number(limit) || 10;

    const jobs = await prisma.queueJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: take
    });
    return jobs.map((job) => attachSave(job, 'queueJob', UPDATE_FIELDS));
  }

  async getJobsWithUnresolvedParents() {
    const jobs = await prisma.queueJob.findMany({
      where: {
        legacyParentJobMongoId: { not: null },
        parentJobId: null
      }
    });
    return jobs.map((job) => attachSave(job, 'queueJob', UPDATE_FIELDS));
  }

  async repairParentJob(jobId, parentPostgresId) {
    const numericJobId = Number(jobId);
    const numericParentId = Number(parentPostgresId);
    if (isNaN(numericJobId) || isNaN(numericParentId)) return null;

    try {
      const job = await prisma.queueJob.update({
        where: { id: numericJobId },
        data: { parentJobId: numericParentId }
      });
      return attachSave(job, 'queueJob', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async aggregate(pipeline) {
    const matchStep = pipeline.find(step => step.$match);
    if (matchStep) {
      const result = await prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "assignedAt")) * 1000) AS avg
        FROM "QueueJob"
        WHERE status = 'COMPLETED'
          AND "assignedAt" IS NOT NULL
          AND "completedAt" IS NOT NULL
      `;
      const avg = result[0]?.avg ? Number(result[0].avg) : 0;
      return [{ _id: null, avg }];
    }
    return [];
  }
}

module.exports = new PgQueueJobRepository();
