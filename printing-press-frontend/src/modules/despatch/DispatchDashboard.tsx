import { useEffect, useState, useMemo } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import ModuleNavigation from '../../components/ModuleNavigation'
import './DispatchDashboard.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

function DispatchParcels({ job, onClose, onDispatched }: any) {
  const [parcelRacks, setParcelRacks] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {}
    job.parcels?.forEach((p: any) => {
      initial[p.parcelNo] = p.rack || job.rackLocation || ''
    })
    return initial
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [viewImage, setViewImage] = useState<string | null>(null)

  // Reorganization Logic
  const [isReorganizing, setIsReorganizing] = useState(false)
  const [tempParcels, setTempParcels] = useState<any[]>([])
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [overrideReason, setOverrideReason] = useState('')
  const [reorgMode, setReorgMode] = useState<'SINGLE' | 'MULTIPLE' | 'MIXED'>('SINGLE')

  const { user } = useAuth()

  const isAdmin = user?.roles?.includes('ADMIN')
  const isApproved = job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED'

  const rackOptions = ['R1', 'R2', 'R3', 'R4', 'CB-VC', 'CB-SM', 'CB-SP', 'OUT PARCEL']

  const handlePack = async (parcelNo: number) => {
    const rack = parcelRacks[parcelNo]
    if (!rack) {
      alert('Please specify a rack location for this parcel.')
      return
    }
    setIsSubmitting(true)
    try {
      await api.patch(
        `/api/dispatch/jobs/${job.jobId}/parcels/${parcelNo}/pack`,
        { rack }
      )
      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Packing failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDispatch = async (parcelNo: number) => {
    if (!isApproved && !isAdmin) {
      alert('Cannot dispatch: Payment or Admin approval required')
      return
    }

    if (!window.confirm(`Are you sure you want to dispatch Parcel ${parcelNo}?`)) return

    setIsSubmitting(true)
    try {
      await api.patch(
        `/api/dispatch/jobs/${job.jobId}/parcels/${parcelNo}/dispatch`,
        { adminApproval: isAdmin && !isApproved }
      )
      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Dispatch failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const startReorganizing = () => {
    setTempParcels(job.parcels?.length > 0 ? [...job.parcels] : [{ parcelNo: 1, itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1), receiverType: 'SELF', receiverName: job.customerName }])
    setReorgMode(job.packingMode || job.packingPreference || 'SINGLE')
    setIsReorganizing(true)
  }

  const handleSaveReorganization = async () => {
    const allAssigned = tempParcels.flatMap(p => p.itemIndexes)
    if (allAssigned.length !== job.totalItems) {
      alert('All items must be assigned to parcels.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.patch(`/api/dispatch/jobs/${job.jobId}/reorganize`, {
        parcels: tempParcels,
        packingMode: reorgMode,
        overrideReason: reorgMode !== job.packingPreference ? overrideReason : ''
      })
      setIsReorganizing(false)
      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Reorganization failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addTempParcel = () => {
    if (selectedItems.length === 0) return alert('Select items first')
    setTempParcels([
      ...tempParcels,
      {
        parcelNo: tempParcels.length + 1,
        itemIndexes: [...selectedItems].sort((a, b) => a - b),
        receiverType: 'SELF',
        receiverName: job.customerName,
        status: 'PENDING'
      }
    ])
    setSelectedItems([])
  }

  const removeTempParcel = (no: number) => {
    setTempParcels(prev => prev.filter(p => p.parcelNo !== no).map((p, i) => ({ ...p, parcelNo: i + 1 })))
  }

  const toggleItem = (i: number) => {
    const alreadyAssigned = tempParcels.flatMap(p => p.itemIndexes).includes(i)
    if (alreadyAssigned) return
    setSelectedItems(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    )
  }


  return (
    <>
      <div className="dispatch-modal-overlay">
        <div className="dispatch-modal">
          <div className="dispatch-modal-header">
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>Job #{job.jobId}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Customer: {job.customerName}</p>
                <div style={{ width: '4px', height: '4px', background: '#e5e7eb', borderRadius: '50%' }}></div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Pref: <span style={{ fontWeight: 700, color: '#000' }}>{job.packingPreference}</span></p>
                {job.packingMode && job.packingMode !== job.packingPreference && (
                  <>
                    <div style={{ width: '4px', height: '4px', background: '#e5e7eb', borderRadius: '50%' }}></div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Mode: <span style={{ fontWeight: 700, color: '#ef4444' }}>{job.packingMode} (Staff Override)</span></p>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {!isReorganizing && !job.parcels?.some((p: any) => p.status === 'DISPATCHED') && (
                <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', fontSize: '0.75rem' }} onClick={startReorganizing}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
                  Reorganize
                </button>
              )}
              <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
          </div>


          <div className="dispatch-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1rem' }}>
            {isReorganizing ? (
              <div className="reorganize-container">
                <div style={{ marginBottom: '1.5rem', background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '1rem' }}>Configure Reorganization</h3>

                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <button
                      className={`btn-outline ${reorgMode === 'SINGLE' ? 'active' : ''}`}
                      style={{ flex: 1, borderColor: reorgMode === 'SINGLE' ? '#000' : '#e5e7eb', background: reorgMode === 'SINGLE' ? '#f3f4f6' : 'transparent' }}
                      onClick={() => { setReorgMode('SINGLE'); setTempParcels([{ parcelNo: 1, itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1), receiverType: 'SELF', receiverName: job.customerName, status: 'PENDING' }]); }}
                    >
                      Single Parcel
                    </button>
                    <button
                      className={`btn-outline ${reorgMode === 'MULTIPLE' ? 'active' : ''}`}
                      style={{ flex: 1, borderColor: reorgMode === 'MULTIPLE' ? '#000' : '#e5e7eb', background: reorgMode === 'MULTIPLE' ? '#f3f4f6' : 'transparent' }}
                      onClick={() => setReorgMode('MULTIPLE')}
                    >
                      Multiple (Cust)
                    </button>
                    <button
                      className={`btn-outline ${reorgMode === 'MIXED' ? 'active' : ''}`}
                      style={{ flex: 1, borderColor: reorgMode === 'MIXED' ? '#000' : '#e5e7eb', background: reorgMode === 'MIXED' ? '#f3f4f6' : 'transparent' }}
                      onClick={() => setReorgMode('MIXED')}
                    >
                      Mixed (Staff)
                    </button>
                  </div>

                  {reorgMode !== job.packingPreference && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Override Reason (Optional)</label>
                      <input
                        className="form-input"
                        placeholder="e.g. Different item types, Staff decision..."
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                      />
                    </div>
                  )}

                  {reorgMode !== 'SINGLE' && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e1e4e8' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Select Items for New Parcel</span>
                      <div className="item-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                        {Array.from({ length: job.totalItems }, (_, i) => i + 1).map(i => {
                          const isAssigned = tempParcels.flatMap(p => p.itemIndexes).includes(i)
                          const isSelected = selectedItems.includes(i)
                          const imgPath = job.itemScreenshots?.[i - 1]
                          const fullUrl = imgPath ? `${BACKEND_URL}/${imgPath.replace(/\\/g, '/')}` : null

                          return (
                            <div key={i} style={{ position: 'relative' }}>
                              <div
                                className={`item-node ${isAssigned ? 'assigned' : isSelected ? 'selected' : ''}`}
                                style={{
                                  width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  border: `2px solid ${isAssigned ? '#e5e7eb' : isSelected ? '#000' : '#e5e7eb'}`,
                                  borderRadius: '6px', overflow: 'hidden', position: 'relative',
                                  cursor: isAssigned ? 'not-allowed' : 'pointer',
                                  background: isAssigned ? '#f3f4f6' : '#fff',
                                }}
                                onClick={() => !isAssigned && toggleItem(i)}
                              >
                                {fullUrl ? (
                                  <img
                                    src={fullUrl}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isAssigned ? 0.4 : 1 }}
                                    alt={`Item ${i}`}
                                  />
                                ) : (
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isAssigned ? '#9ca3af' : '#000' }}>{i}</span>
                                )}

                                {isSelected && !isAssigned && (
                                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="20" height="20" fill="white" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                  </div>
                                )}

                                <span style={{ position: 'absolute', bottom: '2px', right: '2px', background: '#000', color: '#fff', fontSize: '0.625rem', padding: '0 4px', borderRadius: '3px', fontWeight: 900 }}>{i}</span>
                              </div>

                              {fullUrl && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setViewImage(fullUrl); }}
                                  style={{
                                    position: 'absolute', top: '-5px', right: '-5px', width: '20px', height: '20px',
                                    borderRadius: '50%', background: '#fff', border: '1px solid #e5e7eb',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                  }}
                                  title="Expand Preview"
                                >
                                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <button className="btn-primary" style={{ width: '100%', fontSize: '0.875rem' }} onClick={addTempParcel} disabled={selectedItems.length === 0}>
                        Create Parcel Segment
                      </button>
                    </div>
                  )}
                </div>

                <div className="temp-parcel-list">
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '1rem' }}>Current Configuration</h4>
                  {tempParcels.map(p => (
                    <div key={p.parcelNo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Parcel #{p.parcelNo}</span>
                        <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Items: {p.itemIndexes.join(', ')}</p>
                      </div>
                      {reorgMode !== 'SINGLE' && (
                        <button className="btn-danger-outline" style={{ padding: '0.25rem 0.5rem', minWidth: 'auto' }} onClick={() => removeTempParcel(p.parcelNo)}>&times;</button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button className="btn-outline" style={{ flex: 1 }} onClick={() => setIsReorganizing(false)}>Cancel</button>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={handleSaveReorganization} disabled={isSubmitting || (reorgMode !== 'SINGLE' && tempParcels.flatMap(p => p.itemIndexes).length < job.totalItems)}>
                    {isSubmitting ? 'Saving...' : 'Confirm Layout'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {!isApproved && (
                  <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid #fecaca' }}>
                    <strong style={{ color: '#991b1b' }}>Payment Required</strong>
                    <p style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '0.25rem' }}>
                      {isAdmin ? 'Admin override enabled.' : 'Wait for payment confirmation before dispatch.'}
                    </p>
                  </div>
                )}

                <div className="parcel-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {(job.parcels?.length > 0 ? job.parcels : [{ parcelNo: 1, status: 'PENDING', itemIndexes: Array.from({ length: job.totalItems || 0 }, (_, i) => i + 1) }]).map((p: any) => {

                    const isPacked = p.status === 'PACKED'
                    const isOut = p.status === 'DISPATCHED'
                    const items = p.itemIndexes || []

                    return (
                      <div key={p.parcelNo} className="parcel-card" style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', background: '#ffffff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>
                          <div>
                            <span style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.875rem' }}>Parcel {p.parcelNo}</span>
                            <span className={`status-badge ${isOut ? 'status-dispatched' : isPacked ? 'status-packed' : 'status-pending'}`} style={{ marginLeft: '0.5rem' }}>
                              {p.status || 'PENDING'}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '0.75rem', fontWeight: 700 }}>{p.receiverName || job.customerName}</p>
                            <p style={{ fontSize: '0.625rem', color: '#6b7280' }}>{p.receiverPhone || job.customerPhone || 'N/A'}</p>
                          </div>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                          <p style={{ fontSize: '0.625rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Included Items ({items.length})</p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))', gap: '0.5rem' }}>
                            {items.map((idx: number) => {
                              const imgPath = job.itemScreenshots?.[idx - 1]
                              const fullUrl = imgPath ? `${BACKEND_URL}/${imgPath.replace(/\\/g, '/')}` : null

                              return (
                                <div key={idx} style={{ position: 'relative' }}>
                                  <div
                                    style={{
                                      width: '50px',
                                      height: '50px',
                                      border: '1px solid #e5e7eb',
                                      borderRadius: '0.25rem',
                                      overflow: 'hidden',
                                      background: '#f9fafb',
                                      cursor: fullUrl ? 'pointer' : 'default'
                                    }}
                                    onClick={() => fullUrl && setViewImage(fullUrl)}
                                  >
                                    {fullUrl ? (
                                      <img
                                        src={fullUrl}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        alt={`Item ${idx}`}
                                      />
                                    ) : (
                                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', color: '#d1d5db' }}>N/A</div>
                                    )}
                                  </div>
                                  <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', background: '#000', color: '#fff', fontSize: '0.5rem', padding: '0 2px', borderRadius: '2px', fontWeight: 700 }}>{idx}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.625rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Rack Location</label>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <select
                                className="form-input"
                                style={{ padding: '0.25rem', fontSize: '0.75rem' }}
                                value={rackOptions.includes(parcelRacks[p.parcelNo]) ? parcelRacks[p.parcelNo] : ''}
                                onChange={e => setParcelRacks(prev => ({ ...prev, [p.parcelNo]: e.target.value }))}
                              >
                                <option value="">Select Rack</option>
                                {rackOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                {!rackOptions.includes(parcelRacks[p.parcelNo]) && parcelRacks[p.parcelNo] && <option value={parcelRacks[p.parcelNo]}>{parcelRacks[p.parcelNo]}</option>}
                              </select>
                              <input
                                className="form-input"
                                style={{ padding: '0.25rem', fontSize: '0.75rem', width: '60px' }}
                                placeholder="Custom"
                                value={parcelRacks[p.parcelNo] || ''}
                                onChange={e => setParcelRacks(prev => ({ ...prev, [p.parcelNo]: e.target.value }))}
                              />
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                            {!isOut && (
                              <button
                                disabled={isSubmitting}
                                onClick={() => handlePack(p.parcelNo)}
                                className="manage-btn"
                                style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', background: isPacked ? '#f3f4f6' : '#000', color: isPacked ? '#000' : '#fff' }}
                              >
                                {isPacked ? 'Packed ✅' : 'Pack'}
                              </button>
                            )}
                            {isPacked && (
                              <button
                                disabled={isSubmitting || (!isApproved && !isAdmin)}
                                onClick={() => handleDispatch(p.parcelNo)}
                                className="manage-btn"
                                style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', background: (isApproved || isAdmin) ? '#10b981' : '#e5e7eb', color: '#fff', border: 'none' }}
                              >
                                Dispatch
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <div className="dispatch-modal-footer" style={{ padding: '1rem', borderTop: '1px solid #e5e7eb', textAlign: 'right' }}>
            <button className="logout-btn" onClick={onClose} style={{ margin: 0 }}>Close</button>
          </div>
        </div>
      </div>


      {/* Lightbox Modal */}
      {viewImage && (
        <div
          className="lightbox-modal"
          onClick={() => setViewImage(null)}
        >
          <div className="lightbox-content">
            <img
              src={viewImage}
              alt="Preview"
              className="lightbox-img"
            />
            <button
              className="lightbox-close-btn"
              onClick={() => setViewImage(null)}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}


export default function DispatchDashboard() {
  const [jobs, setJobs] = useState<any[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active')

  const { logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    loadJobs()
  }, [viewMode])

  const loadJobs = async () => {
    try {
      setLoading(true)
      const res = await api.get(`/api/dispatch/jobs?status=${viewMode}`)
      setJobs(res.data)
    } catch (err) {
      console.error('Failed to load dispatch jobs', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const query = searchQuery.toLowerCase()
      return job.jobId.toLowerCase().includes(query) ||
        job.customerName.toLowerCase().includes(query)
    })
  }, [jobs, searchQuery])

  const selectedJob = useMemo(() =>
    jobs.find(j => j.jobId === selectedJobId),
    [jobs, selectedJobId]
  )

  if (loading) return <div className="dispatch-loading"><div className="dispatch-spinner"></div></div>

  return (
    <div className="dispatch-page">
      <div className="dispatch-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ fontWeight: 900, fontSize: '1.5rem', textTransform: 'uppercase', letterSpacing: '-0.05em' }}>Dispatch</h1>
          <div className="dashboard-tabs" style={{ marginBottom: 0 }}>
            <button
              onClick={() => setViewMode('active')}
              className={`dashboard-tab ${viewMode === 'active' ? 'active' : ''}`}
            >
              Active
            </button>
            <div style={{ width: '2px', height: '1.5rem', background: '#e5e7eb' }}></div>
            <button
              onClick={() => setViewMode('history')}
              className={`dashboard-tab ${viewMode === 'history' ? 'active' : ''}`}
            >
              History
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ width: '200px' }}
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <ModuleNavigation />
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="logout-btn"
          >
            Logout
          </button>
        </div>
      </div>

      <table className="dispatch-table">
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Customer</th>
            <th>Submitted By</th>
            <th>Packing</th>
            <th>Payment</th>
            {viewMode === 'history' ? <th>Dispatched At</th> : <th>Status</th>}
            {viewMode === 'active' && <th>Actions</th>}
          </tr>
        </thead>

        <tbody>
          {filteredJobs.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                No jobs found
              </td>
            </tr>
          ) : (
            filteredJobs.map(job => {
              return (
                <tr key={job.jobId} className="dispatch-row" onClick={() => setSelectedJobId(job.jobId)}>
                  <td>{job.jobId}</td>
                  <td>{job.customerName}</td>
                  <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>{job.createdBy?.name || '—'}</td>
                  <td>{job.packingPreference || 'SINGLE'}</td>
                  <td>
                    <span className={`status-badge ${(job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED') ? 'status-paid' : 'status-unpaid'}`}>
                      {job.paymentStatus}
                    </span>
                  </td>
                  {viewMode === 'history' ? (
                    <td>
                      {job.dispatchedAt ? new Date(job.dispatchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </td>
                  ) : (
                    <td>
                      <div style={{ fontSize: '0.75rem' }}>
                        <div><span className="status-badge status-packed" style={{ padding: '0.1rem 0.3rem', fontSize: '0.625rem' }}>P</span> {job.parcels?.filter((p: any) => p.status === 'PACKED' || p.status === 'DISPATCHED').length || 0}/{job.parcels?.length || 1}</div>
                        <div style={{ marginTop: '0.25rem' }}><span className="status-badge status-dispatched" style={{ padding: '0.1rem 0.3rem', fontSize: '0.625rem' }}>D</span> {job.parcels?.filter((p: any) => p.status === 'DISPATCHED').length || 0}/{job.parcels?.length || 1}</div>
                      </div>
                    </td>
                  )}
                  {viewMode === 'active' && (
                    <td>
                      <button
                        className="btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedJobId(job.jobId);
                        }}
                      >
                        Manage
                      </button>
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      {selectedJob && (
        <DispatchParcels
          job={selectedJob}
          onClose={() => setSelectedJobId(null)}
          onDispatched={loadJobs}
        />
      )}
    </div>
  )
}
