export const FINISHING_SUBROLES = [
  'FINISHING_CUTTING',
  'FINISHING_DIE_CUTTING',
  'FINISHING_CREASING',
  'FINISHING_CORNER_CUT',
] as const

export type FinishingSubRole = (typeof FINISHING_SUBROLES)[number]

export type FinishingTask = 'all' | 'cutting' | 'dieCutting' | 'creasing' | 'cornerCutting' | 'cutting2'

export const FINISHING_ROLE_CONFIG: Record<
  FinishingSubRole,
  { path: string; tasks: FinishingTask[]; label: string }
> = {
  FINISHING_CUTTING: {
    path: '/finishing/cutting',
    tasks: ['cutting', 'cutting2'],
    label: 'Cutting',
  },
  FINISHING_DIE_CUTTING: {
    path: '/finishing/die-cutting',
    tasks: ['dieCutting'],
    label: 'Die Cutting',
  },
  FINISHING_CREASING: {
    path: '/finishing/creasing',
    tasks: ['creasing'],
    label: 'Creasing',
  },
  FINISHING_CORNER_CUT: {
    path: '/finishing/corner-cutting',
    tasks: ['cornerCutting'],
    label: 'Corner Cutting',
  },
}

const LEGACY_ROLE_ALIASES: Record<string, string> = {
  'FINISHING CUTTING': 'FINISHING_CUTTING',
  'FINISHING DIE CUTTING': 'FINISHING_DIE_CUTTING',
  'FINISHING CREASING': 'FINISHING_CREASING',
  'FINISHING CORNER CUT': 'FINISHING_CORNER_CUT',
  'FINISHING CORNER CUTTING': 'FINISHING_CORNER_CUT',
}

const TASK_ORDER: FinishingTask[] = ['cutting', 'cutting2', 'dieCutting', 'creasing', 'cornerCutting']

/** Normalize legacy role strings (spaces, mixed case) to enum values. */
export function normalizeRoles(roles: string[] = []): string[] {
  return roles.map((r) => {
    const upper = String(r || '').trim().toUpperCase()
    return LEGACY_ROLE_ALIASES[upper] || upper.replace(/\s+/g, '_')
  })
}

/** All finishing sub-roles assigned to this user (supports multiple). */
export function getFinishingSubRoles(roles: string[]): FinishingSubRole[] {
  const normalized = normalizeRoles(roles)
  return FINISHING_SUBROLES.filter((r) => normalized.includes(r))
}

/** First sub-role only — prefer getFinishingSubRoles for multi-role users. */
export function getFinishingSubRole(roles: string[]): FinishingSubRole | null {
  const subRoles = getFinishingSubRoles(roles)
  return subRoles[0] ?? null
}

/** Login / nav path: combined dashboard when user has multiple finishing stations. */
export function getFinishingLoginPath(roles: string[]): string {
  const subRoles = getFinishingSubRoles(roles)
  if (subRoles.length === 0) return '/finishing'
  if (subRoles.length === 1) return FINISHING_ROLE_CONFIG[subRoles[0]].path
  return '/finishing'
}

export function getLockedTasks(roles: string[]): FinishingTask[] {
  const normalized = normalizeRoles(roles)
  const subRoles = getFinishingSubRoles(normalized)

  // Sub-roles always win over general FINISHING / ADMIN broad access
  if (subRoles.length > 0) {
    const tasks = new Set<FinishingTask>()
    for (const role of subRoles) {
      for (const task of FINISHING_ROLE_CONFIG[role].tasks) {
        if (task !== 'all') tasks.add(task)
      }
    }
    return TASK_ORDER.filter((t) => tasks.has(t))
  }

  if (normalized.includes('FINISHING') || normalized.includes('ADMIN')) return ['all']
  return ['all']
}

export function getApiTaskFilter(roles: string[]): string {
  const locked = getLockedTasks(roles)
  if (locked.includes('all')) return 'all'
  return locked.join(',')
}

/** Short badge for profile menus — e.g. "Cutting · Corner Cutting". */
export function getRoleBadgeLabel(roles: string[]): string {
  const normalized = normalizeRoles(roles)
  const subRoles = getFinishingSubRoles(normalized)
  if (subRoles.length > 0) {
    return subRoles.map((r) => FINISHING_ROLE_CONFIG[r].label).join(' · ')
  }
  if (normalized.includes('FINISHING')) return 'Finishing'
  return normalized.map((r) => r.replace(/_/g, ' ')).join(', ')
}

export function getStationLabel(roles: string[]): string {
  const normalized = normalizeRoles(roles)
  if (normalized.includes('FINISHING') && getFinishingSubRoles(normalized).length === 0) {
    return 'Finishing'
  }

  const subRoles = getFinishingSubRoles(normalized)
  if (subRoles.length === 0) return 'Finishing'
  if (subRoles.length === 1) return `Finishing — ${FINISHING_ROLE_CONFIG[subRoles[0]].label}`
  const labels = subRoles.map((r) => FINISHING_ROLE_CONFIG[r].label)
  return `Finishing — ${labels.join(', ')}`
}

const STATUS_FIELD: Partial<Record<FinishingTask, string>> = {
  cutting: 'cuttingStatus',
  cutting2: 'cutting2Status',
  dieCutting: 'dieCuttingStatus',
  creasing: 'creasingStatus',
  cornerCutting: 'cornerCuttingStatus',
}

/** True if item is relevant to the user's allowed finishing tasks. */
export function itemMatchesFinishingTasks(
  item: any,
  allowedTasks: FinishingTask[],
  mode: 'active' | 'history' = 'active'
): boolean {
  if (allowedTasks.includes('all')) return true
  return allowedTasks.some((task) => {
    if (task === 'all') return true
    const statusField = STATUS_FIELD[task]
    if (mode === 'active') {
      return item?.activeStage === task
    }
    return (
      item?.activeStage === task ||
      (statusField && (item?.[statusField] === 'COMPLETED' || item?.[statusField] === 'PENDING'))
    )
  })
}

/** True if job has work matching the user's allowed finishing tasks. */
export function jobMatchesFinishingRoles(
  job: any,
  allowedTasks: FinishingTask[],
  mode: 'active' | 'history',
  getPendingTasks?: (job: any) => { key: string; pending: number }[]
): boolean {
  if (allowedTasks.includes('all')) return true
  const items: any[] = job?.items || []
  if (mode === 'active' && getPendingTasks) {
    const pending = getPendingTasks(job).filter(
      (t) => t.pending > 0 && allowedTasks.includes(t.key as FinishingTask)
    )
    return pending.length > 0
  }
  return items.some((item) => itemMatchesFinishingTasks(item, allowedTasks, mode))
}

/** Map route slug → allowed roles for RoleGuard. */
export const FINISHING_STATION_ROUTES = [
  { path: 'cutting', role: 'FINISHING_CUTTING' as const },
  { path: 'die-cutting', role: 'FINISHING_DIE_CUTTING' as const },
  { path: 'creasing', role: 'FINISHING_CREASING' as const },
  { path: 'corner-cutting', role: 'FINISHING_CORNER_CUT' as const },
]
