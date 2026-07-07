/** Map Job Card (PPA) → item workflow fields (mirrors utils/jobCardToPostPress.js) */

export interface PostPressFields {
  pouchLamination: boolean
  idCard: boolean
  lamination: string
  creasing: string
  binding: string
  dieCutting: string
  cornerCutting: string
  cutting: string
  cuttingValue: string
  cuttingSizes: string[]
  cornerCuttingValue: string
  cornerCuttingCorners: {
    tl: boolean
    tr: boolean
    bl: boolean
    br: boolean
  }
  laminationStatus: string
  creasingStatus: string
  bindingStatus: string
  dieCuttingStatus: string
  cornerCuttingStatus: string
  cuttingStatus: string
  fusing?: string
  fusingQty?: string
  holes?: string
  cutting2?: string
  cutting2Value?: string
  fusingStatus?: string
  holesStatus?: string
  cutting2Status?: string
  foil?: string
  foilQty?: string
  foilStatus?: string
  laminationQty?: number
  bindingQty?: number
  creasingQty?: number
  dieCuttingQty?: number
  cornerCuttingQty?: number
  idCardQty?: number
  idCardStatus?: string
}

function pickLamination(card: any): string {
  const lam = card.lamination || {}
  const proc = card.processes || {}
  if (!proc.lamination) return 'NONE'
  
  let type = ''
  let side = ''
  
  if (lam.glossy) {
    type = 'GLOSS'
    side = lam.glossySide ? String(lam.glossySide).toUpperCase() : ''
  } else if (lam.matt) {
    type = 'MATTE'
    side = lam.mattSide ? String(lam.mattSide).toUpperCase() : ''
  } else if (lam.velvet) {
    type = 'VELVET'
    side = lam.velvetSide ? String(lam.velvetSide).toUpperCase() : ''
  } else if (lam.other) {
    type = lam.otherType ? String(lam.otherType).trim().toUpperCase() : 'OTHER'
    side = lam.otherSide ? String(lam.otherSide).toUpperCase() : ''
  } else {
    return 'GLOSS'
  }
  
  if (side === 'SINGLE') {
    return `${type} (SINGLE SIDE)`
  } else if (side === 'DOUBLE') {
    return `${type} (DOUBLE SIDE)`
  }
  return type
}

function pickLaminationQty(card: any): number {
  const lam = card.lamination || {}
  const proc = card.processes || {}
  if (!proc.lamination) return 0
  
  let qtyVal = ''
  if (lam.glossy) qtyVal = lam.glossyQty
  else if (lam.matt) qtyVal = lam.mattQty
  else if (lam.velvet) qtyVal = lam.velvetQty
  else if (lam.other) qtyVal = lam.otherQty
  
  if (!qtyVal) return 0
  const n = parseInt(String(qtyVal).trim(), 10)
  return Number.isFinite(n) ? n : 0
}

function pickCreasing(card: any): string {
  const proc = card.processes || {}
  const crease = card.creasingPerforation || {}
  const hasCrease = proc.creasing || crease.creasing
  const hasPerf = crease.perforation
  const hasWheel = crease.wheelPerforation
  if (hasCrease && (hasPerf || hasWheel)) return 'CREASE_PERF'
  if (hasCrease) return 'CREASE'
  if (hasWheel) return 'WHEEL_PERF'
  if (hasPerf) return 'PERFORATION'
  return 'NONE'
}

function pickBinding(card: any): string {
  const b = card.binding || {}
  if (b.pouchLamination) return 'POUCH_LAMINATION'
  if (b.perfect) return 'PERFECT_BIND'
  if (b.wiroBinding) return 'SPIRAL_BIND'
  if (b.centerPin) return 'CENTER_PIN'
  if (b.caseBinding) return 'CASE_BIND'
  if (b.special) return 'HALF_FOLD'
  return 'NONE'
}

function pickCutting(card: any): string {
  const proc = card.processes || {}
  // NOTE: do NOT auto-set cutting for dieCutting or cornerCutting — user must explicitly enable cutting
  if (proc.cutting || (card.cutting && card.cutting.noOfCutting)) return 'TRIM'
  return 'NONE'
}

function pickCuttingValue(card: any): string {
  const value = card?.cutting?.noOfCutting
  return value ? String(value).trim() : ''
}

function pickCuttingSizes(card: any): string[] {
  const sizes = card?.cutting?.sizes
  if (!Array.isArray(sizes)) return []
  return sizes.filter((s: any) => s && String(s).trim() && String(s).trim() !== '*')
}

function pickDieCutting(card: any): string {
  const proc = card.processes || {}
  const die = card.dieCutting || {}
  if (!proc.dieCutting) return 'NONE'
  const rows = die.rows || []
  const hasHalf = rows.some((r: any) => r.halfCut && String(r.halfCut).trim())
  return hasHalf ? 'HALF_CUT' : 'FULL_CUT'
}

function pickCornerCutting(card: any): string {
  const proc = card.processes || {}
  const corner = card.cornerCutting || {}
  if (proc.cornerCut || (corner.corners && Object.values(corner.corners).some(Boolean))) {
    return 'CORNER_CUT'
  }
  return 'NONE'
}

function pickCornerCuttingValue(card: any): string {
  const value = card?.cornerCutting?.noOfCards
  return value ? String(value).trim() : ''
}

