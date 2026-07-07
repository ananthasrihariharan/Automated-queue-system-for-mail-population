// ─────────────────────────────────────────────────────────────────────────────
// PROCESS REGISTRY — single source of truth for product types, workflow stages,
// lamination variants, and production timings.
//
// Phase 1 (this file): the previously-scattered hardcoded lists are collapsed here
// and exposed SYNCHRONOUSLY via getters. Behaviour is identical to before because
// the in-memory cache is seeded with the exact former hardcoded values (DEFAULTS).
//
// Phase 2+: call `refresh(tenantId)` at startup / after an admin edit to overlay
// tenant-scoped values stored in SystemConfig (key `tenant:<id>:processRegistry`)
// onto the cache. Consumers keep reading synchronously — no call-site changes.
//
// Storage: SystemConfig is a native Postgres table (`value Json`). Keys are
// namespaced `tenant:<id>:...` so a future multi-shop (SaaS) mode needs no
// re-architecture — only a real tenantId instead of the default `1`.
// ─────────────────────────────────────────────────────────────────────────────

// Canonical defaults — must equal the former hardcoded values so day-1 behaviour
// is unchanged:
//   - postPress/finishing stages   ← jobWorkflow.js
//   - timings                      ← admin.js DEFAULT_TIMINGS
//   - laminationVariants           ← LaminationStockManager.tsx add-roll dropdown
//   - productTypes                 ← CreateJob.tsx KNOWN_TYPES
const DEFAULTS = Object.freeze({
  productTypes: [
    { id: 'P001', name: 'Digital Print', template: 'none' },
    { id: 'P002', name: 'Offset Print', template: 'none' },
    { id: 'P003', name: 'Sticker', template: 'none' },
    { id: 'P004', name: 'Visiting Card', template: 'none' },
    { id: 'P005', name: 'Booklet', template: 'booklet', openingDirection: 'portrait', bindingSide: 'left', bindingMargin: 10 },
    { id: 'P006', name: 'Lanyard', template: 'none' },
    { id: 'P007', name: 'Id Card', template: 'none' },
    { id: 'P008', name: 'Tags', template: 'none' },
    { id: 'P009', name: 'Envelope', template: 'none' },
    { id: 'P010', name: 'Bill Book', template: 'none' },
    { id: 'P011', name: 'Custom', template: 'none' },
  ],
  postPressStages: ['lamination', 'foil', 'binding', 'fusing', 'holes'],
  finishingStages: ['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2'],
  laminationVariants: ['GLOSS', 'MATT', 'VELVET', 'OTHER'],
  timings: {
    lamination:     60,   // 1 hour (< 100 sheets)
    binding:        180,  // 3 hours (saddle stitch / general)
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
  },
  productSequences: {},
  taskBasis: {},
})

// Live cache — seeded with defaults so reads before the first refresh() are safe.
let cache = cloneDefaults()

function cloneDefaults() {
  return {
    productTypes:       DEFAULTS.productTypes.map(p => ({ ...p })),
    postPressStages:    [...DEFAULTS.postPressStages],
    finishingStages:    [...DEFAULTS.finishingStages],
    laminationVariants: [...DEFAULTS.laminationVariants],
    timings:            { ...DEFAULTS.timings },
    productSequences:   cloneSequences(DEFAULTS.productSequences),
    taskBasis:          { ...DEFAULTS.taskBasis },
  }
}

// Deep-clone a { product: { flowName: string[] } } map so callers can't mutate the cache.
function cloneSequences(seqs) {
  const out = {}
  for (const [product, flowMap] of Object.entries(seqs || {})) {
    if (Array.isArray(flowMap)) {
      // Coerce flat array (backward compatibility)
      out[product] = { "Default": [...flowMap] }
    } else if (flowMap && typeof flowMap === 'object') {
      out[product] = {}
      for (const [flowName, seq] of Object.entries(flowMap)) {
        out[product][flowName] = Array.isArray(seq) ? [...seq] : []
      }
    }
  }
  return out
}

