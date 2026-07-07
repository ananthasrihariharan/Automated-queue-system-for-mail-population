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
  // Match YYYY-MM-DDTHH-MM-SS with optional milliseconds suffix (e.g. -123 or .123)
  const match = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:[-.]\d{3})?)_(.*)$/i)
  if (match) {
    const timestampStr = match[1]
    const subjectClean = match[2]
    
    const parts = timestampStr.split('T')
    if (parts.length === 2) {
      const datePart = parts[0]
      let timePart = parts[1].replace(/-/g, ':') // Convert hyphens to colons
      
      // If there's a millisecond part separated by colon, change last colon to dot
      if (timePart.split(':').length === 4) {
        timePart = timePart.replace(/:(\d{3})$/, '.$1')
      }
      
      const isoStr = `${datePart}T${timePart}Z`
      const date = new Date(isoStr)
      
      if (!isNaN(date.getTime())) {
        const istTime = date.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
        return { time: istTime, clean: subjectClean }
      }
    }
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

/**
 * Safe clipboard copy that works on LAN HTTP (non-secure) environments.
 */
export function safeCopy(text: string, onDone?: (label: string) => void) {
  const legacy = () => {
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px'
    document.body.appendChild(el)
    el.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(el)
    onDone?.('Copied!')
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => onDone?.('Copied!')).catch(legacy)
  } else {
    legacy()
  }
}

/**
 * Authenticated file download that sends the Authorization header.
 */
export async function downloadWithAuth(url: string, filename: string, onStart?: () => void, onEnd?: () => void) {
  onStart?.()
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
  } catch (err: any) {
    alert(`Download failed: ${err.message}`)
  } finally {
    onEnd?.()
  }
}

/**
 * Returns a simple emoji icon based on the cloud storage URL.
 */
export function cloudIcon(url: string) {
  const u = url.toLowerCase()
  if (u.includes('drive.google')) return '📁'
  if (u.includes('dropbox')) return '📦'
  if (u.includes('wetransfer')) return '✈️'
  if (u.includes('icloud')) return '☁️'
  return '🔗'
}
