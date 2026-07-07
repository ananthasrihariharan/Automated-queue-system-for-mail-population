import { useState, useEffect } from 'react'
import { fetchProducts, addProduct, deleteProduct } from '@core/services/api'
import './AdminReports.css'

/**
 * Product-type management. Products are the type-suggestion list used by the
 * job creation form (CreateJob). Backed by the process registry API
 * (/api/admin/products), which stores them in SystemConfig.
 */
export default function ProductManager() {
  const [products, setProducts] = useState<{ id: string; name: string; template?: string; openingDirection?: string; bindingSide?: string; bindingMargin?: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [newProductId, setNewProductId] = useState('')
  const [template, setTemplate] = useState('none')
  const [openingDirection, setOpeningDirection] = useState('portrait')
  const [bindingSide, setBindingSide] = useState('left')
  const [bindingMargin, setBindingMargin] = useState(10)

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchProducts()
      setProducts(Array.isArray(data) ? data : [])
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    const prodId = newProductId.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await addProduct(
        name,
        prodId,
        template,
        template === 'booklet' ? openingDirection : undefined,
        template === 'booklet' ? bindingSide : undefined,
        template === 'booklet' ? bindingMargin : undefined
      )
      setProducts(res.products || [])
      setNewName('')
      setNewProductId('')
      setTemplate('none')
      setOpeningDirection('portrait')
      setBindingSide('left')
      setBindingMargin(10)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add product')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Remove product "${name}"?`)) return
    try {
      const res = await deleteProduct(name)
      setProducts(res.products || [])
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to remove product')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '2rem', alignItems: 'start' }}>

      {/* Add Product Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ background: '#fff', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>🏷️ Add Product Type</h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Product ID</label>
              <input
                type="text"
                placeholder="e.g. P001"
                value={newProductId}
                onChange={(e) => setNewProductId(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Product Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Poster"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Template</label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '36px', boxSizing: 'border-box', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '0.375rem', padding: '0 0.5rem' }}
              >
                <option value="none">None</option>
                <option value="booklet">Booklet (Even UPS required)</option>
                <option value="perfect_binding">Perfect Binding (Min UPS = 4 - Future)</option>
                <option value="calendar">Calendar (Min UPS = 2 - Future)</option>
                <option value="wire_binding">Wire Binding (Even UPS, Binding Margin - Future)</option>
                <option value="photo_book">Photo Book (Min width, Spine - Future)</option>
              </select>
            </div>
            {template === 'booklet' && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Opening Direction</label>
                  <select
                    value={openingDirection}
                    onChange={(e) => setOpeningDirection(e.target.value)}
                    className="form-input"
                    style={{ width: '100%', height: '36px', boxSizing: 'border-box', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '0.375rem', padding: '0 0.5rem' }}
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Binding Side</label>
                  <select
                    value={bindingSide}
                    onChange={(e) => setBindingSide(e.target.value)}
                    className="form-input"
                    style={{ width: '100%', height: '36px', boxSizing: 'border-box', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '0.375rem', padding: '0 0.5rem' }}
                  >
                    <option value="left">Left</option>
                    <option value="top">Top</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Binding Margin (mm)</label>
                  <input
                    type="number"
                    min={0}
                    value={bindingMargin}
                    onChange={(e) => setBindingMargin(Number(e.target.value))}
                    className="form-input"
                    style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
                  />
                </div>
              </>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
              style={{ width: '100%', height: '38px', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {saving ? 'Saving…' : '💾 Add Product'}
            </button>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
              These appear as type suggestions when creating a job.
            </p>
          </form>
        </div>
      </div>

      {/* Product List Table */}
      <div className="dispatch-table-container admin-jobs-table-container" style={{ margin: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading products…</div>
        ) : (
          <table className="dispatch-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Product ID</th>
                <th>Product Name</th>
                <th>Template</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No products configured.</td>
                </tr>
              ) : (
                products.map((p, idx) => (
                  <tr key={p.name} className="dispatch-row">
                    <td>{idx + 1}</td>
                    <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>{p.id || '—'}</span></td>
                    <td><span style={{ fontWeight: 800 }}>{p.name}</span></td>
                    <td>
                      <span style={{ fontWeight: 600, color: p.template === 'booklet' ? '#2563eb' : '#64748b' }}>
                        {p.template ? p.template.charAt(0).toUpperCase() + p.template.slice(1).replace('_', ' ') : 'None'}
                        {p.template === 'booklet' && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem', fontWeight: 'normal' }}>
                            ({p.openingDirection ? p.openingDirection.charAt(0).toUpperCase() + p.openingDirection.slice(1) : 'Portrait'},{' '}
                            {p.bindingSide ? p.bindingSide.charAt(0).toUpperCase() + p.bindingSide.slice(1) : 'Left'},{' '}
                            {p.bindingMargin !== undefined ? p.bindingMargin : 10}mm)
                          </div>
                        )}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(p.name)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        🗑 Remove
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
