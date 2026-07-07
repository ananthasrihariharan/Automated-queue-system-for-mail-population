const prisma = require('../../lib/prisma');
const { PrismaQuery, mapUpdate } = require('./prismaMongooseCompat');
const { adaptJobCardToLegacyShape } = require('../../lib/responseAdapters');

const VALID_SECTIONS = [
  'processes',
  'vcBox',
  'binding',
  'dieCutting',
  'cornerCutting',
  'cutting',
  'lamination',
  'creasingPerforation',
  'foil',
  'idCard'
];

function mapNestedToFlat(data) {
  const cleaned = {};
  
  if (data.legacyMongoId !== undefined) cleaned.legacyMongoId = data.legacyMongoId;
  if (data.jobId !== undefined) cleaned.jobId = String(data.jobId);
  if (data.customerName !== undefined) cleaned.customerName = data.customerName;
  if (data.totalItems !== undefined) cleaned.totalItems = Number(data.totalItems || 0);
  if (data.attBy !== undefined) cleaned.attBy = data.attBy;
  if (data.date !== undefined) cleaned.date = data.date ? new Date(data.date) : null;
  if (data.createdAt !== undefined) cleaned.createdAt = new Date(data.createdAt);
  if (data.updatedAt !== undefined) cleaned.updatedAt = new Date(data.updatedAt);

  // processes
  if (data.processes) {
    const p = data.processes;
    cleaned.hasCutting = !!p.cutting;
    cleaned.hasDieCutting = !!p.dieCutting;
    cleaned.hasLamination = !!p.lamination;
    cleaned.hasPerforation = !!p.perforation;
    cleaned.hasNcBox = !!p.ncBox;
    cleaned.hasCreasing = !!p.creasing;
    cleaned.hasCornerCut = !!p.cornerCut;
    cleaned.hasBinding = !!p.binding;
    cleaned.hasFoil = !!p.foil;
    cleaned.hasIdCard = !!p.idCard;
  }

  // vcBox
  if (data.vcBox) {
    cleaned.vcBoxCount = (data.vcBox.count || data.vcBox.vcBoxCount) ? String(data.vcBox.count || data.vcBox.vcBoxCount) : null;
  } else if (data.vcBox === null) {
    cleaned.vcBoxCount = null;
  }

  // foil
  if (data.foil) {
    cleaned.foilType = (data.foil.type || data.foil.foilType) ? String(data.foil.type || data.foil.foilType) : null;
    cleaned.foilQty = (data.foil.qty || data.foil.foilQty) ? String(data.foil.qty || data.foil.foilQty) : null;
  } else if (data.foil === null) {
    cleaned.foilType = null;
    cleaned.foilQty = null;
  }

  // idCard
  if (data.idCard) {
    const id = data.idCard;
    cleaned.idFusing = !!(id.fusing || id.idFusing);
    cleaned.idFusingType = (id.fusingType || id.idFusingType) ? String(id.fusingType || id.idFusingType) : null;
    cleaned.idFusingQty = (id.fusingQty || id.idFusingQty) ? String(id.fusingQty || id.idFusingQty) : null;
    cleaned.idHoles = !!(id.holes || id.idHoles);
    cleaned.idHolesType = (id.holesType || id.idHolesType) ? String(id.holesType || id.idHolesType) : null;
  } else if (data.idCard === null) {
    cleaned.idFusing = false;
    cleaned.idFusingType = null;
    cleaned.idFusingQty = null;
    cleaned.idHoles = false;
    cleaned.idHolesType = null;
  }

  // cornerCutting
  if (data.cornerCutting) {
    const cc = data.cornerCutting;
    cleaned.cornerNoOfCards = cc.noOfCards ? String(cc.noOfCards) : null;
    cleaned.cornerDate = cc.date ? String(cc.date) : null;
    
    const corners = cc.corners || cc;
    cleaned.cornerTl = !!corners.tl;
    cleaned.cornerTr = !!corners.tr;
    cleaned.cornerBl = !!corners.bl;
    cleaned.cornerBr = !!corners.br;
  } else if (data.cornerCutting === null) {
    cleaned.cornerNoOfCards = null;
    cleaned.cornerDate = null;
    cleaned.cornerTl = false;
    cleaned.cornerTr = false;
    cleaned.cornerBl = false;
    cleaned.cornerBr = false;
  }

  // cutting
  if (data.cutting) {
    const c = data.cutting;
    cleaned.cuttingNoOfCutting = c.noOfCutting ? String(c.noOfCutting) : null;
    cleaned.cuttingDate = c.date ? String(c.date) : null;
    cleaned.cuttingSizes = Array.isArray(c.sizes) ? c.sizes.map(String) : [];
  } else if (data.cutting === null) {
    cleaned.cuttingNoOfCutting = null;
    cleaned.cuttingDate = null;
    cleaned.cuttingSizes = [];
  }

  // binding
  if (data.binding) {
    const b = data.binding;
    cleaned.bindingNoOfBooks = b.noOfBooks ? String(b.noOfBooks) : null;
    cleaned.bindingCenterPin = !!b.centerPin;
    cleaned.bindingCenterPinQty = b.centerPinQty ? String(b.centerPinQty) : null;
    cleaned.bindingPerfect = !!b.perfect;
    cleaned.bindingPerfectQty = b.perfectQty ? String(b.perfectQty) : null;
    cleaned.bindingCase = !!(b.caseBinding || b.case);
    cleaned.bindingCaseQty = (b.caseBindingQty || b.caseQty) ? String(b.caseBindingQty || b.caseQty) : null;
    cleaned.bindingWiro = !!(b.wiroBinding || b.wiro);
    cleaned.bindingWiroQty = (b.wiroBindingQty || b.wiroQty) ? String(b.wiroBindingQty || b.wiroQty) : null;
    cleaned.bindingPouchLam = !!(b.pouchLamination || b.pouchLam);
    cleaned.bindingPouchLamQty = (b.pouchLaminationQty || b.pouchLamQty) ? String(b.pouchLaminationQty || b.pouchLamQty) : null;
    cleaned.bindingSpecial = !!b.special;
    cleaned.bindingSpecialQty = b.specialQty ? String(b.specialQty) : null;
    cleaned.bindingSpecialDesc = b.specialDesc ? String(b.specialDesc) : null;
    cleaned.bindingDate = b.date ? String(b.date) : null;
  } else if (data.binding === null) {
    cleaned.bindingNoOfBooks = null;
    cleaned.bindingCenterPin = false;
    cleaned.bindingCenterPinQty = null;
    cleaned.bindingPerfect = false;
    cleaned.bindingPerfectQty = null;
    cleaned.bindingCase = false;
    cleaned.bindingCaseQty = null;
    cleaned.bindingWiro = false;
    cleaned.bindingWiroQty = null;
    cleaned.bindingPouchLam = false;
    cleaned.bindingPouchLamQty = null;
    cleaned.bindingSpecial = false;
    cleaned.bindingSpecialQty = null;
    cleaned.bindingSpecialDesc = null;
    cleaned.bindingDate = null;
  }

  // lamination
  if (data.lamination) {
    const lam = data.lamination;
    cleaned.lamDate = lam.date ? String(lam.date) : null;
    cleaned.lamGlossy = !!lam.glossy;
    cleaned.lamGlossyQty = lam.glossyQty ? String(lam.glossyQty) : null;
    cleaned.lamGlossySide = lam.glossySide ? String(lam.glossySide) : null;
    cleaned.lamMatt = !!lam.matt;
    cleaned.lamMattQty = lam.mattQty ? String(lam.mattQty) : null;
    cleaned.lamMattSide = lam.mattSide ? String(lam.mattSide) : null;
    cleaned.lamVelvet = !!lam.velvet;
    cleaned.lamVelvetQty = lam.velvetQty ? String(lam.velvetQty) : null;
    cleaned.lamVelvetSide = lam.velvetSide ? String(lam.velvetSide) : null;
    cleaned.lamSingleSide = !!lam.singleSide;
    cleaned.lamDoubleSide = !!lam.doubleSide;
    cleaned.lamOther = !!lam.other;
    cleaned.lamOtherType = lam.otherType ? String(lam.otherType) : null;
    cleaned.lamOtherQty = lam.otherQty ? String(lam.otherQty) : null;
    cleaned.lamOtherSide = lam.otherSide ? String(lam.otherSide) : null;
  } else if (data.lamination === null) {
    cleaned.lamDate = null;
    cleaned.lamGlossy = false;
    cleaned.lamGlossyQty = null;
    cleaned.lamGlossySide = null;
    cleaned.lamMatt = false;
    cleaned.lamMattQty = null;
    cleaned.lamMattSide = null;
    cleaned.lamVelvet = false;
    cleaned.lamVelvetQty = null;
    cleaned.lamVelvetSide = null;
    cleaned.lamSingleSide = false;
    cleaned.lamDoubleSide = false;
    cleaned.lamOther = false;
    cleaned.lamOtherType = null;
    cleaned.lamOtherQty = null;
    cleaned.lamOtherSide = null;
  }

  // creasingPerforation
  if (data.creasingPerforation) {
    const cp = data.creasingPerforation;
    cleaned.cpNoOfSheets = cp.noOfSheets ? String(cp.noOfSheets) : null;
    cleaned.cpNoOfStock = cp.noOfStock ? String(cp.noOfStock) : null;
    cleaned.cpDate = cp.date ? String(cp.date) : null;
    cleaned.cpCreasing = !!cp.creasing;
    cleaned.cpCreasingNo = cp.creasingNo ? String(cp.creasingNo) : null;
    cleaned.cpPerforation = !!cp.perforation;
    cleaned.cpPerforationNo = cp.perforationNo ? String(cp.perforationNo) : null;
    cleaned.cpWheelPerforation = !!cp.wheelPerforation;
    cleaned.cpWheelPerforationNo = cp.wheelPerforationNo ? String(cp.wheelPerforationNo) : null;
  } else if (data.creasingPerforation === null) {
    cleaned.cpNoOfSheets = null;
    cleaned.cpNoOfStock = null;
    cleaned.cpDate = null;
    cleaned.cpCreasing = false;
    cleaned.cpCreasingNo = null;
    cleaned.cpPerforation = false;
    cleaned.cpPerforationNo = null;
    cleaned.cpWheelPerforation = false;
    cleaned.cpWheelPerforationNo = null;
  }

  // dieCutting header
  if (data.dieCutting) {
    const dc = data.dieCutting;
    cleaned.dieCuttingNoOfSheets = dc.noOfSheets ? String(dc.noOfSheets) : null;
    cleaned.dieCuttingDate = dc.date ? String(dc.date) : null;
  } else if (data.dieCutting === null) {
    cleaned.dieCuttingNoOfSheets = null;
    cleaned.dieCuttingDate = null;
  }

  return cleaned;
}

