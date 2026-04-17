/**
 * LinkifiedText — Converts plain text containing URLs (including <https://...>)
 * into React nodes with clickable <a> anchors.
 *
 * Handles:
 *  - Bare URLs:              https://example.com
 *  - Angle-bracket URLs:     <https://drive.google.com/...>
 *
 * Preserves all whitespace and line breaks (use whiteSpace: 'pre-wrap' on the container).
 */

interface LinkifiedTextProps {
  text: string
  className?: string
}

// Regex: optionally matches a leading < then captures the URL, optionally matches trailing >
const URL_REGEX = /<?(https?:\/\/[^\s>]+)>?/g

export default function LinkifiedText({ text, className }: LinkifiedTextProps) {
  if (!text) return null

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  URL_REGEX.lastIndex = 0 // reset stateful regex

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      nodes.push(text.substring(lastIndex, match.index))
    }

    const url = match[1] // The captured URL without angle brackets

    // Determine icon by domain
    let icon = '🔗'
    if (url.includes('drive.google.com')) icon = '🗂'
    else if (url.includes('dropbox.com'))  icon = '📦'
    else if (url.includes('wetransfer.com') || url.includes('we.tl')) icon = '📤'

    nodes.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#2563eb',
          textDecoration: 'underline',
          wordBreak: 'break-all',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontWeight: 600,
          borderRadius: '0.25rem',
          padding: '0 0.1rem',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => { (e.target as HTMLAnchorElement).style.color = '#1d4ed8' }}
        onMouseLeave={e => { (e.target as HTMLAnchorElement).style.color = '#2563eb' }}
      >
        <span style={{ fontSize: '0.9em' }}>{icon}</span>
        {url.length > 60 ? url.substring(0, 57) + '…' : url}
      </a>
    )

    lastIndex = URL_REGEX.lastIndex
  }

  // Push any remaining plain text after the last match
  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex))
  }

  return <span className={className}>{nodes}</span>
}
