/**
 * Production Timings Utility
 * Handles calculation of task durations based on job specifications
 */

const DEFAULT_TIMINGS = {
  lamination:     60,   // 1 hour
  binding:        180,  // 3 hours
  perfectBinding: 300,  // 5 hours
  caseBinding:    120,  // 2 hours
  idCard:         300,  // 5 hours
  foil:           1440, // 1 day
  dieCutting:     60,   // 1 hour
  cutting:        30,   // 30 minutes
  creasing:       30,   // 30 minutes
  cornerCutting:  30,
  fusing:         60,
  holes:          30,
}

/**
 * Lamination duration by quantity:
 * - qty <= 100: 1 hour
 * - qty > 100: +1 hour for each additional 100
 */
function calculateLaminationDuration(laminationQty) {
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
 * - qty: 50   â†’ 30 min (default)
 * - qty: 100  â†’ 30 min (default)
 * - qty: 150  â†’ 30 + 120 = 150 min (ceil(150/100) * 60 = 2 hours)
 * - qty: 250  â†’ 30 + 180 = 210 min (ceil(250/100) * 60 = 3 hours)
 * - qty: 500  â†’ 30 + 300 = 330 min (ceil(500/100) * 60 = 5 hours)
 * 
 * @param {number} laminationQty - Total lamination quantity
 * @returns {number} - Creasing duration in minutes
 */
function calculateCreasingDuration(laminationQty) {
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
 * Get total lamination quantity from a job's lamination details
 * Sums up all lamination types (glossy, matt, velvet, other)
 * 
 * @param {object} laminationObj - Job's lamination object containing quantities
 * @returns {number} - Total lamination quantity
 */
function getTotalLaminationQty(laminationObj) {
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
 * Get task duration with any quantity-based adjustments
 * 
 * @param {string} taskType - Type of task (e.g., 'creasing', 'lamination', etc.)
 * @param {object} jobData - Job object containing task specifications
 * @param {object} timingsOverride - Optional custom timings to use instead of defaults
 * @returns {number} - Task duration in minutes
 */
function getTaskDuration(taskType, jobData, timingsOverride = {}) {
  const timings = { ...DEFAULT_TIMINGS, ...timingsOverride }
  
  if (taskType === 'lamination' && jobData.lamination) {
    const laminationQty = getTotalLaminationQty(jobData.lamination)
    return calculateLaminationDuration(laminationQty)
  }

  // Special handling for creasing based on lamination qty
  if (taskType === 'creasing' && jobData.lamination) {
    const laminationQty = getTotalLaminationQty(jobData.lamination)
    return calculateCreasingDuration(laminationQty)
  }
  
  return timings[taskType] || 0
}

module.exports = {
  DEFAULT_TIMINGS,
  calculateLaminationDuration,
  calculateCreasingDuration,
  getTotalLaminationQty,
  getTaskDuration
}

