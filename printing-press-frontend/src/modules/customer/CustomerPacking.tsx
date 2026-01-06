import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import './CustomerPacking.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

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
    <div className="packing-page">
      <div className="packing-container">
        {/* Left Col */}
        <div>
          <header className="packing-header">
            <button onClick={() => navigate('/customer/dashboard')} className="btn-outline" style={{ marginBottom: '1rem' }}>
              &larr; Back to Dashboard
            </button>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Organize Layout</h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Job ID: #{job.jobId}</p>
          </header>

          {job.jobStatus === 'PACKED' || job.parcels?.some((p: any) => p.status === 'PACKED' || p.status === 'DISPATCHED') ? (
            <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '0.5rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#1e40af', fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.5rem' }}>Job is Packed</h3>
              <p style={{ color: '#1e3a8a', fontSize: '0.875rem' }}>
                This job has been processed and is ready for collection. The packing details are now locked.
              </p>
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #dbeafe' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Selected Mode</span>
                <p style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>{packing === 'SINGLE' ? 'Single Parcel' : 'Multiple Parcels'}</p>
              </div>
            </div>
          ) : (
            <section className="packing-section">
              <span className="section-title">Select Packing Mode</span>
              <div className="strategy-grid">
                <div
                  className={`strategy-card ${packing === 'SINGLE' ? 'active' : ''}`}
                  onClick={() => { setPacking('SINGLE'); setParcels([]); }}
                >
                  <span className="strategy-card-title">Single Parcel</span>
                </div>
                <div
                  className={`strategy-card ${packing === 'MULTIPLE' ? 'active' : ''}`}
                  onClick={() => setPacking('MULTIPLE')}
                >
                  <span className="strategy-card-title">Multiple Parcels</span>
                </div>
              </div>

              {packing === 'MULTIPLE' && (
                <div>
                  <span className="section-title">Select Items for Group</span>
                  <div className="item-grid" style={{ marginBottom: '1.5rem' }}>
                    {Array.from({ length: job.totalItems }, (_, i) => i + 1).map(i => {
                      const isAssigned = assignedItems.includes(i)
                      const isSelected = selectedItems.includes(i)
                      return (
                        <div
                          key={i}
                          className={`item-node ${isAssigned ? 'assigned' : isSelected ? 'selected' : ''}`}
                          onClick={() => !isAssigned && toggleItem(i)}
                        >
                          {i}
                        </div>
                      )
                    })}
                  </div>

                  <div className="receiver-form">
                    <span className="section-title">Receiver Details</span>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                      <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        <input type="radio" checked={receiverType === 'SELF'} onChange={() => setReceiverType('SELF')} /> Self
                      </label>
                      <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        <input type="radio" checked={receiverType === 'OTHER'} onChange={() => setReceiverType('OTHER')} /> Other
                      </label>
                    </div>

                    {receiverType === 'OTHER' && (
                      <div className="strategy-grid">
                        <div className="form-input-group">
                          <span className="form-label">Name</span>
                          <input
                            className="form-input"
                            value={receiverName}
                            onChange={e => setReceiverName(e.target.value)}
                          />
                        </div>
                        <div className="form-input-group">
                          <span className="form-label">Phone</span>
                          <input
                            className="form-input"
                            value={receiverPhone}
                            onChange={e => setReceiverPhone(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      className="btn-primary"
                      onClick={addParcel}
                      disabled={selectedItems.length === 0}
                    >
                      Create Parcel Segment
                    </button>
                  </div>
                </div>
              )}

              {packing && (
                <div style={{ marginTop: '2rem' }}>
                  <button
                    className="btn-primary"
                    onClick={submitPacking}
                    disabled={loading || (packing === 'MULTIPLE' && assignedItems.length < job.totalItems)}
                    style={{ background: (loading || (packing === 'MULTIPLE' && assignedItems.length < job.totalItems)) ? '#e5e7eb' : '#000000' }}
                  >
                    {loading ? 'Submitting...' : 'Confirm Strategy'}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Col */}
        <div>
          <section className="packing-section">
            <span className="section-title">Item Previews</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              {job.itemScreenshots?.map((img: string, i: number) => (
                <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '0.375rem', overflow: 'hidden' }}>
                  <img
                    src={`${BACKEND_URL}/${img.replace(/\\/g, '/')}`}
                    alt={`Item ${i + 1}`}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                  <div style={{ padding: '0.25rem', fontSize: '0.625rem', textAlign: 'center', fontWeight: 700 }}>Unit {i + 1}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="packing-section">
            <span className="section-title">Configured Segments</span>
            <div className="parcel-list">
              {packing === 'SINGLE' && (
                <div className="parcel-item">
                  <div className="parcel-info">
                    <h5>Unified Container</h5>
                    <p>Items 1 - {job.totalItems}</p>
                  </div>
                </div>
              )}

              {parcels.length === 0 && packing === 'MULTIPLE' && (
                <p style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center' }}>No segments created yet</p>
              )}

              {parcels.map(p => (
                <div key={p.parcelNo} className="parcel-item">
                  <div className="parcel-info">
                    <h5>Segment #{p.parcelNo}</h5>
                    <p>Items: {p.itemIndexes.join(', ')}</p>
                    <p>To: {p.receiverName}</p>
                  </div>
                  <button className="btn-danger-outline" onClick={() => removeParcel(p.parcelNo)}>
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
