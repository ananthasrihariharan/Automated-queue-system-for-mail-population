const prisma = require('../../lib/prisma');
const { PrismaQuery, countDocuments, findOneAndUpdate, findByIdAndUpdate, deleteMany, updateMany } = require('./prismaMongooseCompat');

const CUSTOMER_PREFERENCE_UPDATE_FIELDS = [
  'customerEmail',
  'customerName',
  'preferredStaffId',
  'legacyPreferredStaffMongoId',
  'confirmedCount',
  'updatedAt'
];

class PgCustomerPreferenceRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('customerPreference', filter, { projection, updateFields: CUSTOMER_PREFERENCE_UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('customerPreference', filter, { projection, single: true, updateFields: CUSTOMER_PREFERENCE_UPDATE_FIELDS });
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('customerPreference', filter, update, options, CUSTOMER_PREFERENCE_UPDATE_FIELDS);
  }

  async deleteMany(filter = {}) {
    return deleteMany('customerPreference', filter);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('customerPreference', filter, update);
  }

  /**
   * Fetch preferences by customer email.
   * @param {string} email 
   * @returns {Promise<Array<object>>}
   */
  async getByCustomerEmail(email) {
    if (!email) return [];
    return prisma.customerPreference.findMany({
      where: { customerEmail: email }
    });
  }

  /**
   * Create a new customer preference record.
   * @param {object} data 
   * @returns {Promise<object>}
   */
  async createPreference(data) {
    return prisma.customerPreference.create({
      data: {
        customerEmail: data.customerEmail,
        customerName: data.customerName || null,
        preferredStaffId: Number(data.preferredStaffId),
        legacyPreferredStaffMongoId: data.legacyPreferredStaffMongoId || null,
        confirmedCount: data.confirmedCount !== undefined ? Number(data.confirmedCount) : 1
      }
    });
  }

  /**
   * Update confirmed count for a preference by ID.
   * @param {number|string} id 
   * @param {number|string} count 
   * @returns {Promise<object|null>}
   */
  async updateConfirmedCount(id, count) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.customerPreference.update({
        where: { id: numericId },
        data: { confirmedCount: Number(count) }
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Update preferred staff ID for a preference by ID.
   * @param {number|string} id 
   * @param {number|string} staffId 
   * @returns {Promise<object|null>}
   */
  async updatePreferredStaff(id, staffId) {
    const numericId = Number(id);
    const numericStaffId = Number(staffId);
    if (isNaN(numericId) || isNaN(numericStaffId)) return null;

    try {
      return await prisma.customerPreference.update({
        where: { id: numericId },
        data: { preferredStaffId: numericStaffId }
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Delete a preference by ID.
   * @param {number|string} id 
   * @returns {Promise<object|null>}
   */
  async deletePreference(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.customerPreference.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Retrieve all preferences associated with preferredStaffId.
   * @param {number|string} staffId 
   * @returns {Promise<Array<object>>}
   */
  async getByPreferredStaff(staffId) {
    const numericStaffId = Number(staffId);
    if (isNaN(numericStaffId)) return [];

    return prisma.customerPreference.findMany({
      where: { preferredStaffId: numericStaffId }
    });
  }
}

module.exports = new PgCustomerPreferenceRepository();
