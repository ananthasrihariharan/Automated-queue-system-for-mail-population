/**
 * Map Job Card (PPA) -> Job item workflow fields.
 * Die cut order: lamination -> cutting -> creasing -> die cutting -> dispatch
 * Corner cut order: lamination -> cutting -> binding -> corner cutting -> dispatch
 *
 * NOTE: pouchLamination is a BINDING type.
 * It maps to binding=POUCH_LAMINATION and lamination=NONE.
 */

function pickLamination(card) {
  const lam = card.lamination || {}
  const proc = card.processes || {}
  if (!proc.lamination) return 'NONE'

  const processRegistry = require('../services/processRegistry')
  const reg = processRegistry.getMergedRegistry() || {}
  const taskBasis = reg.taskBasis || {}

  const customLams = Object.keys(taskBasis).filter(k => taskBasis[k] === 'lamination')
  const defaultLams = ['glossy', 'matt', 'velvet']
  const allLams = [...defaultLams, ...customLams]

  const activeKey = allLams.find(k => lam[k])
  if (!activeKey) {
    if (lam.other) {
      const type = lam.otherType ? String(lam.otherType).trim().toUpperCase() : 'OTHER'
      const side = lam.otherSide ? String(lam.otherSide).toUpperCase() : ''
      if (side === 'SINGLE') return `${type} (SINGLE SIDE)`
      if (side === 'DOUBLE') return `${type} (DOUBLE SIDE)`
      return type
    }
    return 'NONE'
  }

  const type = activeKey === 'glossy' ? 'GLOSS' : activeKey.toUpperCase()
  const sideKey = `${activeKey}Side`
  const side = lam[sideKey] ? String(lam[sideKey]).toUpperCase() : ''

  if (side === 'SINGLE') return `${type} (SINGLE SIDE)`
  if (side === 'DOUBLE') return `${type} (DOUBLE SIDE)`
  return type
}

function pickCreasing(card) {
  const crease = card.creasingPerforation || {}
  // Rely on actual checkbox state -- typing NO OF SHEETS alone should not create a creasing task
  if (crease.creasing && (crease.perforation || crease.wheelPerforation)) return 'CREASE_PERF'
  if (crease.creasing) return 'CREASE'
  if (crease.wheelPerforation) return 'WHEEL_PERF'
  if (crease.perforation) return 'PERFORATION'

  const processRegistry = require('../services/processRegistry')
  const reg = processRegistry.getMergedRegistry() || {}
  const taskBasis = reg.taskBasis || {}

  const customCreases = Object.keys(taskBasis).filter(k => taskBasis[k] === 'creasing')
  const activeKey = customCreases.find(k => crease[k])
  if (activeKey) {
    return activeKey.toUpperCase()
  }

  return 'NONE'
}

function pickBinding(card) {
  const b = card.binding || {}
  if (b.pouchLamination) return 'POUCH_LAMINATION'
  if (b.perfect) return 'PERFECT_BIND'
  if (b.wiroBinding) return 'SPIRAL_BIND'
  if (b.centerPin) return 'CENTER_PIN'
  if (b.caseBinding) return 'CASE_BIND'
  if (b.special) return 'HALF_FOLD'

  const processRegistry = require('../services/processRegistry')
  const reg = processRegistry.getMergedRegistry() || {}
  const taskBasis = reg.taskBasis || {}

  const customBindings = Object.keys(taskBasis).filter(k => taskBasis[k] === 'binding')
  const activeKey = customBindings.find(k => b[k])
  if (activeKey) {
    return activeKey.toUpperCase()
  }

  return 'NONE'
}

function pickCutting(card) {
  const proc = card.processes || {}
  if (!proc.cutting) return 'NONE'
  const sizes = card?.cutting?.sizes || []
  const hasSize = sizes.some(s => s && String(s).trim() && String(s).trim() !== '*')
  // Only assign cutting if the user actually entered a cut size
  if (!hasSize) return 'NONE'
  return 'TRIM'
}

function pickCuttingValue(card) {
  const value = card?.cutting?.noOfCutting
  return value ? String(value).trim() : ''
}

function pickCuttingSizes(card) {
  const sizes = card?.cutting?.sizes
  if (!Array.isArray(sizes)) return []
  return sizes.filter((s) => s && String(s).trim() && String(s).trim() !== '*')
}

