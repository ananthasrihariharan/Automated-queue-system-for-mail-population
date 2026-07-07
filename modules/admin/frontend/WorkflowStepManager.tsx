import { useState, useEffect } from 'react'
import { fetchProcessRegistry, updateProcessRegistry } from '@core/services/api'
import './AdminReports.css'

type ModuleKey = 'postPressStages' | 'finishingStages'

type Registry = {
  postPressStages: string[]
  finishingStages: string[]
  timings: Record<string, number>
  taskBasis?: Record<string, string>
}

const MODULE_META: Record<ModuleKey, { label: string; badgeBg: string; badgeColor: string; icon: string }> = {
  postPressStages: { label: 'Post-Press', badgeBg: '#eff6ff', badgeColor: '#1e40af', icon: '🧩' },
  finishingStages: { label: 'Finishing', badgeBg: '#f0fdf4', badgeColor: '#166534', icon: '✂️' },
}

/**
 * Workflow-step management. Lets admins add/remove/reorder the post-press and
 * finishing stages and edit each stage's default timing. Backed by the process
 * registry (/api/admin/process-registry).
 *
 * NOTE: reordering/adding stages only affects dropdowns and timings until the
 * data-driven workflow engine (feature-flagged) is enabled — the routing logic
 * still reads its stage order from the same registry once that lands.
 */