async function saveDieCuttingRows(tx, jobCardId, rows) {
  if (!Array.isArray(rows)) return;
  await tx.jobCardDieCuttingRow.deleteMany({
    where: { jobCardId }
  });
  const rowPromises = rows.map((r, index) => {
    return tx.jobCardDieCuttingRow.create({
      data: {
        jobCardId,
        sheets: r.sheets ? String(r.sheets) : null,
        halfCut: r.halfCut ? String(r.halfCut) : null,
        throughCut: r.throughCut ? String(r.throughCut) : null,
        timing: r.timing ? String(r.timing) : null,
        sortOrder: r.sortOrder !== undefined ? Number(r.sortOrder) : index
      }
    });
  });
  await Promise.all(rowPromises);
}

function attachSaveJobCard(adaptedCard) {
  if (!adaptedCard) return null;

  Object.defineProperty(adaptedCard, 'save', {
    enumerable: false,
    value: async function save() {
      const flatData = mapNestedToFlat(this);
      
      const updated = await prisma.$transaction(async (tx) => {
        const card = await tx.jobCard.update({
          where: { id: Number(this.id || this._id) },
          data: flatData
        });
        
        if (this.dieCutting && Array.isArray(this.dieCutting.rows)) {
          await saveDieCuttingRows(tx, card.id, this.dieCutting.rows);
        }
        
        return tx.jobCard.findUnique({
          where: { id: card.id },
          include: { dieCuttingRows: true }
        });
      });
      
      const newAdapted = adaptJobCardToLegacyShape(updated);
      Object.assign(this, newAdapted);
      return this;
    }
  });

  Object.defineProperty(adaptedCard, 'markModified', {
    enumerable: false,
    value: function markModified() {}
  });

  return adaptedCard;
}

