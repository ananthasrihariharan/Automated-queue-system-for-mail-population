import { useState, useEffect, useMemo } from 'react'
import { fetchProcessRegistry, updateProcessRegistry } from '@core/services/api'
import './AdminReports.css'

/**
 * Product-based workflow authoring. For a chosen product (e.g. "Visiting Card")
 * the admin defines the ORDERED stage sequence the item flows through
 * (lamination → binding → cutting → cornerCutting → dispatch). Stored in the
 * process registry (`productSequences`).
 */
export default function ProductWorkflowManager() {
  const [productTypes, setProductTypes] = useState<{ id: string; name: string }[]>([])
  const [postPress, setPostPress] = useState<string[]>([])
  const [finishing, setFinishing] = useState<string[]>([])
  const [sequences, setSequences] = useState<Record<string, Record<string, string[]>>>({})

  const [selected, setSelected] = useState<string>('')
  const [selectedFlow, setSelectedFlow] = useState<string>('Default')
  const [newFlowName, setNewFlowName] = useState<string>('')
  const [stageToAdd, setStageToAdd] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchProcessRegistry()
      const types = Array.isArray(data?.productTypes) ? data.productTypes : []
      setProductTypes(types)
      setPostPress(Array.isArray(data?.postPressStages) ? data.postPressStages : [])
      setFinishing(Array.isArray(data?.finishingStages) ? data.finishingStages : [])
      
      const loadedSequences = data?.productSequences && typeof data.productSequences === 'object' ? data.productSequences : {}
      setSequences(loadedSequences)
      
      const firstProduct = types[0]?.name || ''
      setSelected((prev) => {
        const nextProd = prev || firstProduct
        const nextFlows = loadedSequences[nextProd] ? Object.keys(loadedSequences[nextProd]) : []
        setSelectedFlow(prevFlow => nextFlows.includes(prevFlow) ? prevFlow : (nextFlows[0] || 'Default'))
        return nextProd
      })
      setDirty(false)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load product workflows')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Sync selectedFlow when selected product changes
  useEffect(() => {
    if (selected) {
      const nextFlows = sequences[selected] ? Object.keys(sequences[selected]) : []
      if (!nextFlows.includes('Default') && (!sequences[selected] || !sequences[selected]['Default'])) {
        nextFlows.push('Default')
      }
      setSelectedFlow(prevFlow => nextFlows.includes(prevFlow) ? prevFlow : (nextFlows[0] || 'Default'))
    }
  }, [selected])

  const allStages = useMemo(() => [...postPress, ...finishing], [postPress, finishing])
  const moduleOf = (stage: string) => (postPress.includes(stage) ? 'Post-Press' : finishing.includes(stage) ? 'Finishing' : '—')

  const productFlows = useMemo(() => {
    const flows = selected ? (sequences[selected] || {}) : {}
    const out = { ...flows }
    if (selected && !out['Default']) {
      out['Default'] = []
    }
    return out
  }, [selected, sequences])

  const seq = useMemo(() => productFlows[selectedFlow] || [], [productFlows, selectedFlow])
  const available = useMemo(() => allStages.filter((s) => !seq.includes(s)), [allStages, seq])

  const updateSeq = (next: string[]) => {
    setSequences((prev) => ({
      ...prev,
      [selected]: {
        ...(prev[selected] || {}),
        [selectedFlow]: next
      }
    }))
    setDirty(true)
  }

  const addFlowVariant = () => {
    const trimmed = newFlowName.trim()
    if (!trimmed) return
    if (trimmed.toLowerCase() === 'default') return
    if (productFlows[trimmed]) {
      alert('Flow variant already exists!')
      return
    }
    setSequences((prev) => ({
      ...prev,
      [selected]: {
        ...(prev[selected] || {}),
        [trimmed]: []
      }
    }))
    setSelectedFlow(trimmed)
    setNewFlowName('')
    setDirty(true)
  }

  const deleteFlowVariant = (flowToDelete: string) => {
    if (flowToDelete === 'Default') {
      alert('Cannot delete the Default flow variant.')
      return
    }
    if (!window.confirm(`Are you sure you want to delete the flow variant "${flowToDelete}"?`)) return
    
    setSequences((prev) => {
      const copy = { ...prev }
      if (copy[selected]) {
        const nextFlows = { ...copy[selected] }
        delete nextFlows[flowToDelete]
        copy[selected] = nextFlows
      }
      return copy
    })
    setSelectedFlow('Default')
    setDirty(true)
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= seq.length) return
    const list = [...seq]
    ;[list[index], list[target]] = [list[target], list[index]]
    updateSeq(list)
  }

  const remove = (stage: string) => updateSeq(seq.filter((s) => s !== stage))
  
  const add = () => {
    if (!stageToAdd || seq.includes(stageToAdd)) return
    updateSeq([...seq, stageToAdd])
    setStageToAdd('')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await updateProcessRegistry({ productSequences: sequences })
      const saved = res.registry?.productSequences
      if (saved && typeof saved === 'object') setSequences(saved)
      setDirty(false)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save product workflow')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading product workflows…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Product picker + save bar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>Product</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="filter-select" style={{ height: '36px', minWidth: '200px' }}>
            {productTypes.length === 0 && <option value="">No products configured</option>}
            {productTypes.map((p) => {
              const hasSeq = Object.values(sequences[p.name] || {}).some((s) => s && s.length > 0)
              return (
                <option key={p.id || p.name} value={p.name}>{p.name}{hasSeq ? '  ✓' : ''}</option>
              )
            })}
          </select>
        </div>

        {selected && (
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>Workflow Variant</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select value={selectedFlow} onChange={(e) => setSelectedFlow(e.target.value)} className="filter-select" style={{ height: '36px', minWidth: '150px' }}>
                {Object.keys(productFlows).map((flow) => (
                  <option key={flow} value={flow}>{flow}</option>
                ))}
              </select>
              {selectedFlow !== 'Default' && (
                <button type="button" className="btn-secondary" style={{ height: '36px', padding: '0 0.5rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', cursor: 'pointer' }}
                  onClick={() => deleteFlowVariant(selectedFlow)}>
                  🗑
                </button>
              )}
            </div>
          </div>
        )}

        {selected && (
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>New Flow Variant</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" placeholder="e.g. Wiro" value={newFlowName} onChange={(e) => setNewFlowName(e.target.value)} className="form-input-premium" style={{ height: '36px', padding: '0 0.75rem', width: '120px', margin: 0 }} />
              <button type="button" className="btn-secondary" onClick={addFlowVariant} style={{ height: '36px', padding: '0 0.75rem', cursor: 'pointer' }}>
                ＋ Add Flow
              </button>
            </div>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 700 }}>Unsaved changes</span>}
          <button type="button" className="btn-secondary" disabled={!dirty || saving} onClick={loadData}
            style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', opacity: (!dirty || saving) ? 0.5 : 1 }}>Discard</button>
          <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={handleSave}
            style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.82rem', opacity: (!dirty || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : '💾 Save Workflow'}
          </button>
        </div>
      </div>

      {selected && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start' }}>

          {/* Add stage */}
          <div style={{ background: '#fff', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>➕ Add Stage to “{selected} ({selectedFlow})”</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <select value={stageToAdd} onChange={(e) => setStageToAdd(e.target.value)} className="filter-select" style={{ width: '100%', height: '36px' }}>
                <option value="">Select a stage…</option>
                {available.map((s) => (
                  <option key={s} value={s}>{s} ({moduleOf(s)})</option>
                ))}
              </select>
              <button type="button" className="btn-secondary" disabled={!stageToAdd} onClick={add}
                style={{ width: '100%', height: '38px', opacity: stageToAdd ? 1 : 0.5 }}>Append to sequence</button>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                Order = production order. A stage an item didn’t configure is skipped automatically.
                After the last stage the item is done → dispatch.
              </p>
            </div>
          </div>

          {/* Ordered sequence */}
          <div className="dispatch-table-container admin-jobs-table-container" style={{ margin: 0 }}>
            <table className="dispatch-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Stage</th>
                  <th>Module</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {seq.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No sequence yet — add stages to define the flow for “{selected} ({selectedFlow})”.</td></tr>
                ) : (
                  seq.map((stage, idx) => (
                    <tr key={stage} className="dispatch-row">
                      <td><span style={{ fontWeight: 800 }}>{idx + 1}</span></td>
                      <td><span style={{ fontWeight: 800 }}>{stage}</span></td>
                      <td>
                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700,
                          background: moduleOf(stage) === 'Post-Press' ? '#eff6ff' : '#f0fdf4',
                          color: moduleOf(stage) === 'Post-Press' ? '#1e40af' : '#166534' }}>
                          {moduleOf(stage)}
                        </span>
                      </td>
                      <td className="text-right">
                        <button type="button" title="Move up" disabled={idx === 0} onClick={() => move(idx, -1)}
                          style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: '0.9rem' }}>▲</button>
                        <button type="button" title="Move down" disabled={idx === seq.length - 1} onClick={() => move(idx, 1)}
                          style={{ background: 'none', border: 'none', cursor: idx === seq.length - 1 ? 'default' : 'pointer', opacity: idx === seq.length - 1 ? 0.3 : 1, fontSize: '0.9rem' }}>▼</button>
                        <button type="button" onClick={() => remove(stage)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginLeft: '0.5rem' }}>🗑</button>
                      </td>
                    </tr>
                  ))
                )}
                {seq.length > 0 && (
                  <tr className="dispatch-row">
                    <td><span style={{ fontWeight: 800 }}>{seq.length + 1}</span></td>
                    <td colSpan={3}><span style={{ fontWeight: 700, color: '#0369a1' }}>🚚 dispatch</span> <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>(automatic when all stages complete)</span></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