export default function WorkflowStepManager() {
  const [reg, setReg] = useState<Registry>({ postPressStages: [], finishingStages: [], timings: {}, taskBasis: {} })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [newKey, setNewKey] = useState('')
  const [newModule, setNewModule] = useState<ModuleKey>('postPressStages')
  const [newTime, setNewTime] = useState('')
  const [newBasis, setNewBasis] = useState('independent')

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchProcessRegistry()
      setReg({
        postPressStages: Array.isArray(data?.postPressStages) ? data.postPressStages : [],
        finishingStages: Array.isArray(data?.finishingStages) ? data.finishingStages : [],
        timings: data?.timings && typeof data.timings === 'object' ? data.timings : {},
        taskBasis: data?.taskBasis && typeof data.taskBasis === 'object' ? data.taskBasis : {},
      })
      setDirty(false)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load workflow steps')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const move = (mod: ModuleKey, index: number, delta: number) => {
    setReg((prev) => {
      const list = [...prev[mod]]
      const target = index + delta
      if (target < 0 || target >= list.length) return prev
      ;[list[index], list[target]] = [list[target], list[index]]
      return { ...prev, [mod]: list }
    })
    setDirty(true)
  }

  const remove = (mod: ModuleKey, key: string) => {
    setReg((prev) => {
      const nextBasis = { ...prev.taskBasis }
      delete nextBasis[key]
      return {
        ...prev,
        [mod]: prev[mod].filter((k) => k !== key),
        taskBasis: nextBasis
      }
    })
    setDirty(true)
  }

  const setTiming = (key: string, value: string) => {
    setReg((prev) => ({ ...prev, timings: { ...prev.timings, [key]: Number(value) || 0 } }))
    setDirty(true)
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const key = newKey.trim()
    if (!key) return
    const exists = [...reg.postPressStages, ...reg.finishingStages].some((k) => k.toLowerCase() === key.toLowerCase())
    if (exists) { alert(`Step "${key}" already exists`); return }
    setReg((prev) => ({
      ...prev,
      [newModule]: [...prev[newModule], key],
      timings: { ...prev.timings, [key]: newTime ? Number(newTime) : 60 },
      taskBasis: { ...prev.taskBasis, [key]: newBasis }
    }))
    setNewKey('')
    setNewTime('')
    setNewBasis('independent')
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await updateProcessRegistry({
        postPressStages: reg.postPressStages,
        finishingStages: reg.finishingStages,
        timings: reg.timings,
        taskBasis: reg.taskBasis
      })
      const r = res.registry || {}
      setReg({
        postPressStages: r.postPressStages || reg.postPressStages,
        finishingStages: r.finishingStages || reg.finishingStages,
        timings: r.timings || reg.timings,
        taskBasis: r.taskBasis || reg.taskBasis,
      })
      setDirty(false)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save workflow steps')
    } finally {
      setSaving(false)
    }
  }

  const renderModule = (mod: ModuleKey) => {
    const meta = MODULE_META[mod]
    const list = reg[mod]
    return (
      <div className="dispatch-table-container admin-jobs-table-container" style={{ margin: 0 }}>
        <table className="dispatch-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Step Key</th>
              <th>Module</th>
              <th>Task Basis</th>
              <th>Default Time (min)</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>No {meta.label.toLowerCase()} steps.</td></tr>
            ) : (
              list.map((key, idx) => (
                <tr key={key} className="dispatch-row">
                  <td>{idx + 1}</td>
                  <td><span style={{ fontWeight: 800 }}>{key}</span></td>
                  <td>
                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700, background: meta.badgeBg, color: meta.badgeColor }}>
                      {meta.label}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569', textTransform: 'capitalize' }}>
                      {reg.taskBasis?.[key] || 'Independent'}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={reg.timings[key] ?? ''}
                      onChange={(e) => setTiming(key, e.target.value)}
                      className="form-input"
                      style={{ width: '90px', height: '30px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td className="text-right">
                    <button type="button" title="Move up" disabled={idx === 0} onClick={() => move(mod, idx, -1)}
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: '0.9rem' }}>▲</button>
                    <button type="button" title="Move down" disabled={idx === list.length - 1} onClick={() => move(mod, idx, 1)}
                      style={{ background: 'none', border: 'none', cursor: idx === list.length - 1 ? 'default' : 'pointer', opacity: idx === list.length - 1 ? 0.3 : 1, fontSize: '0.9rem' }}>▼</button>
                    <button type="button" onClick={() => remove(mod, key)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginLeft: '0.5rem' }}>🗑</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading workflow steps…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Add step + Save bar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', margin: 0 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>Step Key</label>
            <input type="text" placeholder="e.g. uvCoating" value={newKey} onChange={(e) => setNewKey(e.target.value)}
              className="form-input" style={{ height: '34px', width: '160px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>Module</label>
            <select value={newModule} onChange={(e) => setNewModule(e.target.value as ModuleKey)} className="filter-select" style={{ height: '34px' }}>
              <option value="postPressStages">Post-Press</option>
              <option value="finishingStages">Finishing</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>Task Basis</label>
            <select value={newBasis} onChange={(e) => setNewBasis(e.target.value)} className="filter-select" style={{ height: '34px' }}>
              <option value="independent">Independent Task</option>
              <option value="lamination">Lamination Variant</option>
              <option value="binding">Binding Variant</option>
              <option value="creasing">Creasing Variant</option>
              <option value="foil">Foil Variant</option>
              <option value="fusing">Fusing Variant</option>
              <option value="holes">Holes Variant</option>
              <option value="cutting">Cutting Variant</option>
              <option value="dieCutting">Die Cutting Variant</option>
              <option value="cornerCutting">Corner Cutting Variant</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>Time (min)</label>
            <input type="number" min={0} placeholder="60" value={newTime} onChange={(e) => setNewTime(e.target.value)}
              className="form-input" style={{ height: '34px', width: '90px', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" className="btn-secondary" style={{ height: '34px', padding: '0 1rem', fontSize: '0.8rem' }}>➕ Add Step</button>
        </form>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 700 }}>Unsaved changes</span>}
          <button type="button" className="btn-secondary" disabled={!dirty || saving} onClick={loadData}
            style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', opacity: (!dirty || saving) ? 0.5 : 1 }}>Discard</button>
          <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={handleSave}
            style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.82rem', opacity: (!dirty || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>🧩 Post-Press Steps</h3>
        {renderModule('postPressStages')}
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>✂️ Finishing Steps</h3>
        {renderModule('finishingStages')}
      </div>
    </div>
  )
}
