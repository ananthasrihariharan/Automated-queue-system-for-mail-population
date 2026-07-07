const prisma = require('../../lib/prisma');
const { PrismaQuery, countDocuments, mapUpdate, findOneAndUpdate, findByIdAndUpdate, deleteMany, updateMany } = require('./prismaMongooseCompat');

const LAMINATION_PRODUCT_UPDATE_FIELDS = [
  'productName',
  'laminationType',
  'type',
  'count',
  'month',
  'year',
  'isAvailable',
  'deleted'
];

class PgLaminationProductRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('laminationProduct', filter, { projection, updateFields: LAMINATION_PRODUCT_UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('laminationProduct', filter, { projection, single: true, updateFields: LAMINATION_PRODUCT_UPDATE_FIELDS });
  }

  findById(id, projection = null) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;
    return new PrismaQuery('laminationProduct', { id: numericId }, { projection, single: true, updateFields: LAMINATION_PRODUCT_UPDATE_FIELDS });
  }

  async countDocuments(filter = {}) {
    return countDocuments('laminationProduct', filter);
  }

  async create(data) {
    return prisma.laminationProduct.create({
      data: {
        productName: data.productName,
        laminationType: data.laminationType,
        type: data.type,
        count: Number(data.count),
        month: String(data.month),
        year: String(data.year),
        isAvailable: data.isAvailable !== undefined ? data.isAvailable : true,
        deleted: data.deleted !== undefined ? data.deleted : false
      }
    });
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('laminationProduct', filter, update, options, LAMINATION_PRODUCT_UPDATE_FIELDS);
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    return findByIdAndUpdate('laminationProduct', id, update, options, LAMINATION_PRODUCT_UPDATE_FIELDS);
  }

  async findByIdAndDelete(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;
    return prisma.laminationProduct.delete({
      where: { id: numericId }
    });
  }

  async deleteMany(filter = {}) {
    return deleteMany('laminationProduct', filter);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('laminationProduct', filter, update);
  }
}

module.exports = new PgLaminationProductRepository();
