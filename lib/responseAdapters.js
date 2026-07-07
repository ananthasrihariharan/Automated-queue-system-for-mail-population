// lib/responseAdapters.js

/**
 * Maps the flat, relational JobCard structure from PostgreSQL back to the nested JSON shape
 * expected by the frontend and legacy code paths (like jobCardToPostPress.js).
 */
function adaptJobCardToLegacyShape(jobCard) {
  if (!jobCard) return null;

  // Reconstruct processes object
  const processes = {
    cutting: jobCard.hasCutting,
    dieCutting: jobCard.hasDieCutting,
    lamination: jobCard.hasLamination,
    perforation: jobCard.hasPerforation,
    ncBox: jobCard.hasNcBox,
    creasing: jobCard.hasCreasing,
    cornerCut: jobCard.hasCornerCut,
    binding: jobCard.hasBinding,
    foil: jobCard.hasFoil,
    idCard: jobCard.hasIdCard
  };

  // Reconstruct vcBox
  const vcBox = jobCard.vcBoxCount ? { count: jobCard.vcBoxCount } : null;

  // Reconstruct binding
  const binding = {
    noOfBooks: jobCard.bindingNoOfBooks,
    centerPin: jobCard.bindingCenterPin,
    centerPinQty: jobCard.bindingCenterPinQty,
    perfect: jobCard.bindingPerfect,
    perfectQty: jobCard.bindingPerfectQty,
    caseBinding: jobCard.bindingCase,
    caseBindingQty: jobCard.bindingCaseQty,
    wiroBinding: jobCard.bindingWiro,
    wiroBindingQty: jobCard.bindingWiroQty,
    pouchLamination: jobCard.bindingPouchLam,
    pouchLaminationQty: jobCard.bindingPouchLamQty,
    special: jobCard.bindingSpecial,
    specialQty: jobCard.bindingSpecialQty,
    specialDesc: jobCard.bindingSpecialDesc,
    date: jobCard.bindingDate
  };

  // Reconstruct dieCutting
  const dieCutting = {
    noOfSheets: jobCard.dieCuttingNoOfSheets,
    date: jobCard.dieCuttingDate,
    rows: (jobCard.dieCuttingRows || []).map(r => ({
      sheets: r.sheets,
      halfCut: r.halfCut,
      throughCut: r.throughCut,
      timing: r.timing,
      sortOrder: r.sortOrder
    }))
  };

  // Reconstruct cornerCutting
  const cornerCutting = {
    noOfCards: jobCard.cornerNoOfCards,
    date: jobCard.cornerDate,
    corners: {
      tl: jobCard.cornerTl,
      tr: jobCard.cornerTr,
      bl: jobCard.cornerBl,
      br: jobCard.cornerBr
    }
  };

  // Reconstruct cutting
  const cutting = {
    noOfCutting: jobCard.cuttingNoOfCutting,
    date: jobCard.cuttingDate,
    sizes: jobCard.cuttingSizes || []
  };

  // Reconstruct lamination
  const lamination = {
    date: jobCard.lamDate,
    glossy: jobCard.lamGlossy,
    glossyQty: jobCard.lamGlossyQty,
    glossySide: jobCard.lamGlossySide,
    matt: jobCard.lamMatt,
    mattQty: jobCard.lamMattQty,
    mattSide: jobCard.lamMattSide,
    velvet: jobCard.lamVelvet,
    velvetQty: jobCard.lamVelvetQty,
    velvetSide: jobCard.lamVelvetSide,
    singleSide: jobCard.lamSingleSide,
    doubleSide: jobCard.lamDoubleSide,
    other: jobCard.lamOther,
    otherType: jobCard.lamOtherType,
    otherQty: jobCard.lamOtherQty,
    otherSide: jobCard.lamOtherSide
  };

  // Reconstruct creasingPerforation
  const creasingPerforation = {
    noOfSheets: jobCard.cpNoOfSheets,
    noOfStock: jobCard.cpNoOfStock,
    date: jobCard.cpDate,
    creasing: jobCard.cpCreasing,
    creasingNo: jobCard.cpCreasingNo,
    perforation: jobCard.cpPerforation,
    perforationNo: jobCard.cpPerforationNo,
    wheelPerforation: jobCard.cpWheelPerforation,
    wheelPerforationNo: jobCard.cpWheelPerforationNo
  };

  // Reconstruct foil
  const foil = jobCard.foilType || jobCard.foilQty ? {
    type: jobCard.foilType,
    qty: jobCard.foilQty
  } : null;

  // Reconstruct idCard
  const idCard = {
    fusing: jobCard.idFusing,
    fusingType: jobCard.idFusingType,
    fusingQty: jobCard.idFusingQty,
    holes: jobCard.idHoles,
    holesType: jobCard.idHolesType
  };

  return {
    _id: jobCard.legacyMongoId || String(jobCard.id),
    id: jobCard.id,
    jobId: jobCard.jobId,
    customerName: jobCard.customerName,
    totalItems: jobCard.totalItems,
    attBy: jobCard.attBy,
    date: jobCard.date,
    processes,
    vcBox,
    binding,
    dieCutting,
    cornerCutting,
    cutting,
    lamination,
    creasingPerforation,
    foil,
    idCard,
    createdAt: jobCard.createdAt,
    updatedAt: jobCard.updatedAt
  };
}

