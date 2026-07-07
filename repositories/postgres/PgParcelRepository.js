const prisma = require('../../lib/prisma');

const VALID_RECEIVER_TYPES = ['SELF', 'OTHER'];

class PgParcelRepository {
  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    return prisma.parcel.findUnique({
      where: { id: numericId }
    });
  }

  async getByParcelId(parcelId) {
    if (!parcelId) return null;

    return prisma.parcel.findUnique({
      where: { parcelId: String(parcelId) }
    });
  }

  async getByJobId(jobId) {
    if (!jobId) return [];

    return prisma.parcel.findMany({
      where: { jobId: String(jobId) }
    });
  }

  async createParcel(data) {
    if (!VALID_RECEIVER_TYPES.includes(data.receiverType)) {
      throw new Error(`Invalid receiverType: ${data.receiverType}`);
    }

    return prisma.parcel.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        parcelId: String(data.parcelId),
        jobId: String(data.jobId),
        itemCount: Number(data.itemCount),
        receiverType: data.receiverType,
        receiverName: data.receiverName,
        receiverPhone: data.receiverPhone,
        qrPayload: data.qrPayload !== undefined ? data.qrPayload : null,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      }
    });
  }

  async updateReceiver(id, receiverName, receiverPhone) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.parcel.update({
        where: { id: numericId },
        data: {
          receiverName,
          receiverPhone
        }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async deleteParcel(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.parcel.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getAllParcels() {
    return prisma.parcel.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }
}

module.exports = new PgParcelRepository();