function configKey(tenantId) {
  return `tenant:${tenantId}:processRegistry`
}

// ── Synchronous accessors ────────────────────────────────────────────────────
function getProductTypes()       { return cache.productTypes }
function getPostPressStages()    { return cache.postPressStages }
function getFinishingStages()    { return cache.finishingStages }
function getLaminationVariants() { return cache.laminationVariants }
function getTimings()            { return cache.timings }
function getProductSequences()   { return cache.productSequences }
function getTaskBasis()          { return cache.taskBasis }

/** Snapshot of the whole merged registry (defaults overlaid with saved config). */
function getMergedRegistry() {
  return {
    productTypes:       cache.productTypes.map(p => ({ ...p })),
    postPressStages:    [...cache.postPressStages],
    finishingStages:    [...cache.finishingStages],
    laminationVariants: [...cache.laminationVariants],
    timings:            { ...cache.timings },
    productSequences:   cloneSequences(cache.productSequences),
    taskBasis:          { ...cache.taskBasis },
  }
}

// Coerce a stored config object (its `entries`, or a flat legacy shape) into a
// full cache, falling back to defaults per-field so a partial/bad document can
// never break the workflow engine.
function mergeEntries(entries) {
  const e = (entries && typeof entries === 'object') ? entries : {}
  let productTypes = Array.isArray(e.productTypes) ? e.productTypes : [...DEFAULTS.productTypes];
  productTypes = productTypes.map((p, idx) => {
    if (typeof p === 'string') {
      return { id: `P${String(idx + 1).padStart(3, '0')}`, name: p, template: 'none' };
    }
    const template = p.template ? String(p.template).trim() : 'none';
    return {
      id: String(p.id || '').trim(),
      name: String(p.name || '').trim(),
      template,
      openingDirection: p.openingDirection ? String(p.openingDirection).trim() : (template === 'booklet' ? 'portrait' : 'none'),
      bindingSide: p.bindingSide ? String(p.bindingSide).trim() : (template === 'booklet' ? 'left' : 'none'),
      bindingMargin: p.bindingMargin !== undefined ? Number(p.bindingMargin) : (template === 'booklet' ? 10 : 0)
    };
  }).filter(p => p.name);

  return {
    productTypes,
    postPressStages:    Array.isArray(e.postPressStages) ? e.postPressStages : [...DEFAULTS.postPressStages],
    finishingStages:    Array.isArray(e.finishingStages) ? e.finishingStages : [...DEFAULTS.finishingStages],
    laminationVariants: Array.isArray(e.laminationVariants) ? e.laminationVariants : [...DEFAULTS.laminationVariants],
    timings:            (e.timings && typeof e.timings === 'object') ? e.timings : { ...DEFAULTS.timings },
    productSequences:   (e.productSequences && typeof e.productSequences === 'object' && !Array.isArray(e.productSequences))
                          ? cloneSequences(e.productSequences) : {},
    taskBasis:          (e.taskBasis && typeof e.taskBasis === 'object') ? e.taskBasis : { ...DEFAULTS.taskBasis },
  }
}

/**
 * Overlay tenant-scoped SystemConfig values onto the in-memory cache.
 * Reads the versioned envelope `{ version, updatedBy, updatedAt, entries }`,
 * tolerating a flat legacy shape. Never throws.
 * @param {number} tenantId
 * @returns {Promise<object>} the resulting cache
 */
async function refresh(tenantId = 1) {
  try {
    const { systemConfigRepo } = require('../repositories')
    const doc = await systemConfigRepo.getConfigByKey(configKey(tenantId))
    const value = doc && doc.value
    if (value && typeof value === 'object') {
      cache = mergeEntries(value.entries || value)
    }
  } catch (err) {
    // Keep the current cache — the registry must never break its callers.
  }
  return cache
}

