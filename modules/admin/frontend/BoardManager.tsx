import { useState, useEffect } from 'react'
import { fetchBoards, createBoard, updateBoard, deleteBoard, type Board, type BoardSheet } from '@core/services/api'
import './AdminReports.css'

type SheetDraft = { name: string; width: string; height: string; qty: string }

const emptySheet = (): SheetDraft => ({ name: '', width: '', height: '', qty: '1' })

/**
 * Media Master (Board Master) management.
 * Admin can manage media types aligning with media_stock.json format:
 * - Product ID, Media Name, Original Name, Master Size, Storing Size, Behavior
 * - Cut Sizes (Qty & Dimensions)
 */
export default function BoardManager() {
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Form states
  const [editingId, setEditingId] = useState<number | null>(null)
  const [productId, setProductId] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [name, setName] = useState('') // media_name
  const [masterSize, setMasterSize] = useState('')
  const [storingSize, setStoringSize] = useState('')
  const [mediaBehavior, setMediaBehavior] = useState('DIRECT')
  const [sheets, setSheets] = useState<SheetDraft[]>([emptySheet()])

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchBoards()
      setBoards(Array.isArray(data) ? data : [])
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load boards')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setProductId('')
    setOriginalName('')
    setName('')
    setMasterSize('')
    setStoringSize('')
    setMediaBehavior('DIRECT')
    setSheets([emptySheet()])
    setShowForm(false)
  }

  const updateSheetField = (idx: number, field: keyof SheetDraft, value: string) => {
    setSheets(prev => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  const handleSheetNameChange = (idx: number, nameVal: string) => {
    const parts = nameVal.split('*')
    if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
      const w = parts[0].trim()
      const h = parts[1].trim()
      setSheets(prev => prev.map((s, i) => (i === idx ? { ...s, name: nameVal, width: w, height: h } : s)))
    } else {
      setSheets(prev => prev.map((s, i) => (i === idx ? { ...s, name: nameVal } : s)))
    }
  }

  const addSheetRow = () => setSheets(prev => [...prev, emptySheet()])
  const removeSheetRow = (idx: number) => setSheets(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))

  const handleEdit = (board: Board) => {
    setEditingId(board.id)
    setProductId(board.productId || '')
    setOriginalName(board.originalName || '')
    setName(board.name)
    setMasterSize(board.masterSize || '')
    setStoringSize(board.storingSize || '')
    setMediaBehavior(board.mediaBehavior || 'DIRECT')
    setSheets(
      board.sheets.length
        ? board.sheets.map(s => ({
            name: s.name,
            width: String(s.width),
            height: String(s.height),
            qty: String(s.qty ?? 1)
          }))
        : [emptySheet()]
    )
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const mediaName = name.trim()
    if (!mediaName) { alert('Media Name is required'); return }

    const cleanedSheets: BoardSheet[] = []

    // If media behavior is DIRECT, we can automatically create a default sheet from storingSize
    if (mediaBehavior === 'DIRECT') {
      const sizeVal = storingSize.trim()
      if (sizeVal) {
        const parts = sizeVal.split('*')
        const w = Number(parts[0])
        const h = Number(parts[1])
        if (w > 0 && h > 0) {
          cleanedSheets.push({ name: sizeVal, width: w, height: h, qty: 1 })
        }
      }
    } else {
      for (const s of sheets) {
        const nm = s.name.trim()
        if (!nm && !s.width && !s.height) continue
        const w = Number(s.width)
        const h = Number(s.height)
        const q = Number(s.qty) || 1
        if (!nm || !isFinite(w) || w <= 0 || !isFinite(h) || h <= 0) {
          alert(`Each cut size sheet needs a valid dimensions name (e.g. 315*453) and positive width & height. Check "${nm || 'unnamed'}"`)
          return
        }
        cleanedSheets.push({ name: nm, width: w, height: h, qty: q })
      }
    }

    setSaving(true)
    try {
      const payload: Partial<Board> = {
        productId: productId.trim() || undefined,
        originalName: originalName.trim() || undefined,
        name: mediaName,
        masterSize: masterSize.trim() || undefined,
        storingSize: storingSize.trim() || undefined,
        mediaBehavior,
        sheets: cleanedSheets
      }

      if (editingId != null) {
        await updateBoard(editingId, payload)
      } else {
        await createBoard(payload)
      }
      resetForm()
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save media')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (board: Board) => {
    if (!window.confirm(`Delete board/media "${board.name}"?`)) return
    try {
      await deleteBoard(board.id)
      if (editingId === board.id) resetForm()
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete board')
    }
  }

  if (showForm) {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto', paddingBottom: '2rem' }}>
        {/* Form Header with Back Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <button type="button" onClick={resetForm} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 0.8rem' }}>
            ⬅️ Back to List
          </button>
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
            {editingId != null ? '✏️ Edit Media Master' : '🗂️ Add New Media'}
          </h3>
        </div>

        {/* Form Container */}
        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Product ID</label>
                <input
                  type="text"
                  placeholder="e.g. P001"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Media Behavior</label>
                <select
                  value={mediaBehavior}
                  onChange={(e) => setMediaBehavior(e.target.value)}
                  className="filter-select"
                  style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
                >
                  <option value="DIRECT">DIRECT</option>
                  <option value="MULTI_STORAGE">MULTI_STORAGE</option>
                  <option value="CONVERSION">CONVERSION</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Media Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. art 300"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Original Name</label>
              <input
                type="text"
                placeholder="e.g. art 300 13X19"
                value={originalName}
                onChange={(e) => setOriginalName(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Master Size</label>
                <input
                  type="text"
                  placeholder="e.g. 635*910"
                  value={masterSize}
                  onChange={(e) => setMasterSize(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Storing Size</label>
                <input
                  type="text"
                  placeholder="e.g. 315*453"
                  value={storingSize}
                  onChange={(e) => setStoringSize(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Cut sizes / Sheets (only for non-DIRECT behavior) */}
            {mediaBehavior !== 'DIRECT' && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                    Cut Sizes Configuration
                  </label>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic' }}>
                    * Qty = number of cuts obtained from one master sheet
                  </span>
                </div>

                {/* Sub-headers for columns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr auto', gap: '0.4rem', marginBottom: '0.25rem', paddingLeft: '0.2rem' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>Size Name</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>Width (W)</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>Height (H)</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }} title="Number of cut sheets obtained from one master sheet">Cuts Qty</span>
                  <span></span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {sheets.map((s, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr auto', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="text" placeholder="Size (e.g. 315*453)" value={s.name}
                        onChange={(e) => handleSheetNameChange(idx, e.target.value)}
                        className="form-input" style={{ height: '32px', boxSizing: 'border-box', fontSize: '0.78rem' }}
                      />
                      <input
                        type="number" placeholder="W" value={s.width}
                        onChange={(e) => updateSheetField(idx, 'width', e.target.value)}
                        className="form-input" style={{ height: '32px', boxSizing: 'border-box', fontSize: '0.78rem' }}
                      />
                      <input
                        type="number" placeholder="H" value={s.height}
                        onChange={(e) => updateSheetField(idx, 'height', e.target.value)}
                        className="form-input" style={{ height: '32px', boxSizing: 'border-box', fontSize: '0.78rem' }}
                      />
                      <input
                        type="number" placeholder="Cuts" value={s.qty}
                        onChange={(e) => updateSheetField(idx, 'qty', e.target.value)}
                        className="form-input" style={{ height: '32px', boxSizing: 'border-box', fontSize: '0.78rem' }}
                      />
                      <button
                        type="button" onClick={() => removeSheetRow(idx)} title="Remove cut size"
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}
                      >×</button>
                    </div>
                  ))}
                </div>
                <button
                  type="button" onClick={addSheetRow}
                  style={{ marginTop: '0.5rem', background: 'none', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#475569', fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.6rem', cursor: 'pointer' }}
                >+ Add Cut Size</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <button type="submit" className="btn-primary" disabled={saving}
                style={{ flex: 1, height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
                {saving ? 'Saving…' : editingId != null ? '💾 Update Media' : '💾 Add Media'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem' }}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Default List View
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      
      {/* Title & Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
          🗂️ Media Stock Master ({boards.length} items)
        </h3>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="btn-primary"
          style={{ height: '36px', padding: '0 1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700 }}
        >
          ➕ Add Media
        </button>
      </div>

      {/* Media Stock List Table */}
      <div className="dispatch-table-container admin-jobs-table-container" style={{ margin: 0, width: '100%' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading media stock…</div>
        ) : (
          <table className="dispatch-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Product ID</th>
                <th>Media Name</th>
                <th>Original Name</th>
                <th>Behavior</th>
                <th>Sizes (Master/Storing)</th>
                <th>Cuts & Sheets</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {boards.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No media configured.</td>
                </tr>
              ) : (
                boards.map((board, idx) => (
                  <tr key={board.id} className="dispatch-row">
                    <td>{idx + 1}</td>
                    <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>{board.productId || '—'}</span></td>
                    <td><span style={{ fontWeight: 800 }}>{board.name}</span></td>
                    <td><span style={{ fontSize: '0.78rem', color: '#64748b' }}>{board.originalName || '—'}</span></td>
                    <td>
                      <span style={{
                        fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700,
                        background: board.mediaBehavior === 'DIRECT' ? '#f1f5f9' : board.mediaBehavior === 'MULTI_STORAGE' ? '#ecfdf5' : '#fff7ed',
                        color: board.mediaBehavior === 'DIRECT' ? '#475569' : board.mediaBehavior === 'MULTI_STORAGE' ? '#047857' : '#c2410c'
                      }}>
                        {board.mediaBehavior}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.75rem' }}>
                        <div>M: <span style={{ fontWeight: 700 }}>{board.masterSize || '—'}</span></div>
                        <div>S: <span style={{ fontWeight: 700 }}>{board.storingSize || '—'}</span></div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxWidth: '350px' }}>
                        {board.sheets.length === 0 ? (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                        ) : (
                          board.sheets.map((s) => (
                            <span key={s.id} style={{
                              fontSize: '0.68rem', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 700,
                              background: '#eff6ff', color: '#1e40af', display: 'inline-flex', gap: '0.2rem'
                            }}>
                              <span>{s.name}</span>
                              <span style={{ opacity: 0.6 }}>({s.qty} cuts)</span>
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="text-right">
                      <button type="button" onClick={() => handleEdit(board)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginRight: '0.4rem' }}>
                        ✏️ Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(board)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                        🗑 Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
