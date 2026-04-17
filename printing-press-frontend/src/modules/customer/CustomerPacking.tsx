import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import './CustomerPacking.css'

const BACKEND_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_BACKEND_URL || '')

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

  // Packing State
  const [packing, setPacking] = useState<'SINGLE' | 'MULTIPLE' | null>(null)
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [parcels, setParcels] = useState<Parcel[]>([])

  // Receiver Form State
  const [receiverType, setReceiverType] = useState<'SELF' | 'OTHER'>('SELF')
  const [receiverName, setReceiverName] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  const [loading, setLoading] = useState(false)

  // Load Job Logic
  useEffect(() => {
    api
      .get(`/api/customer/jobs/${jobId}`)
      .then(res => {
        setJob(res.data)
        // If already packed/dispatched, the backend might send the preference.
        // We can set it to view mode automatically in the render logic.
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
      // Refresh job data to switch to read-only view
      const res = await api.get(`/api/customer/jobs/${jobId}`)
      setJob(res.data)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to submit packing')
    } finally {
      setLoading(false)
    }
  }

  if (!job) return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
  )

  const isLocked = job.jobStatus === 'PACKED' || job.jobStatus === 'DISPATCHED' || job.parcels?.some((p: any) => p.status === 'PACKED' || p.status === 'DISPATCHED')

  // --- READ ONLY VIEW ---
  if (isLocked) {
    const finalParcels = job.parcels && job.parcels.length > 0 ? job.parcels : [{ parcelNo: 1, itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1), receiverName: job.customerName }]

    return (
      <div className="packing-page">
        <div className="read-only-container">
          <div className="ro-header">
            <h1 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '0.5rem' }}>Job #{job.jobId}</h1>
            <div className="ro-status-badge">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              Packing Confirmed
            </div>
            <p style={{ color: '#6b7280' }}>Your packing preferences have been submitted to our dispatch team.</p>
            <button onClick={() => navigate('/customer/dashboard')} className="btn-outline" style={{ display: 'inline-flex', marginTop: '1.5rem', width: 'auto' }}>
              Back to Dashboard
            </button>
          </div>

          <div className="ro-grid">
            {finalParcels.map((p: any) => (
              <div key={p.parcelNo} className="ro-parcel-card">
                <div className="ro-parcel-header">
                  <span style={{ fontWeight: 800 }}>PARCEL {p.parcelNo}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.itemIndexes.length} items</span>
                </div>
                <div className="ro-parcel-content">
                  <div className="ro-item-grid">
                    {p.itemIndexes.map((idx: number) => {
                      const imgPath = job.itemScreenshots?.[idx - 1]
                      return (
                        <div key={idx} className="ro-item-thumb">
                          {imgPath ? (
                            <img src={`${BACKEND_URL}/${imgPath.replace(/\\/g, '/')}`} alt={`Item ${idx}`} />
                          ) : (
                            <div style={{ height: '100%', background: '#f1f5f9' }}></div>
                          )}
                          <span>#{idx}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', fontSize: '0.75rem', color: '#64748b' }}>
                    <strong style={{ color: '#000' }}>Receiver:</strong> {p.receiverName || job.customerName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // --- EDITABLE PACKING VIEW ---
  return (
    <div className="packing-page">
      <div className="packing-container">

        {/* Left Panel: Configurator */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <header className="packing-header">
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Pack Your Items</h2>
              <p style={{ color: '#6b7280' }}>Select items to group them into parcels.</p>
            </div>
            <button onClick={() => navigate('/customer/dashboard')} className="btn-outline" style={{ width: 'auto' }}>Exit</button>
          </header>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '1rem' }}>
            <div className="strategy-grid">
              <div
                className={`strategy-card ${packing === 'SINGLE' ? 'active' : ''}`}
                onClick={() => { setPacking('SINGLE'); setParcels([]); setSelectedItems([]); }}
              >
                <span className="strategy-card-title">Single Parcel</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Everything in one box</span>
              </div>
              <div
                className={`strategy-card ${packing === 'MULTIPLE' ? 'active' : ''}`}
                onClick={() => setPacking('MULTIPLE')}
              >
                <span className="strategy-card-title">Multiple Parcels</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Split items into boxes</span>
              </div>
            </div>

            {packing === 'MULTIPLE' && (
              <>
                <h4 className="section-title">Select Items for New Segment</h4>
                <div className="packing-item-grid">
                  {Array.from({ length: job.totalItems }, (_, i) => i + 1).map(i => {
                    const isAssigned = assignedItems.includes(i)
                    const isSelected = selectedItems.includes(i)
                    const imgPath = job.itemScreenshots?.[i - 1]
                    const fullUrl = imgPath ? `${BACKEND_URL}/${imgPath.replace(/\\/g, '/')}` : null

                    return (
                      <div
                        key={i}
                        className={`packing-item-card ${isAssigned ? 'assigned' : isSelected ? 'selected' : ''}`}
                        onClick={() => !isAssigned && toggleItem(i)}
                      >
                        {fullUrl ? (
                          <>
                            <img src={fullUrl} alt={`Item ${i}`} />
                            <div className="overlay">
                              <div className="check-icon">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                              </div>
                            </div>
                            {!isSelected && <div className="item-number-badge">{i}</div>}
                          </>
                        ) : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: '#e5e7eb' }}>
                            {i}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="packing-section">
                  <h4 className="section-title" style={{ marginBottom: '0.5rem' }}>Receiver Details (Optional)</h4>
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                      <input type="radio" checked={receiverType === 'SELF'} onChange={() => setReceiverType('SELF')} /> Self (Me)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                      <input type="radio" checked={receiverType === 'OTHER'} onChange={() => setReceiverType('OTHER')} /> Someone Else
                    </label>
                  </div>

                  {receiverType === 'OTHER' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <label className="form-label">Name</label>
                        <input className="form-input" value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="Receiver Name" />
                      </div>
                      <div>
                        <label className="form-label">Phone</label>
                        <input className="form-input" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} placeholder="Phone Number" />
                      </div>
                    </div>
                  )}

                  <button className="btn-primary" onClick={addParcel} disabled={selectedItems.length === 0}>
                    Create Parcel Segment ({selectedItems.length} Items)
                  </button>
                </div>
              </>
            )}

            {/* Confirmation Area */}
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#000', borderRadius: '1rem', color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: '1.25rem' }}>Confirm Packing</h3>
                  <p style={{ fontSize: '0.875rem', color: '#a3a3a3' }}>
                    {packing === 'SINGLE' ? 'All items will be packed in one box.' : `${parcels.length} parcels configured.`}
                  </p>
                </div>
                <button
                  className="btn-primary"
                  style={{ background: '#fff', color: '#000', width: 'auto' }}
                  onClick={submitPacking}
                  disabled={loading || (packing === 'MULTIPLE' && assignedItems.length < job.totalItems)}
                >
                  {loading ? 'Submitting...' : 'Submit to Dispatch'}
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Right Panel: Summary */}
        <div className="packing-sidebar">
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Current Configuration
          </h3>

          <div className="parcel-list">
            {packing === 'SINGLE' && (
              <div className="parcel-card-new">
                <div className="parcel-header">
                  <span className="parcel-title">Parcel #1</span>
                  <span className="ro-status-badge" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginBottom: 0 }}>SINGLE</span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Contains all {job.totalItems} items.</p>
              </div>
            )}

            {packing === 'MULTIPLE' && parcels.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '0.75rem' }}>
                No parcels created yet. Select items and click "Create Parcel" to start.
              </div>
            )}

            {parcels.map(p => (
              <div key={p.parcelNo} className="parcel-card-new">
                <div className="parcel-header">
                  <span className="parcel-title">Parcel #{p.parcelNo}</span>
                  <button style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => removeParcel(p.parcelNo)}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <div className="parcel-items-preview">
                  {p.itemIndexes.map(idx => (
                    <span key={idx} className="mini-item-pill">#{idx}</span>
                  ))}
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                  <strong>To:</strong> {p.receiverName}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