/**
 * Validate and persist a new registry to SystemConfig, then refresh the cache.
 * Only whitelisted fields are accepted; each is validated and normalized. The
 * stored document is a versioned, auditable envelope so edits can be rolled back.
 * @param {object} patch  partial registry — any subset of the whitelisted fields
 * @param {{ updatedBy?: number|string, tenantId?: number }} [opts]
 * @returns {Promise<object>} the new merged registry
 */
async function save(patch = {}, opts = {}) {
  const tenantId = opts.tenantId || 1
  const { systemConfigRepo } = require('../repositories')

  // Start from the current merged view so a partial patch only changes what it names.
  const current = getMergedRegistry()
  const next = { ...current }

  const stringArrayFields = ['postPressStages', 'finishingStages', 'laminationVariants']
  for (const field of stringArrayFields) {
    if (patch[field] === undefined) continue
    if (!Array.isArray(patch[field])) {
      throw badRequest(`'${field}' must be an array of non-empty strings`)
    }
    const cleaned = patch[field].map((v) => String(v).trim()).filter(Boolean)
    if (cleaned.length !== patch[field].length) {
      throw badRequest(`'${field}' contains empty entries`)
    }
    if (new Set(cleaned).size !== cleaned.length) {
      throw badRequest(`'${field}' contains duplicates`)
    }
    next[field] = cleaned
  }

  if (patch.productTypes !== undefined) {
    if (!Array.isArray(patch.productTypes)) {
      throw badRequest(`'productTypes' must be an array of objects or strings`)
    }
    const cleaned = patch.productTypes.map((p, idx) => {
      if (typeof p === 'string') {
        return { id: `P${String(idx + 1).padStart(3, '0')}`, name: p.trim(), template: 'none' }
      }
      if (p && typeof p === 'object') {
        const template = p.template ? String(p.template).trim() : 'none'
        const openingDirection = p.openingDirection ? String(p.openingDirection).trim() : (template === 'booklet' ? 'portrait' : 'none')
        const bindingSide = p.bindingSide ? String(p.bindingSide).trim() : (template === 'booklet' ? 'left' : 'none')
        const bindingMargin = p.bindingMargin !== undefined ? Number(p.bindingMargin) : (template === 'booklet' ? 10 : 0)

        if (template === 'booklet') {
          if (!['portrait', 'landscape', 'none'].includes(openingDirection)) {
            throw badRequest(`openingDirection must be 'portrait', 'landscape', or 'none'`)
          }
          if (!['left', 'right', 'top', 'bottom', 'none'].includes(bindingSide)) {
            throw badRequest(`bindingSide must be 'left', 'right', 'top', 'bottom', or 'none'`)
          }
          if (!Number.isFinite(bindingMargin) || bindingMargin < 0) {
            throw badRequest(`bindingMargin must be a non-negative number`)
          }
        }

        return {
          id: String(p.id || '').trim(),
          name: String(p.name || '').trim(),
          template,
          openingDirection,
          bindingSide,
          bindingMargin
        }
      }
      return null
    }).filter(p => p && p.name)

    if (cleaned.length !== patch.productTypes.length) {
      throw badRequest(`'productTypes' contains invalid or empty entries`)
    }
    const names = cleaned.map(p => p.name.toLowerCase())
    if (new Set(names).size !== names.length) {
      throw badRequest(`'productTypes' contains duplicate names`)
    }
    const ids = cleaned.map(p => p.id.toLowerCase()).filter(Boolean)
    if (new Set(ids).size !== ids.length) {
      throw badRequest(`'productTypes' contains duplicate IDs`)
    }
    next.productTypes = cleaned
  }

  if (patch.timings !== undefined) {
    if (!patch.timings || typeof patch.timings !== 'object' || Array.isArray(patch.timings)) {
      throw badRequest(`'timings' must be an object of { stageKey: minutes }`)
    }
    const timings = {}
    for (const [key, val] of Object.entries(patch.timings)) {
      const n = Number(val)
      if (!Number.isFinite(n) || n < 0) throw badRequest(`timings['${key}'] must be a non-negative number`)
      timings[String(key).trim()] = n
    }
    next.timings = timings
  }

  if (patch.productSequences !== undefined) {
    if (!patch.productSequences || typeof patch.productSequences !== 'object' || Array.isArray(patch.productSequences)) {
      throw badRequest(`'productSequences' must be an object of { productName: { flowName: [stageKeys] } }`)
    }
    // A sequence may only reference stages that exist in the (possibly just-patched)
    // post-press or finishing lists — this keeps sequences and the enum in sync.
    const knownStages = new Set([...next.postPressStages, ...next.finishingStages])
    const sequences = {}
    for (const [product, flowMap] of Object.entries(patch.productSequences)) {
      const name = String(product).trim()
      if (!name) throw badRequest(`productSequences has an empty product name`)
      
      if (Array.isArray(flowMap)) {
        // Coerce if it comes as a flat array
        const cleaned = flowMap.map((s) => String(s).trim()).filter(Boolean)
        for (const stage of cleaned) {
          if (!knownStages.has(stage)) throw badRequest(`sequence for '${name}' references unknown stage '${stage}'`)
        }
        sequences[name] = { "Default": cleaned }
      } else if (flowMap && typeof flowMap === 'object') {
        sequences[name] = {}
        for (const [flowName, seq] of Object.entries(flowMap)) {
          const fName = String(flowName).trim()
          if (!fName) throw badRequest(`flow name cannot be empty`)
          if (!Array.isArray(seq)) throw badRequest(`sequence for '${name}' -> '${fName}' must be an array of stage keys`)
          const cleaned = seq.map((s) => String(s).trim()).filter(Boolean)
          if (new Set(cleaned).size !== cleaned.length) throw badRequest(`sequence for '${name}' -> '${fName}' contains duplicate stages`)
          for (const stage of cleaned) {
            if (!knownStages.has(stage)) throw badRequest(`sequence for '${name}' -> '${fName}' references unknown stage '${stage}'`)
          }
          sequences[name][fName] = cleaned
        }
      }
    }
    next.productSequences = sequences
  }

  if (patch.taskBasis !== undefined) {
    if (!patch.taskBasis || typeof patch.taskBasis !== 'object' || Array.isArray(patch.taskBasis)) {
      throw badRequest(`'taskBasis' must be an object of { stageKey: baseTask }`)
    }
    const taskBasis = {}
    const allowedBases = ['lamination', 'binding', 'creasing', 'dieCutting', 'cornerCutting', 'foil', 'fusing', 'holes', 'cutting', 'cutting2', 'independent']
    for (const [key, val] of Object.entries(patch.taskBasis)) {
      const cleanKey = String(key).trim()
      const cleanVal = String(val).trim()
      if (!allowedBases.includes(cleanVal)) {
        throw badRequest(`taskBasis['${cleanKey}'] must be one of: ${allowedBases.join(', ')}`)
      }
      taskBasis[cleanKey] = cleanVal
    }
    next.taskBasis = taskBasis
  }

  const existing = await systemConfigRepo.getConfigByKey(configKey(tenantId))
  const prevVersion = existing && existing.value && Number(existing.value.version)
  const envelope = {
    version: Number.isFinite(prevVersion) ? prevVersion + 1 : 1,
    updatedBy: opts.updatedBy != null ? opts.updatedBy : null,
    updatedAt: new Date().toISOString(),
    entries: next,
  }

  await systemConfigRepo.findOneAndUpdate(
    { key: configKey(tenantId) },
    { key: configKey(tenantId), value: envelope, description: 'Process registry (products, stages, variants, timings)' },
    { upsert: true, new: true }
  )

  await refresh(tenantId)
  return getMergedRegistry()
}

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  return err
}

module.exports = {
  DEFAULTS,
  configKey,
  getProductTypes,
  getPostPressStages,
  getFinishingStages,
  getLaminationVariants,
  getTimings,
  getProductSequences,
  getTaskBasis,
  getMergedRegistry,
  refresh,
  save,
}
