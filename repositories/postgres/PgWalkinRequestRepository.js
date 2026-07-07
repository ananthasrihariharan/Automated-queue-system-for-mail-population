const prisma = require('../../lib/prisma');

class PgWalkinRequestRepository {
  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    return prisma.walkinRequest.findUnique({
      where: { id: numericId }
    });
  }

  async createRequest(data) {
    return prisma.walkinRequest.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        description: data.description,
        requestedById: Number(data.requestedById),
        assignedToId: data.assignedToId === undefined || data.assignedToId === null ? null : Number(data.assignedToId),
        status: data.status || 'PENDING',
        adminAction: data.adminAction || '',
        legacyQueueJobMongoId: data.legacyQueueJobMongoId || null,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      }
    });
  }

  async assignRequest(id, assignedToId) {
    const numericId = Number(id);
    const numericAssignedToId = Number(assignedToId);
    if (isNaN(numericId) || isNaN(numericAssignedToId)) return null;

    try {
      return await prisma.walkinRequest.update({
        where: { id: numericId },
        data: { assignedToId: numericAssignedToId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async approveRequest(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.walkinRequest.update({
        where: { id: numericId },
        data: { status: 'APPROVED' }
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
      return await prisma.walkinRequest.update({
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
      return await prisma.walkinRequest.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getPendingRequests() {
    return prisma.walkinRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' }
    });
  }
}

module.exports = new PgWalkinRequestRepository();
