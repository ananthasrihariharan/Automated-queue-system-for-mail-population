/**
 * Compute estimated production time in minutes for a single item
 * based on job card form data and configurable timings.
 */

export interface ProductionTimings {
  lamination: number
  binding: number
  perfectBinding: number
  caseBinding: number
  idCard: number
  foil: number
  dieCutting: number
  cutting: number
  creasing: number
  cornerCutting: number
  fusing: number
  holes: number
}

export const DEFAULT_TIMINGS: ProductionTimings = {
  lamination:     60,
  binding:        180,
  perfectBinding: 300,
  caseBinding:    120,    // 2 hours for case binding
  idCard:         300,
  foil:           1440,
  dieCutting:     60,
  cutting:        30,
  creasing:       30,
  cornerCutting:  30,
  fusing:         60,
  holes:          30,
}

/**
 * Lamination duration by quantity:
 * - qty <= 100: 1 hour
 * - qty > 100: +1 hour for each additional 100
 */
export function calculateLaminationDuration(laminationQty: number): number {
  const baseMinutes = 60

  if (!laminationQty || laminationQty <= 100) {
    return baseMinutes
  }

  const additionalHours = Math.floor((laminationQty - 1) / 100) * 60
  return baseMinutes + additionalHours
}

/**
 * Calculate creasing duration based on lamination quantity
 * Rule: If lamination qty > 100, add 1 hour (60 minutes) for each 100 qty
 * 
 * Examples:
 * - qty: 50   → 30 min (default)
 * - qty: 100  → 30 min (default)
 * - qty: 150  → 30 + 120 = 150 min (2h 30m)
 * - qty: 250  → 30 + 180 = 210 min (3h 30m)
 * - qty: 500  → 30 + 300 = 330 min (5h 30m)
 * 
 * @param {number} laminationQty - Total lamination quantity
 * @returns {number} - Creasing duration in minutes
 */
export function calculateCreasingDurationFE(laminationQty: number): number {
  const baseCreasingTime = DEFAULT_TIMINGS.creasing // 30 minutes
  
  if (!laminationQty || laminationQty <= 100) {
    return baseCreasingTime
  }
  
  // For qty > 100: add 60 minutes for each complete 100+ bucket
  // qty 101-200 = 1 extra hour, qty 201-300 = 2 extra hours, etc.
  const additionalHours = Math.floor((laminationQty - 1) / 100) * 60
  return baseCreasingTime + additionalHours
}

/**
 * Extract total lamination quantity from job card form data
 * @param {object} laminationObj - Job card lamination object
 * @returns {number} - Total lamination quantity
 */
export function getTotalLaminationQty(laminationObj: any): number {
  if (!laminationObj || typeof laminationObj !== 'object') {
    return 0
  }
  
  let total = 0
  const qtyFields = ['glossyQty', 'mattQty', 'velvetQty', 'otherQty']
  
  for (const field of qtyFields) {
    const qty = parseInt(laminationObj[field]) || 0
    total += qty
  }
  
  return total
}

/**
 * Given a JobItem's workflow fields (lamination, binding, etc.)
 * and a timings config, return total estimated minutes.
 */
export function estimateItemTime(item: {
  lamination?: string
  binding?: string
  dieCutting?: string
  cutting?: string
  creasing?: string
  cornerCutting?: string
  foil?: string
  idCard?: boolean
  fusing?: string
  holes?: string
  pouchLamination?: boolean
  laminationQty?: number
}, timings: ProductionTimings): number {
  let total = 0

  // ID Card flow
  if (item.idCard) {
    total += timings.idCard
    return total
  }

  // Lamination — qty-based: 1h up to 100, +1h per extra 100
  if (item.lamination && item.lamination !== 'NONE') {
    total += calculateLaminationDuration(item.laminationQty || 0)
  }

  // Foil
  if (item.foil && item.foil !== 'NONE') {
    total += timings.foil
  }

  // Binding — distinguish perfect binding and case binding
  if (item.binding && item.binding !== 'NONE') {
    if (item.binding === 'PERFECT_BIND') {
      total += timings.perfectBinding
    } else if (item.binding === 'CASE_BIND') {
      total += timings.caseBinding
    } else {
      total += timings.binding
    }
  }

  // Die Cutting
  if (item.dieCutting && item.dieCutting !== 'NONE') {
    total += timings.dieCutting
  }

  // Cutting
  if (item.cutting && item.cutting !== 'NONE') {
    total += timings.cutting
  }

  // Creasing — use dynamic calculation based on lamination qty
  if (item.creasing && item.creasing !== 'NONE') {
    const creasingDuration = calculateCreasingDurationFE(item.laminationQty || 0)
    total += creasingDuration
  }

  // Corner Cutting
  if (item.cornerCutting && item.cornerCutting !== 'NONE') {
    total += timings.cornerCutting
  }

  // Fusing
  if (item.fusing && item.fusing !== 'NONE') {
    total += timings.fusing
  }

  // Holes
  if (item.holes && item.holes !== 'NONE') {
    total += timings.holes
  }

  return total
}

