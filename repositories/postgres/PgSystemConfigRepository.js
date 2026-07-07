const prisma = require('../../lib/prisma');
const { PrismaQuery, attachSave, findOneAndUpdate, updateMany } = require('./prismaMongooseCompat');

const UPDATE_FIELDS = ['key', 'value', 'description'];

class PgSystemConfigRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('systemConfig', filter, { projection, updateFields: UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('systemConfig', filter, { projection, single: true, updateFields: UPDATE_FIELDS });
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return findOneAndUpdate('systemConfig', filter, update, options, UPDATE_FIELDS);
  }

  async updateOne(filter = {}, update = {}) {
    return updateMany('systemConfig', filter, update);
  }

  async create(data = {}) {
    const config = await prisma.systemConfig.create({
      data: {
        key: data.key,
        value: data.value,
        description: data.description || null
      }
    });
    return attachSave(config, 'systemConfig', UPDATE_FIELDS);
  }

  /**
   * Fetch a configuration by key.
   * @param {string} key
   * @returns {Promise<object|null>}
   */
  async getConfigByKey(key) {
    if (!key) return null;
    const config = await prisma.systemConfig.findUnique({
      where: { key }
    });
    return attachSave(config, 'systemConfig', UPDATE_FIELDS);
  }

  /**
   * Create a new configuration record.
   * Throws an error on duplicate key constraint violation.
   * @param {string} key
   * @param {any} value
   * @param {string|null} description
   * @returns {Promise<object>}
   */
  async createConfig(key, value, description = null) {
    const config = await prisma.systemConfig.create({
      data: {
        key,
        value,
        description
      }
    });
    return attachSave(config, 'systemConfig', UPDATE_FIELDS);
  }

  /**
   * Update an existing configuration.
   * If key does not exist, returns null without creating.
   * @param {string} key
   * @param {any} value
   * @param {string|undefined} description
   * @returns {Promise<object|null>}
   */
  async updateConfig(key, value, description = undefined) {
    if (!key) return null;
    try {
      const data = { value };
      if (description !== undefined) {
        data.description = description;
      }
      const config = await prisma.systemConfig.update({
        where: { key },
        data
      });
      return attachSave(config, 'systemConfig', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Delete a configuration by key.
   * If key does not exist, returns null.
   * @param {string} key
   * @returns {Promise<object|null>}
   */
  async deleteConfig(key) {
    if (!key) return null;
    try {
      const config = await prisma.systemConfig.delete({
        where: { key }
      });
      return attachSave(config, 'systemConfig', UPDATE_FIELDS);
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Get all configurations.
   * @returns {Promise<Array<object>>}
   */
  async getAllConfigs() {
    const configs = await prisma.systemConfig.findMany();
    return configs.map((config) => attachSave(config, 'systemConfig', UPDATE_FIELDS));
  }
}

module.exports = new PgSystemConfigRepository();
