type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmActionModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel
}: Props) {
  if (!open) return null

  return (
    <div className="press-modal-overlay" onClick={loading ? undefined : onCancel}>
      <div className="press-modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="press-modal-header">
          <h2 className="press-modal-title">{title}</h2>
          {!loading && (
            <button type="button" className="press-modal-close" onClick={onCancel}>&times;</button>
          )}
        </div>
        <div className="press-modal-content">
          <p style={{ margin: 0, color: 'var(--press-text)' }}>{message}</p>
        </div>
        <div className="workflow-modal-footer" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="logout-btn" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button type="button" className="press-btn-finish" onClick={onConfirm} disabled={loading}>
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