class PgJobCardRepository {
  find(filter = {}) {
    if (filter.jobId && filter.jobId.$in) {
      return new PrismaQuery('jobCard', { jobId: { $in: filter.jobId.$in.map(String) } });
    }
    return new PrismaQuery('jobCard', filter, { orderBy: [{ createdAt: 'desc' }] });
  }

  findOne(filter = {}) {
    return new PrismaQuery('jobCard', filter, { single: true });
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    if (!filter.jobId) return null;
    const flatData = mapNestedToFlat(mapUpdate(update, 'jobCard'));

    try {
      const card = await prisma.$transaction(async (tx) => {
        const updated = await tx.jobCard.update({
          where: { jobId: String(filter.jobId) },
          data: flatData
        });
        
        const updateObj = update.$set || update;
        if (updateObj.dieCutting && Array.isArray(updateObj.dieCutting.rows)) {
          await saveDieCuttingRows(tx, updated.id, updateObj.dieCutting.rows);
        }
        
        return tx.jobCard.findUnique({
          where: { id: updated.id },
          include: { dieCuttingRows: true }
        });
      });
      
      return attachSaveJobCard(adaptJobCardToLegacyShape(card));
    } catch (err) {
      if (err.code === 'P2025' || (err.message && err.message.includes('Record to update not found'))) {
        if (!options.upsert) return null;
        
        const card = await prisma.$transaction(async (tx) => {
          const created = await tx.jobCard.create({
            data: {
              ...flatData,
              jobId: String(filter.jobId),
              customerName: flatData.customerName || 'Unknown Customer',
              totalItems: flatData.totalItems || 1
            }
          });
          
          const updateObj = update.$set || update;
          if (updateObj.dieCutting && Array.isArray(updateObj.dieCutting.rows)) {
            await saveDieCuttingRows(tx, created.id, updateObj.dieCutting.rows);
          }
          
          return tx.jobCard.findUnique({
            where: { id: created.id },
            include: { dieCuttingRows: true }
          });
        });
        
        return attachSaveJobCard(adaptJobCardToLegacyShape(card));
      }
      throw err;
    }
  }

  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const card = await prisma.jobCard.findUnique({
      where: { id: numericId },
      include: { dieCuttingRows: true }
    });
    if (!card) return null;
    return attachSaveJobCard(adaptJobCardToLegacyShape(card));
  }

  async getByJobId(jobId) {
    if (!jobId) return null;

    const card = await prisma.jobCard.findUnique({
      where: { jobId: String(jobId) },
      include: { dieCuttingRows: true }
    });
    if (!card) return null;
    return attachSaveJobCard(adaptJobCardToLegacyShape(card));
  }

  async createJobCard(data) {
    const flatData = mapNestedToFlat(data);
    
    const card = await prisma.$transaction(async (tx) => {
      const created = await tx.jobCard.create({
        data: {
          ...flatData,
          customerName: flatData.customerName || 'Unknown Customer',
          totalItems: flatData.totalItems || 1
        }
      });
      
      if (data.dieCutting && Array.isArray(data.dieCutting.rows)) {
        await saveDieCuttingRows(tx, created.id, data.dieCutting.rows);
      }
      
      return tx.jobCard.findUnique({
        where: { id: created.id },
        include: { dieCuttingRows: true }
      });
    });
    
    return attachSaveJobCard(adaptJobCardToLegacyShape(card));
  }

  async updateProcesses(id, processes) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const flatData = mapNestedToFlat({ processes });
    
    try {
      const card = await prisma.jobCard.update({
        where: { id: numericId },
        data: flatData,
        include: { dieCuttingRows: true }
      });
      return attachSaveJobCard(adaptJobCardToLegacyShape(card));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async updateSection(id, sectionName, sectionData) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    if (!VALID_SECTIONS.includes(sectionName)) {
      throw new Error(`Invalid sectionName: ${sectionName}`);
    }

    const flatData = mapNestedToFlat({ [sectionName]: sectionData });
    
    try {
      const card = await prisma.$transaction(async (tx) => {
        const updated = await tx.jobCard.update({
          where: { id: numericId },
          data: flatData
        });
        if (sectionName === 'dieCutting' && sectionData && Array.isArray(sectionData.rows)) {
          await saveDieCuttingRows(tx, updated.id, sectionData.rows);
        }
        return tx.jobCard.findUnique({
          where: { id: updated.id },
          include: { dieCuttingRows: true }
        });
      });
      return attachSaveJobCard(adaptJobCardToLegacyShape(card));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async deleteJobCard(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const card = await prisma.jobCard.delete({
        where: { id: numericId },
        include: { dieCuttingRows: true }
      });
      return attachSaveJobCard(adaptJobCardToLegacyShape(card));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getAllJobCards() {
    const cards = await prisma.jobCard.findMany({
      include: { dieCuttingRows: true },
      orderBy: { createdAt: 'desc' }
    });
    return cards.map(card => attachSaveJobCard(adaptJobCardToLegacyShape(card)));
  }
}

module.exports = new PgJobCardRepository();
module.exports.attachSaveJobCard = attachSaveJobCard;
