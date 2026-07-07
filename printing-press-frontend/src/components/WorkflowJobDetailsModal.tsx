import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import '@modules/press/frontend/PressDashboard.css'
import { useAuth } from '../hooks/useAuth'
import { getImageUrl } from '../utils/backendUrl'
import { formatEstimateLabel } from '../utils/productionTime'
import { api } from '../services/api'

const BINDING_DISPLAY_NAMES: Record<string, string> = {
  'SADDLE_STITCH': 'Center Pin',
  'CENTER_PIN':    'Center Pin',
  'CREASE':        'Creasing',
  'CREASE_PERF':   'Creasing / Perf',
  'PERFORATION':   'Perforation',
  'WHEEL_PERF':    'Wheel Perforation',
}

const labelize = (value?: string) => {
  if (!value || value === 'NONE') return '--'
  if (BINDING_DISPLAY_NAMES[value]) return BINDING_DISPLAY_NAMES[value]
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const formatDuration = (ms?: number) => {
  if (!ms || ms < 0) return '--'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m ${seconds}s`
}

type WorkflowTask = 'press' | 'lamination' | 'foil' | 'creasing' | 'binding' | 'dieCutting' | 'cutting' | 'cornerCutting' | 'fusing' | 'cutting2' | 'holes'

const cornerListLabel = (corners?: { tl?: boolean; tr?: boolean; bl?: boolean; br?: boolean }) => {
  if (!corners) return 'All sides'
  const labels = [
    corners.tl ? 'TL' : null,
    corners.tr ? 'TR' : null,
    corners.bl ? 'BL' : null,
    corners.br ? 'BR' : null,
  ].filter(Boolean)
  return labels.length ? labels.join(', ') : 'All sides'
}

const sizeLabel = (item: any) => {
  const qty = item?.size?.qty || '1'
  const h = item?.size?.h
  const w = item?.size?.w
  const sizeText = h && w ? `${w} × ${h}` : item?.size?.defaultVal || '--'
  return `Qty ${qty} | ${sizeText}`
}

// const FOIL_CODE_TO_LABEL: Record<string, string> = {
//   'SS_UV':              'Single Side UV',
//   'SS_GOLD':            'Single Side Gold Foil',
//   'SS_UV_SS_GOLD':      'Single Side UV & S/S Gold Foil',
//   'DS_SS_UV':           'D/S print + S/S UV',
//   'DS_DS_UV':           'D/S print + D/S UV',
//   'DS_SS_GOLD':         'D/S print + S/S Gold Foil',
//   'DS_DS_GOLD':         'D/S print + D/S Gold Foil',
//   'DS_SS_UV_SS_GOLD':   'D/S print + S/S UV & S/S Gold Foil',
//   'DS_DS_UV_DS_GOLD':   'D/S print + D/S UV & D/S Gold Foil',
//   'DS_DS_UV_SS_GOLD':   'D/S print + D/S UV & S/S Gold Foil',
//   'DS_DS_GOLD_SS_UV':   'D/S print + D/S Gold Foil & S/S UV',
// }

const workflowTypeLabel = (item: any, task: WorkflowTask, fallback?: string) => {
  if (task === 'lamination') {
    const raw = item.lamination && item.lamination !== 'NONE' ? item.lamination : (fallback || '--')
    // Strip parenthesised side/qty suffix — keep only the type name e.g. "GLOSS (SINGLE SIDE)" → "Gloss"
    const typeOnly = raw.includes('(') ? raw.substring(0, raw.indexOf('(')).trim() : raw
    return labelize(typeOnly) || '--'
  }
  if (task === 'foil') {
    // Full label stored directly in DB — show it as-is
    const label = item.foil && item.foil !== 'NONE' ? item.foil : (fallback || '--')
    return label
  }
  if (task === 'cutting') {
    if (item.idCard) {
      return 'Straight Cutting'
    }
    // Show no. of cuttings + all cut sizes on one line
    const qty = item.cuttingValue && String(item.cuttingValue).trim() ? `×${String(item.cuttingValue).trim()}` : ''
    if (item.cuttingSizes && item.cuttingSizes.length > 0) {
      const sizes = item.cuttingSizes
        .map((s: string) => s.split('*').map((v: string) => v.trim()).join('×'))
        .join(' | ')
      return qty ? `${qty} | Cut: ${sizes}` : `Cut: ${sizes}`
    }
    const base = sizeLabel(item)
    return qty ? `${qty} | ${base}` : base
  }
  if (task === 'cutting2') {
    if (item.cuttingSizes && item.cuttingSizes.length > 0) {
      const sizes = item.cuttingSizes
        .map((s: string) => s.split('*').map((v: string) => v.trim()).join('×'))
        .join(' | ')
      return `Cut: ${sizes}`
    }
    return labelize(fallback)
  }
  if (task === 'dieCutting') {
    // Show the die cut type (Half Cut / Full Cut / Shape Cut) stored in item.dieCutting
    const cutType = labelize(item.dieCutting)
    if (item.dieCuttingRows && item.dieCuttingRows.length > 0) {
      const row = item.dieCuttingRows[0]
      const parts = [cutType]
      if (row.sheets) parts.push(`Sheets: ${row.sheets}`)
      return `Die: ${parts.join(' | ')}`
    }
    return `Die: ${cutType}`
  }
  if (task === 'cornerCutting' && item.cornerCuttingValue) {
    return `Corner ${item.cornerCuttingValue} (${cornerListLabel(item.cornerCuttingCorners)})`
  }
  if (task === 'creasing') {
    // Show type only — NO: and Sheets are shown in their own dedicated rows below
    const label = item.creasing && item.creasing !== 'NONE' ? labelize(item.creasing) : (labelize(fallback) || '--')
    return label || '--'
  }
  if (task === 'binding') {
    // Show type only — NO: and Qty are shown in their own dedicated rows below
    const label = item.binding && item.binding !== 'NONE' ? labelize(item.binding) : (labelize(fallback) || '--')
    return label || '--'
  }
  return labelize(fallback)
}

/**
 * Returns workflow rows in the correct sequential order for this item.
 * Always starts with a Press step, followed by post-press/finishing tasks.
 *
 * ID Card flow:   Press → Cutting → Fusing → Cutting2 → Corner Cutting → Holes
 * Binding flow:   Press → Lamination → Creasing → Binding → Cutting
 * Die cut flow:   Press → Lamination → Cutting → Die Cutting
 * Pouch lam:      Press → Cutting → Binding
 * Corner cut:     Press → Lamination → Cutting → Corner Cutting
 */
const STAGE_ALIASES: Record<string, string[]> = {
  'SPIRAL_BIND': ['Wiro', 'Wiro Binding', 'Spiral', 'Spiral Bind'],
  'WIRO_BINDING': ['Wiro', 'Wiro Binding', 'Spiral', 'Spiral Bind'],
  'PERFECT_BIND': ['Perfect', 'Perfect Binding'],
  'PERFECT': ['Perfect', 'Perfect Binding'],
  'CENTER_PIN': ['Center Pin'],
  'CENTRE_PIN': ['Center Pin'],
  'POUCH_LAMINATION': ['Pouch', 'Pouch Lamination'],
  'SADDLE_STITCH': ['Center Pin']
}

function getStageCandidates(stage: string, val: any, item: any): string[] {
  if (!val || val === 'NONE') {
    if (stage === 'binding' && item.pouchLamination === true) {
      return ['Pouch', 'Pouch Lamination', 'POUCH_LAMINATION']
    }
    return []
  }

  const candidates: string[] = []

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

  return Array.from(new Set(candidates))
}

const workflowRows = (item: any, productSequences?: any) => {
  const isPouchLam = item.pouchLamination === true
  const isIdCard = item.idCard === true
  const hasBinding = item.binding && item.binding !== 'NONE'
  const hasCornerCut = item.cornerCutting && item.cornerCutting !== 'NONE'
  const isBindingFlow = hasBinding && !isPouchLam && !hasCornerCut && !isIdCard

  // Press step — always first
  const pressStatus = item.printConfirmed ? 'COMPLETED' : 'PENDING'
  const pressRow = { key: 'press', name: 'Press', type: 'Print', status: pressStatus }

  const all = [
    { key: 'cutting',       name: 'Cutting',        type: item.cutting,        status: item.cuttingStatus },
    { key: 'fusing',        name: 'Fusing',          type: item.fusing,         status: item.fusingStatus },
    { key: 'cutting2',      name: 'Cutting 2',       type: item.cutting2,       status: item.cutting2Status },
    { key: 'cornerCutting', name: 'Corner Cutting',  type: item.cornerCutting,  status: item.cornerCuttingStatus },
    { key: 'holes',         name: 'Holes',           type: item.holes,          status: item.holesStatus },
    { key: 'lamination',    name: 'Lamination',      type: item.lamination,     status: item.laminationStatus },
    { key: 'foil',          name: 'Foil',            type: item.foil,           status: item.foilStatus },
    { key: 'binding',       name: 'Binding / Fold',  type: item.binding,        status: item.bindingStatus },
    { key: 'creasing',      name: 'Creasing',        type: item.creasing,       status: item.creasingStatus },
    { key: 'dieCutting',    name: 'Die Cutting',     type: item.dieCutting,     status: item.dieCuttingStatus },
  ]

  // Build ordered list based on product sequence if available, otherwise fall back to hardcoded defaults
  let order: string[] = []

  const productFlows = productSequences && productSequences[item.type]
  if (productFlows && typeof productFlows === 'object') {
    const keys = Object.keys(productFlows)
    let matchedFlow: string | null = null

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

    for (const field of fields) {
      const val = item[field]
      const candidates = getStageCandidates(field, val, item)
      if (candidates.length > 0) {
        for (const candidate of candidates) {
          const matchedKey = keys.find(k => k.toLowerCase() === candidate.toLowerCase())
          if (matchedKey) {
            matchedFlow = matchedKey
            break
          }
        }
      }
      if (matchedFlow) break
    }

    const activeFlowName = matchedFlow || 'Default'
    const sequence = productFlows[activeFlowName] || productFlows['Default']
    if (Array.isArray(sequence) && sequence.length > 0) {
      order = sequence
    }
  }

  // Fall back to original hardcoded order rules if no custom registry sequence matched
  if (order.length === 0) {
    if (isIdCard) {
      order = ['cutting', 'fusing', 'cutting2', 'cornerCutting', 'holes']
    } else if (item.foil && item.foil !== 'NONE' && hasBinding && !isPouchLam) {
      order = ['lamination', 'foil', 'binding', 'cutting', 'dieCutting', 'cornerCutting']
    } else if (item.foil && item.foil !== 'NONE') {
      order = ['lamination', 'foil', 'cutting', 'dieCutting', 'cornerCutting']
    } else if (isBindingFlow) {
      order = ['lamination', 'creasing', 'binding', 'cutting', 'dieCutting', 'cornerCutting']
    } else if (isPouchLam) {
      order = ['cutting', 'binding', 'cornerCutting']
    } else {
      order = ['lamination', 'cutting', 'binding', 'cornerCutting', 'creasing', 'dieCutting']
    }
  }

  const postPressRows = order
    .map(k => {
      const found = all.find(r => r.key === k)
      if (found) return found
      // If it's a custom admin-defined step, map it dynamically
      const displayName = k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      const stepStatus = item.workflowSteps?.find((s: any) => s.stepName === k)?.status || 'NONE'
      return { key: k, name: displayName, type: 'Custom Process', status: stepStatus }
    })
    .filter(r => r && ((r.type && r.type !== 'NONE') || r.status !== 'NONE'))

  // Always prepend Press step and append Dispatch step
  const dispatched = item._jobStatus === 'DISPATCHED'
  const dispatchRow = {
    key: 'dispatch',
    name: 'Dispatch',
    type: dispatched ? 'Dispatched' : 'Ready to ship',
    status: dispatched ? 'COMPLETED' : 'PENDING'
  }
  return [pressRow, ...postPressRows, dispatchRow]
}

const statusStepState = (row: any, index: number, currentIndex: number) => {
  if (row.status === 'COMPLETED') return { className: 'complete', label: 'Done' }
  if (index === currentIndex) return { className: 'current', label: 'Current' }
  return { className: 'upcoming', label: 'Pending' }
}

const statusLabel = (status?: string) => {
  if (status === 'COMPLETED') return 'Done'
  if (status === 'PENDING') return 'Pending'
  return '--'
}

const currentWorkflowDetail = (rows: any[], workflowTask?: WorkflowTask | null) => {
  const workflowIndex = workflowTask ? rows.findIndex((row) => row.key === workflowTask) : -1
  const pendingIndex = rows.findIndex((row) => row.status === 'PENDING')
  const currentIndex = workflowIndex >= 0 ? workflowIndex : pendingIndex
  const detailIndex = currentIndex >= 0 ? currentIndex : Math.max(rows.length - 1, 0)

  return {
    currentIndex,
    detail: rows[detailIndex],
  }
}

type Props = {
  job: any
  onClose: () => void
  workflowLabel?: string
  workflowTask?: WorkflowTask | null
  onCompleteItemTask?: (itemIndex: number, task: WorkflowTask, rollCode?: string) => void
  completingItemIndex?: number | null
  isCompleting?: boolean
  confirmedItemIndexes?: Set<number>
  /** Items that have been "started" — shows Confirm button instead of Start */
  startedItemIndexes?: Set<number>
  footerAction?: React.ReactNode
  /** Optional extra filter applied on top of workflowTask filtering */
  itemFilter?: (item: any) => boolean
  /** If provided, shows an Edit Timings button on each item card header (admin only) */
  onEditTimings?: (item: any, itemIndex: number) => void
  /** Estimated time per item index (minutes) */
  itemTimings?: Record<number, number>
  /** Whether to show logs button (default: true, only visible to admin) */
  showLogs?: boolean
  /** History/read-only: show every item with full workflow status (no stage filter) */
  showAllItems?: boolean
  /** Finishing sub-roles: only show these workflow steps (hides creasing, dispatch, etc.) */
  allowedWorkflowKeys?: string[]
  /** Called after an admin status override so the parent can refresh its data */
  onRefresh?: () => void
}

export default function WorkflowJobDetailsModal({
  job,
  onClose,
  workflowLabel,
  workflowTask,
  onCompleteItemTask,
  completingItemIndex = null,
  isCompleting = false,
  confirmedItemIndexes,
  startedItemIndexes,
  footerAction,
  itemFilter,
  onEditTimings,
  itemTimings,
  showLogs = true,
  showAllItems = false,
  allowedWorkflowKeys,
  onRefresh,
}: Props) {
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [currentTask, setCurrentTask] = useState<WorkflowTask | null>(workflowTask || null)
  const [showItemLog, setShowItemLog] = useState<{ itemIndex: number; logs: any[] } | null>(null)
  const [selectedStep, setSelectedStep] = useState<{ itemIdx: number; rowKey: string } | null>(null)

  // Lamination roll selection state
  const [availableRolls, setAvailableRolls] = useState<any[]>([])
  const [selectedRollCodes, setSelectedRollCodes] = useState<Record<number, string>>({})
  const [showAllRollTypes, setShowAllRollTypes] = useState<Record<number, boolean>>({})

  const [productSequences, setProductSequences] = useState<any>(null)
  useEffect(() => {
    api.get('/api/admin/process-registry')
      .then(res => {
        if (res.data && res.data.productSequences) {
          setProductSequences(res.data.productSequences)
        }
      })
      .catch(err => {
        console.error('Failed to load process registry for workflow details:', err)
      })
  }, [])

  useEffect(() => {
    if (currentTask === 'lamination') {
      api.get('/api/post-press/lamination-products/available')
        .then(res => {
          setAvailableRolls(res.data || [])
        })
        .catch(err => {
          console.error('Failed to fetch available rolls:', err)
        })
    }
  }, [currentTask])

  const getNormalizedType = (rawType: string) => {
    const t = String(rawType).toUpperCase().trim()
    if (t.includes('GLOSS')) return 'GLOSS'
    if (t.includes('MATT')) return 'MATT'
    if (t.includes('VELVET')) return 'VELVET'
    return 'OTHER'
  }
  
  const { user } = useAuth()
  const userRoles = user?.roles || []
  const isAdmin = userRoles.includes('ADMIN')

  useEffect(() => {
    setCurrentTask(workflowTask || null)
  }, [workflowTask])

  const POST_PRESS_STAGES = ['lamination', 'foil', 'binding', 'fusing', 'holes']
  const FINISHING_STAGES = ['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2']

  // Lag calculation functions
  const calculatePressToPostPressLag = (itemTaskLog: any[]) => {
    if (!itemTaskLog || itemTaskLog.length === 0) return null
    const pressCompletion = itemTaskLog
      .filter(l => l.module === 'press' && l.completedAt)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
    const postPressStart = itemTaskLog
      .filter(l => l.module === 'post_press' && l.startedAt)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())[0]
    if (!pressCompletion || !postPressStart) return null
    return new Date(postPressStart.startedAt).getTime() - new Date(pressCompletion.completedAt).getTime()
  }

  const calculatePostPressToFinishingLag = (itemTaskLog: any[]) => {
    if (!itemTaskLog || itemTaskLog.length === 0) return null
    const postPressCompletion = itemTaskLog
      .filter(l => l.module === 'post_press' && l.completedAt)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
    const finishingStart = itemTaskLog
      .filter(l => l.module === 'finishing' && l.startedAt)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())[0]
    if (!postPressCompletion || !finishingStart) return null
    return new Date(finishingStart.startedAt).getTime() - new Date(postPressCompletion.completedAt).getTime()
  }

  const calculateFinishingToPressLag = (itemTaskLog: any[]) => {
    if (!itemTaskLog || itemTaskLog.length === 0) return null
    const finishingCompletion = itemTaskLog
      .filter(l => l.module === 'finishing' && l.completedAt)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
    const pressStart = itemTaskLog
      .filter(l => l.module === 'press' && l.startedAt)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())[0]
    if (!finishingCompletion || !pressStart) return null
    // This calculates time from finishing completion to dispatch (end of workflow)
    return finishingCompletion.completedAt ? new Date(finishingCompletion.completedAt).getTime() - new Date(pressStart.startedAt).getTime() : null
  }

  const isPostPressContext = workflowTask && POST_PRESS_STAGES.includes(workflowTask)
  const isFinishingContext = workflowTask && FINISHING_STAGES.includes(workflowTask)
  const isPressContext = workflowTask === 'press'

  const allItems = job.items?.map((item: any, index: number) => ({ item, index: item.itemIndex ?? index })) || []
  const visibleItems = itemFilter
    ? allItems.filter(({ item }: any) => itemFilter(item))
    : allItems

  const activeStages = Array.from(new Set(
    visibleItems
      .map(({ item }: any) => item.activeStage)
      .filter(Boolean)
  )) as WorkflowTask[]

  const relevantActiveStages = activeStages.filter(stage => {
    if (isPressContext) return stage === 'press'
    if (isPostPressContext) return POST_PRESS_STAGES.includes(stage)
    if (isFinishingContext) return FINISHING_STAGES.includes(stage)
    return false
  })

  useEffect(() => {
    if (currentTask && relevantActiveStages.length > 0 && !relevantActiveStages.includes(currentTask)) {
      setCurrentTask(relevantActiveStages[0])
    }
  }, [relevantActiveStages, currentTask])

  const currentItems = showAllItems || !currentTask
    ? visibleItems
    : visibleItems.filter(({ item }: any) => item.activeStage === currentTask)

  const displayLabel = currentTask
    ? (currentTask === 'press' ? 'Press'
      : currentTask === 'lamination' ? 'Lamination'
      : currentTask === 'foil' ? 'Foil'
      : currentTask === 'binding' ? 'Binding / Fold'
        : currentTask === 'cutting' ? 'Cutting'
          : currentTask === 'creasing' ? 'Creasing'
            : currentTask === 'dieCutting' ? 'Die Cutting'
              : currentTask === 'cornerCutting' ? 'Corner Cutting'
                : currentTask === 'fusing' ? 'Fusing'
                  : currentTask === 'cutting2' ? 'Cutting 2'
                    : currentTask === 'holes' ? 'Holes'
                      : labelize(currentTask))
    : workflowLabel;
  /*
  const jobDetails = [
    ['Customer', job.customerName || '--'],
    ['Phone', job.customerPhone || '--'],
    ['Total Items', job.items?.length || job.totalItems || 0],
    ['Packing', job.packingMode || job.packingPreference || '--'],
    ['Delivery', labelize(job.defaultDeliveryType)],
    ['Submitted By', job.createdBy?.name || '--'],
    ['Job Status', labelize(job.jobStatus)],
    ['Description', job.jobDescription || job.items?.map((item: any) => item.orderDescription).filter(Boolean).join(', ') || '--'],
  ]
  */

  return (
    <>
      <div className="press-modal-overlay workflow-modal-overlay" onClick={onClose}>
        <div className="press-modal-container workflow-modal-container" onClick={(e) => e.stopPropagation()}>
          <div className="press-modal-header workflow-modal-header">
            <div>
              <h2 className="press-modal-title">Job #{job.jobId}</h2>
              <div className="workflow-modal-subtitle">
                <span>Customer: {job.customerName}</span>
                <span>Items: {job.items?.length || job.totalItems || 0}</span>
                {job.jobStatus && <span>Status: {labelize(job.jobStatus)}</span>}
                {displayLabel && <span>Step: {displayLabel}</span>}
                <span>Submitted By: {job.createdBy?.name || '--'}</span>
              </div>
            </div>
            <button type="button" className="press-modal-close" onClick={onClose}>&times;</button>
          </div>

          <div className="press-modal-content workflow-modal-content">

            <section className="workflow-section">
              <div className="workflow-section-header">
                <h3>Items</h3>
                <span>
                  {showAllItems || !workflowTask
                    ? `${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'}`
                    : `${currentItems.length} current of ${job.items?.length || 0} total`}
                </span>
              </div>

              {relevantActiveStages.length > 1 && (
                <div className="modal-task-tabs" style={{
                  display: 'flex',
                  gap: '0.5rem',
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: '0.75rem',
                  marginBottom: '1rem',
                  flexWrap: 'wrap'
                }}>
                   {relevantActiveStages.map((stage) => {
                    const label = stage === 'lamination' ? 'Lamination'
                      : stage === 'binding' ? 'Binding / Fold'
                        : stage === 'cutting' ? 'Cutting'
                          : stage === 'creasing' ? 'Creasing'
                            : stage === 'dieCutting' ? 'Die Cutting'
                              : stage === 'cornerCutting' ? 'Corner Cutting'
                                : stage === 'fusing' ? 'Fusing'
                                  : stage === 'cutting2' ? 'Cutting 2'
                                    : stage === 'holes' ? 'Holes'
                                      : labelize(stage);

                    const itemCount = visibleItems.filter(({ item }: any) => item.activeStage === stage).length;
                    const isActive = currentTask === stage;

                    return (
                      <button
                        key={stage}
                        type="button"
                        onClick={() => setCurrentTask(stage)}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          border: '1px solid',
                          borderColor: isActive ? '#1d4ed8' : '#e2e8f0',
                          background: isActive ? '#1d4ed8' : '#f8fafc',
                          color: isActive ? '#fff' : '#475569',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {label}
                        <span style={{
                          background: isActive ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                          color: isActive ? '#fff' : '#64748b',
                          borderRadius: '10px',
                          padding: '1px 6px',
                          fontSize: '0.7rem',
                          fontWeight: 700
                        }}>
                          {itemCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {currentTask === 'lamination' && currentItems.length > 0 && (() => {
                const typeCount: Record<string, number> = {}
                currentItems.forEach(({ item }: any) => {
                  const raw = item.lamination && item.lamination !== 'NONE' ? item.lamination : null
                  if (!raw) return
                  typeCount[raw] = (typeCount[raw] || 0) + 1
                })
                const laminationTypes = Object.entries(typeCount)
                if (laminationTypes.length < 2) return null
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', alignSelf: 'center' }}>Types:</span>
                    {laminationTypes.map(([type, count]) => {
                      const typeOnly = type.includes('(') ? type.substring(0, type.indexOf('(')).trim() : type
                      const sideMatch = type.match(/\(([^)]+)\)/)
                      const sideLabel = sideMatch ? ` · ${sideMatch[1].replace('SIDE', '').trim()}` : ''
                      return (
                        <span key={type} style={{ background: '#0ea5e9', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
                          {count}× {typeOnly}{sideLabel}
                        </span>
                      )
                    })}
                  </div>
                )
              })()}

              <div className="workflow-item-list">
                {currentItems.length === 0 && (
                  <div className="workflow-empty-state">
                    {showAllItems || !workflowTask
                      ? 'No items found for this job.'
                      : 'No items are waiting in the current stage.'}
                  </div>
                )}
                {currentItems.map(({ item, index }: any) => {
                  const imgPath = item.screenshot
                  const fullUrl = getImageUrl(imgPath)
                  const allRows = workflowRows({ ...item, _jobStatus: job.jobStatus }, productSequences)
                  const rows = allowedWorkflowKeys?.length
                    ? allRows.filter((row) => allowedWorkflowKeys.includes(row.key))
                    : allRows
                  const { currentIndex, detail: currentDetail } = currentWorkflowDetail(rows, currentTask)
                  const sizeText = [item.size?.w, item.size?.h].filter(Boolean).join(' × ')
                  
                  let qtyLabel = 'Quantity'
                  let qtyValue = item.size?.qty || '1'
                  if (currentDetail) {
                    if (currentDetail.key === 'cutting') {
                      qtyLabel = 'No.of Cutting'
                      qtyValue = item.cuttingValue || '1'
                    } else if (currentDetail.key === 'cutting2') {
                      qtyLabel = 'No.of Cutting'
                      qtyValue = item.cutting2Value || '1'
                    } else if (currentDetail.key === 'lamination') {
                      qtyLabel = 'Lamination Qty'
                      qtyValue = item.laminationQty !== undefined ? String(item.laminationQty) : '--'
                    } else if (currentDetail.key === 'foil') {
                      qtyLabel = 'Foil Qty'
                      qtyValue = item.foilQty || '--'
                    } else if (currentDetail.key === 'binding') {
                      qtyLabel = 'Binding Qty'
                      qtyValue = item.bindingQty !== undefined ? String(item.bindingQty) : '--'
                    } else if (currentDetail.key === 'creasing') {
                      qtyLabel = 'Creasing Qty'
                      qtyValue = item.creasingQty !== undefined ? String(item.creasingQty) : '--'
                    } else if (currentDetail.key === 'dieCutting') {
                      qtyLabel = 'No. of Sheets'
                      // sheets value lives in dieCuttingRows[0].sheets (from the job card table)
                      const sheetsVal = item.dieCuttingRows?.[0]?.sheets
                      qtyValue = sheetsVal && String(sheetsVal).trim() ? String(sheetsVal) : (item.dieCuttingQty > 0 ? String(item.dieCuttingQty) : '--')
                    } else if (currentDetail.key === 'cornerCutting') {
                      qtyLabel = 'Corner Cutting Qty'
                      qtyValue = item.cornerCuttingQty !== undefined ? String(item.cornerCuttingQty) : '--'
                    } else if (currentDetail.key === 'idCard') {
                      qtyLabel = 'ID Card Qty'
                      qtyValue = item.idCardQty !== undefined ? String(item.idCardQty) : '--'
                    }
                  }

                  // For lamination step: extract side ("Single Side" / "Double Side") from
                  // the stored lamination string e.g. "GLOSS (SINGLE SIDE)" → "Single Side"
                  const laminationSide = (() => {
                    if (currentDetail?.key !== 'lamination' || !item.lamination) return null
                    const upper = String(item.lamination).toUpperCase()
                    if (upper.includes('SINGLE SIDE')) return 'Single Side'
                    if (upper.includes('DOUBLE SIDE')) return 'Double Side'
                    return null
                  })()

                  const itemDetails = [
                    ['Item Description', item.orderDescription || '--'],
                    ['Current Job', currentDetail?.name || '--'],
                    ['Job Detail', currentDetail ? workflowTypeLabel(item, currentDetail.key, currentDetail.type) : '--'],
                    ['Status', statusLabel(currentDetail?.status)],
                    [qtyLabel, qtyValue],
                    [
                      currentDetail?.key === 'creasing' ? 'No. of Stock'
                        : currentDetail?.key === 'dieCutting' ? 'Timing'
                        : 'Side',
                      currentDetail?.key === 'creasing'
                        ? (item.creasingNo && String(item.creasingNo).trim() ? String(item.creasingNo) : '--')
                        : currentDetail?.key === 'dieCutting'
                        ? (item.dieCuttingRows?.[0]?.timing && String(item.dieCuttingRows[0].timing).trim() ? String(item.dieCuttingRows[0].timing) : '--')
                        : (laminationSide ?? (sizeText || item.size?.defaultVal || '--'))
                    ],]

                  return (
                    <div key={index} className="press-item-card workflow-item-card" style={{ padding: '0.6rem 0.75rem', gap: '0.5rem' }}>
                      <div className="workflow-item-card-header">
                        <div>
                          <h4>Item #{index + 1}</h4>
                          <p>{item.orderDescription || 'No description provided.'}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {itemTimings && itemTimings[index] > 0 && (
                            <span style={{
                              fontSize: '0.72rem', fontWeight: 700,
                              color: itemTimings[index] >= 1440 ? '#dc2626' : itemTimings[index] >= 180 ? '#f59e0b' : '#16a34a',
                              background: itemTimings[index] >= 1440 ? '#fee2e2' : itemTimings[index] >= 180 ? '#fef3c7' : '#dcfce7',
                              padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap'
                            }}>
                              ⏱ {formatEstimateLabel(itemTimings[index])}
                            </span>
                          )}
                          {onEditTimings && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onEditTimings(item, index) }}
                              style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              Edit Timings
                            </button>
                          )}
                          {isAdmin && !workflowTask && showLogs && (
                            <button
                              type="button"
                              onClick={(e) => { 
                                e.stopPropagation()
                                // Fetch item-specific logs
                                const itemLogs = job.taskLog?.filter((log: any) => log.itemIndex === index) || []
                                console.log(`📋 Logs clicked for item ${index}:`, { totalTaskLog: job.taskLog?.length || 0, itemLogs, jobId: job.jobId })
                                setShowItemLog({ itemIndex: index, logs: itemLogs })
                              }}
                              style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', border: '1px solid #3b82f6', background: '#dbeafe', color: '#1e40af', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              📋 Logs
                            </button>
                          )}
                          <span className="status-badge">{rows.filter((row) => row.status === 'COMPLETED').length}/{rows.length || 0} done</span>
                        </div>
                      </div>

                      {/* Status tracker + diagram — hidden until started when startedItemIndexes provided */}
                      {(!startedItemIndexes || startedItemIndexes.has(index)) && (
                      <div className="workflow-tracker-diagram-row" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {rows.length > 0 ? (
                            <div className="workflow-status-tracker" style={{ gridAutoColumns: 'minmax(70px, 1fr)', padding: '0.1rem 0 0.4rem' }}>
                              {rows.map((row, rowIndex) => {
                                const state = statusStepState(row, rowIndex, currentIndex)

                                // Show staff name only for COMPLETED steps — look it up from job.taskLog
                                let stepStaffName: string | null = null
                                if (state.className === 'complete' && job.taskLog && job.taskLog.length > 0) {
                                  if (row.key === 'dispatch') {
                                    const e = job.taskLog
                                      .filter((l: any) => l.task === 'dispatch' && l.staffName && l.completedAt)
                                      .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
                                    stepStaffName = e?.staffName || job.dispatchedByName || null
                                  } else {
                                    const e = job.taskLog
                                      .filter((l: any) =>
                                        l.task === row.key &&
                                        l.staffName &&
                                        l.completedAt &&
                                        l.itemIndex === index
                                      )
                                      .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
                                    stepStaffName = e?.staffName || null
                                  }
                                }

                                const isStepSelected = selectedStep?.itemIdx === index && selectedStep?.rowKey === row.key
                                return (
                                  <div
                                    key={`${row.name}-${rowIndex}`}
                                    className={`workflow-status-step ${state.className} ${isStepSelected ? 'selected' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedStep(prev =>
                                      prev?.itemIdx === index && prev?.rowKey === row.key ? null : { itemIdx: index, rowKey: row.key }
                                    )}
                                    onKeyDown={(e) => e.key === 'Enter' && setSelectedStep(prev =>
                                      prev?.itemIdx === index && prev?.rowKey === row.key ? null : { itemIdx: index, rowKey: row.key }
                                    )}
                                  >
                                    <div className="workflow-step-marker" style={{ width: 26, height: 26, minWidth: 26, fontSize: '0.65rem' }}>
                                      {state.className === 'complete' ? (
                                        <svg viewBox="0 0 20 20" aria-hidden="true">
                                          <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                                        </svg>
                                      ) : (
                                        rowIndex + 1
                                      )}
                                    </div>
                                    <div className="workflow-step-copy">
                                      <strong style={{ fontSize: '0.6rem' }}>{row.name}</strong>
                                      <span style={{ fontSize: '0.575rem' }}>{labelize(row.type)}</span>
                                      <em style={{ fontSize: '0.55rem' }}>{state.label}</em>
                                      <span style={{
                                        fontSize: '0.55rem',
                                        fontStyle: 'normal',
                                        fontWeight: stepStaffName ? 700 : 400,
                                        color: stepStaffName ? '#059669' : '#94a3b8',
                                        marginTop: '1px',
                                      }}>
                                        {stepStaffName || '--'}
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="workflow-empty-state">No post press or finishing tasks for this item.</div>
                          )}

                          {/* Step detail panel — shown when a step is clicked */}
                          {selectedStep?.itemIdx === index && (() => {
                            if (!selectedStep) return null
                            const selRow = rows.find(r => r.key === selectedStep.rowKey)
                            if (!selRow) return null
                            const selRowIndex = rows.findIndex(r => r.key === selectedStep.rowKey)
                            const selState = statusStepState(selRow, selRowIndex, currentIndex)
                            const stepLog = selRow.key === 'dispatch'
                              ? (job.taskLog || [])
                                  .filter((l: any) => l.task === 'dispatch' && l.completedAt)
                                  .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
                              : (job.taskLog || [])
                                  .filter((l: any) => l.task === selRow.key && l.itemIndex === index && l.completedAt)
                                  .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
                            const duration = stepLog?.startedAt && stepLog?.completedAt
                              ? new Date(stepLog.completedAt).getTime() - new Date(stepLog.startedAt).getTime()
                              : null
                            return (
                              <div className="step-detail-panel" style={{ marginTop: '0.4rem', padding: '0.5rem 0.65rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.7rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                  <strong style={{ color: '#0f172a', fontSize: '0.72rem' }}>{selRow.name}</strong>
                                  <span style={{
                                    padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '0.62rem',
                                    background: selState.className === 'complete' ? '#dcfce7' : selState.className === 'current' ? '#dbeafe' : '#f1f5f9',
                                    color: selState.className === 'complete' ? '#166534' : selState.className === 'current' ? '#1d4ed8' : '#475569'
                                  }}>{selState.label}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem 0.75rem', color: '#64748b' }}>
                                  <span>Type: <strong style={{ color: '#0f172a' }}>{labelize(selRow.type)}</strong></span>
                                  {stepLog?.staffName && <span>By: <strong style={{ color: '#059669' }}>{stepLog.staffName}</strong></span>}
                                  {stepLog?.completedAt && <span>Done: <strong style={{ color: '#0f172a' }}>{new Date(stepLog.completedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></span>}
                                  {stepLog?.startedAt && <span>Started: <strong style={{ color: '#0f172a' }}>{new Date(stepLog.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></span>}
                                  {duration !== null && <span>Duration: <strong style={{ color: '#0f172a' }}>{formatDuration(duration)}</strong></span>}
                                </div>
                                {isAdmin && onRefresh && selRow.key !== 'dispatch' && (
                                  <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9333ea', textTransform: 'uppercase' }}>Admin Override:</span>
                                    <select
                                      defaultValue={selRow.status || 'PENDING'}
                                      className="admin-override-select"
                                      onChange={async (e) => {
                                        try {
                                          await api.patch(`/api/admin/jobs/${job.jobId}/items/${index}/override`, { task: selRow.key, status: e.target.value })
                                          setSelectedStep(null)
                                          onRefresh()
                                        } catch {
                                          alert('Override failed')
                                        }
                                      }}
                                    >
                                      <option value="PENDING">Pending</option>
                                      <option value="COMPLETED">Completed</option>
                                      {selRow.key !== 'press' && <option value="NONE">None (skip)</option>}
                                    </select>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </div>

                        {/* Diagram in the right free space next to status tracker */}
                        {(
                          (currentDetail?.key === 'cutting' && !item.idCard && item.cuttingSizes && item.cuttingSizes.length > 0) ||
                          (currentDetail?.key === 'cutting2' && item.idCard && item.cuttingSizes && item.cuttingSizes.length > 0) ||
                          (currentDetail?.key === 'dieCutting' && item.dieCutting && item.dieCutting !== 'NONE') ||
                          (currentDetail?.key === 'cornerCutting' && item.cornerCutting && item.cornerCutting !== 'NONE')
                        ) && (
                            <div className="workflow-diagram-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '140px', maxWidth: '200px', flexShrink: 0 }}>
                              {/* Insert sizes — only for cutting step (non-ID Card) or cutting2 step (ID Card) */}
                              {((currentDetail?.key === 'cutting' && !item.idCard) || (currentDetail?.key === 'cutting2' && item.idCard)) && item.cuttingSizes && item.cuttingSizes.length > 0 && (
                                <div>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Insert Sizes
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                    {item.cuttingSizes.map((size: string, si: number) => {
                                      const [h, w] = size.split('*').map((v: string) => v.trim())
                                      return (
                                        <span key={si} style={{ background: '#f1f5f9', border: '2px solid #475569', borderRadius: '6px', padding: '6px 12px', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
                                          {h}×{w}
                                        </span>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              {/* Die cutting info — only for dieCutting step */}
                              {currentDetail?.key === 'dieCutting' && item.dieCutting && item.dieCutting !== 'NONE' && (
                                <div>
                                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Die Cutting
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    <span style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', color: '#92400e', fontWeight: 600 }}>
                                      {labelize(item.dieCutting)}
                                    </span>
                                    {item.dieCuttingRows && item.dieCuttingRows.map((row: any, ri: number) => (
                                      row.sheets ? (
                                        <span key={ri} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', color: '#334155', fontWeight: 600 }}>
                                          Sheets: {row.sheets}
                                        </span>
                                      ) : null
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Corner cutting diagram — only for cornerCutting step */}
                              {currentDetail?.key === 'cornerCutting' && item.cornerCutting && item.cornerCutting !== 'NONE' && (
                                <div style={{ padding: '0.65rem', border: '1px dashed #94a3b8', borderRadius: '8px' }}>
                                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.45rem' }}>
                                    CORNER CUT PREVIEW
                                  </div>
                                  {/* Show actual item image with corner radius applied */}
                                  {(() => {
                                    // Scale mm radius to pixels — use a sensible default if not set
                                    const mmVal = parseFloat(item.cornerCuttingValue || '0') || 0
                                    // If no value given, use a default of 8px so corners are always visibly cut
                                    // Otherwise scale: image is 120px wide, typical card 85mm → ~1.4px/mm, min 6px
                                    const pxRadius = mmVal > 0
                                      ? Math.max(Math.min(Math.round(mmVal * 1.4), 28), 6)
                                      : 12  // default visible cut when no value entered
                                    const r = `${pxRadius}px`
                                    const tl = item.cornerCuttingCorners?.tl ? r : '0'
                                    const tr = item.cornerCuttingCorners?.tr ? r : '0'
                                    const bl = item.cornerCuttingCorners?.bl ? r : '0'
                                    const br = item.cornerCuttingCorners?.br ? r : '0'
                                    return fullUrl ? (
                                      <img
                                        src={fullUrl}
                                        alt="Corner cut preview"
                                        style={{
                                          width: '120px',
                                          height: '80px',
                                          objectFit: 'cover',
                                          display: 'block',
                                          borderTopLeftRadius: tl,
                                          borderTopRightRadius: tr,
                                          borderBottomLeftRadius: bl,
                                          borderBottomRightRadius: br,
                                          border: '1px solid #cbd5e1',
                                        }}
                                      />
                                    ) : (
                                      <div style={{
                                        width: '120px',
                                        height: '80px',
                                        background: '#f1f5f9',
                                        border: '2px solid #1e293b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.6rem',
                                        color: '#64748b',
                                        borderTopLeftRadius: tl,
                                        borderTopRightRadius: tr,
                                        borderBottomLeftRadius: bl,
                                        borderBottomRightRadius: br,
                                      }}>
                                        NO IMAGE
                                      </div>
                                    )
                                  })()}
                                  <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: '#475569' }}>
                                    R: <strong>{item.cornerCuttingValue || '--'}</strong>
                                    {' · '}
                                    {cornerListLabel(item.cornerCuttingCorners)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                      )} {/* end startedItemIndexes tracker hide */}

                      <div className="workflow-item-body" style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr)', gap: '0.625rem', alignItems: 'start' }}>
                        <div className="press-item-preview-box workflow-item-preview" style={{ width: 64, height: 64, minWidth: 64 }} onClick={() => fullUrl && setViewImage(fullUrl)} role="button">
                          {fullUrl ? (
                            <img src={fullUrl} alt={`Item ${index + 1}`} className="press-item-preview-img" loading="lazy" decoding="async" />
                          ) : (
                            <div className="workflow-empty-preview">NO IMAGE</div>
                          )}
                          <span className="workflow-item-number">#{index + 1}</span>
                        </div>

                        {/* Left: item details + colors + action button */}
                        <div className="workflow-item-main">
                          {/* Hide item details until item is started (when startedItemIndexes is provided) */}
                          {(!startedItemIndexes || startedItemIndexes.has(index)) && (
                            <>
                              <div className="workflow-key-value-list workflow-item-key-values">
                                {itemDetails.map(([key, value]) => (
                                  <div key={key} className="workflow-key-value-row" style={{ minHeight: 18, columnGap: '0.5rem', gridTemplateColumns: 'minmax(80px,110px) minmax(0,1fr)' }}>
                                    <span className="workflow-key" style={{ fontSize: '0.68rem', padding: '0.05rem 0' }}>{key}</span>
                                    <span className="workflow-value" style={{ fontSize: '0.68rem', padding: '0.05rem 0' }}>{value}</span>
                                  </div>
                                ))}
                              </div>

                              {(item.mc || item.fc || item.ac) && (
                                <div className="workflow-color-row">
                                  {item.mc && <span className="status-badge workflow-color-mc">MC: {item.mc}</span>}
                                  {item.fc && <span className="status-badge workflow-color-fc">FC: {item.fc}</span>}
                                  {item.ac && <span className="status-badge workflow-color-ac">AC: {item.ac}</span>}
                                </div>
                              )}
                            </>
                          )}

                          {startedItemIndexes && !startedItemIndexes.has(index) && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', padding: '0.5rem 0' }}>
                              Click <strong>▶ Start Item #{index + 1}</strong> to reveal details
                            </div>
                          )}

                          {!!onCompleteItemTask && (
                            (currentTask === 'press'
                              ? !confirmedItemIndexes?.has(index)  // press: show if not yet confirmed
                              : currentTask
                                ? currentDetail?.status === 'PENDING' && currentDetail?.key === currentTask
                                : true
                            )
                          ) && (
                              <div style={{ marginTop: '0.75rem' }}>
                                {currentTask === 'press' ? (
                                  // Press context — show confirm button
                                  <button
                                    type="button"
                                    className="press-btn-finish"
                                    disabled={isCompleting}
                                    onClick={() => onCompleteItemTask(index, 'press' as WorkflowTask)}
                                  >
                                    {isCompleting && completingItemIndex === index
                                      ? `Confirming Item #${index + 1}...`
                                      : `Confirm Item #${index + 1} Printed`}
                                  </button>
                                ) : !currentTask && confirmedItemIndexes?.has(index) ? (
                                  <button
                                    type="button"
                                    className="press-btn-finish"
                                    disabled
                                    style={{ background: '#22c55e', borderColor: '#22c55e', opacity: 1 }}
                                  >
                                    ✓ Item #{index + 1} Confirmed
                                  </button>
                                ) : (
                                  <>
                                    {currentTask === 'lamination' && startedItemIndexes?.has(index) && (
                                      <div style={{ marginTop: '0.5rem', marginBottom: '0.75rem', textAlign: 'left' }}>
                                        <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>
                                          Select Lamination Roll <span style={{ color: '#ef4444' }}>*</span>
                                          <span className="status-badge" style={{ marginLeft: '0.4rem', fontSize: '0.6rem', padding: '0.1rem 0.3rem', background: '#e0f2fe', color: '#0369a1', textTransform: 'uppercase' }}>
                                            Expected: {getNormalizedType(item.lamination || '')}
                                          </span>
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                          <select
                                            value={selectedRollCodes[index] || ''}
                                            onChange={(e) => setSelectedRollCodes(prev => ({ ...prev, [index]: e.target.value }))}
                                            className="filter-select"
                                            style={{ height: '32px', fontSize: '0.75rem', flex: 1, padding: '0 0.5rem' }}
                                          >
                                            <option value="">-- Choose Roll --</option>
                                            {(showAllRollTypes[index]
                                              ? availableRolls
                                              : availableRolls.filter(r => r.laminationType === getNormalizedType(item.lamination || ''))
                                            ).map((r: any) => (
                                              <option key={r.id} value={r.productName}>
                                                {r.productName} ({r.laminationType} - {r.type}")
                                              </option>
                                            ))}
                                          </select>
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                            <input
                                              type="checkbox"
                                              checked={!!showAllRollTypes[index]}
                                              onChange={(e) => setShowAllRollTypes(prev => ({ ...prev, [index]: e.target.checked }))}
                                            />
                                            Show all
                                          </label>
                                        </div>
                                        {availableRolls.filter(r => r.laminationType === getNormalizedType(item.lamination || '')).length === 0 && !showAllRollTypes[index] && (
                                          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.65rem', color: '#ea580c' }}>
                                            ⚠️ No matching rolls found. Check "Show all" to override.
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      className="press-btn-finish"
                                      disabled={isCompleting || (currentTask === 'lamination' && startedItemIndexes?.has(index) && !selectedRollCodes[index])}
                                      onClick={() => onCompleteItemTask(index, currentTask as WorkflowTask, selectedRollCodes[index])}
                                      style={startedItemIndexes?.has(index)
                                        ? { background: '#16a34a', borderColor: '#16a34a', color: '#fff' }
                                        : { background: '#0f172a', borderColor: '#0f172a', color: '#fff' }
                                      }
                                    >
                                      {isCompleting && completingItemIndex === index
                                        ? `Completing Item #${index + 1}...`
                                        : startedItemIndexes?.has(index)
                                          ? `✓ Confirm Item #${index + 1}`
                                          : `▶ Start Item #${index + 1}`}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <div className="workflow-modal-footer">
            {footerAction}
            <button type="button" className="logout-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      {viewImage && createPortal(
        <div className="lightbox-modal" onClick={() => setViewImage(null)} style={{ zIndex: 99999 }}>
          <div className="lightbox-content">
            <img src={viewImage} alt="Preview" className="lightbox-img" />
            <button type="button" className="lightbox-close-btn" onClick={() => setViewImage(null)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Item Log Modal */}
      {showItemLog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9998
        }} onClick={() => setShowItemLog(null)}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '75vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>📋 Item #{showItemLog.itemIndex + 1} Task Log</h3>
              <button
                type="button"
                onClick={() => setShowItemLog(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                ✕
              </button>
            </div>
            
            {showItemLog.logs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Stage Lag Times */}
                <div style={{
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: '#f3f4f6',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>⏳ STAGE TRANSITIONS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
                    {(() => {
                      const p2pp = calculatePressToPostPressLag(showItemLog.logs)
                      return p2pp !== null ? (
                        <div>
                          <div style={{ color: '#6b7280', fontWeight: 500 }}>Press → PostPress</div>
                          <div style={{ color: '#1e40af', fontWeight: 600 }}>{formatDuration(p2pp)}</div>
                        </div>
                      ) : null
                    })()}
                    {(() => {
                      const pp2f = calculatePostPressToFinishingLag(showItemLog.logs)
                      return pp2f !== null ? (
                        <div>
                          <div style={{ color: '#6b7280', fontWeight: 500 }}>PostPress → Finishing</div>
                          <div style={{ color: '#1e40af', fontWeight: 600 }}>{formatDuration(pp2f)}</div>
                        </div>
                      ) : null
                    })()}
                    {(() => {
                      const f2total = calculateFinishingToPressLag(showItemLog.logs)
                      return f2total !== null ? (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ color: '#6b7280', fontWeight: 500 }}>Total Workflow Time (Press Start → Finishing End)</div>
                          <div style={{ color: '#059669', fontWeight: 600 }}>{formatDuration(f2total)}</div>
                        </div>
                      ) : null
                    })()}
                  </div>
                </div>

                {/* Individual Task Logs */}
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>📝 TASK ENTRIES</div>
                {showItemLog.logs.map((entry: any, idx: number) => {
                  console.log(`📋 Rendering log entry ${idx}:`, entry)
                  return (
                    <div key={idx} style={{
                      padding: '0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: '#f8fafc'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.8rem' }}>
                        <div>
                          <div style={{ color: '#64748b', fontWeight: 600, marginBottom: '0.2rem' }}>Task</div>
                          <div style={{ color: '#1e293b', fontWeight: 500 }}>{entry.task?.toUpperCase() || '--'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontWeight: 600, marginBottom: '0.2rem' }}>Module</div>
                          <div style={{ color: '#1e293b', fontWeight: 500 }}>{entry.module?.toUpperCase() || '--'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontWeight: 600, marginBottom: '0.2rem' }}>Staff</div>
                          <div style={{ color: '#1e293b', fontWeight: 500 }}>{entry.staffName || '--'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontWeight: 600, marginBottom: '0.2rem' }}>Duration</div>
                          <div style={{ color: '#16a34a', fontWeight: 600 }}>{formatDuration(entry.durationMs)}</div>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ color: '#64748b', fontWeight: 600, marginBottom: '0.2rem' }}>Started</div>
                          <div style={{ color: '#475569', fontSize: '0.75rem' }}>
                            {entry.startedAt ? new Date(entry.startedAt).toLocaleString() : '--'}
                          </div>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ color: '#64748b', fontWeight: 600, marginBottom: '0.2rem' }}>Completed</div>
                          <div style={{ color: '#475569', fontSize: '0.75rem' }}>
                            {entry.completedAt ? new Date(entry.completedAt).toLocaleString() : '--'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem 0' }}>No task logs for this item yet.</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export function jobThumbnailUrl(screenshot?: string) {
  return getImageUrl(screenshot)
}

export function firstItemScreenshot(job: any, prefer?: (item: any) => boolean) {
  if (prefer) {
    const preferred = job.items?.find((i: any) => i.screenshot && prefer(i))
    if (preferred) return preferred.screenshot
  }
  const item = job.items?.find((i: any) => i.screenshot)
  return item?.screenshot || job.itemScreenshots?.[0] || null
}