function pickDieCutting(card) {
  const proc = card.processes || {}
  const die = card.dieCutting || {}
  if (!proc.dieCutting) return 'NONE'
  const rows = die.rows || []

  // Check custom die cutting steps first
  const processRegistry = require('../services/processRegistry')
  const reg = processRegistry.getMergedRegistry() || {}
  const taskBasis = reg.taskBasis || {}
  const customDieCuts = Object.keys(taskBasis).filter(k => taskBasis[k] === 'dieCutting')

  for (let i = 0; i < customDieCuts.length; i++) {
    const row = rows[1 + i]
    if (row && (row.sheets || row.halfCut || row.timing)) {
      return customDieCuts[i].toUpperCase()
    }
  }

  const hasHalf = rows[0] && rows[0].halfCut && String(rows[0].halfCut).trim()
  const hasCut = rows[0] && (
    (rows[0].halfCut && String(rows[0].halfCut).trim()) ||
    (rows[0].throughCut && String(rows[0].throughCut).trim())
  )
  if (!hasCut) return 'NONE'
  return hasHalf ? 'HALF_CUT' : 'FULL_CUT'
}

function pickCornerCutting(card) {
  const proc = card.processes || {}
  const corner = card.cornerCutting || {}
  if (proc.cornerCut || (corner.corners && Object.values(corner.corners).some(Boolean))) {
    return 'CORNER_CUT'
  }
  return 'NONE'
}

function pickCornerCuttingValue(card) {
  const value = card?.cornerCutting?.noOfCards
  return value ? String(value).trim() : ''
}

function pickCornerCuttingCorners(card) {
  const corners = card?.cornerCutting?.corners || {}
  return {
    tl: !!corners.tl,
    tr: !!corners.tr,
    bl: !!corners.bl,
    br: !!corners.br
  }
}

function statusForChoice(choice) {
  return choice === 'NONE' ? 'NONE' : 'PENDING'
}

const FOIL_LABEL_TO_CODE = {
  'Single Side UV':                         'SS_UV',
  'Single Side Gold Foil':                  'SS_GOLD',
  'Single Side UV & S/S Gold Foil':         'SS_UV_SS_GOLD',
  'D/S print + S/S UV':                     'DS_SS_UV',
  'D/S print + D/S UV':                     'DS_DS_UV',
  'D/S print + S/S Gold Foil':              'DS_SS_GOLD',
  'D/S print + D/S Gold Foil':              'DS_DS_GOLD',
  'D/S print + S/S UV & S/S Gold Foil':     'DS_SS_UV_SS_GOLD',
  'D/S print + D/S UV & D/S Gold Foil':     'DS_DS_UV_DS_GOLD',
  'D/S print + D/S UV & S/S Gold Foil':     'DS_DS_UV_SS_GOLD',
  'D/S print + D/S Gold Foil & S/S UV':     'DS_DS_GOLD_SS_UV',
}

function pickFoil(card) {
  const proc = card.processes || {}
  const foilType = card?.foil?.type || ''
  // Accept foil if processes.foil is true OR if a foil type is explicitly set
  if (!proc.foil && !foilType) return 'NONE'
  // Store the full label directly in the DB
  return foilType || 'NONE'
}

function pickLaminationQty(card) {
  const lam = card?.lamination
  if (!lam || typeof lam !== 'object') return 0
  const qtyFields = ['glossyQty', 'mattQty', 'velvetQty', 'otherQty']
  return qtyFields.reduce((sum, field) => sum + (parseInt(lam[field], 10) || 0), 0)
}

function pickFoilQty(card) {
  const proc = card.processes || {}
  const foilType = card?.foil?.type || ''
  if (!proc.foil && !foilType) return ''
  return card?.foil?.qty ? String(card.foil.qty).trim() : ''
}

function pickBindingQty(card) {
  const b = card?.binding
  if (!b) return 0
  if (b.noOfBooks && parseInt(b.noOfBooks, 10)) {
    return parseInt(b.noOfBooks, 10)
  }
  const qtyFields = ['centerPinQty', 'perfectQty', 'caseBindingQty', 'wiroBindingQty', 'pouchLaminationQty', 'specialQty']
  return qtyFields.reduce((sum, field) => sum + (parseInt(b[field], 10) || 0), 0)
}

