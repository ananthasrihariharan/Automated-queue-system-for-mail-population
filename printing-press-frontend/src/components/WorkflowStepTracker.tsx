import './WorkflowStepTracker.css'

interface Step {
  num: number
  name: string
  detail: string
  status: 'COMPLETED' | 'CURRENT' | 'PENDING'
}

interface Props {
  items: any[]
  jobStatus: string
  compact?: boolean
}

const PP_TASK_LABELS: Record<string, string> = {
  lamination: 'Lamination',
  foil: 'Foil',
  binding: 'Binding / Fold',
  fusing: 'Fusing',
  holes: 'Holes',
}

const FIN_TASK_LABELS: Record<string, string> = {
  cutting: 'Cutting',
  creasing: 'Creasing / Perf',
  dieCutting: 'Die Cutting',
  cornerCutting: 'Corner Cut',
}

const CREASING_DISPLAY: Record<string, string> = {
  'CREASE':      'Creasing',
  'PERFORATION': 'Perforation',
  'WHEEL_PERF':  'Wheel Perforation',
  'CREASE_PERF': 'Creasing / Perf',
}

function buildSteps(items: any[], jobStatus: string): Step[] {
  const steps: Step[] = []
  let num = 1

  // ── Prepress ──────────────────────────────────────────────────────────────
  steps.push({
    num: num++,
    name: 'Prepress',
    detail: 'Job Created',
    status: 'COMPLETED',
  })

  // ── Press ─────────────────────────────────────────────────────────────────
  const totalItems = items.length
  const confirmedItems = items.filter((i: any) => i.printConfirmed === true).length
  const pressDone = totalItems > 0 && confirmedItems === totalItems
  const pressPartial = confirmedItems > 0 && !pressDone
  steps.push({
    num: num++,
    name: 'Press',
    detail: pressPartial ? `${confirmedItems}/${totalItems} items` : 'Print',
    status: pressDone ? 'COMPLETED' : pressPartial ? 'CURRENT' : 'PENDING',
  })

  // ── Post Press tasks ───────────────────────────────────────────────────────
  Object.entries(PP_TASK_LABELS).forEach(([task, label]) => {
    const relevant = items.filter((i: any) => i[task] && i[task] !== 'NONE')
    if (relevant.length === 0) return
    const done = relevant.every((i: any) => i[`${task}Status`] === 'COMPLETED')
    const started = relevant.some((i: any) => i[`${task}Status`] === 'COMPLETED')
    // get the detail value from the first item
    const detail = relevant[0][task] && relevant[0][task] !== 'NONE'
      ? String(relevant[0][task]).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
      : label
    steps.push({
      num: num++,
      name: label,
      detail,
      status: done ? 'COMPLETED' : started ? 'CURRENT' : 'PENDING',
    })
  })

  // ── Finishing tasks ────────────────────────────────────────────────────────
  Object.entries(FIN_TASK_LABELS).forEach(([task, label]) => {
    const relevant = items.filter((i: any) => i[task] && i[task] !== 'NONE')
    if (relevant.length === 0) return
    const done = relevant.every((i: any) => i[`${task}Status`] === 'COMPLETED')
    const started = relevant.some((i: any) => i[`${task}Status`] === 'COMPLETED')

    // For creasing task, use the specific type label (Creasing / Perforation / Wheel Perf)
    let stepName = label
    let detail = label
    if (task === 'creasing') {
      const val = relevant[0][task]
      stepName = CREASING_DISPLAY[val] || label
      detail = stepName
    } else {
      detail = relevant[0][task] && relevant[0][task] !== 'NONE'
        ? String(relevant[0][task]).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
        : label
    }

    steps.push({
      num: num++,
      name: stepName,
      detail,
      status: done ? 'COMPLETED' : started ? 'CURRENT' : 'PENDING',
    })
  })

  // ── Dispatch ───────────────────────────────────────────────────────────────
  const dispatched = jobStatus === 'DISPATCHED'
  const packed = jobStatus === 'PACKED' || jobStatus === 'DISPATCHED'

  // If all preceding steps are COMPLETED and not dispatched yet → Dispatch is CURRENT
  const allPreceding = steps.every(s => s.status === 'COMPLETED')
  const hasCurrentStep = steps.some(s => s.status === 'CURRENT')

  let dispatchStatus: 'COMPLETED' | 'CURRENT' | 'PENDING'
  if (dispatched) {
    dispatchStatus = 'COMPLETED'
  } else if (packed || (!hasCurrentStep && allPreceding)) {
    dispatchStatus = 'CURRENT'
  } else {
    dispatchStatus = 'PENDING'
  }

  steps.push({
    num: num++,
    name: 'Dispatch',
    detail: dispatched ? 'Dispatched' : packed ? 'Ready to ship' : 'Pending',
    status: dispatchStatus,
  })

  // If still no CURRENT anywhere, mark the first PENDING as CURRENT
  const hasAnyCurrentNow = steps.some(s => s.status === 'CURRENT')
  if (!hasAnyCurrentNow) {
    const firstPending = steps.find(s => s.status === 'PENDING')
    if (firstPending) firstPending.status = 'CURRENT'
  }

  return steps
}

export default function WorkflowStepTracker({ items, jobStatus, compact = false }: Props) {
  const steps = buildSteps(items || [], jobStatus || '')
  const cls = compact ? 'wst wst--compact' : 'wst'

  return (
    <div className={cls}>
      {steps.map((step, idx) => (
        <div key={idx} className="wst-step">
          {/* connector line before (except first) */}
          {idx > 0 && (
            <div className={`wst-connector ${steps[idx - 1].status === 'COMPLETED' ? 'done' : ''}`} />
          )}

          {/* circle */}
          <div className={`wst-circle wst-circle--${step.status.toLowerCase()}`}>
            {step.status === 'COMPLETED'
              ? <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
              : step.num
            }
          </div>

          {/* label below */}
          {!compact && (
            <div className="wst-label">
              <span className={`wst-name wst-name--${step.status.toLowerCase()}`}>{step.name}</span>
              <span className="wst-detail">{step.detail}</span>
              <span className={`wst-status wst-status--${step.status.toLowerCase()}`}>{step.status}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