function pickCornerCuttingCorners(card: any): { tl: boolean; tr: boolean; bl: boolean; br: boolean } {
  const corners = card?.cornerCutting?.corners || {}
  return {
    tl: !!corners.tl,
    tr: !!corners.tr,
    bl: !!corners.bl,
    br: !!corners.br
  }
}

// const FOIL_TYPE_TO_CODE: Record<string, string> = {
//   'Single Side UV':                         'SS_UV',
//   'Single Side Gold Foil':                  'SS_GOLD',
//   'Single Side UV & S/S Gold Foil':         'SS_UV_SS_GOLD',
//   'D/S print + S/S UV':                     'DS_SS_UV',
//   'D/S print + D/S UV':                     'DS_DS_UV',
//   'D/S print + S/S Gold Foil':              'DS_SS_GOLD',
//   'D/S print + D/S Gold Foil':              'DS_DS_GOLD',
//   'D/S print + S/S UV & S/S Gold Foil':     'DS_SS_UV_SS_GOLD',
//   'D/S print + D/S UV & D/S Gold Foil':     'DS_DS_UV_DS_GOLD',
//   'D/S print + D/S UV & S/S Gold Foil':     'DS_DS_UV_SS_GOLD',
//   'D/S print + D/S Gold Foil & S/S UV':     'DS_DS_GOLD_SS_UV',
// }

function pickFoil(card: any): string {
  const proc = card.processes || {}
  const foilType = card?.foil?.type || ''
  if (!proc.foil && !foilType) return 'NONE'
  // Store full label directly — e.g. "Single Side UV"
  return foilType || 'NONE'
}

function pickFoilQty(card: any): string {
  const proc = card.processes || {}
  const foilType = card?.foil?.type || ''
  if (!proc.foil && !foilType) return ''
  return card?.foil?.qty ? String(card.foil.qty).trim() : ''
}

function pickBindingQty(card: any): number {
  const b = card?.binding
  if (!b) return 0
  if (b.noOfBooks && parseInt(b.noOfBooks, 10)) {
    return parseInt(b.noOfBooks, 10)
  }
  const qtyFields = ['centerPinQty', 'perfectQty', 'caseBindingQty', 'wiroBindingQty', 'pouchLaminationQty', 'specialQty']
  return qtyFields.reduce((sum, field) => sum + (parseInt(b[field], 10) || 0), 0)
}

function pickCreasingQty(card: any): number {
  const cp = card?.creasingPerforation
  if (!cp) return 0
  return parseInt(cp.noOfSheets, 10) || 0
}

function pickDieCuttingQty(card: any): number {
  const dc = card?.dieCutting
  if (!dc) return 0
  return parseInt(dc.noOfSheets, 10) || 0
}

function pickCornerCuttingQty(card: any): number {
  const cc = card?.cornerCutting
  if (!cc) return 0
  return parseInt(cc.noOfCards, 10) || 0
}

function pickIdCardQty(card: any): number {
  const id = card?.idCard
  if (!id) return 0
  return parseInt(id.fusingQty, 10) || 0
}

function statusForChoice(choice: string): string {
  return choice === 'NONE' ? 'NONE' : 'PENDING'
}

export function jobCardToPostPressFields(card: any): PostPressFields {
  const isIdCard = !!card?.processes?.idCard
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
      pouchLamination: false,
      idCard: true,
      idCardQty: pickIdCardQty(card),
      idCardStatus: statusForChoice(isIdCard ? 'YES' : 'NONE'),
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
      fusing,
      fusingQty,
      holes,
      cutting2,
      cutting2Value,
      laminationStatus: 'NONE',
      creasingStatus: 'NONE',
      bindingStatus: 'NONE',
      dieCuttingStatus: 'NONE',
      cornerCuttingStatus: statusForChoice(cornerCutting),
      cuttingStatus: statusForChoice(cutting),
      fusingStatus: statusForChoice(fusing),
      holesStatus: statusForChoice(holes),
      cutting2Status: statusForChoice(cutting2),
      foil: 'NONE',
      foilQty: '',
      foilStatus: 'NONE'
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
  const creasingQty = pickCreasingQty(card)
  const dieCuttingQty = pickDieCuttingQty(card)
  const cornerCuttingQty = pickCornerCuttingQty(card)

  return {
    pouchLamination,
    idCard: false,
    idCardQty: 0,
    idCardStatus: 'NONE',
    lamination,
    laminationQty,
    creasing,
    creasingQty,
    binding,
    bindingQty,
    dieCutting,
    dieCuttingQty,
    cornerCutting,
    cornerCuttingQty,
    cutting,
    cuttingValue,
    cuttingSizes,
    cornerCuttingValue,
    cornerCuttingCorners,
    fusing: 'NONE',
    fusingQty: '',
    holes: 'NONE',
    cutting2: 'NONE',
    cutting2Value: '',
    foil,
    foilQty,
    laminationStatus: statusForChoice(lamination),
    creasingStatus: statusForChoice(creasing),
    bindingStatus: statusForChoice(binding),
    dieCuttingStatus: statusForChoice(dieCutting),
    cornerCuttingStatus: statusForChoice(cornerCutting),
    cuttingStatus: statusForChoice(cutting),
    fusingStatus: 'NONE',
    holesStatus: 'NONE',
    cutting2Status: 'NONE',
    foilStatus: statusForChoice(foil)
  }
}

