const prisma = require('../../lib/prisma');

class PgMigrationMapRepository {
  /**
   * Create a new mapping record.
   * Throws unique constraint errors on composite violations.
   * @param {string} entityType 
   * @param {string} mongoId 
   * @param {number} postgresId 
   * @returns {Promise<object>}
   */
  async createMapping(entityType, mongoId, postgresId) {
    return prisma.migrationMap.create({
      data: {
        entityType,
        mongoId,
        postgresId
      }
    });
  }

  /**
   * Retrieve the postgresId associated with entityType and mongoId.
   * @param {string} entityType 
   * @param {string} mongoId 
   * @returns {Promise<number|null>}
   */
  async getPostgresId(entityType, mongoId) {
    if (!entityType || !mongoId) return null;
    const record = await prisma.migrationMap.findUnique({
      where: {
        entityType_mongoId: {
          entityType,
          mongoId
        }
      }
    });
    return record ? record.postgresId : null;
  }

  /**
   * Retrieve the mongoId associated with entityType and postgresId.
   * @param {string} entityType 
   * @param {number} postgresId 
   * @returns {Promise<string|null>}
   */
  async getMongoId(entityType, postgresId) {
    if (!entityType || postgresId === undefined || postgresId === null) return null;
    const record = await prisma.migrationMap.findUnique({
      where: {
        entityType_postgresId: {
          entityType,
          postgresId: Number(postgresId)
        }
      }
    });
    return record ? record.mongoId : null;
  }

  /**
   * Delete the mapping for the specified entityType and mongoId.
   * @param {string} entityType 
   * @param {string} mongoId 
   * @returns {Promise<object|null>}
   */
  async deleteMapping(entityType, mongoId) {
    if (!entityType || !mongoId) return null;
    try {
      return await prisma.migrationMap.delete({
        where: {
          entityType_mongoId: {
            entityType,
            mongoId
          }
        }
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Retrieve all mappings associated with entityType.
   * @param {string} entityType 
   * @returns {Promise<Array<object>>}
   */
  async getMappingsByEntity(entityType) {
    if (!entityType) return [];
    return prisma.migrationMap.findMany({
      where: { entityType }
    });
  }
}

module.exports = new PgMigrationMapRepository();
