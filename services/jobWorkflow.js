const { jobRepo } = require('../repositories')
const { userRepo } = require('../repositories')
const { applyJobCardsToItems } = require('../utils/applyJobCardsToItems')
const processRegistry = require('./processRegistry')

function populateCreatedBy(query) {
  return query.populate('createdBy', 'name')
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ACTIVE STAGE COMPUTATION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function hasTask(val) { return val && val !== 'NONE' }

// isDone: returns true if the task is not required OR is already completed
function isDone(taskVal, statusVal) {
  if (!taskVal || taskVal === 'NONE') return true   // task not required
  return statusVal === 'COMPLETED'                  // task required â€” only done if COMPLETED
}

/**
 * Compute the single next active stage for one item.
 * Flows:
 *   Normal binding:  lamination â†’ creasing â†’ binding â†’ cutting â†’ done
 *   Pouch lam:       cutting â†’ binding â†’ done
 *   Corner cut:      lamination â†’ cutting â†’ binding â†’ cornerCutting â†’ done
 *   Die cut:         lamination â†’ cutting â†’ creasing â†’ dieCutting â†’ done
 *   Creasing-only:   lamination â†’ cutting â†’ creasing â†’ done
 */


const STAGE_ALIASES = {
  'SPIRAL_BIND': ['Wiro', 'Wiro Binding', 'Spiral', 'Spiral Bind'],
  'WIRO_BINDING': ['Wiro', 'Wiro Binding', 'Spiral', 'Spiral Bind'],
  'PERFECT_BIND': ['Perfect', 'Perfect Binding'],
  'PERFECT': ['Perfect', 'Perfect Binding'],
  'CENTER_PIN': ['Center Pin'],
  'CENTRE_PIN': ['Center Pin'],
  'POUCH_LAMINATION': ['Pouch', 'Pouch Lamination'],
  'SADDLE_STITCH': ['Center Pin']
}

function getStageCandidates(stage, val, item) {
  if (!val || val === 'NONE') {
    if (stage === 'binding' && item.pouchLamination === true) {
      return ['Pouch', 'Pouch Lamination', 'POUCH_LAMINATION']
    }
    return []
  }

  const candidates = []

  if (typeof val === 'boolean') {
    if (val === true) {
      candidates.push(stage)
      const friendlyStage = stage.replace(/([A-Z])/g, ' $1').trim().toLowerCase()
      candidates.push(friendlyStage)
    }
  } else if (typeof val === 'string') {
    candidates.push(val)
    const cleanVal = val.includes('(') ? val.substring(0, val.indexOf('(')).trim() : val
    candidates.push(cleanVal)
    
    const words = cleanVal.replace(/_/g, ' ').toLowerCase().split(' ')
    const friendlyVal = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    candidates.push(friendlyVal)

    const friendlyStage = stage.replace(/([A-Z])/g, ' $1').trim()
    const capitalizedStage = friendlyStage.charAt(0).toUpperCase() + friendlyStage.slice(1)
    candidates.push(stage, friendlyStage, capitalizedStage, `${capitalizedStage} Flow`)
    if (stage === 'lamination') {
      candidates.push('Laminated')
    }

    const aliases = STAGE_ALIASES[val]
    if (aliases) {
      candidates.push(...aliases)
    }
  }

  return [...new Set(candidates)]
}

/**
 * Auto-resolves the active named workflow variant based on the specifications
 * checked inside the Job Card.
 * @param {object} item 
 * @param {object} productFlows 
 * @returns {string} active flow name
 */
function resolveFlowVariant(item, productFlows) {
  if (!productFlows || typeof productFlows !== 'object') return 'Default'

  const fields = [
    'binding',
    'lamination',
    'creasing',
    'dieCutting',
    'cornerCutting',
    'foil',
    'fusing',
    'holes',
    'cutting',
    'cutting2'
  ]

  const keys = Object.keys(productFlows)
  for (const field of fields) {
    const val = item[field]
    const candidates = getStageCandidates(field, val, item)
    if (candidates.length > 0) {
      for (const candidate of candidates) {
        const matchedKey = keys.find(k => k.toLowerCase() === candidate.toLowerCase())
        if (matchedKey) return matchedKey
      }
    }
  }

  return 'Default'
}

function computeItemActiveStage(item, job) {
  // Press is always the first stage for every item
  // Consider press done if: explicitly COMPLETED, printConfirmed=true, or job is already past press
  const pressComplete = item.pressStatus === 'COMPLETED' ||
    item.printConfirmed === true ||
    (job && ['PRINTED', 'PACKED', 'DISPATCHED', 'RECEIVED'].includes(job.jobStatus))
  if (!pressComplete) return 'press'

  // Dynamic Product-Based Flow Engine:
  // If the product type has an admin-defined sequence, follow it!
  try {
    const registry = processRegistry.getMergedRegistry()
    const productFlows = registry.productSequences && registry.productSequences[item.type]
    if (productFlows && typeof productFlows === 'object') {
      const activeFlowName = resolveFlowVariant(item, productFlows)
      const sequence = productFlows[activeFlowName] || productFlows['Default']
      if (sequence && sequence.length > 0) {
        for (const stage of sequence) {
          const required = (stage === 'binding' && item.pouchLamination === true) || hasTask(item[stage])
          if (required) {
            const done = (stage === 'binding' && item.pouchLamination === true)
              ? item.bindingStatus === 'COMPLETED'
              : isDone(item[stage], item[`${stage}Status`])
            if (!done) return stage
          }
        }
        return 'done'
      }
    }
  } catch (err) {
    console.error('[computeItemActiveStage Product Flow Error]:', err)
  }


  const isIdCard     = item.idCard === true
  const isPouchLam   = item.pouchLamination === true
  const hasLam       = hasTask(item.lamination)
  const hasCreasing  = hasTask(item.creasing)
  const hasBinding   = hasTask(item.binding)
  const hasCutting   = hasTask(item.cutting)
  const hasDieCut    = hasTask(item.dieCutting)
  const hasCornerCut = hasTask(item.cornerCutting)
  const hasFusing    = hasTask(item.fusing)
  const hasFoil      = hasTask(item.foil)
  const hasCutting2  = hasTask(item.cutting2)
  const hasHoles     = hasTask(item.holes)

  const lamDone       = isDone(item.lamination,    item.laminationStatus)
  const creasingDone  = isDone(item.creasing,      item.creasingStatus)
  const bindingDone   = isDone(item.binding,       item.bindingStatus)
  const cuttingDone   = isDone(item.cutting,       item.cuttingStatus)
  const dieCutDone    = isDone(item.dieCutting,    item.dieCuttingStatus)
  const cornerCutDone = isDone(item.cornerCutting, item.cornerCuttingStatus)
  const fusingDone    = isDone(item.fusing,        item.fusingStatus)
  const foilDone      = isDone(item.foil,          item.foilStatus)
  const cutting2Done  = isDone(item.cutting2,      item.cutting2Status)
  const holesDone     = isDone(item.holes,         item.holesStatus)

  // ID Card flow: cutting â†’ fusing â†’ cutting2 â†’ cornerCutting â†’ holes â†’ done
  if (isIdCard) {
    if (hasCutting   && !cuttingDone)   return 'cutting'
    if (hasFusing    && !fusingDone)    return 'fusing'
    if (hasCutting2  && !cutting2Done)  return 'cutting2'
    if (hasCornerCut && !cornerCutDone) return 'cornerCutting'
    if (hasHoles     && !holesDone)     return 'holes'
    return 'done'
  }
  
  // Pouch lam: cutting â†’ binding â†’ done
  if (isPouchLam) {
    if (hasCutting && !cuttingDone)  return 'cutting'
    if (hasBinding && !bindingDone)  return 'binding'
    return 'done'
  }

  // Foil flows â€” foil inserts after lamination, before binding/cutting
  if (hasFoil) {
    // With binding: lamination â†’ foil â†’ binding â†’ cutting â†’ cornerCutting â†’ done
    if (hasBinding) {
      if (hasLam       && !lamDone)       return 'lamination'
      if (hasFoil      && !foilDone)      return 'foil'
      if (hasBinding   && !bindingDone)   return 'binding'
      if (hasCutting   && !cuttingDone)   return 'cutting'
      if (hasCornerCut && !cornerCutDone) return 'cornerCutting'
      return 'done'
    }
    // Without binding: lamination â†’ foil â†’ cutting â†’ cornerCutting â†’ done
    if (hasLam       && !lamDone)       return 'lamination'
    if (hasFoil      && !foilDone)      return 'foil'
    if (hasCutting   && !cuttingDone)   return 'cutting'
    if (hasCornerCut && !cornerCutDone) return 'cornerCutting'
    return 'done'
  }

  // Corner cut: lamination â†’ cutting â†’ binding â†’ cornerCutting â†’ done
  if (hasCornerCut) {
    if (hasLam       && !lamDone)       return 'lamination'
    if (hasCutting   && !cuttingDone)   return 'cutting'
    if (hasBinding   && !bindingDone)   return 'binding'
    if (hasCornerCut && !cornerCutDone) return 'cornerCutting'
    return 'done'
  }

  // Die cut: lamination â†’ cutting â†’ creasing â†’ dieCutting â†’ done
  if (hasDieCut) {
    if (hasLam      && !lamDone)      return 'lamination'
    if (hasCutting  && !cuttingDone)  return 'cutting'
    if (hasCreasing && !creasingDone) return 'creasing'
    if (hasDieCut   && !dieCutDone)   return 'dieCutting'
    return 'done'
  }

  // Normal binding: lamination â†’ creasing â†’ binding â†’ cutting â†’ done
  if (hasBinding) {
    if (hasLam      && !lamDone)      return 'lamination'
    if (hasCreasing && !creasingDone) return 'creasing'
    if (hasBinding  && !bindingDone)  return 'binding'
    if (hasCutting  && !cuttingDone)  return 'cutting'
    return 'done'
  }

  // Creasing-only / cutting-only: lamination â†’ cutting â†’ creasing â†’ done
  if (hasLam      && !lamDone)      return 'lamination'
  if (hasCutting  && !cuttingDone)  return 'cutting'
  if (hasCreasing && !creasingDone) return 'creasing'
  return 'done'
}

function refreshItemStages(job) {
  let changed = false
  for (const item of (job.items || [])) {
    const next = computeItemActiveStage(item, job)
    if (item.activeStage !== next) {
      item.activeStage = next
      changed = true
    }
    
    if (item.idCard) {
      const fusingDone = !item.fusing || item.fusing === 'NONE' || item.fusingStatus === 'COMPLETED'
      const holesDone = !item.holes || item.holes === 'NONE' || item.holesStatus === 'COMPLETED'
      const cuttingDone = !item.cutting || item.cutting === 'NONE' || item.cuttingStatus === 'COMPLETED'
      const cutting2Done = !item.cutting2 || item.cutting2 === 'NONE' || item.cutting2Status === 'COMPLETED'
      const cornerDone = !item.cornerCutting || item.cornerCutting === 'NONE' || item.cornerCuttingStatus === 'COMPLETED'
      
      const newStatus = (fusingDone && holesDone && cuttingDone && cutting2Done && cornerDone) ? 'COMPLETED' : 'PENDING'
      if (item.idCardStatus !== newStatus) {
        item.idCardStatus = newStatus
        changed = true
      }
    }
  }
  if (changed) job.markModified('items')
  return changed
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CONSTANTS & HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Sourced from the process registry (single source of truth). Seeded with the
// former hardcoded values, so behaviour is unchanged until refresh() overlays
// tenant config in a later phase.
const POST_PRESS_STAGES = processRegistry.getPostPressStages()
const FINISHING_STAGES  = processRegistry.getFinishingStages()
const FINISHING_TASKS   = FINISHING_STAGES
const PRINTED_STATUSES  = ['PRINTED', 'PACKED', 'DISPATCHED', 'PARTIAL_DISPATCH', 'RECEIVED']
const PRESS_STAGES      = ['press']

function parseCopies(qtyVal) {
  if (!qtyVal) return 0
  const n = parseInt(String(qtyVal).trim(), 10)
  return Number.isFinite(n) ? n : 0
}

function isLegacyPrintedJob(job) {
  const items = job.items || []
  return PRINTED_STATUSES.includes(job.jobStatus) && items.length > 0 && !items.some(i => i.printConfirmed === true)
}

function isItemPressConfirmed(item, job) {
  return item.printConfirmed === true || isLegacyPrintedJob(job)
}

function hasUnconfirmedPressItems(job) {
  const items = job.items || []
  return items.length === 0 || items.some(i => !isItemPressConfirmed(i, job))
}

function hasPendingPostPress(job) {
  return (job.items || []).some(i => isItemPressConfirmed(i, job) && POST_PRESS_STAGES.includes(i.activeStage))
}

function hasPendingFinishingReady(job) {
  return (job.items || []).some(i => isItemPressConfirmed(i, job) && FINISHING_STAGES.includes(i.activeStage))
}

function hasPendingCuttingReady(job) { return hasPendingFinishingReady(job) }

function getActivePostPressStage(job) {
  const items = job.items || []
  if (items.some(i => isItemPressConfirmed(i, job) && i.activeStage === 'lamination')) return 'lamination'
  if (items.some(i => isItemPressConfirmed(i, job) && i.activeStage === 'binding'))    return 'binding'
  return null
}

function transformJob(job) {
  const doc = job.toObject ? job.toObject() : { ...job }
  const items = doc.items || []
  if (isLegacyPrintedJob(doc)) {
    for (const item of items) item.printConfirmed = true
  }
  const pressConfirmedItems = items.filter(i => isItemPressConfirmed(i, doc)).length
  doc.pressConfirmedItems = pressConfirmedItems
  doc.pressPendingItems = Math.max(items.length - pressConfirmedItems, 0)
  const descList = items.map(i => i.orderDescription).filter(Boolean)
  doc.jobDescription = descList.length ? descList.join(', ') : 'No Description'
  const mediaList = [...new Set(items.map(i => i.media).filter(Boolean))]
  doc.media = mediaList.length ? mediaList.join(', ') : 'No Media'
  let totalCopies = 0
  const ppsParts = []
  for (const item of items) {
    if (item.size && typeof item.size === 'object') totalCopies += parseCopies(item.size.qty)
    const parts = []
    if (item.lamination    && item.lamination    !== 'NONE') parts.push(`Lam: ${item.lamination}`)
    if (item.creasing      && item.creasing      !== 'NONE') parts.push('Crease')
    if (item.binding       && item.binding       !== 'NONE') {
      parts.push(item.pouchLamination === true ? 'Bind: POUCH LAMINATION' : `Bind: ${item.binding.replace(/_/g, ' ')}`)
    }
    if (item.dieCutting    && item.dieCutting    !== 'NONE') parts.push(`Die: ${item.dieCutting.replace(/_/g, ' ')}`)
    if (item.cornerCutting && item.cornerCutting !== 'NONE') parts.push(`Corner: ${item.cornerCutting.replace(/_/g, ' ')}`)
    if (item.cutting       && item.cutting       !== 'NONE') parts.push(`Cut: ${item.cutting.replace(/_/g, ' ')}`)
    if (parts.length) ppsParts.push(parts.join(' | '))
  }
  doc.totalCopies = totalCopies
  doc.ppsDetails  = ppsParts.length ? ppsParts.join('; ') : 'No Post Press Specs'
  doc.activePostPressStage = getActivePostPressStage(doc)
  doc.workflowStep = doc.activePostPressStage
    ? doc.activePostPressStage
    : hasPendingCuttingReady(doc) ? 'cutting'
    : doc.jobStatus === 'PACKED'  ? 'dispatch'
    : doc.jobStatus
  return doc
}

function applyDateFilter(filter, date) {
  if (!date || !String(date).trim()) return filter
  const [y, m, d] = String(date).trim().split('-').map(Number)
  if (!y || !m || !d) return filter
  return { ...filter, createdAt: { $gte: new Date(y, m-1, d, 0,0,0,0), $lte: new Date(y, m-1, d, 23,59,59,999) } }
}

function applySearchFilter(filter, search) {
  if (!search || !String(search).trim()) return filter
  const r = { $regex: String(search).trim(), $options: 'i' }
  return { ...filter, $or: [{ jobId: r }, { customerName: r }, { customerPhone: r }] }
}

async function paginateJobs(filter, page, limit, postFilter) {
  const pageNumber = Number(page)
  const limitNumber = Number(limit)
  const skip = (pageNumber - 1) * limitNumber

  if (postFilter) {
    const allJobs = await populateCreatedBy(jobRepo.find(filter)).sort({ createdAt: -1 })
    const jobs = allJobs.filter(postFilter)
    const pageJobs = jobs.slice(skip, skip + limitNumber)
    return { jobs: pageJobs.map(transformJob), total: jobs.length, page: pageNumber, pages: Math.ceil(jobs.length / limitNumber) || 1 }
  }

  const [jobs, total] = await Promise.all([
    populateCreatedBy(jobRepo.find(filter)).sort({ createdAt: -1 }).skip(skip).limit(limitNumber),
    jobRepo.countDocuments(filter)
  ])
  return { jobs: jobs.map(transformJob), total, page: pageNumber, pages: Math.ceil(total / limitNumber) || 1 }
}

async function syncPostPressFromJobCards(job) {
  const items = job.items || []
  if (!items.length) return false
  const merged = await applyJobCardsToItems(job.jobId, items.map(i => i.toObject ? i.toObject() : { ...i }))
  const snap = i => JSON.stringify({
    lamination: i.lamination, pouchLamination: i.pouchLamination,
    creasing: i.creasing, binding: i.binding, dieCutting: i.dieCutting,
    cornerCutting: i.cornerCutting, cutting: i.cutting,
    cuttingValue: i.cuttingValue, cuttingSizes: i.cuttingSizes,
    foil: i.foil, foilQty: i.foilQty,
    laminationStatus: i.laminationStatus, creasingStatus: i.creasingStatus,
    bindingStatus: i.bindingStatus, dieCuttingStatus: i.dieCuttingStatus,
    cornerCuttingStatus: i.cornerCuttingStatus, cuttingStatus: i.cuttingStatus,
    foilStatus: i.foilStatus,
    laminationQty: i.laminationQty, bindingQty: i.bindingQty,
    creasingQty: i.creasingQty, dieCuttingQty: i.dieCuttingQty,
    cornerCuttingQty: i.cornerCuttingQty, idCardQty: i.idCardQty,
    idCardStatus: i.idCardStatus,
    fusing: i.fusing, fusingQty: i.fusingQty, fusingStatus: i.fusingStatus,
    holes: i.holes, holesStatus: i.holesStatus,
    cutting2: i.cutting2, cutting2Value: i.cutting2Value, cutting2Status: i.cutting2Status
  })
  const before = items.map(snap).join('|')
  job.items = merged
  job.markModified('items')
  const after = merged.map(snap).join('|')
  return before !== after
}

async function syncJobsWithCards(jobs) {
  for (const job of jobs) {
    const synced = await syncPostPressFromJobCards(job)
    if (synced) { refreshItemStages(job); await job.save() }
  }
}

async function checkAndAdvanceJob(jobId) {
  const job = await jobRepo.findOne({ jobId })
  if (!job) return 'PRINTED'
  const items = job.items || []
  const allPressConfirmed = items.length === 0 || items.every(i => isItemPressConfirmed(i, job))
  const hasPending = items.some(i => i.activeStage && i.activeStage !== 'done')
  if (!allPressConfirmed) return job.jobStatus
  if (!hasPending) { job.jobStatus = 'PACKED'; await job.save(); return 'PACKED' }
  if (job.jobStatus !== 'PRINTED') {
    job.jobStatus = 'PRINTED'
    await job.save()
  }
  return job.jobStatus
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PRESS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getPressJobs({ page=1, limit=50, search='', date='' }) {
  let f = {
    'items.activeStage': 'press',
    // Exclude legacy jobs that are already done â€” PACKED/DISPATCHED jobs with
    // stale activeStage="press" from before the printConfirmed field existed
    jobStatus: { $nin: ['PACKED', 'DISPATCHED'] }
  }
  f = applySearchFilter(f, search)
  if (date) f = applyDateFilter(f, date)   // â† honour the date param from the press dashboard
  return paginateJobs(f, page, limit, null)
}

async function getPressHistory({ page=1, limit=50, search='', date='' }) {
  let f = { jobStatus: { $in: ['PRINTED','PACKED','DISPATCHED'] } }
  f = applySearchFilter(f, search); f = applyDateFilter(f, date)
  const skip = (Number(page)-1)*Number(limit)
  const [jobs, total] = await Promise.all([
    populateCreatedBy(jobRepo.find(f)).sort({ updatedAt: -1 }).skip(skip).limit(Number(limit)),
    jobRepo.countDocuments(f)
  ])
  return { jobs: jobs.map(transformJob), total, page: Number(page), pages: Math.ceil(total/Number(limit))||1 }
}

async function finishPressJob(jobId, userId) {
  const job = await jobRepo.findOne({ jobId })
  if (!job) { const e = new Error('Job not found'); e.status = 404; throw e }
  await syncPostPressFromJobCards(job)
  const items = job.items || []
  const unconfirmed = items.filter(i => !isItemPressConfirmed(i, job))
  if (items.length > 1 && unconfirmed.length > 0) {
    const e = new Error('Use per-item confirmation for multi-item press jobs')
    e.status = 400; throw e
  }

  const now = new Date()
  const staffName = userId ? (await userRepo.findById(userId).select('name').lean())?.name || 'Staff' : 'Staff'

  for (const item of unconfirmed) {
    item.printConfirmed = true
    item.pressStatus = 'COMPLETED'   // â† fixes activeStage not advancing past 'press'

    // Log to taskLog
    if (!job.taskLog) job.taskLog = []
    const idx = items.indexOf(item)
    const pressStartedAt = item.pressStartedAt || job.createdAt || now
    job.taskLog.push({
      task:        'press',
      itemIndex:   idx,
      startedAt:   pressStartedAt,
      completedAt: now,
      durationMs:  now.getTime() - new Date(pressStartedAt).getTime(),
      staffName,
      staffId:     userId || undefined,
      module:      'press'
    })
  }

  if (unconfirmed.length) {
    job.markModified('items')
    job.markModified('taskLog')
  }
  if (userId) job.printedBy = userId
  refreshItemStages(job)
  await job.save()
  const status = await checkAndAdvanceJob(jobId)
  return { message: 'Job marked as printed successfully', jobId, status }
}

/**
 * Confirm a single item as printed â€” per-item tracking like PostPress/Finishing.
 * - Marks only that item as printConfirmed
 * - Job stays in press queue until ALL items are confirmed
 * - When last item confirmed â†’ job moves to next workflow stage
 */
async function confirmPressItem(jobId, itemIndex, userId) {
  const job = await jobRepo.findOne({ jobId })
  if (!job) { const e = new Error('Job not found'); e.status = 404; throw e }
  await syncPostPressFromJobCards(job)

  const items = job.items || []
  if (itemIndex < 0 || itemIndex >= items.length) {
    const e = new Error(`Item index ${itemIndex} out of range`)
    e.status = 400; throw e
  }

  if (isItemPressConfirmed(items[itemIndex], job)) {
    const e = new Error(`Item #${itemIndex + 1} is already confirmed`)
    e.status = 400; throw e
  }

  // Mark only this item as confirmed â€” both printConfirmed and pressStatus
  items[itemIndex].printConfirmed = true
  items[itemIndex].pressStatus = 'COMPLETED'
  job.markModified('items')
  if (userId) job.printedBy = userId
  refreshItemStages(job)  // item's activeStage now advances past 'press'

  // â”€â”€ Task Time Log: record press completion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const now = new Date()
  if (!job.taskLog) job.taskLog = []
  const pressStartedAt = items[itemIndex].pressStartedAt || job.createdAt || now
  job.taskLog.push({
    task:        'press',
    itemIndex,
    startedAt:   pressStartedAt,
    completedAt: now,
    durationMs:  now.getTime() - new Date(pressStartedAt).getTime(),
    staffName:   userId ? (await userRepo.findById(userId).select('name').lean())?.name || 'Staff' : 'Staff',
    staffId:     userId || undefined,
    module:      'press'
  })
  job.markModified('taskLog')

  const confirmed = items.filter(i => isItemPressConfirmed(i, job)).length
  const total = items.length
  const allConfirmed = confirmed === total

  if (allConfirmed) {
    await job.save()
    const status = await checkAndAdvanceJob(jobId)
    return { message: `All ${total} items confirmed`, jobId, allConfirmed: true, confirmed, total, status }
  }

  await job.save()
  return { message: `Item ${itemIndex + 1} confirmed (${confirmed}/${total})`, jobId, allConfirmed: false, confirmed, total, status: job.jobStatus }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST PRESS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Jobs still at Press stage but have post-press tasks configured.
 * These are "incoming" â€” not yet in the post-press queue but will be soon.
 */
async function getIncomingPostPressJobs({ page=1, limit=50, search='', date='' }) {
  // Show jobs where:
  //  1. At least one item still has activeStage === 'press' (not all confirmed yet)
  //  2. At least one item has a post-press task configured
  //  3. The job has NOT fully moved into the post-press queue yet (jobStatus not PRINTED with all items past press)
  let f = {
    jobStatus: { $nin: ['PACKED', 'DISPATCHED'] },
    'items': {
      $elemMatch: { activeStage: 'press' }
    },
    $or: [
      { 'items.lamination':  { $nin: ['NONE', null, ''] } },
      { 'items.binding':     { $nin: ['NONE', null, ''] } },
      { 'items.foil':        { $nin: ['NONE', null, ''] } },
      { 'items.fusing':      { $nin: ['NONE', null, ''] } },
      { 'items.holes':       { $nin: ['NONE', null, ''] } },
    ]
  }
  f = applySearchFilter(f, search)
  f = applyDateFilter(f, date)
  return paginateJobs(f, page, limit, null)
}

async function getPostPressJobs({ page=1, limit=50, search='', date='', taskType='all' }) {
  const targetStages = taskType === 'all'
    ? POST_PRESS_STAGES
    : String(taskType).split(',').map(t => t.trim()).filter(Boolean)
  let f = {
    jobStatus: { $in: ['PENDING','CREATED','PRINTED','PARTIAL_DISPATCH'] },
    $or: [
      {
        items: {
          $elemMatch: {
            printConfirmed: true,
            activeStage: { $in: targetStages }
          }
        }
      },
      {
        jobStatus: { $in: ['PRINTED','PARTIAL_DISPATCH'] },
        'items.printConfirmed': { $ne: true },
        'items.activeStage': { $in: targetStages }
      }
    ]
  }
  f = applySearchFilter(f, search); f = applyDateFilter(f, date)
  const postFilter = targetStages.length < POST_PRESS_STAGES.length
    ? (job) => (job.items || []).some(
        (i) => isItemPressConfirmed(i, job) && targetStages.includes(i.activeStage)
      )
    : null
  return paginateJobs(f, page, limit, postFilter)
}

async function getPostPressHistory({ page=1, limit=50, search='', date='', taskType='all', userId=null }) {
  const targetStages = taskType === 'all'
    ? POST_PRESS_STAGES
    : String(taskType).split(',').map(t => t.trim()).filter(Boolean)

  const POST_PRESS_STATUS_FIELDS = targetStages.map(stage => `${stage}Status`)
  let f = {
    $or: POST_PRESS_STATUS_FIELDS.map(field => ({
      items: { $elemMatch: { [field]: 'COMPLETED' } }
    }))
  }
  // User-scoped: only jobs where this user completed a post-press task
  if (userId) {
    f['taskLog'] = {
      $elemMatch: {
        module: 'post_press',
        staffId: userId,
        completedAt: { $exists: true, $ne: null }
      }
    }
  }
  f = applySearchFilter(f, search); f = applyDateFilter(f, date)
  const skip = (Number(page)-1)*Number(limit)
  const [jobs, total] = await Promise.all([
    populateCreatedBy(jobRepo.find(f)).sort({ ppsCompletedAt: -1, updatedAt: -1 }).skip(skip).limit(Number(limit)),
    jobRepo.countDocuments(f)
  ])
  return { jobs: jobs.map(transformJob), total, page: Number(page), pages: Math.ceil(total/Number(limit))||1 }
}

async function completePostPressTask(jobId, taskType, userId, itemIndex, laminationProduct = null) {
  const job = await jobRepo.findOne({ jobId })
  if (!job) { const e = new Error('Job not found'); e.status = 404; throw e }
  if (!POST_PRESS_STAGES.includes(taskType)) {
    const e = new Error(`Invalid task_type. Use: ${POST_PRESS_STAGES.join(', ')}`); e.status = 400; throw e
  }
  const anyReady = (job.items || []).some(i => isItemPressConfirmed(i, job) && i.activeStage === taskType)
  if (!anyReady) {
    const e = new Error(`No items are ready for ${taskType} on this job`); e.status = 400; throw e
  }
  let staffName = 'Staff'
  if (userId) {
    const userDoc = await userRepo.findById(userId).select('name').lean()
    if (userDoc) staffName = userDoc.name
  }
  const statusField = `${taskType}Status`
  const hasIdx = Number.isInteger(itemIndex) && itemIndex >= 0
  if (hasIdx && (!job.items || itemIndex >= job.items.length)) {
    const e = new Error(`Invalid item_index '${itemIndex}'`); e.status = 400; throw e
  }
  let count = 0
  for (let idx = 0; idx < (job.items||[]).length; idx++) {
    if (hasIdx && idx !== itemIndex) continue
    const item = job.items[idx]
    if (!isItemPressConfirmed(item, job)) {
      if (hasIdx) { const e = new Error(`Item #${itemIndex+1} is not confirmed by Press yet`); e.status=400; throw e }
      continue
    }
    if (item.activeStage !== taskType) {
      if (hasIdx) { const e = new Error(`Item #${itemIndex+1} is not ready for ${taskType} yet`); e.status=400; throw e }
      continue
    }
    item[statusField] = 'COMPLETED';
    if (taskType === 'lamination' && laminationProduct) {
      item.laminationProduct = laminationProduct;
    }
    count++

    // â”€â”€ Task Time Log: record post-press completion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!job.taskLog) job.taskLog = []
    const ppNow = new Date()
    const existingPPEntry = job.taskLog.find(
      l => l.task === taskType && l.itemIndex === idx && l.module === 'post_press' && !l.completedAt
    )
    if (existingPPEntry) {
      existingPPEntry.completedAt = ppNow
      existingPPEntry.durationMs  = ppNow.getTime() - new Date(existingPPEntry.startedAt).getTime()
      if (staffName !== 'Staff') existingPPEntry.staffName = staffName
      if (userId) existingPPEntry.staffId = userId
    } else {
      const pressEntry = job.taskLog.find(l => l.task === 'press' && l.itemIndex === idx)
      job.taskLog.push({
        task: taskType, itemIndex: idx,
        startedAt: pressEntry ? pressEntry.completedAt : ppNow,
        completedAt: ppNow,
        durationMs: pressEntry ? ppNow.getTime() - new Date(pressEntry.completedAt).getTime() : 0,
        staffName, staffId: userId || undefined, module: 'post_press'
      })
    }
    job.markModified('taskLog')
  }
  if (count === 0) {
    const e = new Error(hasIdx ? `No pending ${taskType} for item #${itemIndex+1}` : `No pending ${taskType} tasks`); e.status=400; throw e
  }
  if (userId) { job.ppsCompletedBy = userId; job.ppsCompletedAt = new Date() }
  refreshItemStages(job)
  await job.save()
  const status = await checkAndAdvanceJob(jobId)
  return { message: `Task '${taskType}' marked as completed successfully`, jobId, status }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FINISHING
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getFinishingJobs({ page=1, limit=50, search='', date='', taskType='all' }) {
  const targetStages = taskType === 'all'
    ? FINISHING_STAGES
    : String(taskType).split(',').map(t => t.trim()).filter(Boolean)
  let f = {
    jobStatus: { $in: ['PENDING','CREATED','PRINTED','PARTIAL_DISPATCH'] },
    $or: [
      {
        items: {
          $elemMatch: {
            printConfirmed: true,
            activeStage: { $in: targetStages }
          }
        }
      },
      {
        jobStatus: { $in: ['PRINTED','PARTIAL_DISPATCH'] },
        'items.printConfirmed': { $ne: true },
        'items.activeStage': { $in: targetStages }
      }
    ]
  }
  f = applySearchFilter(f, search); f = applyDateFilter(f, date)
  const postFilter = targetStages.length < FINISHING_STAGES.length
    ? (job) => (job.items || []).some(
        (i) => isItemPressConfirmed(i, job) && targetStages.includes(i.activeStage)
      )
    : null
  return paginateJobs(f, page, limit, postFilter)
}

function finishingStatusField(stage) {
  return `${stage}Status`
}

/** Drop jobs with no items at the user's allowed finishing stages. */
function filterFinishingJobsByTasks(jobs, targetStages) {
  if (!Array.isArray(jobs) || !targetStages || targetStages.length >= FINISHING_STAGES.length) {
    return jobs
  }
  const allowed = new Set(targetStages)
  return jobs.filter((job) =>
    (job.items || []).some((i) => isItemPressConfirmed(i, job) && allowed.has(i.activeStage))
  )
}

async function getFinishingHistory({ page=1, limit=50, search='', date='', taskType='all', userId=null }) {
  const targetStages = taskType === 'all'
    ? FINISHING_STAGES
    : String(taskType).split(',').map(t => t.trim()).filter(Boolean)

  let f
  // Both admin (all stages) and sub-role (subset of stages) now use the same
  // approach: only return jobs where at least one relevant finishing task is COMPLETED.
  // The old admin branch returned ALL packed/dispatched jobs regardless of whether
  // they had any finishing work â€” causing 1,700+ irrelevant records to show.
  f = {
    $or: targetStages.map(stage => ({
      items: {
        $elemMatch: { [finishingStatusField(stage)]: 'COMPLETED' }
      }
    }))
  }

  // User-scoped: only jobs where this specific user completed a finishing task
  if (userId) {
    f['taskLog'] = {
      $elemMatch: {
        module: 'finishing',
        staffId: userId,
        completedAt: { $exists: true, $ne: null }
      }
    }
  }

  f = applySearchFilter(f, search); f = applyDateFilter(f, date)
  const skip = (Number(page)-1)*Number(limit)

  // Calculate unpaginated total cutting count
  const allMatchingJobs = await jobRepo.find(f);

  function getJobCuttingSum(job, uId) {
    const items = job.items || [];
    const taskLog = job.taskLog || [];
    let sum = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      
      const cuttingDoneByUs = taskLog.some(l => 
        l.module === 'finishing' && 
        l.task === 'cutting' && 
        l.itemIndex === idx && 
        l.completedAt && 
        (!uId || Number(l.staffId) === Number(uId))
      );
      if (cuttingDoneByUs) {
        sum += Number(item.cuttingValue) || 0;
      }

      const cutting2DoneByUs = taskLog.some(l => 
        l.module === 'finishing' && 
        l.task === 'cutting2' && 
        l.itemIndex === idx && 
        l.completedAt && 
        (!uId || Number(l.staffId) === Number(uId))
      );
      if (cutting2DoneByUs) {
        sum += Number(item.cutting2Value) || 0;
      }
    }
    return sum;
  }

  let totalCutting = 0;
  for (const job of allMatchingJobs) {
    totalCutting += getJobCuttingSum(job, userId);
  }

  const [jobs, total] = await Promise.all([
    populateCreatedBy(jobRepo.find(f)).sort({ finishingCompletedAt: -1, updatedAt: -1 }).skip(skip).limit(Number(limit)),
    jobRepo.countDocuments(f)
  ])

  const transformed = jobs.map(j => {
    const jobDoc = transformJob(j);
    jobDoc.cuttingTotal = getJobCuttingSum(j, userId);
    return jobDoc;
  });

  return {
    jobs: transformed,
    total,
    totalCutting,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)) || 1
  }
}

async function completeFinishingTask(jobId, userId, itemIndex, taskType='cutting') {
  const job = await jobRepo.findOne({ jobId })
  if (!job) { const e = new Error('Job not found'); e.status = 404; throw e }
  if (!FINISHING_TASKS.includes(taskType)) {
    const e = new Error(`Invalid task type. Use: ${FINISHING_TASKS.join(', ')}`); e.status=400; throw e
  }
  const anyReady = (job.items || []).some(i => isItemPressConfirmed(i, job) && i.activeStage === taskType)
  if (!anyReady) {
    const e = new Error(`No items are ready for ${taskType} on this job`); e.status=400; throw e
  }
  let staffName = 'Staff'
  if (userId) {
    const userDoc = await userRepo.findById(userId).select('name').lean()
    if (userDoc) staffName = userDoc.name
  }
  const statusField = `${taskType}Status`
  const hasIdx = Number.isInteger(itemIndex) && itemIndex >= 0
  if (hasIdx && (!job.items || itemIndex >= job.items.length)) {
    const e = new Error(`Invalid item_index '${itemIndex}'`); e.status=400; throw e
  }
  let count = 0
  for (let idx = 0; idx < (job.items||[]).length; idx++) {
    if (hasIdx && idx !== itemIndex) continue
    const item = job.items[idx]
    if (!isItemPressConfirmed(item, job)) {
      if (hasIdx) {
        const e = new Error(`Item #${itemIndex+1} is not confirmed by Press yet`)
        e.status=400; throw e
      }
      continue
    }
    if (item.activeStage !== taskType) {
      if (hasIdx) {
        const e = new Error(`Item #${itemIndex+1} is not ready for ${taskType} yet (current: ${item.activeStage})`)
        e.status=400; throw e
      }
      continue
    }
    item[statusField] = 'COMPLETED'; count++

    // â”€â”€ Task Time Log: record finishing completion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!job.taskLog) job.taskLog = []
    const finNow = new Date()
    const existingFinEntry = job.taskLog.find(
      l => l.task === taskType && l.itemIndex === idx && l.module === 'finishing' && !l.completedAt
    )
    if (existingFinEntry) {
      existingFinEntry.completedAt = finNow
      existingFinEntry.durationMs  = finNow.getTime() - new Date(existingFinEntry.startedAt).getTime()
      if (staffName !== 'Staff') existingFinEntry.staffName = staffName
      if (userId) existingFinEntry.staffId = userId
    } else {
      job.taskLog.push({
        task: taskType, itemIndex: idx,
        startedAt: finNow, completedAt: finNow,
        durationMs: 0, staffName, staffId: userId || undefined, module: 'finishing'
      })
    }
    job.markModified('taskLog')
  }
  if (count === 0) {
    const e = new Error(hasIdx ? `No pending ${taskType} for item #${itemIndex+1}` : `No pending ${taskType} tasks`); e.status=400; throw e
  }
  if (userId) { job.finishingCompletedBy = userId; job.finishingCompletedAt = new Date() }
  refreshItemStages(job)
  await job.save()
  const status = await checkAndAdvanceJob(jobId)
  return { message: `${taskType} task marked as completed successfully`, jobId, status }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TIME LOG HELPERS - Calculate lags and durations for analytics
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function calculatePressToPostPressLag(taskLog) {
  if (!taskLog || taskLog.length === 0) return null
  const lastPressCompletion = taskLog
    .filter(l => l.module === 'press' && l.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0]
  const firstPostPressStart = taskLog
    .filter(l => l.module === 'post_press' && l.startedAt)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))[0]
  if (!lastPressCompletion || !firstPostPressStart) return null
  return new Date(firstPostPressStart.startedAt) - new Date(lastPressCompletion.completedAt)
}

function calculatePostPressToFinishingLag(taskLog) {
  if (!taskLog || taskLog.length === 0) return null
  const lastPostPressCompletion = taskLog
    .filter(l => l.module === 'post_press' && l.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0]
  const firstFinishingStart = taskLog
    .filter(l => l.module === 'finishing' && l.startedAt)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))[0]
  if (!lastPostPressCompletion || !firstFinishingStart) return null
  return new Date(firstFinishingStart.startedAt) - new Date(lastPostPressCompletion.completedAt)
}

