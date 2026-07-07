const prisma = require('../../lib/prisma');
const { PrismaQuery, countDocuments, mapUpdate } = require('./prismaMongooseCompat');

const VALID_PACKING = ['SINGLE', 'MULTIPLE', 'MIXED'];
const VALID_DELIVERY = ['COURIER', 'WALK_IN'];
const VALID_PAYMENT = ['UNPAID', 'PAID', 'ADMIN_APPROVED'];
const VALID_STATUS = ['PENDING', 'CREATED', 'PRINTED', 'PACKED', 'DISPATCHED', 'PARTIAL_DISPATCH'];

const UPDATE_FIELDS = [
  'customerName',
  'totalItems',
  'itemScreenshots',
  'items',
  'filesArchived',
  'packingPreference',
  'packingMode',
  'defaultDeliveryType',
  'contactMe',
  'paymentStatus',
  'paymentMode',
  'jobStatus',
  'dispatchedAt',
  'rackLocation',
  'createdById',
  'printedById',
  'ppsCompletedById',
  'ppsCompletedAt',
  'finishingCompletedById',
  'finishingCompletedAt',
  'adminApprovalNote',
  'adminApprovedAt',
  'paymentHandledById',
  'dispatchedById',
  'packedById',
  'parcels',
  'packingOverride',
  'taskLog',
  'customerId',
  'customerPhone',
  'customerConfirmedAt',
  'approvalRequested'
];

function cleanStatus(status) {
  if (!status) return 'NONE';
  const s = String(status).toUpperCase().trim();
  if (['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NONE'].includes(s)) {
    return s;
  }
  return 'NONE';
}

function cleanCornerPosition(pos) {
  const p = String(pos).toUpperCase().trim();
  if (['TL', 'TR', 'BL', 'BR'].includes(p)) {
    return p;
  }
  return null;
}

function cleanReceiverType(type) {
  if (!type) return 'SELF';
  const t = String(type).toUpperCase().trim();
  if (['SELF', 'OTHER'].includes(t)) return t;
  return 'SELF';
}

function cleanDeliveryType(type) {
  if (!type) return 'COURIER';
  const t = String(type).toUpperCase().trim();
  if (['COURIER', 'WALK_IN'].includes(t)) return t;
  return 'COURIER';
}

function cleanParcelStatus(status) {
  if (!status) return 'PENDING';
  const s = String(status).toUpperCase().trim();
  if (['PENDING', 'PACKED', 'DISPATCHED'].includes(s)) return s;
  return 'PENDING';
}

function getFromMapOrObject(collection, key) {
  if (!collection) return undefined;
  if (collection instanceof Map) {
    return collection.get(String(key)) || collection.get(Number(key));
  }
  if (typeof collection === 'object') {
    return collection[String(key)];
  }
  return undefined;
}

function cleanLaminationSide(side) {
  if (!side) return 'SINGLE';
  const s = String(side).toUpperCase().trim();
  if (s === 'DOUBLE' || s === 'DOUBLE_SIDE' || s === 'DOUBLE-SIDE') return 'DOUBLE';
  return 'SINGLE';
}

function getCornerPositions(cornersObj) {
  if (!cornersObj) return [];
  const list = [];
  if (cornersObj.tl) list.push('TL');
  if (cornersObj.tr) list.push('TR');
  if (cornersObj.bl) list.push('BL');
  if (cornersObj.br) list.push('BR');
  return list;
}

function cleanActiveStage(stage) {
  if (!stage) return 'press';
  const s = String(stage).trim();
  const valid = [
    'press', 'lamination', 'foil', 'binding', 'fusing', 'holes',
    'cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2', 'done'
  ];
  if (valid.includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'diecutting') return 'dieCutting';
  if (lower === 'cornercutting') return 'cornerCutting';
  if (valid.includes(lower)) return lower;
  return 'press';
}

