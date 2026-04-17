// ─── Shared Queue Helper Utilities ──────────────────────────────────────────

/**
 * Returns how long ago a date was, as a human-readable string.
 * e.g. "just now", "23m", "2h 15m"
 */
export function elapsed(from: string | Date): string {
  const ms = Date.now() - new Date(from).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/**
 * Converts an ISO-encoded email subject like "2026-04-11T14-20-12_hi_siva"
 * into { time: '2026-04-11 14:20:12', clean: 'hi_siva' }.
 * Falls back to { time: '', clean: raw } for normal subjects.
 */
export function formatSubject(raw: string): { time: string; clean: string } {
  if (!raw) return { time: '', clean: '' }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})_(.*)$/i)
  if (match) {
    const t = match[1].replace(/-/g, ':').replace('T', ' ')
    return { time: t, clean: match[2] }
  }
  return { time: '', clean: raw }
}

/**
 * Formats milliseconds into a compact human-readable duration.
 * e.g. 3661000 → "1h 1m"
 */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const m = Math.floor(ms / 60000)
  if (m < 1)  return '<1m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