function calculateModuleTotalTime(taskLog, module) {
  if (!taskLog) return 0
  const moduleTasks = taskLog.filter(l => l.module === module && l.durationMs)
  return moduleTasks.reduce((sum, t) => sum + (t.durationMs || 0), 0)
}

function calculateTotalWorkflowTime(taskLog) {
  if (!taskLog) return 0
  return taskLog
    .filter(l => l.durationMs)
    .reduce((sum, t) => sum + (t.durationMs || 0), 0)
}

function getTimeLogMetrics(job) {
  const taskLog = job.taskLog || []
  const pressTime = calculateModuleTotalTime(taskLog, 'press')
  const postPressTime = calculateModuleTotalTime(taskLog, 'post_press')
  const finishingTime = calculateModuleTotalTime(taskLog, 'finishing')
  const totalTime = calculateTotalWorkflowTime(taskLog)
  
  return {
    pressTime,
    postPressTime,
    finishingTime,
    totalTime,
    pressToPostPressLagMs: calculatePressToPostPressLag(taskLog),
    postPressToFinishingLagMs: calculatePostPressToFinishingLag(taskLog),
    taskLog: taskLog.map(t => ({
      ...t,
      startedAt: t.startedAt ? new Date(t.startedAt).toISOString() : null,
      completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null
    }))
  }
}