async function writeJobRelations(tx, jobId, data) {
  // 1. Screenshots — batch insert
  const screenshots = Array.isArray(data.itemScreenshots) ? data.itemScreenshots : [];
  if (screenshots.length > 0) {
    await tx.jobItemScreenshot.createMany({
      data: screenshots.map((screenshotPath, i) => ({ jobId, screenshotPath, sortOrder: i }))
    });
  }

  // 2. Task Logs — batch insert
  const taskLog = Array.isArray(data.taskLog) ? data.taskLog : [];
  if (taskLog.length > 0) {
    await tx.jobTaskLog.createMany({
      data: taskLog.map(log => ({
        jobId,
        task: log.task || '',
        itemIndex: Number(log.itemIndex || 0),
        startedAt: log.startedAt ? new Date(log.startedAt) : null,
        completedAt: log.completedAt ? new Date(log.completedAt) : null,
        durationMs: log.durationMs !== undefined ? Number(log.durationMs) : null,
        staffName: log.staffName || null,
        staffId: log.staffId ? Number(log.staffId) : null,
        module: log.module ? String(log.module) : null
      }))
    });
  }

  // 3. Packing Override
  if (data.packingOverride) {
    const o = data.packingOverride;
    await tx.packingOverride.create({
      data: {
        jobId,
        overridden: o.overridden !== undefined ? Boolean(o.overridden) : false,
        reason: o.reason || null,
        overriddenById: o.overriddenBy || o.overriddenById ? Number(o.overriddenBy || o.overriddenById) : null,
        overriddenAt: o.overriddenAt ? new Date(o.overriddenAt) : null
      }
    });
  }

  const jobItemIds = [];
  const pendingWorkflowSteps = [];

  // 4. Job Items & Processes
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length > 0) {
    // Prepare all item rows for batch insert
    const itemsData = items.map((item, index) => {
      let sizeDefault = "Custom", sizeH = null, sizeW = null, qty = "1";
      if (item.size) {
        sizeDefault = item.size.defaultVal || "Custom";
        sizeH = item.size.h ? String(item.size.h) : null;
        sizeW = item.size.w ? String(item.size.w) : null;
        qty = item.size.qty ? String(item.size.qty) : "1";
      } else {
        sizeDefault = item.sizeDefault || "Custom";
        sizeH = item.sizeH ? String(item.sizeH) : null;
        sizeW = item.sizeW ? String(item.sizeW) : null;
        qty = item.qty ? String(item.qty) : "1";
      }
      return {
        jobId,
        itemIndex: index,
        orderDescription: item.orderDescription || null,
        media: item.media || null,
        type: item.type || null,
        printType: item.printType || null,
        sizeDefault, sizeH, sizeW, qty,
        pages: item.pages ? String(item.pages) : null,
        sheets: item.sheets ? String(item.sheets) : null,
        sheetSize: item.sheetSize ? String(item.sheetSize) : null,
        mc: item.mc ? String(item.mc) : null,
        fc: item.fc ? String(item.fc) : null,
        ac: item.ac ? String(item.ac) : null,
        screenshot: item.screenshot || null,
        printConfirmed: !!item.printConfirmed,
        pressStatus: cleanStatus(item.pressStatus || item.status),
        activeStage: cleanActiveStage(item.activeStage || "press"),
        printedById: item.printedById || item.printedBy ? Number(item.printedById || item.printedBy) : null,
        pouchLamination: !!item.pouchLamination,
        idCard: !!item.idCard,
        syncTimestamp: 0n
      };
    });

    // Batch create all items, get IDs back
    const createdItems = await tx.jobItem.createManyAndReturn({ data: itemsData });
    for (let i = 0; i < createdItems.length; i++) {
      jobItemIds[i] = createdItems[i].id;
    }

    // Collect spec data across all items for batch inserts
    const laminationSpecs = [], bindingSpecs = [], creasingSpecs = [];
    const cuttingSpecs = [], cornerCuttingSpecs = [], foilSpecs = [], idCardSpecs = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const jobItemId = createdItems[i].id;

      if (item.lamination && item.lamination !== 'NONE') {
        laminationSpecs.push({ jobItemId, variant: item.lamination, quantity: Number(item.laminationQty) || 0, side: cleanLaminationSide(item.laminationSide), laminationProduct: item.laminationProduct || null });
      }
      if (item.binding && item.binding !== 'NONE' && item.binding !== 'POUCH_LAMINATION') {
        bindingSpecs.push({ jobItemId, variant: item.binding, quantity: Number(item.bindingQty) || 0, bindingNo: item.bindingNo || null });
      }
      if (item.creasing && item.creasing !== 'NONE') {
        creasingSpecs.push({ jobItemId, variant: item.creasing, quantity: Number(item.creasingQty) || 0, creasingNo: item.creasingNo || null });
      }
      if (item.cutting && item.cutting !== 'NONE') {
        cuttingSpecs.push({ jobItemId, variant: item.cutting, value: item.cuttingValue || null, sizes: Array.isArray(item.cuttingSizes) ? item.cuttingSizes.filter(Boolean).map(String) : [] });
      }
      if (item.cornerCutting && item.cornerCutting !== 'NONE') {
        cornerCuttingSpecs.push({ jobItemId, variant: item.cornerCutting, quantity: Number(item.cornerCuttingQty) || 0, corners: getCornerPositions(item.cornerCuttingCorners) });
      }
      if (item.foil && item.foil !== 'NONE') {
        foilSpecs.push({ jobItemId, variant: item.foil, quantity: Number(item.foilQty) || 0 });
      }
      const hasIdCardSpec = !!item.idCard || (item.fusing && item.fusing !== 'NONE') || (item.holes && item.holes !== 'NONE') || (item.cutting2 && item.cutting2 !== 'NONE');
      if (hasIdCardSpec) {
        idCardSpecs.push({ jobItemId, fusing: !!(item.fusing && item.fusing !== 'NONE'), holes: !!(item.holes && item.holes !== 'NONE'), cutting2: !!(item.cutting2 && item.cutting2 !== 'NONE'), qty: Number(item.idCardQty || item.fusingQty) || 0 });
      }

      // Collect workflow steps
      const STAGE_STATUS_MAP = [
        { stage: 'press',         status: cleanStatus(item.pressStatus || item.status) },
        { stage: 'lamination',    status: cleanStatus(item.laminationStatus) },
        { stage: 'binding',       status: cleanStatus(item.bindingStatus) },
        { stage: 'creasing',      status: cleanStatus(item.creasingStatus) },
        { stage: 'cutting',       status: cleanStatus(item.cuttingStatus) },
        { stage: 'dieCutting',    status: cleanStatus(item.dieCuttingStatus) },
        { stage: 'cornerCutting', status: cleanStatus(item.cornerCuttingStatus) },
        { stage: 'foil',          status: cleanStatus(item.foilStatus) },
        { stage: 'fusing',        status: cleanStatus(item.fusingStatus) },
        { stage: 'holes',         status: cleanStatus(item.holesStatus) },
        { stage: 'cutting2',      status: cleanStatus(item.cutting2Status) },
      ].filter(s => s.status && s.status !== 'NONE');
      for (const { stage, status } of STAGE_STATUS_MAP) {
        pendingWorkflowSteps.push({ jobItemId, stepName: stage, status });
      }
    }

    // Batch insert specs (7 types in parallel — all independent)
    const specInserts = [];
    if (laminationSpecs.length)    specInserts.push(tx.laminationSpec.createMany({ data: laminationSpecs }));
    if (bindingSpecs.length)       specInserts.push(tx.bindingSpec.createMany({ data: bindingSpecs }));
    if (creasingSpecs.length)      specInserts.push(tx.creasingSpec.createMany({ data: creasingSpecs }));
    if (cuttingSpecs.length)       specInserts.push(tx.cuttingSpec.createMany({ data: cuttingSpecs }));
    if (cornerCuttingSpecs.length) specInserts.push(tx.cornerCuttingSpec.createMany({ data: cornerCuttingSpecs }));
    if (foilSpecs.length)          specInserts.push(tx.foilSpec.createMany({ data: foilSpecs }));
    if (idCardSpecs.length)        specInserts.push(tx.idCardSpec.createMany({ data: idCardSpecs }));
    if (specInserts.length)        await Promise.all(specInserts);

    // DieCuttingSpec — kept individual because rows need parent spec ID
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.dieCutting && item.dieCutting !== 'NONE') {
        await tx.dieCuttingSpec.create({
          data: {
            jobItemId: createdItems[i].id,
            variant: item.dieCutting,
            quantity: Number(item.dieCuttingQty) || 0,
            rows: {
              create: (item.dieCuttingRows || []).map((r, rIndex) => ({
                sheets: r.sheets != null && !isNaN(Number(r.sheets)) ? Number(r.sheets) : null,
                halfCut: r.halfCut != null && !isNaN(Number(r.halfCut)) ? Number(r.halfCut) : null,
                throughCut: r.throughCut != null && !isNaN(Number(r.throughCut)) ? Number(r.throughCut) : null,
                timing: r.timing ? String(r.timing) : null,
                sortOrder: r.sortOrder !== undefined ? Number(r.sortOrder) : rIndex
              }))
            }
          }
        });
      }
    }
  }

  // Batch insert all workflow steps
  if (pendingWorkflowSteps.length > 0) {
    await tx.jobItemWorkflowStep.createMany({ data: pendingWorkflowSteps });
  }

  // 5. Parcels and ParcelItems
  const parcels = Array.isArray(data.parcels) ? data.parcels : [];
  for (const p of parcels) {
    const jobParcel = await tx.jobParcel.create({
      data: {
        jobId,
        parcelNo: Number(p.parcelNo),
        receiverType: cleanReceiverType(p.receiverType),
        deliveryType: cleanDeliveryType(p.deliveryType),
        receiverName: p.receiverName || '',
        receiverPhone: p.receiverPhone || '',
        qrCode: p.qrCode || '',
        status: cleanParcelStatus(p.status),
        packedAt: p.packedAt ? new Date(p.packedAt) : null,
        dispatchedAt: p.dispatchedAt ? new Date(p.dispatchedAt) : null,
        dispatchedBy: p.dispatchedBy || '',
        rack: p.rack || '',
        rackLocation: p.rackLocation || '',
      }
    });

    const itemIndexes = Array.isArray(p.itemIndexes) ? p.itemIndexes : [];
    const parcelItemData = [];
    for (const itemIndex of itemIndexes) {
      const rackName = getFromMapOrObject(p.itemRacks, itemIndex);
      const itemStatus = getFromMapOrObject(p.itemStatuses, itemIndex) || {};
      const jobItemId = jobItemIds[Number(itemIndex) - 1];
      if (!jobItemId) continue;
      parcelItemData.push({
        jobParcelId: jobParcel.id,
        jobItemId,
        itemIndex: Number(itemIndex),
        status: cleanParcelStatus(itemStatus.status),
        dispatchedAt: itemStatus.dispatchedAt ? new Date(itemStatus.dispatchedAt) : null,
        rackName: rackName || null
      });
    }
    if (parcelItemData.length > 0) {
      await tx.jobParcelItem.createMany({ data: parcelItemData });
    }
  }
}

function attachSaveJob(adaptedJob) {
  if (!adaptedJob) return null;

  Object.defineProperty(adaptedJob, 'save', {
    enumerable: false,
    value: async function save() {
      const pgJobRepo = require('./PgJobRepository');
      const updated = await pgJobRepo.updateJob(this.id, this);
      Object.assign(this, updated);
      return this;
    }
  });

  Object.defineProperty(adaptedJob, 'markModified', {
    enumerable: false,
    value: function markModified() {}
  });

  return adaptedJob;
}

