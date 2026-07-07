const prisma = require('../../lib/prisma');
const { PrismaQuery, countDocuments, mapUpdate, findOneAndUpdate, findByIdAndUpdate, deleteMany, updateMany } = require('./prismaMongooseCompat');

const USER_UPDATE_FIELDS = [
  'legacyMongoId',
  'name',
  'email',
  'phone',
  'password',
  'role',
  'rawRoles',
  'isActive',
  'lastLoginAt',
  'lastJobCompletedAt'
];

const normalizePgUser = (user) => {
  if (!user) return null;
  const rawRoles = Array.isArray(user.rawRoles) ? user.rawRoles : [];
  const roles = rawRoles.length > 0 ? rawRoles : (user.role ? [user.role] : []);
  return {
    ...user,
    _id: user.id,
    roles
  };
};

class PgUserRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('user', filter, { projection, updateFields: USER_UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('user', filter, { projection, single: true, updateFields: USER_UPDATE_FIELDS });
  }

  findById(id, projection = null) {
    const numericId = Number(id);
    if (isNaN(numericId)) {
      return new PrismaQuery('user', { legacyMongoId: String(id) }, { projection, single: true, updateFields: USER_UPDATE_FIELDS });
    }
    return new PrismaQuery('user', { id: numericId }, { projection, single: true, updateFields: USER_UPDATE_FIELDS });
  }

  async countDocuments(filter = {}) {
    return countDocuments('user', filter);
  }

  async create(data) {
    return this.createUser(data);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('user', filter, update, options, USER_UPDATE_FIELDS);
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    return findByIdAndUpdate('user', id, update, options, USER_UPDATE_FIELDS);
  }

  async findByIdAndDelete(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const user = await prisma.user.findUnique({
      where: { id: numericId }
    });
    if (!user) return null;

    try {
      const deleted = await prisma.user.delete({
        where: { id: numericId }
      });
      return normalizePgUser(deleted);
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }

      // Any other error (like foreign key constraint/RESTRICT violations) triggers soft delete fallback
      try {
        const legacyId = user.legacyMongoId || `id_${user.id}`;
        const ghostPhone = `ghost-${user.id}-${Math.random().toString(36).substring(2, 6)}`;
        const ghostEmail = user.email ? `ghost-${user.id}-${Math.random().toString(36).substring(2, 6)}@deleted.com` : null;

        const softDeleted = await prisma.user.update({
          where: { id: numericId },
          data: {
            name: `Deleted Staff (${legacyId.slice(-6)})`,
            phone: ghostPhone,
            email: ghostEmail,
            password: '',
            isActive: false,
            isDeleted: true,
            deletedAt: new Date()
          }
        });
        return normalizePgUser(softDeleted);
      } catch (updateErr) {
        console.error(`Failed to soft-delete user ${numericId}:`, updateErr);
        throw err;
      }
    }
  }

  async deleteMany(filter = {}) {
    return deleteMany('user', filter);
  }

  async updateMany(filter = {}, update = {}) {
    return updateMany('user', filter, update);
  }

  /**
   * Fetch a user by their PostgreSQL auto-incrementing integer ID.
   * @param {number|string} id 
   * @returns {Promise<object|null>}
   */
  async getUserById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;
    const user = await prisma.user.findUnique({
      where: { id: numericId }
    });
    return normalizePgUser(user);
  }

  /**
   * Fetch a user by their email.
   * @param {string} email 
   * @returns {Promise<object|null>}
   */
  async getUserByEmail(email) {
    if (!email) return null;
    const user = await prisma.user.findUnique({
      where: { email }
    });
    return normalizePgUser(user);
  }

  /**
   * Fetch a user by their phone number.
   * @param {string} phone 
   * @returns {Promise<object|null>}
   */
  async getUserByPhone(phone) {
    if (!phone) return null;
    const user = await prisma.user.findUnique({
      where: { phone }
    });
    return normalizePgUser(user);
  }

  /**
   * Create a new user record.
   * @param {object} data 
   * @returns {Promise<object>}
   */
  async createUser(data) {
    // Build a deterministic email fallback when none is provided.
    // Admin creates users by phone+name+roles — email is optional in Mongo but
    // was required in the old Postgres schema. We now allow NULL, but still
    // generate a placeholder so legacy code that does findByEmail still works.
    const resolvedEmail = data.email
      ? data.email.trim().toLowerCase()
      : null   // schema now allows NULL email

    const user = await prisma.user.create({
      data: {
        legacyMongoId: data.legacyMongoId || `legacy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: data.name,
        email: resolvedEmail,
        phone: data.phone || null,
        password: data.password,
        role: data.role || (data.roles && data.roles[0]) || 'OPERATOR',
        rawRoles: data.rawRoles || data.roles || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
        lastLoginAt: data.lastLoginAt ? new Date(data.lastLoginAt) : null,
        lastJobCompletedAt: data.lastJobCompletedAt ? new Date(data.lastJobCompletedAt) : null
      }
    });
    return normalizePgUser(user);
  }

  /**
   * Update the last login timestamp for a user.
   * @param {number|string} userId 
   * @returns {Promise<object|null>}
   */
  async updateLastLogin(userId) {
    const numericId = Number(userId);
    if (isNaN(numericId)) return null;

    try {
      const user = await prisma.user.update({
        where: { id: numericId },
        data: { lastLoginAt: new Date() }
      });
      return normalizePgUser(user);
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Deactivate a user by setting isActive to false.
   * @param {number|string} userId 
   * @returns {Promise<object|null>}
   */
  async deactivateUser(userId) {
    const numericId = Number(userId);
    if (isNaN(numericId)) return null;

    try {
      return await prisma.user.update({
        where: { id: numericId },
        data: { isActive: false }
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }
}

module.exports = new PgUserRepository();
