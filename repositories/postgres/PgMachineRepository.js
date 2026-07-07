const prisma = require('../../lib/prisma');

/**
 * Machine Master repository. Each Machine has a name and a printable margin
 * (mm per side) used by the UPS calculator in job creation.
 */
class PgMachineRepository {
  /** All machines, ordered by name. */
  findAll() {
    return prisma.machine.findMany({
      orderBy: { name: 'asc' }
    });
  }

  findById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;
    return prisma.machine.findUnique({ where: { id: numericId } });
  }

  /** Create a new machine. */
  create({ name, printableMargin = 5 }) {
    return prisma.machine.create({
      data: {
        name: String(name).trim(),
        printableMargin: Number(printableMargin)
      }
    });
  }

  /** Update a machine's name and/or printable margin. */
  async update(id, { name, printableMargin }) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (printableMargin !== undefined) data.printableMargin = Number(printableMargin);

    return prisma.machine.update({
      where: { id: numericId },
      data
    });
  }

  /** Delete a machine. */
  async remove(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;
    return prisma.machine.delete({ where: { id: numericId } });
  }
}

module.exports = new PgMachineRepository();
