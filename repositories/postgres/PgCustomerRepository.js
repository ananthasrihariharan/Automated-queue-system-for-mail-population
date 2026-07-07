const prisma = require('../../lib/prisma');
const {
  PrismaQuery,
  attachSave,
  deleteMany,
  findByIdAndUpdate,
  findOneAndUpdate,
  mapUpdate
} = require('./prismaMongooseCompat');

const normalizePgCustomer = (customer) => {
  if (!customer) return null;
  return {
    ...customer,
    _id: customer.id,
    save: async function save() {
      const updated = await prisma.customer.update({
        where: { id: Number(this.id || this._id) },
        data: cleanCustomerUpdate(this)
      });
      Object.assign(this, normalizePgCustomer(updated));
      return this;
    },
    markModified: function markModified() {}
  };
};

function cleanCustomerUpdate(data = {}) {
  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.alternatePhones !== undefined) updateData.alternatePhones = Array.isArray(data.alternatePhones) ? data.alternatePhones : [];
  if (data.password !== undefined) updateData.password = data.password;
  if (data.isCreditCustomer !== undefined) updateData.isCreditCustomer = Boolean(data.isCreditCustomer);
  if (data.isPremium !== undefined) updateData.isPremium = Boolean(data.isPremium);
  if (data.emails !== undefined) updateData.emails = Array.isArray(data.emails) ? data.emails : [];
  return updateData;
}

class PgCustomerRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('customer', filter, { projection, updateFields: ['name', 'phone', 'alternatePhones', 'password', 'isCreditCustomer', 'isPremium', 'emails'] });
  }

  async findById(id) {
    return this.getCustomerById(id);
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('customer', filter, { projection, single: true, updateFields: ['name', 'phone', 'alternatePhones', 'password', 'isCreditCustomer', 'isPremium', 'emails'] });
  }

  async create(data) {
    return this.createCustomer(data);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('customer', filter, update, options, ['name', 'phone', 'alternatePhones', 'password', 'isCreditCustomer', 'isPremium', 'emails']);
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    const data = mapUpdate(update, 'customer');
    if (data.emails && data.emails.push) {
      const customer = await this.getCustomerById(id);
      if (!customer) return null;
      const email = data.emails.push;
      data.emails = customer.emails?.includes(email) ? customer.emails : [...(customer.emails || []), email];
    }
    return findByIdAndUpdate('customer', id, data, options, ['name', 'phone', 'alternatePhones', 'password', 'isCreditCustomer', 'isPremium', 'emails']);
  }

  async findByIdAndDelete(id) {
    return this.deleteCustomer(id);
  }

  async deleteMany(filter = {}) {
    return deleteMany('customer', filter);
  }

  async getCustomerByPhone(phone) {
    if (!phone) return null;
    const customer = await prisma.customer.findUnique({
      where: { phone }
    });
    return normalizePgCustomer(customer);
  }

  async getCustomerById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const customer = await prisma.customer.findUnique({
      where: { id: numericId }
    });
    return normalizePgCustomer(customer);
  }

  async createCustomer(data) {
    const customer = await prisma.customer.create({
      data: {
        legacyMongoId: data.legacyMongoId || null,
        name: data.name,
        phone: data.phone,
        alternatePhones: Array.isArray(data.alternatePhones) ? data.alternatePhones : [],
        password: data.password,
        isCreditCustomer: data.isCreditCustomer !== undefined ? Boolean(data.isCreditCustomer) : false,
        isPremium: data.isPremium !== undefined ? Boolean(data.isPremium) : false,
        emails: Array.isArray(data.emails) ? data.emails : [],
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      }
    });
    return normalizePgCustomer(customer);
  }

  async updateCustomer(id, data) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.alternatePhones !== undefined) {
      updateData.alternatePhones = Array.isArray(data.alternatePhones) ? data.alternatePhones : [];
    }
    if (data.password !== undefined) updateData.password = data.password;
    if (data.isCreditCustomer !== undefined) updateData.isCreditCustomer = Boolean(data.isCreditCustomer);
    if (data.isPremium !== undefined) updateData.isPremium = Boolean(data.isPremium);
    if (data.emails !== undefined) updateData.emails = Array.isArray(data.emails) ? data.emails : [];

    try {
      return await prisma.customer.update({
        where: { id: numericId },
        data: updateData
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  async updatePremiumStatus(id, status) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.customer.update({
        where: { id: numericId },
        data: { isPremium: Boolean(status) }
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  async deleteCustomer(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const customer = await prisma.customer.findUnique({
      where: { id: numericId }
    });
    if (!customer) return null;

    try {
      return await prisma.customer.delete({
        where: { id: numericId }
      });
    } catch (err) {
      if (err.code === 'P2025') return null;

      // FK constraint (customer has linked Jobs) — fall back to soft delete
      try {
        const ghostPhone = `ghost-c${numericId}-${Math.random().toString(36).substring(2, 6)}`;
        const label = String(customer.legacyMongoId || customer.id).slice(-6);
        const softDeleted = await prisma.customer.update({
          where: { id: numericId },
          data: {
            name: `Deleted Customer (${label})`,
            phone: ghostPhone,
            alternatePhones: [],
            emails: [],
            password: '',
            isDeleted: true,
            deletedAt: new Date()
          }
        });
        return normalizePgCustomer(softDeleted);
      } catch (updateErr) {
        console.error(`Failed to soft-delete customer ${numericId}:`, updateErr);
        throw err;
      }
    }
  }
}

module.exports = new PgCustomerRepository();