function pickBindingNo(card) {
  const b = card?.binding
  if (!b) return ''
  if (b.centerPin && b.centerPinQty) return String(b.centerPinQty).trim()
  if (b.perfect && b.perfectQty) return String(b.perfectQty).trim()
  if (b.caseBinding && b.caseBindingQty) return String(b.caseBindingQty).trim()
  if (b.wiroBinding && b.wiroBindingQty) return String(b.wiroBindingQty).trim()
  if (b.pouchLamination && b.pouchLaminationQty) return String(b.pouchLaminationQty).trim()
  if (b.special && b.specialQty) return String(b.specialQty).trim()
  return ''
}

function pickCreasingQty(card) {
  const cp = card?.creasingPerforation
  if (!cp) return 0
  return parseInt(cp.noOfSheets, 10) || 0
}

function pickCreasingNo(card) {
  const cp = card?.creasingPerforation
  if (!cp) return ''
  // Return the most relevant NO value based on what's checked:
  // creasing checked -> creasingNo, perforation -> perforationNo, wheel perf -> wheelPerforationNo
  // If multiple are checked, prefer creasingNo -> perforationNo -> wheelPerforationNo
  if (cp.creasing && cp.creasingNo && String(cp.creasingNo).trim()) return String(cp.creasingNo).trim()
  if (cp.perforation && cp.perforationNo && String(cp.perforationNo).trim()) return String(cp.perforationNo).trim()
  if (cp.wheelPerforation && cp.wheelPerforationNo && String(cp.wheelPerforationNo).trim()) return String(cp.wheelPerforationNo).trim()
  // Fallback: return whichever has a value
  if (cp.creasingNo && String(cp.creasingNo).trim()) return String(cp.creasingNo).trim()
  if (cp.perforationNo && String(cp.perforationNo).trim()) return String(cp.perforationNo).trim()
  if (cp.wheelPerforationNo && String(cp.wheelPerforationNo).trim()) return String(cp.wheelPerforationNo).trim()
  return ''
}

function pickDieCuttingQty(card) {
  const dc = card?.dieCutting
  if (!dc) return 0
  return parseInt(dc.noOfSheets, 10) || 0
}

function pickCornerCuttingQty(card) {
  const cc = card?.cornerCutting
  if (!cc) return 0
  return parseInt(cc.noOfCards, 10) || 0
}

function pickIdCardQty(card) {
  const id = card?.idCard
  if (!id) return 0
  return parseInt(id.fusingQty, 10) || 0
}

function statusForMappedChoice(choice, existingStatus, fallbackStatus) {
  if (choice === 'NONE') return 'NONE'
  if (existingStatus === 'COMPLETED' || fallbackStatus === 'COMPLETED') return 'COMPLETED'
  return 'PENDING'
}