const includeRelations = {
  jobItems: {
    include: {
      laminationSpec:    true,
      bindingSpec:       true,
      creasingSpec:      true,
      cuttingSpec:       true,
      dieCuttingSpec:    { include: { rows: true } },
      cornerCuttingSpec: true,
      foilSpec:          true,
      idCardSpec:        true,
      workflowSteps:     true
    }
  },
  jobParcels: {
    include: {
      parcelItems: true
    }
  },
  taskLogs:       true,
  packingOverride: true,
  screenshots:    true
};

class PgJobRepository {
  find(filter = {}, projection = null) {
    return new PrismaQuery('job', filter, { projection, updateFields: UPDATE_FIELDS });
  }

  findOne(filter = {}, projection = null) {
    return new PrismaQuery('job', filter, { projection, single: true, updateFields: UPDATE_FIELDS });
  }

  async countDocuments(filter = {}) {
    return countDocuments('job', filter);
  }

  async create(data) {
    return this.createJob(data);
  }

  async findById(id) {
    return this.getById(id);
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    const job = await this.findOne(filter).exec();
    if (!job) {
      if (!options.upsert) return null;
      const data = mapUpdate(update, 'job');
      return this.createJob(data);
    }
    const data = mapUpdate(update, 'job');
    Object.assign(job, data);
    return job.save();
  }

  async findByIdAndUpdate(id, update = {}, options = {}) {
    const job = await this.getById(id);
    if (!job) {
      return null;
    }
    const data = mapUpdate(update, 'job');
    Object.assign(job, data);
    return job.save();
  }

  async findByIdAndDelete(id) {
    return this.deleteJob(id);
  }

  async deleteMany(filter = {}) {
    const jobs = await this.find(filter).exec();
    for (const job of jobs) {
      await this.deleteJob(job.id);
    }
    return { count: jobs.length };
  }

  async getById(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const job = await prisma.job.findUnique({
      where: { id: numericId },
      include: includeRelations
    });
    if (!job) return null;
    const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
    return attachSaveJob(adaptJobToLegacyShape(job));
  }

  async getByJobId(jobId) {
    if (!jobId) return null;

    const job = await prisma.job.findUnique({
      where: { jobId: String(jobId) },
      include: includeRelations
    });
    if (!job) return null;
    const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
    return attachSaveJob(adaptJobToLegacyShape(job));
  }

