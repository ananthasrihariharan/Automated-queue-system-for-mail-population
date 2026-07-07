import { useState, useEffect } from 'react'
import { fetchMachines, createMachine, updateMachine, deleteMachine, type Machine } from '@core/services/api'
import './AdminReports.css'

/**
 * Machine Master management. A machine (e.g. "Konica C1060") has a printable
 * margin (mm per side) used by the UPS calculator in job creation.
 * Admin can add / edit / delete machines.
 * Backed by /api/machines.
 */
export default function MachineManager() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [margin, setMargin] = useState('5')

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchMachines()
      setMachines(Array.isArray(data) ? data : [])
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load machines')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setMargin('5')
  }

  const handleEdit = (machine: Machine) => {
    setEditingId(machine.id)
    setName(machine.name)
    setMargin(String(machine.printableMargin))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const machineName = name.trim()
    if (!machineName) { alert('Machine name is required'); return }

    const marginValue = parseFloat(margin)
    if (isNaN(marginValue) || marginValue < 0) { alert('Printable margin must be a non-negative number'); return }

    setSaving(true)
    try {
      if (editingId != null) {
        await updateMachine(editingId, { name: machineName, printableMargin: marginValue })
      } else {
        await createMachine({ name: machineName, printableMargin: marginValue })
      }
      resetForm()
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save machine')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (machine: Machine) => {
    if (!window.confirm(`Delete machine "${machine.name}"?`)) return
    try {
      await deleteMachine(machine.id)
      if (editingId === machine.id) resetForm()
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete machine')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start' }}>

      {/* Add / Edit Machine Form */}
      <div style={{ background: '#fff', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
          {editingId != null ? '✏️ Edit Machine' : '🖨️ Add Machine'}
        </h3>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Machine Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Konica C1060"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Printable Margin (mm per side)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              required
              placeholder="e.g. 5"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className="form-input"
              style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn-primary" disabled={saving}
              style={{ flex: 1, height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {saving ? 'Saving…' : editingId != null ? '💾 Update Machine' : '💾 Add Machine'}
            </button>
            {editingId != null && (
              <button type="button" className="btn-secondary" onClick={resetForm} style={{ height: '38px', padding: '0 0.9rem' }}>Cancel</button>
            )}
          </div>
        </form>
      </div>

      {/* Machine List Table */}
      <div className="dispatch-table-container admin-jobs-table-container" style={{ margin: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading machines…</div>
        ) : (
          <table className="dispatch-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Machine Name</th>
                <th>Printable Margin</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {machines.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No machines configured.</td>
                </tr>
              ) : (
                machines.map((machine, idx) => (
                  <tr key={machine.id} className="dispatch-row">
                    <td>{idx + 1}</td>
                    <td><span style={{ fontWeight: 800 }}>{machine.name}</span></td>
                    <td><span>{machine.printableMargin} mm</span></td>
                    <td className="text-right">
                      <button type="button" onClick={() => handleEdit(machine)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginRight: '0.5rem' }}>
                        ✏️ Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(machine)}
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