/**
 * Maps the PostgreSQL Job structure to the Mongoose legacy shape expected everywhere.
 *
 * Supports two data paths:
 *  A) Spec-table path  — item.laminationSpec, item.workflowSteps, etc. (full include)
 *  B) Flat-column path — item.laminationStatus, item.lamination, etc. (added 2026-06-22)
 * Both paths produce the same output. Path A takes priority.
 */
function adaptJobToLegacyShape(job) {
  if (!job) return null;

  const buildStepMap = (steps) => {
    const m = {};
    for (const s of steps || []) m[s.stepName] = s.status;
    return m;
  };

  const sortedJobItems = [...(job.jobItems || [])].sort((a, b) => a.itemIndex - b.itemIndex);
  const items = sortedJobItems.map(item => {
    const stepMap = buildStepMap(item.workflowSteps);

    const li = {
      itemIndex: item.itemIndex,
      orderDescription: item.orderDescription || null,
      media: item.media || null,
      type: item.type || null,
      printType: item.printType || null,
      size: {
        defaultVal: item.sizeDefault || 'Custom',
        h: item.sizeH || '', w: item.sizeW || '',
        qty: String(item.qty || '1')
      },
      pages:   item.pages  != null ? String(item.pages)  : null,
      sheets:  item.sheets != null ? String(item.sheets) : null,
      mc: item.mc || null, fc: item.fc || null, ac: item.ac || null,
      screenshot: item.screenshot || null,
      printConfirmed: item.printConfirmed || false,
      pressStatus:    item.pressStatus   || 'PENDING',
      pressStartedAt: item.pressStartedAt || null,
      activeStage:    item.activeStage   || 'press',
      printedBy:      item.printedById   || null,
      pouchLamination: item.pouchLamination || false,
      idCard:          item.idCard          || false,
      // defaults — overwritten below
      lamination: 'NONE', laminationQty: 0, laminationStatus: 'NONE', laminationProduct: '',
      creasing:   'NONE', creasingQty:   0, creasingNo: '',   creasingStatus: 'NONE',
      binding:    'NONE', bindingQty:    0, bindingNo:  '',   bindingStatus:  'NONE',
      dieCutting:   'NONE', dieCuttingQty:   0, dieCuttingStatus:   'NONE', dieCuttingRows: [],
      cornerCutting: 'NONE', cornerCuttingQty: 0, cornerCuttingStatus: 'NONE',
        cornerCuttingValue: '', cornerCuttingCorners: { tl: false, tr: false, bl: false, br: false },
      cutting:  'NONE', cuttingValue:  '', cuttingSizes: [], cuttingStatus:  'NONE',
      cutting2: 'NONE', cutting2Value: '',                  cutting2Status: 'NONE',
      foil:     'NONE', foilQty:  '',  foilStatus:  'NONE',
      fusing:   'NONE', fusingQty: '', fusingStatus: 'NONE',
      holes:    'NONE',               holesStatus:  'NONE',
      idCardQty: 0, idCardStatus: 'NONE'
    };

    // ── PATH A: relational spec tables ────────────────────────────────────────
    if (item.laminationSpec) {
      li.lamination      = item.laminationSpec.variant  || 'YES';
      li.laminationQty   = item.laminationSpec.quantity || 0;
      li.laminationStatus = stepMap['lamination'] || item.laminationStatus || 'PENDING';
      li.laminationProduct = item.laminationSpec.laminationProduct || '';
    }
    if (item.creasingSpec) {
      li.creasing      = item.creasingSpec.variant    || 'YES';
      li.creasingQty   = item.creasingSpec.quantity   || 0;
      li.creasingNo    = item.creasingSpec.creasingNo || '';
      li.creasingStatus = stepMap['creasing'] || item.creasingStatus || 'PENDING';
    }
    if (item.bindingSpec) {
      li.binding      = item.bindingSpec.variant   || 'YES';
      li.bindingQty   = item.bindingSpec.quantity  || 0;
      li.bindingNo    = item.bindingSpec.bindingNo || '';
      li.bindingStatus = stepMap['binding'] || item.bindingStatus || 'PENDING';
    }
    if (item.cuttingSpec) {
      li.cutting      = item.cuttingSpec.variant || 'YES';
      li.cuttingValue = item.cuttingSpec.value   || '';
      li.cuttingSizes = item.cuttingSpec.sizes   || [];
      li.cuttingStatus = stepMap['cutting'] || item.cuttingStatus || 'PENDING';
    }
    if (item.dieCuttingSpec) {
      li.dieCutting      = item.dieCuttingSpec.variant  || 'YES';
      li.dieCuttingQty   = item.dieCuttingSpec.quantity || 0;
      li.dieCuttingStatus = stepMap['dieCutting'] || item.dieCuttingStatus || 'PENDING';
      li.dieCuttingRows  = (item.dieCuttingSpec.rows || []).map(r => ({
        sheets:     r.sheets     != null ? String(r.sheets)     : '',
        halfCut:    r.halfCut    != null ? String(r.halfCut)    : '',
        throughCut: r.throughCut != null ? String(r.throughCut) : '',
        timing:     r.timing || '', sortOrder: r.sortOrder || 0
      }));
    }
    if (item.cornerCuttingSpec) {
      li.cornerCutting      = item.cornerCuttingSpec.variant  || 'YES';
      li.cornerCuttingQty   = item.cornerCuttingSpec.quantity || 0;
      li.cornerCuttingStatus = stepMap['cornerCutting'] || item.cornerCuttingStatus || 'PENDING';
      const c = { tl: false, tr: false, bl: false, br: false };
      for (const pos of item.cornerCuttingSpec.corners || []) c[pos.toLowerCase()] = true;
      li.cornerCuttingCorners = c;
    }
    if (item.foilSpec) {
      li.foil      = item.foilSpec.variant  || 'YES';
      li.foilQty   = String(item.foilSpec.quantity || '');
      li.foilStatus = stepMap['foil'] || item.foilStatus || 'PENDING';
    }
    if (item.idCardSpec) {
      li.idCard    = true;
      li.idCardQty = item.idCardSpec.qty || 0;
      if (item.idCardSpec.fusing)   { li.fusing = 'YES'; li.fusingQty = String(item.idCardSpec.qty || ''); li.fusingStatus = stepMap['fusing'] || item.fusingStatus || 'PENDING'; }
      if (item.idCardSpec.holes)    { li.holes  = 'YES'; li.holesStatus   = stepMap['holes']   || item.holesStatus   || 'PENDING'; }
      if (item.idCardSpec.cutting2) { li.cutting2 = 'YES'; li.cutting2Status = stepMap['cutting2'] || item.cutting2Status || 'PENDING'; }
      li.idCardStatus = item.idCardStatus || 'PENDING';
    }

    // ── PATH B: flat columns (fallback when spec tables not included) ──────────
    const fb = (cur, col, val) => cur === 'NONE' && val && val !== 'NONE' ? val : col;
    if (li.lamination   === 'NONE' && item.lamination   && item.lamination   !== 'NONE') { li.lamination = item.lamination; li.laminationQty = item.laminationQty||0; li.laminationStatus = item.laminationStatus||'NONE'; }
    if (li.creasing     === 'NONE' && item.creasing     && item.creasing     !== 'NONE') { li.creasing   = item.creasing;   li.creasingQty   = item.creasingQty  ||0; li.creasingNo = item.creasingNo||''; li.creasingStatus   = item.creasingStatus  ||'NONE'; }
    if (li.binding      === 'NONE' && item.binding      && item.binding      !== 'NONE') { li.binding    = item.binding;    li.bindingQty    = item.bindingQty   ||0; li.bindingNo  = item.bindingNo ||''; li.bindingStatus    = item.bindingStatus   ||'NONE'; }
    if (li.dieCutting   === 'NONE' && item.dieCutting   && item.dieCutting   !== 'NONE') { li.dieCutting = item.dieCutting; li.dieCuttingQty = item.dieCuttingQty||0; li.dieCuttingStatus = item.dieCuttingStatus||'NONE'; }
    if (li.cornerCutting=== 'NONE' && item.cornerCutting&& item.cornerCutting!== 'NONE') { li.cornerCutting = item.cornerCutting; li.cornerCuttingQty = item.cornerCuttingQty||0; li.cornerCuttingStatus = item.cornerCuttingStatus||'NONE'; li.cornerCuttingValue = item.cornerCuttingValue||''; }
    if (li.cutting      === 'NONE' && item.cutting      && item.cutting      !== 'NONE') { li.cutting    = item.cutting;    li.cuttingValue  = item.cuttingValue ||''; li.cuttingStatus = item.cuttingStatus||'NONE'; }
    if (li.cutting2     === 'NONE' && item.cutting2     && item.cutting2     !== 'NONE') { li.cutting2   = item.cutting2;   li.cutting2Value = item.cutting2Value||''; li.cutting2Status = item.cutting2Status||'NONE'; }
    if (li.foil         === 'NONE' && item.foil         && item.foil         !== 'NONE') { li.foil   = item.foil;   li.foilQty   = item.foilQty  ||''; li.foilStatus   = item.foilStatus  ||'NONE'; }
    if (li.fusing       === 'NONE' && item.fusing       && item.fusing       !== 'NONE') { li.fusing = item.fusing; li.fusingQty = item.fusingQty||''; li.fusingStatus = item.fusingStatus||'NONE'; }
    if (li.holes        === 'NONE' && item.holes        && item.holes        !== 'NONE') { li.holes  = item.holes;  li.holesStatus = item.holesStatus||'NONE'; }
    if (!li.idCard && item.idCard) { li.idCard = true; li.idCardQty = item.idCardQty||0; li.idCardStatus = item.idCardStatus||'NONE'; }

    void fb; // suppress unused warning
    return li;
  });

  const itemScreenshots = (job.screenshots || []).sort((a,b)=>a.sortOrder-b.sortOrder).map(s=>s.screenshotPath);
  const taskLog = (job.taskLogs || []).map(l => ({ task:l.task, itemIndex:l.itemIndex, startedAt:l.startedAt, completedAt:l.completedAt, durationMs:l.durationMs, staffName:l.staffName, staffId:l.staffId, module:l.module }));
  const packingOverride = job.packingOverride ? { overridden:job.packingOverride.overridden, reason:job.packingOverride.reason, overriddenBy:job.packingOverride.overriddenById, overriddenAt:job.packingOverride.overriddenAt } : null;

  // Parcels — use itemIndex directly now that JobParcelItem stores it
  const parcels = (job.jobParcels || []).map(p => {
    const itemIndexes = (p.parcelItems || []).map(pi => pi.itemIndex);
    const itemRacks = new Map(), itemStatuses = new Map();
    itemRacks.toJSON = function() { return Object.fromEntries(this); };
    itemStatuses.toJSON = function() { return Object.fromEntries(this); };
    for (const pi of p.parcelItems || []) {
      const key = String(pi.itemIndex);
      if (pi.rackName) itemRacks.set(key, pi.rackName);
      itemStatuses.set(key, { status: pi.status || 'PENDING', dispatchedAt: pi.dispatchedAt || null });
    }
    return { parcelNo:p.parcelNo, itemIndexes, receiverType:p.receiverType, deliveryType:p.deliveryType, receiverName:p.receiverName||'', receiverPhone:p.receiverPhone||'', qrCode:p.qrCode||'', status:p.status, packedAt:p.packedAt||null, dispatchedAt:p.dispatchedAt||null, dispatchedBy:p.dispatchedBy||'', rack:p.rack||'', rackLocation:p.rackLocation||'', itemRacks, itemStatuses };
  });

  return {
    _id: job.legacyMongoId || String(job.id), id: job.id, jobId: job.jobId,
    customerName: job.customerName, totalItems: job.totalItems,
    itemScreenshots, items, filesArchived: job.filesArchived,
    packingPreference: job.packingPreference, packingMode: job.packingMode,
    defaultDeliveryType: job.defaultDeliveryType, contactMe: job.contactMe,
    paymentStatus: job.paymentStatus, paymentMode: job.paymentMode || null,
    jobStatus: job.jobStatus, dispatchedAt: job.dispatchedAt, rackLocation: job.rackLocation,
    createdAt: job.createdAt, updatedAt: job.updatedAt,
    parcels, packingOverride, taskLog,
    customerId: job.customerId, customerPhone: job.customerPhone,
    customerConfirmedAt: job.customerConfirmedAt, approvalRequested: job.approvalRequested,
    adminApprovalNote: job.adminApprovalNote, adminApprovedAt: job.adminApprovedAt,
    createdBy: job.legacyCreatedByMongoId || job.createdById,
    printedBy: job.legacyPrintedByMongoId || job.printedById,
    ppsCompletedBy: job.legacyPpsCompletedByMongoId || job.ppsCompletedById,
    ppsCompletedAt: job.ppsCompletedAt,
    finishingCompletedBy: job.legacyFinishingCompletedByMongoId || job.finishingCompletedById,
    finishingCompletedAt: job.finishingCompletedAt,
    paymentHandledBy: job.legacyPaymentHandledByMongoId || job.paymentHandledById,
    dispatchedBy: job.legacyDispatchedByMongoId || job.dispatchedById,
    packedBy: job.legacyPackedByMongoId || job.packedById,
    createdById: job.createdById, printedById: job.printedById,
    ppsCompletedById: job.ppsCompletedById, finishingCompletedById: job.finishingCompletedById,
    paymentHandledById: job.paymentHandledById, dispatchedById: job.dispatchedById,
    packedById: job.packedById
  };
}

module.exports = {
  adaptJobCardToLegacyShape,
  adaptJobToLegacyShape
};
