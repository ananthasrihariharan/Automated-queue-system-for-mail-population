/**
 * UPS (Units Per Sheet) calculator — pure functions, no I/O.
 *
 * Implements the algorithm in upsCalculation.md:
 *   1. Printable area = sheet size − (2 × printableMargin)
 *   2. Compute UPS for the original orientation and the rotated (swapped) one
 *   3. Pick the orientation with the higher UPS
 *   4. Split the leftover space into equal margins
 *   5. Required sheets = ceil(quantity / UPS)
 *
 * Cut Type only controls the gap: "none" forces gap = 0; "single"/"double"
 * use the operator-entered cutGap. The gap sits between adjacent jobs, matching
 * the spec formula floor((printable + gap) / (job + gap)).
 */

export type CutType = 'none' | 'single' | 'double'

export interface UpsCalcInput {
  sheetWidth: number      // mm (from BoardSheet)
  sheetHeight: number     // mm (from BoardSheet)
  jobWidth: number        // mm (sizeW in the table)
  jobHeight: number       // mm (sizeH in the table)
  quantity: number        // sizeQty in the table
  cutType: CutType
  cutGap: number          // mm, operator input (ignored when cutType === 'none')
  printableMargin: number // mm per side
  bookletSide?: string    // 'left' | 'right' | 'top' | 'bottom'
}

export interface UpsCalcResult {
  printableWidth: number
  printableHeight: number
  orientation: 'original' | 'rotated'
  jobsAcross: number
  rows: number
  ups: number
  leftMargin: number
  rightMargin: number
  topMargin: number
  bottomMargin: number
  requiredSheets: number
}

const EMPTY_RESULT: UpsCalcResult = {
  printableWidth: 0,
  printableHeight: 0,
  orientation: 'original',
  jobsAcross: 0,
  rows: 0,
  ups: 0,
  leftMargin: 0,
  rightMargin: 0,
  topMargin: 0,
  bottomMargin: 0,
  requiredSheets: 0,
}

/** How many items of size `job` fit across `printable`, given an inter-item gap. */
function fitCount(printable: number, job: number, gap: number): number {
  if (job <= 0 || printable <= 0) return 0
  // n × job + (n − 1) × gap ≤ printable  ⇒  n ≤ (printable + gap) / (job + gap)
  const n = Math.floor((printable + gap) / (job + gap))
  return n > 0 ? n : 0
}

/** Compute the grid + even margins for one orientation. */
function layoutFor(
  printableWidth: number,
  printableHeight: number,
  jobWidth: number,
  jobHeight: number,
  gap: number,
) {
  const jobsAcross = fitCount(printableWidth, jobWidth, gap)
  const rows = fitCount(printableHeight, jobHeight, gap)
  const ups = jobsAcross * rows

  const usedWidth = jobsAcross > 0 ? jobWidth * jobsAcross + (jobsAcross - 1) * gap : 0
  const usedHeight = rows > 0 ? jobHeight * rows + (rows - 1) * gap : 0
  const remWidth = Math.max(0, printableWidth - usedWidth)
  const remHeight = Math.max(0, printableHeight - usedHeight)

  return {
    jobsAcross,
    rows,
    ups,
    leftMargin: remWidth / 2,
    rightMargin: remWidth / 2,
    topMargin: remHeight / 2,
    bottomMargin: remHeight / 2,
  }
}

export function calculateUps(input: UpsCalcInput): UpsCalcResult {
  const sheetWidth = Number(input.sheetWidth)
  const sheetHeight = Number(input.sheetHeight)
  const jobWidth = Number(input.jobWidth)
  const jobHeight = Number(input.jobHeight)
  const quantity = Number(input.quantity)
  const margin = Number(input.printableMargin) || 0
  const gap = input.cutType === 'none' ? 0 : (Number(input.cutGap) || 0)

  if (!isFinite(sheetWidth) || !isFinite(sheetHeight) || sheetWidth <= 0 || sheetHeight <= 0) return { ...EMPTY_RESULT }
  if (!isFinite(jobWidth) || !isFinite(jobHeight) || jobWidth <= 0 || jobHeight <= 0) return { ...EMPTY_RESULT }

  const printableWidth = Math.max(0, sheetWidth - 2 * margin)
  const printableHeight = Math.max(0, sheetHeight - 2 * margin)

  const original = layoutFor(printableWidth, printableHeight, jobWidth, jobHeight, gap)
  const rotated = layoutFor(printableWidth, printableHeight, jobHeight, jobWidth, gap)

  let originalValid = original.ups > 0
  let rotatedValid = rotated.ups > 0

  if (input.bookletSide) {
    const side = input.bookletSide.toLowerCase().trim()
    if (side === 'left' || side === 'right') {
      originalValid = original.jobsAcross > 0 && original.jobsAcross % 2 === 0
      rotatedValid = rotated.rows > 0 && rotated.rows % 2 === 0
    } else if (side === 'top' || side === 'bottom') {
      originalValid = original.rows > 0 && original.rows % 2 === 0
      rotatedValid = rotated.jobsAcross > 0 && rotated.jobsAcross % 2 === 0
    }
  }

  let useRotated = false
  let best = original

  if (originalValid && rotatedValid) {
    useRotated = rotated.ups > original.ups
    best = useRotated ? rotated : original
  } else if (rotatedValid) {
    useRotated = true
    best = rotated
  } else if (originalValid) {
    useRotated = false
    best = original
  } else {
    best = {
      jobsAcross: 0,
      rows: 0,
      ups: 0,
      leftMargin: 0,
      rightMargin: 0,
      topMargin: 0,
      bottomMargin: 0,
    }
  }

  const requiredSheets = best.ups > 0 && quantity > 0 ? Math.ceil(quantity / best.ups) : 0

  return {
    printableWidth,
    printableHeight,
    orientation: useRotated ? 'rotated' : 'original',
    jobsAcross: best.jobsAcross,
    rows: best.rows,
    ups: best.ups,
    leftMargin: best.leftMargin,
    rightMargin: best.rightMargin,
    topMargin: best.topMargin,
    bottomMargin: best.bottomMargin,
    requiredSheets,
  }
}