/**
 * Calculate estimated time for a complete job card with all lamination quantities
 * @param {object} formData - Job card form data from useJobCardForm
 * @param {ProductionTimings} timings - Production timings configuration
 * @returns {number} - Total estimated time in minutes
 */
export function estimateJobCardTime(formData: any, timings: ProductionTimings): number {
  let total = 0

  // ID Card flow
  if (formData.idCard?.fusing) {
    total += timings.idCard
    return total
  }

  // Lamination — check processes.lamination flag to see if it's enabled
  let laminationQty = 0
  if (formData.processes?.lamination) {
    laminationQty = getTotalLaminationQty(formData.lamination)
    total += calculateLaminationDuration(laminationQty)
  }

  // Binding
  if (formData.binding && formData.processes?.binding) {
    if (formData.binding.perfect) {
      total += timings.perfectBinding
    } else if (formData.binding.caseBinding) {
      total += timings.caseBinding
    } else {
      total += timings.binding
    }
  }

  // Die Cutting
  if (formData.dieCutting && formData.processes?.dieCutting && formData.dieCutting.rows?.some((r: any) => r.sheets)) {
    total += timings.dieCutting
  }

  // Cutting
  if (formData.cutting && formData.processes?.cutting && formData.cutting.sizes?.some((s: any) => s)) {
    total += timings.cutting
  }

  // Corner Cutting
  if (formData.cornerCutting && formData.processes?.cornerCut && Object.values(formData.cornerCutting.corners || {}).some((v: any) => v)) {
    total += timings.cornerCutting
  }

  // Foil
  if (formData.foil && formData.processes?.foil) {
    total += timings.foil
  }

  // Fusing
  if (formData.idCard?.fusing) {
    total += timings.fusing
  }

  // Holes
  if (formData.idCard?.holes) {
    total += timings.holes
  }

  // CREASING — ALWAYS calculate based on lamination qty if lamination is enabled
  // This is automatic: creasing time depends on lamination quantities
  if (formData.processes?.lamination || laminationQty > 0) {
    const creasingDuration = calculateCreasingDurationFE(laminationQty)
    total += creasingDuration
  }

  return total
}

/** Format minutes as "30m", "1h 30m", "1d 2h", etc. */
export function formatMinutes(mins: number): string {
  if (mins <= 0) return '—'
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  return parts.join(' ') || '—'
}

/**
 * Estimated completion = now (or base time) + duration.
 * e.g. "Today, 4:30 pm" or "10 Jun, 2:15 pm"
 */
export function formatEstimatedCompletion(
  mins: number,
  fromDate: Date = new Date()
): string {
  if (mins <= 0) return '—'

  const completion = new Date(fromDate.getTime() + mins * 60_000)
  const timeStr = completion.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const startDay = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
  const endDay = new Date(completion.getFullYear(), completion.getMonth(), completion.getDate())
  const dayDiff = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000)

  if (dayDiff === 0) return `Today, ${timeStr}`
  if (dayDiff === 1) return `Tomorrow, ${timeStr}`

  const dateStr = completion.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
  return `${dateStr}, ${timeStr}`
}

/** Estimate display: current time + duration → ready-by datetime. */
export function formatEstimateLabel(mins: number, fromDate?: Date): string {
  return formatEstimatedCompletion(mins, fromDate)
}