function mergeJobCardIntoItem(item, card) {
  const base = item && typeof item.toObject === 'function' ? item.toObject() : { ...(item || {}) }

  const isIdCard = !!(card?.processes?.idCard)
  if (isIdCard) {
    const cutting = pickCutting(card)
    const cuttingValue = pickCutting(card) === 'TRIM' ? 'straight cutting' : ''
    const cuttingSizes = pickCuttingSizes(card)

    const rawFusing = card?.idCard?.fusingType || 'GLOSSY'
    const fusing = card?.idCard?.fusing ? rawFusing.toUpperCase().replace(/ /g, '_') : 'NONE'
    const fusingQty = card?.idCard?.fusing ? String(card?.idCard?.fusingQty || '') : ''

    const cutting2 = pickCutting(card)
    const cutting2Value = pickCutting(card) === 'TRIM' ? pickCuttingValue(card) : ''

    const cornerCutting = pickCornerCutting(card)
    const cornerCuttingValue = pickCornerCuttingValue(card)
    const cornerCuttingCorners = pickCornerCuttingCorners(card)
    const holes = card?.idCard?.holes ? 'SQUARE' : 'NONE'

    return {
      ...base,
      idCard: true,
      idCardQty: pickIdCardQty(card),
      idCardStatus: statusForMappedChoice('YES', base.idCardStatus),
      lamination: 'NONE',
      laminationQty: 0,
      creasing: 'NONE',
      creasingQty: 0,
      binding: 'NONE',
      bindingQty: 0,
      dieCutting: 'NONE',
      dieCuttingQty: 0,
      cornerCutting,
      cornerCuttingQty: pickCornerCuttingQty(card),
      cutting,
      cuttingValue,
      cuttingSizes,
      cornerCuttingValue,
      cornerCuttingCorners,
      cutting2,
      cutting2Value,
      fusing,
      fusingQty,
      holes,
      pouchLamination: false,
      laminationStatus: 'NONE',
      creasingStatus: 'NONE',
      bindingStatus: 'NONE',
      dieCuttingStatus: 'NONE',
      foil: 'NONE',
      foilQty: '',
      foilStatus: 'NONE',
      cuttingStatus: statusForMappedChoice(cutting, base.cuttingStatus),
      fusingStatus: statusForMappedChoice(fusing, base.fusingStatus),
      cutting2Status: statusForMappedChoice(cutting2, base.cutting2Status),
      cornerCuttingStatus: statusForMappedChoice(cornerCutting, base.cornerCuttingStatus),
      holesStatus: statusForMappedChoice(holes, base.holesStatus)
    }
  }

  const lamination = pickLamination(card)
  const creasing = pickCreasing(card)
  const binding = pickBinding(card)
  const dieCutting = pickDieCutting(card)
  const cornerCutting = pickCornerCutting(card)
  const cutting = pickCutting(card)
  const cuttingValue = pickCuttingValue(card)
  const cuttingSizes = pickCuttingSizes(card)
  const cornerCuttingValue = pickCornerCuttingValue(card)
  const cornerCuttingCorners = pickCornerCuttingCorners(card)
  const pouchLamination = !!card?.binding?.pouchLamination
  const foil = pickFoil(card)
  const foilQty = pickFoilQty(card)
  const laminationQty = pickLaminationQty(card)
  const bindingQty = pickBindingQty(card)
  const bindingNo = pickBindingNo(card)
  const creasingQty = pickCreasingQty(card)
  const creasingNo = pickCreasingNo(card)
  const dieCuttingQty = pickDieCuttingQty(card)
  const cornerCuttingQty = pickCornerCuttingQty(card)

  return {
    ...base,
    idCard: false,
    idCardQty: 0,
    idCardStatus: 'NONE',
    lamination,
    laminationQty,
    creasing,
    creasingQty,
    creasingNo,
    binding,
    bindingQty,
    bindingNo,
    dieCutting,
    dieCuttingQty,
    cornerCutting,
    cornerCuttingQty,
    cutting,
    cuttingValue,
    cuttingSizes,
    cornerCuttingValue,
    cornerCuttingCorners,
    pouchLamination,
    foil,
    foilQty,
    fusing: 'NONE',
    fusingQty: '',
    holes: 'NONE',
    cutting2: 'NONE',
    cutting2Value: '',
    laminationStatus: statusForMappedChoice(lamination, base.laminationStatus),
    creasingStatus: statusForMappedChoice(creasing, base.creasingStatus),
    bindingStatus: statusForMappedChoice(
      binding,
      base.bindingStatus,
      pouchLamination ? base.laminationStatus : undefined
    ),
    dieCuttingStatus: statusForMappedChoice(dieCutting, base.dieCuttingStatus),
    cornerCuttingStatus: statusForMappedChoice(cornerCutting, base.cornerCuttingStatus),
    cuttingStatus: statusForMappedChoice(cutting, base.cuttingStatus),
    foilStatus: statusForMappedChoice(foil, base.foilStatus),
    fusingStatus: 'NONE',
    holesStatus: 'NONE',
    cutting2Status: 'NONE'
  }
}

function getBaseJobId(jobId) {
  if (!jobId) return ''
  const m = String(jobId).match(/^(.+)-(\d{6})$/)
  return m ? m[1] : String(jobId)
}

function jobCardLookupIds(jobId, itemIndex) {
  const base = getBaseJobId(jobId)
  if (base !== jobId) {
    // If the jobId has a date suffix, only look up the specific date-suffixed card
    return [`${jobId}_${itemIndex}`]
  }
  return [`${base}_${itemIndex}`]
}

module.exports = {
  pickLamination,
  pickCreasing,
  pickBinding,
  pickDieCutting,
  pickCornerCutting,
  pickCornerCuttingValue,
  pickCornerCuttingCorners,
  pickCutting,
  pickCuttingValue,
  pickCuttingSizes,
  pickFoil,
  pickFoilQty,
  pickBindingNo,
  pickCreasingNo,
  mergeJobCardIntoItem,
  getBaseJobId,
  jobCardLookupIds,
  statusForChoice
}