/**
 * Jobs created by PrePress that have finishing tasks for this sub-role.
 * Shows from job creation until the job's relevant items reach the finishing active queue.
 * taskType: comma-separated list of finishing task keys e.g. 'cutting,cutting2' or 'all'
 *
 * Sub-role scoping (via injectTaskFilter in finishing.js):
 *   FINISHING_CUTTING     â†’ taskType = 'cutting,cutting2'
 *   FINISHING_DIE_CUTTING â†’ taskType = 'dieCutting'
 *   FINISHING_CREASING    â†’ taskType = 'creasing'
 *   FINISHING_CORNER_CUT  â†’ taskType = 'cornerCutting'
 *   FINISHING / ADMIN     â†’ taskType = 'all'
 *
 * A job appears in Incoming for this sub-role if:
 *   1. At least one item has the sub-role's task configured (not NONE/null)
 *   2. That same item's activeStage is NOT yet one of the sub-role's finishing stages
 *      (meaning it hasn't arrived at the finishing active queue yet)
 *   3. Job is not PACKED/DISPATCHED
 */
async function getIncomingFinishingJobs({ page=1, limit=50, search='', date='', taskType='all' }) {
  // Map each finishing task to its field name and corresponding activeStage value
  const TASK_CONFIG = {
    cutting:       { field: 'cutting',       activeStage: 'cutting' },
    cutting2:      { field: 'cutting2',      activeStage: 'cutting2' },
    dieCutting:    { field: 'dieCutting',    activeStage: 'dieCutting' },
    creasing:      { field: 'creasing',      activeStage: 'creasing' },
    cornerCutting: { field: 'cornerCutting', activeStage: 'cornerCutting' },
  }

  // Determine which tasks this request is scoped to
  let tasks = Object.keys(TASK_CONFIG)
  if (taskType && taskType !== 'all') {
    const requested = String(taskType).split(',').map(t => t.trim()).filter(Boolean)
    tasks = tasks.filter(k => requested.includes(k))
  }
  if (tasks.length === 0) tasks = Object.keys(TASK_CONFIG)

  // The activeStages that mean "job has already arrived at this sub-role's active queue"
  const arrivedStages = tasks.map(t => TASK_CONFIG[t].activeStage)

  // Show job if it has at least one item where:
  //   - The relevant task field is configured (not NONE/null/empty)
  //   - AND the item's activeStage is NOT yet one of the sub-role's finishing stages
  //     (i.e. it's still at press, post-press, or another earlier stage)
  let f = {
    jobStatus: { $nin: ['PACKED', 'DISPATCHED'] },
    items: {
      $elemMatch: {
        $or: tasks.map(t => ({ [TASK_CONFIG[t].field]: { $nin: ['NONE', null, ''] } })),
        activeStage: { $nin: [...arrivedStages, 'done'] }
      }
    }
  }
  f = applySearchFilter(f, search)
  f = applyDateFilter(f, date)
  return paginateJobs(f, page, limit, null)
}

module.exports = {
  computeItemActiveStage, refreshItemStages, transformJob,
  getPressJobs, getPressHistory, finishPressJob, confirmPressItem,
  getIncomingPostPressJobs, getIncomingFinishingJobs,
  getPostPressJobs, getPostPressHistory, completePostPressTask,
  getFinishingJobs, getFinishingHistory, completeFinishingTask, filterFinishingJobsByTasks,
  checkAndAdvanceJob, getActivePostPressStage, hasPendingPostPress, hasPendingCuttingReady,
  syncPostPressFromJobCards,
  getTimeLogMetrics, calculatePressToPostPressLag, calculatePostPressToFinishingLag,
  calculateModuleTotalTime, calculateTotalWorkflowTime
}

