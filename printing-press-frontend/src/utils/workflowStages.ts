/**
 * Client-side workflow stage helpers.
 *
 * Post Press stages:  'lamination' | 'foil' | 'binding' | 'fusing' | 'holes'
 * Finishing stages:   'cutting' | 'creasing' | 'dieCutting' | 'cornerCutting' | 'cutting2'
 * Terminal:           'done'
 */

export type PostPressTask = 'lamination' | 'foil' | 'binding' | 'fusing' | 'holes'

const FINISHING_STAGES = ['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2']

export function isPressConfirmedItem(item: any): boolean {
  return item?.printConfirmed === true
}

// ─── Post Press helpers ───────────────────────────────────────────────────────

export function getItemPostPressStage(item: any): PostPressTask | null {
  if (!isPressConfirmedItem(item)) return null
  if (item.activeStage === 'lamination') return 'lamination'
  if (item.activeStage === 'foil')       return 'foil'
  if (item.activeStage === 'binding')    return 'binding'
  if (item.activeStage === 'fusing')     return 'fusing'
  if (item.activeStage === 'holes')      return 'holes'
  return null
}

export function getActivePostPressStage(job: any): PostPressTask | null {
  const items: any[] = job.items || []
  if (items.some(i => isPressConfirmedItem(i) && i.activeStage === 'lamination')) return 'lamination'
  if (items.some(i => isPressConfirmedItem(i) && i.activeStage === 'foil'))       return 'foil'
  if (items.some(i => isPressConfirmedItem(i) && i.activeStage === 'binding'))    return 'binding'
  if (items.some(i => isPressConfirmedItem(i) && i.activeStage === 'fusing'))     return 'fusing'
  if (items.some(i => isPressConfirmedItem(i) && i.activeStage === 'holes'))      return 'holes'
  return null
}

export function postPressStageLabel(stage: PostPressTask | null): string {
  if (stage === 'lamination') return 'Lamination'
  if (stage === 'foil')       return 'Foil'
  if (stage === 'binding')    return 'Binding / Fold'
  if (stage === 'fusing')     return 'Fusing'
  if (stage === 'holes')      return 'Holes'
  return 'Complete'
}

// ─── Finishing helpers ────────────────────────────────────────────────────────

export function canShowFinishing(job: any): boolean {
  return (job.items || []).some((i: any) => isPressConfirmedItem(i) && FINISHING_STAGES.includes(i.activeStage))
}

export function isTaskReadyForItem(item: any, taskKey: string): boolean {
  return item.activeStage === taskKey
}

// ─── Pipeline label ───────────────────────────────────────────────────────────

export function workflowPipelineLabel(job: any): string {
  if (job.jobStatus === 'PENDING' || job.jobStatus === 'CREATED') return 'Press'
  if (job.jobStatus === 'PRINTED') {
    const pp = getActivePostPressStage(job)
    if (pp) return postPressStageLabel(pp)
    if (canShowFinishing(job)) return 'Finishing'
    return 'Finishing'
  }
  if (job.jobStatus === 'PACKED') return 'Dispatch'
  return job.jobStatus
}