  async createJob(data) {
    const packingPreference = data.packingPreference || 'SINGLE';
    const defaultDeliveryType = data.defaultDeliveryType || 'COURIER';
    const paymentStatus = data.paymentStatus || 'UNPAID';
    const jobStatus = data.jobStatus || 'PENDING';

    if (!VALID_PACKING.includes(packingPreference)) {
      throw new Error(`Invalid packingPreference: ${packingPreference}`);
    }
    if (data.packingMode !== undefined && data.packingMode !== null && !VALID_PACKING.includes(data.packingMode)) {
      throw new Error(`Invalid packingMode: ${data.packingMode}`);
    }
    if (!VALID_DELIVERY.includes(defaultDeliveryType)) {
      throw new Error(`Invalid defaultDeliveryType: ${defaultDeliveryType}`);
    }
    if (!VALID_PAYMENT.includes(paymentStatus)) {
      throw new Error(`Invalid paymentStatus: ${paymentStatus}`);
    }
    if (!VALID_STATUS.includes(jobStatus)) {
      throw new Error(`Invalid jobStatus: ${jobStatus}`);
    }

    const createdJob = await prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          legacyMongoId: data.legacyMongoId || null,
          jobId: String(data.jobId),
          customerName: data.customerName,
          totalItems: Number(data.totalItems),
          filesArchived: data.filesArchived !== undefined ? Boolean(data.filesArchived) : false,
          packingPreference,
          packingMode: data.packingMode || null,
          defaultDeliveryType,
          contactMe: data.contactMe !== undefined ? Boolean(data.contactMe) : false,
          paymentStatus,
          jobStatus,
          dispatchedAt: data.dispatchedAt ? new Date(data.dispatchedAt) : null,
          rackLocation: data.rackLocation || null,
          createdById: data.createdById != null ? Number(data.createdById) : (data.createdBy != null && !isNaN(Number(data.createdBy)) ? Number(data.createdBy) : null),
          legacyCreatedByMongoId: data.legacyCreatedByMongoId || (data.createdBy && isNaN(Number(data.createdBy)) ? String(data.createdBy) : null),
          printedById: data.printedById != null ? Number(data.printedById) : null,
          legacyPrintedByMongoId: data.legacyPrintedByMongoId || null,
          ppsCompletedById: data.ppsCompletedById != null ? Number(data.ppsCompletedById) : null,
          legacyPpsCompletedByMongoId: data.legacyPpsCompletedByMongoId || null,
          ppsCompletedAt: data.ppsCompletedAt ? new Date(data.ppsCompletedAt) : null,
          finishingCompletedById: data.finishingCompletedById != null ? Number(data.finishingCompletedById) : null,
          legacyFinishingCompletedByMongoId: data.legacyFinishingCompletedByMongoId || null,
          finishingCompletedAt: data.finishingCompletedAt ? new Date(data.finishingCompletedAt) : null,
          adminApprovalNote: data.adminApprovalNote || null,
          adminApprovedAt: data.adminApprovedAt ? new Date(data.adminApprovedAt) : null,
          paymentHandledById: data.paymentHandledById != null ? Number(data.paymentHandledById) : null,
          legacyPaymentHandledByMongoId: data.legacyPaymentHandledByMongoId || null,
          dispatchedById: data.dispatchedById != null ? Number(data.dispatchedById) : null,
          legacyDispatchedByMongoId: data.legacyDispatchedByMongoId || null,
          packedById: data.packedById != null ? Number(data.packedById) : null,
          legacyPackedByMongoId: data.legacyPackedByMongoId || null,
          customerId: Number(data.customerId),
          customerPhone: data.customerPhone,
          customerConfirmedAt: data.customerConfirmedAt ? new Date(data.customerConfirmedAt) : null,
          approvalRequested: data.approvalRequested !== undefined ? Boolean(data.approvalRequested) : false,
          createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
        }
      });

      await writeJobRelations(tx, job.id, data);

      return tx.job.findUnique({
        where: { id: job.id },
        include: includeRelations
      });
    });

    const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
    return attachSaveJob(adaptJobToLegacyShape(createdJob));
  }

  async updateJob(id, data) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    const packingPreference = data.packingPreference || 'SINGLE';
    const defaultDeliveryType = data.defaultDeliveryType || 'COURIER';
    const paymentStatus = data.paymentStatus || 'UNPAID';
    const jobStatus = data.jobStatus || 'PENDING';

    if (!VALID_PACKING.includes(packingPreference)) {
      throw new Error(`Invalid packingPreference: ${packingPreference}`);
    }
    if (data.packingMode !== undefined && data.packingMode !== null && !VALID_PACKING.includes(data.packingMode)) {
      throw new Error(`Invalid packingMode: ${data.packingMode}`);
    }
    if (!VALID_DELIVERY.includes(defaultDeliveryType)) {
      throw new Error(`Invalid defaultDeliveryType: ${defaultDeliveryType}`);
    }
    if (!VALID_PAYMENT.includes(paymentStatus)) {
      throw new Error(`Invalid paymentStatus: ${paymentStatus}`);
    }
    if (!VALID_STATUS.includes(jobStatus)) {
      throw new Error(`Invalid jobStatus: ${jobStatus}`);
    }

    const updatedJob = await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: numericId },
        data: {
          customerName: data.customerName,
          totalItems: Number(data.totalItems),
          filesArchived: data.filesArchived !== undefined ? Boolean(data.filesArchived) : false,
          packingPreference,
          packingMode: data.packingMode || null,
          defaultDeliveryType,
          contactMe: data.contactMe !== undefined ? Boolean(data.contactMe) : false,
          paymentStatus,
          jobStatus,
          dispatchedAt: data.dispatchedAt ? new Date(data.dispatchedAt) : null,
          rackLocation: data.rackLocation || null,
          createdById: data.createdById != null ? Number(data.createdById) : (data.createdBy != null && !isNaN(Number(data.createdBy)) ? Number(data.createdBy) : null),
          legacyCreatedByMongoId: data.legacyCreatedByMongoId || (data.createdBy && isNaN(Number(data.createdBy)) ? String(data.createdBy) : null),
          printedById: data.printedById != null ? Number(data.printedById) : null,
          legacyPrintedByMongoId: data.legacyPrintedByMongoId || null,
          ppsCompletedById: data.ppsCompletedById != null ? Number(data.ppsCompletedById) : null,
          legacyPpsCompletedByMongoId: data.legacyPpsCompletedByMongoId || null,
          ppsCompletedAt: data.ppsCompletedAt ? new Date(data.ppsCompletedAt) : null,
          finishingCompletedById: data.finishingCompletedById != null ? Number(data.finishingCompletedById) : null,
          legacyFinishingCompletedByMongoId: data.legacyFinishingCompletedByMongoId || null,
          finishingCompletedAt: data.finishingCompletedAt ? new Date(data.finishingCompletedAt) : null,
          adminApprovalNote: data.adminApprovalNote || null,
          adminApprovedAt: data.adminApprovedAt ? new Date(data.adminApprovedAt) : null,
          paymentHandledById: data.paymentHandledById != null ? Number(data.paymentHandledById) : null,
          legacyPaymentHandledByMongoId: data.legacyPaymentHandledByMongoId || null,
          dispatchedById: data.dispatchedById != null ? Number(data.dispatchedById) : null,
          legacyDispatchedByMongoId: data.legacyDispatchedByMongoId || null,
          packedById: data.packedById != null ? Number(data.packedById) : null,
          legacyPackedByMongoId: data.legacyPackedByMongoId || null,
          customerId: Number(data.customerId),
          customerPhone: data.customerPhone,
          customerConfirmedAt: data.customerConfirmedAt ? new Date(data.customerConfirmedAt) : null,
          approvalRequested: data.approvalRequested !== undefined ? Boolean(data.approvalRequested) : false,
          updatedAt: new Date()
        }
      });

      // --- DIFFERENTIAL RECONCILIATION FOR CHILD RELATIONS ---
      
      // 1. Screenshots Reconcile
      const oldScreenshots = await tx.jobItemScreenshot.findMany({
        where: { jobId: numericId },
        orderBy: { sortOrder: 'asc' }
      });
      const newScreenshots = Array.isArray(data.itemScreenshots) ? data.itemScreenshots : [];
      const oldPaths = oldScreenshots.map(s => s.screenshotPath);
      if (JSON.stringify(oldPaths) !== JSON.stringify(newScreenshots)) {
        await tx.jobItemScreenshot.deleteMany({ where: { jobId: numericId } });
        for (let i = 0; i < newScreenshots.length; i++) {
          await tx.jobItemScreenshot.create({
            data: {
              jobId: numericId,
              screenshotPath: newScreenshots[i],
              sortOrder: i
            }
          });
        }
      }

      // 2. Task Logs Reconcile (Append-Only)
      const existingLogs = await tx.jobTaskLog.findMany({
        where: { jobId: numericId }
      });
      const newLogs = Array.isArray(data.taskLog) ? data.taskLog : [];
      for (const log of newLogs) {
        const numericLogId = log.id ? Number(log.id) : null;
        const exists = numericLogId && !isNaN(numericLogId)
          ? existingLogs.some(e => e.id === numericLogId)
          : existingLogs.some(e => e.task === log.task && e.itemIndex === Number(log.itemIndex || 0) && e.startedAt?.getTime() === new Date(log.startedAt).getTime());

        if (!exists) {
          await tx.jobTaskLog.create({
            data: {
              jobId: numericId,
              task: log.task || '',
              itemIndex: Number(log.itemIndex || 0),
              startedAt: log.startedAt ? new Date(log.startedAt) : null,
              completedAt: log.completedAt ? new Date(log.completedAt) : null,
              durationMs: log.durationMs !== undefined ? Number(log.durationMs) : null,
              staffName: log.staffName || null,
              staffId: log.staffId ? Number(log.staffId) : null,
              module: log.module ? String(log.module) : null
            }
          });
        }
      }

      // 3. Packing Override Reconcile
      const existingOverride = await tx.packingOverride.findUnique({
        where: { jobId: numericId }
      });
      if (data.packingOverride) {
        const o = data.packingOverride;
        const isOverridden = o.overridden !== undefined ? Boolean(o.overridden) : false;
        const reason = o.reason || null;
        const oById = o.overriddenBy || o.overriddenById ? Number(o.overriddenBy || o.overriddenById) : null;
        const oAt = o.overriddenAt ? new Date(o.overriddenAt) : null;

        if (existingOverride) {
          await tx.packingOverride.update({
            where: { jobId: numericId },
            data: { overridden: isOverridden, reason, overriddenById: oById, overriddenAt: oAt }
          });
        } else {
          await tx.packingOverride.create({
            data: { jobId: numericId, overridden: isOverridden, reason, overriddenById: oById, overriddenAt: oAt }
          });
        }
      } else if (existingOverride) {
        await tx.packingOverride.delete({
          where: { jobId: numericId }
        });
      }

      // 4. Job Items & Processes Reconcile (Optimized to perform writes only when changed)
      const existingItems = await tx.jobItem.findMany({
        where: { jobId: numericId },
        include: {
          laminationSpec:    true,
          bindingSpec:       true,
          creasingSpec:      true,
          cuttingSpec:       true,
          dieCuttingSpec:    { include: { rows: true } },
          cornerCuttingSpec: true,
          foilSpec:          true,
          idCardSpec:        true,
          workflowSteps:     true
        }
      });

      const jobItemIds = [];
      for (const ei of existingItems) {
        jobItemIds[ei.itemIndex] = ei.id;
      }

      const newItems = Array.isArray(data.items) ? data.items : [];

      for (let index = 0; index < newItems.length; index++) {
        const item = newItems[index];
        const existingItem = existingItems.find(e => e.itemIndex === index);

        let sizeDefault = "Custom";
        let sizeH = null;
        let sizeW = null;
        let qty = "1";
        if (item.size) {
          sizeDefault = item.size.defaultVal || "Custom";
          sizeH = item.size.h ? String(item.size.h) : null;
          sizeW = item.size.w ? String(item.size.w) : null;
          qty = item.size.qty ? String(item.size.qty) : "1";
        } else {
          sizeDefault = item.sizeDefault || "Custom";
          sizeH = item.sizeH ? String(item.sizeH) : null;
          sizeW = item.sizeW ? String(item.sizeW) : null;
          qty = item.qty ? String(item.qty) : "1";
        }

        const itemData = {
          orderDescription: item.orderDescription || null,
          media: item.media || null,
          type: item.type || null,
          printType: item.printType || null,
          sizeDefault,
          sizeH,
          sizeW,
          qty,
          pages: item.pages ? String(item.pages) : null,
          sheets: item.sheets ? String(item.sheets) : null,
          sheetSize: item.sheetSize ? String(item.sheetSize) : null,
          mc: item.mc ? String(item.mc) : null,
          fc: item.fc ? String(item.fc) : null,
          ac: item.ac ? String(item.ac) : null,
          screenshot: item.screenshot || null,
          printConfirmed: !!item.printConfirmed,
          pressStatus: cleanStatus(item.pressStatus || item.status),
          activeStage: cleanActiveStage(item.activeStage || "press"),
          printedById: item.printedById || item.printedBy ? Number(item.printedById || item.printedBy) : null,
          pouchLamination: !!item.pouchLamination,
          idCard: !!item.idCard,
        };

        let dbItemId;
        if (existingItem) {
          dbItemId = existingItem.id;
          const itemChanged = 
            existingItem.orderDescription !== itemData.orderDescription ||
            existingItem.media !== itemData.media ||
            existingItem.type !== itemData.type ||
            existingItem.printType !== itemData.printType ||
            existingItem.sizeDefault !== itemData.sizeDefault ||
            existingItem.sizeH !== itemData.sizeH ||
            existingItem.sizeW !== itemData.sizeW ||
            existingItem.qty !== itemData.qty ||
            existingItem.pages !== itemData.pages ||
            existingItem.sheets !== itemData.sheets ||
            existingItem.sheetSize !== itemData.sheetSize ||
            existingItem.mc !== itemData.mc ||
            existingItem.fc !== itemData.fc ||
            existingItem.ac !== itemData.ac ||
            existingItem.screenshot !== itemData.screenshot ||
            existingItem.printConfirmed !== itemData.printConfirmed ||
            existingItem.pressStatus !== itemData.pressStatus ||
            existingItem.activeStage !== itemData.activeStage ||
            existingItem.printedById !== itemData.printedById ||
            existingItem.pouchLamination !== itemData.pouchLamination ||
            existingItem.idCard !== itemData.idCard;

          if (itemChanged) {
            await tx.jobItem.update({
              where: { id: dbItemId },
              data: itemData
            });
          }
        } else {
          const created = await tx.jobItem.create({
            data: {
              ...itemData,
              jobId: numericId,
              itemIndex: index,
              syncTimestamp: 0n
            }
          });
          dbItemId = created.id;
        }
        jobItemIds[index] = dbItemId;

        // Specs Reconcile (Only run writes/updates if spec values differ from database)
        
        // LaminationSpec
        if (item.lamination && item.lamination !== 'NONE') {
          const old = existingItem?.laminationSpec;
          const wantsUpdate = !old ||
            old.variant !== item.lamination ||
            old.quantity !== (Number(item.laminationQty) || 0) ||
            old.side !== cleanLaminationSide(item.laminationSide) ||
            old.laminationProduct !== (item.laminationProduct || null);

          if (wantsUpdate) {
            await tx.laminationSpec.upsert({
              where: { jobItemId: dbItemId },
              update: {
                variant: item.lamination,
                quantity: Number(item.laminationQty) || 0,
                side: cleanLaminationSide(item.laminationSide),
                laminationProduct: item.laminationProduct || null
              },
              create: {
                jobItemId: dbItemId,
                variant: item.lamination,
                quantity: Number(item.laminationQty) || 0,
                side: cleanLaminationSide(item.laminationSide),
                laminationProduct: item.laminationProduct || null
              }
            });
          }
        } else {
          if (existingItem?.laminationSpec) {
            await tx.laminationSpec.deleteMany({ where: { jobItemId: dbItemId } });
          }
        }

        // BindingSpec
        if (item.binding && item.binding !== 'NONE' && item.binding !== 'POUCH_LAMINATION') {
          const old = existingItem?.bindingSpec;
          const wantsUpdate = !old ||
            old.variant !== item.binding ||
            old.quantity !== (Number(item.bindingQty) || 0) ||
            old.bindingNo !== (item.bindingNo || null);

          if (wantsUpdate) {
            await tx.bindingSpec.upsert({
              where: { jobItemId: dbItemId },
              update: {
                variant: item.binding,
                quantity: Number(item.bindingQty) || 0,
                bindingNo: item.bindingNo || null
              },
              create: {
                jobItemId: dbItemId,
                variant: item.binding,
                quantity: Number(item.bindingQty) || 0,
                bindingNo: item.bindingNo || null
              }
            });
          }
        } else {
          if (existingItem?.bindingSpec) {
            await tx.bindingSpec.deleteMany({ where: { jobItemId: dbItemId } });
          }
        }

        // CreasingSpec
        if (item.creasing && item.creasing !== 'NONE') {
          const old = existingItem?.creasingSpec;
          const wantsUpdate = !old ||
            old.variant !== item.creasing ||
            old.quantity !== (Number(item.creasingQty) || 0) ||
            old.creasingNo !== (item.creasingNo || null);

          if (wantsUpdate) {
            await tx.creasingSpec.upsert({
              where: { jobItemId: dbItemId },
              update: {
                variant: item.creasing,
                quantity: Number(item.creasingQty) || 0,
                creasingNo: item.creasingNo || null
              },
              create: {
                jobItemId: dbItemId,
                variant: item.creasing,
                quantity: Number(item.creasingQty) || 0,
                creasingNo: item.creasingNo || null
              }
            });
          }
        } else {
          if (existingItem?.creasingSpec) {
            await tx.creasingSpec.deleteMany({ where: { jobItemId: dbItemId } });
          }
        }

        // CuttingSpec
        if (item.cutting && item.cutting !== 'NONE') {
          const old = existingItem?.cuttingSpec;
          const newSizes = Array.isArray(item.cuttingSizes) ? item.cuttingSizes.filter(Boolean).map(String) : [];
          const wantsUpdate = !old ||
            old.variant !== item.cutting ||
            old.value !== (item.cuttingValue || null) ||
            JSON.stringify(old.sizes) !== JSON.stringify(newSizes);

          if (wantsUpdate) {
            await tx.cuttingSpec.upsert({
              where: { jobItemId: dbItemId },
              update: {
                variant: item.cutting,
                value: item.cuttingValue || null,
                sizes: newSizes
              },
              create: {
                jobItemId: dbItemId,
                variant: item.cutting,
                value: item.cuttingValue || null,
                sizes: newSizes
              }
            });
          }
        } else {
          if (existingItem?.cuttingSpec) {
            await tx.cuttingSpec.deleteMany({ where: { jobItemId: dbItemId } });
          }
        }

        // DieCuttingSpec & rows
        if (item.dieCutting && item.dieCutting !== 'NONE') {
          const old = existingItem?.dieCuttingSpec;
          const oldRows = old?.rows || [];
          const newRows = Array.isArray(item.dieCuttingRows) ? item.dieCuttingRows : [];
          const rowsMatch = oldRows.length === newRows.length && oldRows.every((r, idx) => {
            const nr = newRows[idx];
            return nr &&
              (r.sheets == null ? nr.sheets == null : Number(r.sheets) === Number(nr.sheets)) &&
              (r.halfCut == null ? nr.halfCut == null : Number(r.halfCut) === Number(nr.halfCut)) &&
              (r.throughCut == null ? nr.throughCut == null : Number(r.throughCut) === Number(nr.throughCut)) &&
              r.timing === (nr.timing ? String(nr.timing) : null);
          });
          const wantsUpdate = !old ||
            old.variant !== item.dieCutting ||
            old.quantity !== (Number(item.dieCuttingQty) || 0) ||
            !rowsMatch;

          if (wantsUpdate) {
            await tx.dieCuttingSpec.upsert({
              where: { jobItemId: dbItemId },
              update: {
                variant: item.dieCutting,
                quantity: Number(item.dieCuttingQty) || 0
              },
              create: {
                jobItemId: dbItemId,
                variant: item.dieCutting,
                quantity: Number(item.dieCuttingQty) || 0
              }
            });
            await tx.dieCuttingRow.deleteMany({ where: { dieCuttingSpecId: dbItemId } });
            for (let rIndex = 0; rIndex < newRows.length; rIndex++) {
              const r = newRows[rIndex];
              await tx.dieCuttingRow.create({
                data: {
                  dieCuttingSpecId: dbItemId,
                  sheets: r.sheets != null && !isNaN(Number(r.sheets)) ? Number(r.sheets) : null,
                  halfCut: r.halfCut != null && !isNaN(Number(r.halfCut)) ? Number(r.halfCut) : null,
                  throughCut: r.throughCut != null && !isNaN(Number(r.throughCut)) ? Number(r.throughCut) : null,
                  timing: r.timing ? String(r.timing) : null,
                  sortOrder: r.sortOrder !== undefined ? Number(r.sortOrder) : rIndex
                }
              });
            }
          }
        } else {
          if (existingItem?.dieCuttingSpec) {
            await tx.dieCuttingRow.deleteMany({ where: { dieCuttingSpecId: dbItemId } });
            await tx.dieCuttingSpec.deleteMany({ where: { jobItemId: dbItemId } });
          }
        }

        // CornerCuttingSpec
        if (item.cornerCutting && item.cornerCutting !== 'NONE') {
          const old = existingItem?.cornerCuttingSpec;
          const wantsUpdate = !old ||
            old.variant !== item.cornerCutting ||
            old.quantity !== (Number(item.cornerCuttingQty) || 0) ||
            JSON.stringify(old.corners) !== JSON.stringify(getCornerPositions(item.cornerCuttingCorners));

          if (wantsUpdate) {
            await tx.cornerCuttingSpec.upsert({
              where: { jobItemId: dbItemId },
              update: {
                variant: item.cornerCutting,
                quantity: Number(item.cornerCuttingQty) || 0,
                corners: getCornerPositions(item.cornerCuttingCorners)
              },
              create: {
                jobItemId: dbItemId,
                variant: item.cornerCutting,
                quantity: Number(item.cornerCuttingQty) || 0,
                corners: getCornerPositions(item.cornerCuttingCorners)
              }
            });
          }
        } else {
          if (existingItem?.cornerCuttingSpec) {
            await tx.cornerCuttingSpec.deleteMany({ where: { jobItemId: dbItemId } });
          }
        }

        // FoilSpec
        if (item.foil && item.foil !== 'NONE') {
          const old = existingItem?.foilSpec;
          const wantsUpdate = !old ||
            old.variant !== item.foil ||
            old.quantity !== (Number(item.foilQty) || 0);

          if (wantsUpdate) {
            await tx.foilSpec.upsert({
              where: { jobItemId: dbItemId },
              update: {
                variant: item.foil,
                quantity: Number(item.foilQty) || 0
              },
              create: {
                jobItemId: dbItemId,
                variant: item.foil,
                quantity: Number(item.foilQty) || 0
              }
            });
          }
        } else {
          if (existingItem?.foilSpec) {
            await tx.foilSpec.deleteMany({ where: { jobItemId: dbItemId } });
          }
        }

        // IdCardSpec
        const hasIdCardSpec = !!item.idCard || (item.fusing && item.fusing !== 'NONE') || (item.holes && item.holes !== 'NONE') || (item.cutting2 && item.cutting2 !== 'NONE');
        if (hasIdCardSpec) {
          const old = existingItem?.idCardSpec;
          const fusingVal = !!(item.fusing && item.fusing !== 'NONE');
          const holesVal = !!(item.holes && item.holes !== 'NONE');
          const cutting2Val = !!(item.cutting2 && item.cutting2 !== 'NONE');
          const qtyVal = Number(item.idCardQty || item.fusingQty) || 0;
          const wantsUpdate = !old ||
            old.fusing !== fusingVal ||
            old.holes !== holesVal ||
            old.cutting2 !== cutting2Val ||
            old.qty !== qtyVal;

          if (wantsUpdate) {
            await tx.idCardSpec.upsert({
              where: { jobItemId: dbItemId },
              update: {
                fusing: fusingVal,
                holes: holesVal,
                cutting2: cutting2Val,
                qty: qtyVal
              },
              create: {
                jobItemId: dbItemId,
                fusing: fusingVal,
                holes: holesVal,
                cutting2: cutting2Val,
                qty: qtyVal
              }
            });
          }
        } else {
          if (existingItem?.idCardSpec) {
            await tx.idCardSpec.deleteMany({ where: { jobItemId: dbItemId } });
          }
        }

        // Workflow Steps Reconcile
        const STAGE_STATUS_MAP = [
          { stage: 'press',         status: cleanStatus(item.pressStatus || item.status) },
          { stage: 'lamination',    status: cleanStatus(item.laminationStatus) },
          { stage: 'binding',       status: cleanStatus(item.bindingStatus) },
          { stage: 'creasing',      status: cleanStatus(item.creasingStatus) },
          { stage: 'cutting',       status: cleanStatus(item.cuttingStatus) },
          { stage: 'dieCutting',    status: cleanStatus(item.dieCuttingStatus) },
          { stage: 'cornerCutting', status: cleanStatus(item.cornerCuttingStatus) },
          { stage: 'foil',          status: cleanStatus(item.foilStatus) },
          { stage: 'fusing',        status: cleanStatus(item.fusingStatus) },
          { stage: 'holes',         status: cleanStatus(item.holesStatus) },
          { stage: 'cutting2',      status: cleanStatus(item.cutting2Status) },
        ];

        for (const { stage, status } of STAGE_STATUS_MAP) {
          const existingStep = existingItem?.workflowSteps?.find(ws => ws.stepName === stage);
          if (status && status !== 'NONE') {
            if (!existingStep || existingStep.status !== status) {
              await tx.jobItemWorkflowStep.upsert({
                where: { jobItemId_stepName: { jobItemId: dbItemId, stepName: stage } },
                update: { status },
                create: { jobItemId: dbItemId, stepName: stage, status }
              });
            }
          } else {
            if (existingStep) {
              await tx.jobItemWorkflowStep.deleteMany({
                where: { jobItemId: dbItemId, stepName: stage }
              });
            }
          }
        }
      }

      // Delete removed items
      const itemsToDelete = existingItems.filter(e => e.itemIndex >= newItems.length);
      if (itemsToDelete.length > 0) {
        await tx.jobItem.deleteMany({
          where: { id: { in: itemsToDelete.map(e => e.id) } }
        });
      }

      // 5. Parcels and ParcelItems Reconcile
      const existingParcels = await tx.jobParcel.findMany({
        where: { jobId: numericId },
        include: { parcelItems: true }
      });
      const incomingParcels = Array.isArray(data.parcels) ? data.parcels : [];

      for (const p of incomingParcels) {
        const parcelNo = Number(p.parcelNo);
        const existingParcel = existingParcels.find(ep => ep.parcelNo === parcelNo);

        const parcelData = {
          receiverType: cleanReceiverType(p.receiverType),
          deliveryType: cleanDeliveryType(p.deliveryType),
          receiverName: p.receiverName || '',
          receiverPhone: p.receiverPhone || '',
          qrCode: p.qrCode || '',
          status: cleanParcelStatus(p.status),
          packedAt: p.packedAt ? new Date(p.packedAt) : null,
          dispatchedAt: p.dispatchedAt ? new Date(p.dispatchedAt) : null,
          dispatchedBy: p.dispatchedBy || '',
          rack: p.rack || '',
          rackLocation: p.rackLocation || '',
        };

        let dbParcelId;
        if (existingParcel) {
          dbParcelId = existingParcel.id;
          await tx.jobParcel.update({
            where: { id: dbParcelId },
            data: parcelData
          });
        } else {
          const createdParcel = await tx.jobParcel.create({
            data: {
              ...parcelData,
              jobId: numericId,
              parcelNo,
            }
          });
          dbParcelId = createdParcel.id;
        }

        // Reconcile parcel items
        const existingParcelItems = existingParcel ? existingParcel.parcelItems : [];
        const itemIndexes = Array.isArray(p.itemIndexes) ? p.itemIndexes : [];
        const activeItemIndexes = new Set();

        for (const itemIndex of itemIndexes) {
          const numericIndex = Number(itemIndex);
          activeItemIndexes.add(numericIndex);

          const rackName = getFromMapOrObject(p.itemRacks, itemIndex);
          const itemStatus = getFromMapOrObject(p.itemStatuses, itemIndex) || {};
          const status = cleanParcelStatus(itemStatus.status);
          const dispatchedAt = itemStatus.dispatchedAt ? new Date(itemStatus.dispatchedAt) : null;
          const rName = rackName || null;

          const existingParcelItem = existingParcelItems.find(epi => epi.itemIndex === numericIndex);
          if (existingParcelItem) {
            if (existingParcelItem.status !== status ||
                existingParcelItem.rackName !== rName ||
                existingParcelItem.dispatchedAt?.getTime() !== dispatchedAt?.getTime()) {
              await tx.jobParcelItem.update({
                where: { id: existingParcelItem.id },
                data: {
                  status,
                  dispatchedAt,
                  rackName: rName
                }
              });
            }
          } else {
            const jobItemId = jobItemIds[numericIndex - 1];
            if (!jobItemId) {
              throw new Error(`Cannot create JobParcelItem: JobItem not found for index ${numericIndex}`);
            }
            await tx.jobParcelItem.create({
              data: {
                jobParcelId: dbParcelId,
                jobItemId,
                itemIndex: numericIndex,
                status,
                dispatchedAt,
                rackName: rName
              }
            });
          }
        }

        // Delete removed parcel items
        const parcelItemsToDelete = existingParcelItems.filter(epi => !activeItemIndexes.has(epi.itemIndex));
        if (parcelItemsToDelete.length > 0) {
          await tx.jobParcelItem.deleteMany({
            where: { id: { in: parcelItemsToDelete.map(epi => epi.id) } }
          });
        }
      }

      // Delete removed parcels
      const incomingParcelNos = new Set(incomingParcels.map(p => Number(p.parcelNo)));
      const parcelsToDelete = existingParcels.filter(ep => !incomingParcelNos.has(ep.parcelNo));
      if (parcelsToDelete.length > 0) {
        await tx.jobParcel.deleteMany({
          where: { id: { in: parcelsToDelete.map(ep => ep.id) } }
        });
      }

      return tx.job.findUnique({
        where: { id: numericId },
        include: includeRelations
      });
    });

    const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
    return attachSaveJob(adaptJobToLegacyShape(updatedJob));
  }

  async updateJobStatus(id, jobStatus) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    if (!VALID_STATUS.includes(jobStatus)) {
      throw new Error(`Invalid jobStatus: ${jobStatus}`);
    }

    try {
      const job = await prisma.job.update({
        where: { id: numericId },
        data: { jobStatus },
        include: includeRelations
      });
      const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
      return attachSaveJob(adaptJobToLegacyShape(job));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getByCustomer(customerId) {
    const numericCustomerId = Number(customerId);
    if (isNaN(numericCustomerId)) return [];

    const jobs = await prisma.job.findMany({
      where: { customerId: numericCustomerId },
      orderBy: { createdAt: 'desc' },
      include: includeRelations
    });
    const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
    return jobs.map((job) => attachSaveJob(adaptJobToLegacyShape(job)));
  }

  async getByStatus(jobStatus) {
    if (!VALID_STATUS.includes(jobStatus)) return [];

    const jobs = await prisma.job.findMany({
      where: { jobStatus },
      orderBy: { createdAt: 'desc' },
      include: includeRelations
    });
    const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
    return jobs.map((job) => attachSaveJob(adaptJobToLegacyShape(job)));
  }

  async deleteJob(id) {
    const numericId = Number(id);
    if (isNaN(numericId)) return null;

    try {
      const job = await prisma.job.delete({
        where: { id: numericId },
        include: includeRelations
      });
      const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
      return attachSaveJob(adaptJobToLegacyShape(job));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async getAllJobs(skip = 0, take = 50) {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      skip: Number(skip) || 0,
      take: Math.min(Number(take) || 50, 200),
      include: includeRelations
    });
    const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
    return jobs.map((job) => attachSaveJob(adaptJobToLegacyShape(job)));
  }

  async updatePaymentStatus(jobId, paymentStatus, paymentHandledById, paymentMode) {
    const numericId = Number(jobId);
    if (isNaN(numericId)) return null;
    if (!VALID_PAYMENT.includes(paymentStatus)) throw new Error(`Invalid paymentStatus: ${paymentStatus}`);

    const data = { paymentStatus };
    if (paymentHandledById != null) data.paymentHandledById = Number(paymentHandledById);
    if (paymentMode != null) data.paymentMode = paymentMode;

    try {
      const job = await prisma.job.update({ where: { id: numericId }, data, include: includeRelations });
      const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
      return attachSaveJob(adaptJobToLegacyShape(job));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async updateRackLocation(jobId, rackLocation) {
    const numericId = Number(jobId);
    if (isNaN(numericId)) return null;

    try {
      const job = await prisma.job.update({
        where: { id: numericId },
        data: { rackLocation: rackLocation || null },
        include: includeRelations
      });
      const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
      return attachSaveJob(adaptJobToLegacyShape(job));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async updatePackingPreference(jobId, packingPreference) {
    const numericId = Number(jobId);
    if (isNaN(numericId)) return null;

    try {
      const job = await prisma.job.update({
        where: { id: numericId },
        data: { packingPreference },
        include: includeRelations
      });
      const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
      return attachSaveJob(adaptJobToLegacyShape(job));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async updateDispatchFields(jobId, { rackLocation, dispatchedById, jobStatus, dispatchedAt } = {}) {
    const numericId = Number(jobId);
    if (isNaN(numericId)) return null;

    const data = {};
    if (rackLocation !== undefined) data.rackLocation = rackLocation || null;
    if (dispatchedById != null) data.dispatchedById = Number(dispatchedById);
    if (jobStatus != null) data.jobStatus = jobStatus;
    if (dispatchedAt !== undefined) data.dispatchedAt = dispatchedAt;

    try {
      const job = await prisma.job.update({ where: { id: numericId }, data, include: includeRelations });
      const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
      return attachSaveJob(adaptJobToLegacyShape(job));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  async addTaskLog(jobId, logEntry) {
    const numericId = Number(jobId);
    if (isNaN(numericId)) return null;
    return prisma.jobTaskLog.create({
      data: {
        jobId: numericId,
        task: logEntry.task || '',
        itemIndex: Number(logEntry.itemIndex || 0),
        startedAt: logEntry.startedAt ? new Date(logEntry.startedAt) : null,
        completedAt: logEntry.completedAt ? new Date(logEntry.completedAt) : null,
        durationMs: logEntry.durationMs != null ? Number(logEntry.durationMs) : null,
        staffName: logEntry.staffName || null,
        staffId: logEntry.staffId ? Number(logEntry.staffId) : null,
        module: logEntry.module ? String(logEntry.module) : null
      }
    });
  }

  async updateItemStage(jobId, itemIndex, { pressStatus, activeStage, printConfirmed } = {}) {
    const numericJobId = Number(jobId);
    if (isNaN(numericJobId)) return null;

    const item = await prisma.jobItem.findFirst({
      where: { jobId: numericJobId, itemIndex: Number(itemIndex) }
    });
    if (!item) return null;

    const data = {};
    if (pressStatus !== undefined) data.pressStatus = pressStatus;
    if (activeStage !== undefined) data.activeStage = activeStage;
    if (printConfirmed !== undefined) data.printConfirmed = Boolean(printConfirmed);

    return prisma.jobItem.update({ where: { id: item.id }, data });
  }

  async listJobsForCashier({ createdAtStart, createdAtEnd, search, paymentStatus, hideDispatched, skip, take }) {
    const where = {
      createdAt: { gte: createdAtStart, lte: createdAtEnd }
    };
    if (search) {
      where.OR = [
        { jobId: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (paymentStatus && paymentStatus !== 'ALL') {
      where.paymentStatus = paymentStatus;
    }
    if (hideDispatched) {
      where.jobStatus = { not: 'DISPATCHED' };
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        select: {
          id: true,
          jobId: true,
          customerName: true,
          paymentStatus: true,
          jobStatus: true,
          createdAt: true,
          customerId: true,
          customer: { select: { isCreditCustomer: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: Number(skip) || 0,
        take: Math.min(Number(take) || 50, 200)
      }),
      prisma.job.count({ where })
    ]);

    return {
      jobs: jobs.map(row => ({
        _id: row.id,
        id: row.id,
        jobId: row.jobId,
        customerName: row.customerName,
        paymentStatus: row.paymentStatus,
        jobStatus: row.jobStatus,
        createdAt: row.createdAt,
        customerId: row.customerId,
        isCreditCustomer: row.customer?.isCreditCustomer || false
      })),
      total
    };
  }

  async listJobsForDispatch({ status, date, search, skip, take }) {
    const where = {
      packingPreference: { in: ['SINGLE', 'MULTIPLE', 'MIXED'] }
    };

    if (search) {
      where.OR = [
        { jobId: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } }
      ];
    } else if (status === 'history') {
      where.OR = [{ jobStatus: 'DISPATCHED' }, { jobStatus: 'PARTIAL_DISPATCH' }];
      if (date) {
        const queryDate = new Date(date);
        const nextDay = new Date(queryDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const dateRange = { gte: queryDate, lt: nextDay };
        where.AND = [
          { OR: where.OR },
          { OR: [
            { dispatchedAt: dateRange },
            { jobParcels: { some: { dispatchedAt: dateRange } } }
          ]}
        ];
        delete where.OR;
      }
    } else {
      // active (default)
      where.jobStatus = { not: 'DISPATCHED' };
      if (date) {
        const queryDate = new Date(date);
        const nextDay = new Date(queryDate);
        nextDay.setDate(nextDay.getDate() + 1);
        where.createdAt = { gte: queryDate, lt: nextDay };
      }
    }

    const [rows, total] = await Promise.all([
      prisma.job.findMany({
        where,
        select: {
          id: true,
          jobId: true,
          customerName: true,
          packingPreference: true,
          paymentStatus: true,
          totalItems: true,
          approvalRequested: true,
          jobStatus: true,
          dispatchedAt: true,
          rackLocation: true,
          packingMode: true,
          createdAt: true,
          defaultDeliveryType: true,
          contactMe: true,
          customerId: true,
          customer: { select: { isCreditCustomer: true } },
          jobParcels: { include: { parcelItems: true } },
          jobItems: {
            select: {
              itemIndex: true,
              orderDescription: true,
              activeStage: true,
              pressStatus: true,
              type: true,
              media: true,
              sizeDefault: true
            },
            orderBy: { itemIndex: 'asc' }
          },
          screenshots: {
            select: { screenshotPath: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' }
          },
          packingOverride: {
            select: { overridden: true, reason: true, overriddenById: true, overriddenAt: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: Number(skip) || 0,
        take: Math.min(Number(take) || 50, 200)
      }),
      prisma.job.count({ where })
    ]);

    const jobs = rows.map(row => {
      const parcels = (row.jobParcels || []).map(p => {
        const itemIndexes = (p.parcelItems || []).map(pi => pi.itemIndex);
        const itemRacks = new Map();
        const itemStatuses = new Map();
        itemRacks.toJSON = function() { return Object.fromEntries(this); };
        itemStatuses.toJSON = function() { return Object.fromEntries(this); };
        for (const pi of p.parcelItems || []) {
          const key = String(pi.itemIndex);
          if (pi.rackName) itemRacks.set(key, pi.rackName);
          itemStatuses.set(key, { status: pi.status || 'PENDING', dispatchedAt: pi.dispatchedAt || null });
        }
        return { parcelNo: p.parcelNo, itemIndexes, receiverType: p.receiverType, deliveryType: p.deliveryType, receiverName: p.receiverName || '', receiverPhone: p.receiverPhone || '', qrCode: p.qrCode || '', status: p.status, packedAt: p.packedAt || null, dispatchedAt: p.dispatchedAt || null, dispatchedBy: p.dispatchedBy || '', rack: p.rack || '', rackLocation: p.rackLocation || '', itemRacks, itemStatuses };
      });

      const itemScreenshots = (row.screenshots || []).map(s => s.screenshotPath);

      const items = (row.jobItems || []).map(item => ({
        itemIndex: item.itemIndex,
        orderDescription: item.orderDescription || null,
        media: item.media || null,
        type: item.type || null,
        activeStage: item.activeStage || 'press',
        pressStatus: item.pressStatus || 'PENDING',
        size: { defaultVal: item.sizeDefault || 'Custom' }
      }));

      const packingOverride = row.packingOverride
        ? { overridden: row.packingOverride.overridden, reason: row.packingOverride.reason, overriddenBy: row.packingOverride.overriddenById, overriddenAt: row.packingOverride.overriddenAt }
        : null;

      return {
        _id: String(row.id),
        id: row.id,
        jobId: row.jobId,
        customerName: row.customerName,
        packingPreference: row.packingPreference,
        paymentStatus: row.paymentStatus,
        totalItems: row.totalItems,
        approvalRequested: row.approvalRequested,
        jobStatus: row.jobStatus,
        dispatchedAt: row.dispatchedAt,
        rackLocation: row.rackLocation,
        packingMode: row.packingMode,
        packingOverride,
        createdAt: row.createdAt,
        defaultDeliveryType: row.defaultDeliveryType,
        contactMe: row.contactMe,
        customerId: row.customerId,
        isCreditCustomer: row.customer?.isCreditCustomer || false,
        parcels,
        items,
        itemScreenshots
      };
    });

    return { jobs, total };
  }

  async listJobsForCustomer({ customerId, status }) {
    const numericCustomerId = Number(customerId);
    if (isNaN(numericCustomerId)) return [];

    const where = { customerId: numericCustomerId };
    if (status === 'active') {
      where.jobStatus = { not: 'DISPATCHED' };
    } else if (status === 'history') {
      where.jobStatus = 'DISPATCHED';
    }

    const rows = await prisma.job.findMany({
      where,
      select: {
        id: true,
        jobId: true,
        createdAt: true,
        jobStatus: true,
        totalItems: true,
        packingPreference: true,
        dispatchedAt: true,
        rackLocation: true,
        defaultDeliveryType: true,
        packingMode: true,
        screenshots: {
          select: { screenshotPath: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return rows.map(row => ({
      _id: String(row.id),
      id: row.id,
      jobId: row.jobId,
      createdAt: row.createdAt,
      jobStatus: row.jobStatus,
      totalItems: row.totalItems,
      packingPreference: row.packingPreference,
      dispatchedAt: row.dispatchedAt,
      rackLocation: row.rackLocation,
      defaultDeliveryType: row.defaultDeliveryType,
      packingMode: row.packingMode,
      itemScreenshots: row.screenshots.map(s => s.screenshotPath)
    }));
  }
}

module.exports = new PgJobRepository();
module.exports.attachSaveJob = attachSaveJob;
module.exports.writeJobRelations = writeJobRelations;
