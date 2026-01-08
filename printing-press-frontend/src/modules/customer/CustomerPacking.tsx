import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import './CustomerPacking.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

type Parcel = {
  parcelNo: number
  itemIndexes: number[]
  receiverType: 'SELF' | 'OTHER'
  receiverName?: string
  receiverPhone?: string
}

export default function CustomerPacking() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<any>(null)
  const [packing, setPacking] = useState<'SINGLE' | 'MULTIPLE' | null>(null)
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [parcels, setParcels] = useState<Parcel[]>([])

  const [receiverType, setReceiverType] = useState<'SELF' | 'OTHER'>('SELF')
  const [receiverName, setReceiverName] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api
      .get(`/api/customer/jobs/${jobId}`)
      .then(res => {
        setJob(res.data)
        if (res.data.packingPreference) setPacking(res.data.packingPreference)
      })
      .catch(err => {
        if (err.response?.status === 401) navigate('/login')
      })
  }, [jobId, navigate])

  const assignedItems = useMemo(() => parcels.flatMap(p => p.itemIndexes), [parcels])

  const toggleItem = (i: number) => {
    if (assignedItems.includes(i)) return
    setSelectedItems(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    )
  }

  const addParcel = () => {
    if (selectedItems.length === 0) return alert('Select items first')
    if (receiverType === 'OTHER' && (!receiverName || !receiverPhone)) return alert('Enter receiver details')

    setParcels([
      ...parcels,
      {
        parcelNo: parcels.length + 1,
        itemIndexes: [...selectedItems].sort((a, b) => a - b),
        receiverType,
        receiverName: receiverType === 'OTHER' ? receiverName : job.customerName,
        receiverPhone: receiverType === 'OTHER' ? receiverPhone : 'SELF'
      }
    ])

    setSelectedItems([])
    setReceiverName('')
    setReceiverPhone('')
    setReceiverType('SELF')
  }

  const removeParcel = (no: number) => {
    setParcels(prev => prev.filter(p => p.parcelNo !== no).map((p, i) => ({ ...p, parcelNo: i + 1 })))
  }

  const submitPacking = async () => {
    if (packing === 'MULTIPLE' && assignedItems.length < job.totalItems) {
      alert('All items must be assigned to a parcel.')
      return
    }

    setLoading(true)
    try {
      await api.post(`/api/customer/jobs/${jobId}/packing`, {
        packingPreference: packing,
        parcels: packing === 'SINGLE'
          ? [{ parcelNo: 1, itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1), receiverType: 'SELF' }]
          : parcels
      })
      navigate('/customer/dashboard')
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to submit packing')
    } finally {
      setLoading(false)
    }
  }

  if (!job) return (
    <div className="dispatch-loading">
      <div className="dispatch-spinner"></div>
    </div>
  )

  if (job.jobStatus === 'DISPATCHED') return (
    <div className="packing-page" style={{ textAlign: 'center', paddingTop: '10rem' }}>
      <h2 style={{ fontSize: '2rem', fontWeight: 900 }}>Already Dispatched</h2>
      <p style={{ color: '#6b7280', margin: '1rem 0 2rem' }}>This job has been completed and dispatched.</p>
      <button onClick={() => navigate('/customer/dashboard')} className="btn-primary" style={{ width: 'auto' }}>
        Back to Dashboard
      </button>
    </div>
  )

  return (
    <div className="dispatch-modal-overlay">
      <div className="dispatch-modal-container">
        <header className="dispatch-modal-header" style={{ flexShrink: 0 }}>
          <div className="job-info-brief">
            <h2 className="modal-title">Organize Packing for #{job.jobId}</h2>
            <p className="modal-subtitle">Customer: {job.customerName}</p>
          </div>
          <button onClick={() => navigate('/customer/dashboard')} className="btn-outline">
            &larr; Exit to Dashboard
          </button>
        </header>

        <div className="dispatch-modal-content" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {job.jobStatus === 'PACKED' || job.parcels?.some((p: any) => p.status === 'PACKED' || p.status === 'DISPATCHED') ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '1rem', padding: '3rem', maxWidth: '500px' }}>
                <h3 style={{ color: '#1e40af', fontWeight: 900, fontSize: '1.5rem', marginBottom: '1rem' }}>Order is Locked</h3>
                <p style={{ color: '#1e3a8a', marginBottom: '2rem', lineHeight: 1.5 }}>
                  This job has already been processed by our dispatch team. The packing configuration is now locked and cannot be modified.
                </p>
                <div style={{ padding: '1rem', background: '#fff', borderRadius: '0.5rem', border: '1px solid #dbeafe', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Selected Preference</span>
                  <p style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>{packing === 'SINGLE' ? 'Single Parcel' : 'Multiple Parcels'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', height: '100%', overflow: 'hidden' }}>
              {/* Left Column: Configurator */}
              <div style={{ overflowY: 'auto', paddingRight: '1rem' }}>
                <section className="packing-mode-section" style={{ marginBottom: '2rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '1rem' }}>1. Choose Mode</h4>
                  <div className="strategy-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div
                      className={`strategy-card ${packing === 'SINGLE' ? 'active' : ''}`}
                      onClick={() => { setPacking('SINGLE'); setParcels([]); }}
                      style={{ padding: '1.5rem', border: '2px solid #e2e8f0', borderRadius: '0.75rem', cursor: 'pointer', textAlign: 'center' }}
                    >
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '1rem' }}>Single Parcel</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Best for small orders</span>
                    </div>
                    <div
                      className={`strategy-card ${packing === 'MULTIPLE' ? 'active' : ''}`}
                      onClick={() => setPacking('MULTIPLE')}
                      style={{ padding: '1.5rem', border: '2px solid #e2e8f0', borderRadius: '0.75rem', cursor: 'pointer', textAlign: 'center' }}
                    >
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '1rem' }}>Multiple Parcels</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Split by receiver or safety</span>
                    </div>
                  </div>
                </section>

                {packing === 'MULTIPLE' && (
                  <section style={{ marginBottom: '2rem' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '1rem' }}>2. Group Items</h4>
                    <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                      <div className="item-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        {Array.from({ length: job.totalItems }, (_, i) => i + 1).map(i => {
                          const isAssigned = assignedItems.includes(i)
                          const isSelected = selectedItems.includes(i)
                          return (
                            <div
                              key={i}
                              className={`item-node ${isAssigned ? 'assigned' : isSelected ? 'selected' : ''}`}
                              onClick={() => !isAssigned && toggleItem(i)}
                              style={{
                                height: '60px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '0.5rem',
                                fontWeight: 800,
                                cursor: isAssigned ? 'not-allowed' : 'pointer',
                                background: isAssigned ? '#e2e8f0' : isSelected ? '#000' : '#fff',
                                color: isAssigned ? '#94a3b8' : isSelected ? '#fff' : '#1e293b',
                                border: '2px solid',
                                borderColor: isAssigned ? 'transparent' : isSelected ? '#000' : '#e2e8f0'
                              }}
                            >
                              {i}
                            </div>
                          )
                        })}
                      </div>

                      <div className="receiver-form" style={{ marginTop: '1.5rem', padding: '1rem', background: '#fff', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>
                            <input type="radio" checked={receiverType === 'SELF'} onChange={() => setReceiverType('SELF')} /> Self Collection
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>
                            <input type="radio" checked={receiverType === 'OTHER'} onChange={() => setReceiverType('OTHER')} /> Send to Other
                          </label>
                        </div>

                        {receiverType === 'OTHER' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                              <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Receiver Name</span>
                              <input
                                className="form-input"
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}
                                value={receiverName}
                                onChange={e => setReceiverName(e.target.value)}
                              />
                            </div>
                            <div>
                              <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Phone Number</span>
                              <input
                                className="form-input"
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}
                                value={receiverPhone}
                                onChange={e => setReceiverPhone(e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        <button
                          className="btn-primary"
                          style={{ width: '100%', borderRadius: '0.5rem' }}
                          onClick={addParcel}
                          disabled={selectedItems.length === 0}
                        >
                          Add to Selection
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {packing && (
                  <div style={{ marginTop: '3rem', padding: '1.5rem', background: '#000', borderRadius: '1rem', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h5 style={{ fontWeight: 800, fontSize: '1.125rem' }}>Ready to Confirm?</h5>
                      <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>This will lock in your strategy for the dispatch team.</p>
                    </div>
                    <button
                      className="btn-primary"
                      onClick={submitPacking}
                      disabled={loading || (packing === 'MULTIPLE' && assignedItems.length < job.totalItems)}
                      style={{ background: '#fff', color: '#000', width: 'auto', padding: '0.75rem 2rem' }}
                    >
                      {loading ? 'Processing...' : 'Confirm Strategy'}
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Previews & Result */}
              <div style={{ overflowY: 'auto', background: '#f8fafc', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                <section style={{ marginBottom: '2rem' }}>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '1rem' }}>Configured Parcels</h4>
                  <div className="parcel-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {packing === 'SINGLE' && (
                      <div className="parcel-card" style={{ background: '#fff' }}>
                        <div className="parcel-header">
                          <span className="parcel-id">Unified Parcel #1</span>
                          <span className="status-badge">SINGLE</span>
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
                          All {job.totalItems} Units
                        </div>
                      </div>
                    )}

                    {parcels.length === 0 && packing === 'MULTIPLE' && (
                      <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #e2e8f0', borderRadius: '0.75rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                        No segments created yet
                      </div>
                    )}

                    {parcels.map(p => (
                      <div key={p.parcelNo} className="parcel-card" style={{ background: '#fff' }}>
                        <div className="parcel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="parcel-id">Segment #{p.parcelNo}</span>
                          <button style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '1.25rem' }} onClick={() => removeParcel(p.parcelNo)}>&times;</button>
                        </div>
                        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {p.itemIndexes.map(idx => (
                            <span key={idx} style={{ background: '#f1f5f9', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700 }}>#{idx}</span>
                          ))}
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                          <strong>Receiver:</strong> {p.receiverName}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '1rem' }}>Unit Previews</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                    {job.itemScreenshots?.map((img: string, i: number) => (
                      <div key={i} className="item-thumb" style={{ background: '#fff' }}>
                        <img
                          src={`${BACKEND_URL}/${img.replace(/\\/g, '/')}`}
                          alt={`Unit ${i + 1}`}
                          style={{ width: '100%', height: '80px', objectFit: 'cover' }}
                        />
                        <div style={{ padding: '0.5rem', fontSize: '0.625rem', textAlign: 'center', fontWeight: 800 }}>Unit {i + 1}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
