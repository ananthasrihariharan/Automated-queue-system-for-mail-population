const prisma = require('../../lib/prisma');

/**
 * Board Master repository. A Board owns many BoardSheets (sheet sizes).
 * Sheets are managed together with their parent board, so create/update
 * accept a nested `sheets` array and replace the board's sheet set.
 */
class PgBoardRepository {
  /** All boards with their sheets, ordered by name. */
  findAllWithSheets() {
    return prisma.board.findMany({
      orderBy: { name: 'asc' },
      include: { sheets: { orderBy: { id: 'asc' } } }
    });
  }

  findByIdWithSheets(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;
    return prisma.board.findUnique({
      where: { id: numericId },
      include: { sheets: { orderBy: { id: 'asc' } } }
    });
  }

  /** Create a board and its sheets in one transaction. */
  create({ name, productId, originalName, masterSize, storingSize, mediaBehavior, sheets = [] }) {
    return prisma.board.create({
      data: {
        name: String(name).trim(),
        productId: productId ? String(productId).trim() : null,
        originalName: originalName ? String(originalName).trim() : null,
        masterSize: masterSize ? String(masterSize).trim() : null,
        storingSize: storingSize ? String(storingSize).trim() : null,
        mediaBehavior: mediaBehavior ? String(mediaBehavior).trim() : "DIRECT",
        sheets: { create: sheets.map(normalizeSheet) }
      },
      include: { sheets: { orderBy: { id: 'asc' } } }
    });
  }

  /**
   * Update a board's properties and fully replace its sheet set (delete + recreate).
   */
  async update(id, { name, productId, originalName, masterSize, storingSize, mediaBehavior, sheets }) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    return prisma.$transaction(async (tx) => {
      const data = {};
      if (name !== undefined) data.name = String(name).trim();
      if (productId !== undefined) data.productId = productId ? String(productId).trim() : null;
      if (originalName !== undefined) data.originalName = originalName ? String(originalName).trim() : null;
      if (masterSize !== undefined) data.masterSize = masterSize ? String(masterSize).trim() : null;
      if (storingSize !== undefined) data.storingSize = storingSize ? String(storingSize).trim() : null;
      if (mediaBehavior !== undefined) data.mediaBehavior = mediaBehavior ? String(mediaBehavior).trim() : "DIRECT";
      
      await tx.board.update({ where: { id: numericId }, data });

      if (Array.isArray(sheets)) {
        await tx.boardSheet.deleteMany({ where: { boardId: numericId } });
        if (sheets.length) {
          await tx.boardSheet.createMany({
            data: sheets.map((s) => ({ ...normalizeSheet(s), boardId: numericId }))
          });
        }
      }

      return tx.board.findUnique({
        where: { id: numericId },
        include: { sheets: { orderBy: { id: 'asc' } } }
      });
    });
  }

  async remove(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;
    return prisma.board.delete({ where: { id: numericId } }); // cascades to sheets
  }
}

function normalizeSheet(s) {
  return {
    name: String(s.name || '').trim(),
    width: Number(s.width),
    height: Number(s.height),
    qty: Number(s.qty) || 1
  };
}

module.exports = new PgBoardRepository();

