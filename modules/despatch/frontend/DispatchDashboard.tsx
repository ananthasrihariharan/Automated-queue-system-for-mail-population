import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@core/services/api'
import { endpoints } from '@core/services/endpoints'
import { useAuth } from '@core/hooks/useAuth'
import UserMenu from '@core/components/UserMenu'
import ModuleNavigation from '@core/components/ModuleNavigation'

import WorkflowJobDetailsModal from '@core/components/WorkflowJobDetailsModal'
import './DispatchDashboard.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DateFilter from '@core/components/DateFilter'
import { fetchDispatchJobs } from '@core/services/api'

const BACKEND_URL = import.meta.env?.VITE_BACKEND_URL || ''

function DispatchParcels({ job, onClose, onDispatched, viewMode = 'active' }: any) {
  const [itemRacks, setItemRacks] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    job.parcels?.forEach((p: any) => {
      // Each item gets its own independent rack — read from per-item itemRacks map first
      p.itemIndexes?.forEach((itemIdx: number) => {
        const key = `${p.parcelNo}-${itemIdx}`
        // itemRacks from backend is a plain object (JSON-serialised Map)
        const perItemRack = p.itemRacks
          ? (p.itemRacks instanceof Map
              ? p.itemRacks.get(String(itemIdx))
              : (p.itemRacks as Record<string, string>)[String(itemIdx)])
          : null
        initial[key] = perItemRack || ''
      })
    })
    return initial
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [parcelBulkRack, setParcelBulkRack] = useState<Record<number, string>>({})

  // Fix 1: Pre-populate packedItems from server-side itemStatuses data.
  // This ensures items that were already packed (status set to PACKED or DISPATCHED via API) show
  // as packed when the modal opens, without relying on the rack field presence.
  const [packedItems, setPackedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    job.parcels?.forEach((p: any) => {
      p.itemIndexes?.forEach((itemIdx: number) => {
        const key = `${p.parcelNo}-${itemIdx}`
        const itemStatusEntry = (() => {
          if (!p.itemStatuses) return null
          const entries = p.itemStatuses instanceof Map
            ? p.itemStatuses
            : new Map(Object.entries(p.itemStatuses))
          return entries.get(String(itemIdx))
        })()
        const status = itemStatusEntry ? (itemStatusEntry.status || (itemStatusEntry as any).get?.('status')) : null
        const hasItemTracking = p.itemStatuses && (
          p.itemStatuses instanceof Map
            ? p.itemStatuses.size > 0
            : Object.keys(p.itemStatuses).length > 0
        )
        const isOut = p.status === 'DISPATCHED'
        // If the server already has a PACKED or DISPATCHED status for this item, or parcel is dispatched legacy style
        if (status === 'PACKED' || status === 'DISPATCHED' || (isOut && !hasItemTracking)) {
          initial[key] = true
        }
      })
    })
    return initial
  })

  // Track per-item dispatch state — pre-populate from existing itemStatuses
  const [dispatchedItems, setDispatchedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    job.parcels?.forEach((p: any) => {
      // Handle Map (from Mongoose) or plain object
      if (p.itemStatuses) {
        const entries: Array<[string, any]> = p.itemStatuses instanceof Map
          ? Array.from(p.itemStatuses.entries() as Iterable<[string, any]>)
          : Object.entries(p.itemStatuses as Record<string, any>)
        entries.forEach(([key, val]) => {
          if (val?.status === 'DISPATCHED') {
            initial[`${p.parcelNo}-${key}`] = true
          }
        })
      }
    })
    return initial
  })

  // Keep local states in sync when job data changes (e.g. after refetch)
  useEffect(() => {
    if (!job) return

    // 1. Sync itemRacks
    const newRacks: Record<string, string> = {}
    job.parcels?.forEach((p: any) => {
      p.itemIndexes?.forEach((itemIdx: number) => {
        const key = `${p.parcelNo}-${itemIdx}`
        const perItemRack = p.itemRacks
          ? (p.itemRacks instanceof Map
              ? p.itemRacks.get(String(itemIdx))
              : (p.itemRacks as Record<string, string>)[String(itemIdx)])
          : null
        newRacks[key] = perItemRack || ''
      })
    })
    setItemRacks(newRacks)

    // 2. Sync packedItems
    const newPacked: Record<string, boolean> = {}
    job.parcels?.forEach((p: any) => {
      p.itemIndexes?.forEach((itemIdx: number) => {
        const key = `${p.parcelNo}-${itemIdx}`
        const itemStatusEntry = (() => {
          if (!p.itemStatuses) return null
          const entries = p.itemStatuses instanceof Map
            ? p.itemStatuses
            : new Map(Object.entries(p.itemStatuses))
          return entries.get(String(itemIdx))
        })()
        const status = itemStatusEntry ? (itemStatusEntry.status || (itemStatusEntry as any).get?.('status')) : null
        const hasItemTracking = p.itemStatuses && (
          p.itemStatuses instanceof Map
            ? p.itemStatuses.size > 0
            : Object.keys(p.itemStatuses).length > 0
        )
        const isOut = p.status === 'DISPATCHED'
        if (status === 'PACKED' || status === 'DISPATCHED' || (isOut && !hasItemTracking)) {
          newPacked[key] = true
        }
      })
    })
    setPackedItems(newPacked)

    // 3. Sync dispatchedItems
    const newDispatched: Record<string, boolean> = {}
    job.parcels?.forEach((p: any) => {
      p.itemIndexes?.forEach((itemIdx: number) => {
        const key = `${p.parcelNo}-${itemIdx}`
        const itemStatusEntry = (() => {
          if (!p.itemStatuses) return null
          const entries = p.itemStatuses instanceof Map
            ? p.itemStatuses
            : new Map(Object.entries(p.itemStatuses))
          return entries.get(String(itemIdx))
        })()
        const hasItemTracking = p.itemStatuses && (
          p.itemStatuses instanceof Map
            ? p.itemStatuses.size > 0
            : Object.keys(p.itemStatuses).length > 0
        )
        const isOut = p.status === 'DISPATCHED'
        const isItemDispatched =
          itemStatusEntry?.status === 'DISPATCHED' ||
          (isOut && !hasItemTracking)
        if (isItemDispatched) {
          newDispatched[key] = true
        }
      })
    })
    setDispatchedItems(newDispatched)
  }, [job])

  // Reorganization Logic
  const [isReorganizing, setIsReorganizing] = useState(false)
  const [tempParcels, setTempParcels] = useState<any[]>([])
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [overrideReason, setOverrideReason] = useState('')
  const [reorgMode, setReorgMode] = useState<'SINGLE' | 'MULTIPLE' | 'MIXED'>('SINGLE')
  const [newParcelType, setNewParcelType] = useState<'COURIER' | 'WALK_IN'>('COURIER')
  const [visibleItems, setVisibleItems] = useState(20)

  const { user } = useAuth()

  const isAdmin = user?.roles?.includes('ADMIN')
  const isApproved = job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED'
  const isCreditCustomer = job.customerId?.isCreditCustomer || false

  const rackOptions = ['R1', 'R2', 'R3', 'R4', 'CB-VC', 'CB-SM', 'CB-SP', 'OUT PARCEL', 'BIG PARCEL', 'OFFC RACK', 'DELIVERED']

  // Handle individual item rack selection/update
  const handleUpdateItemRack = async (parcelNo: number, itemIndex: number, selectedRack: string) => {
    // 1. Update frontend state immediately for responsive UI
    setItemRacks(prev => ({
      ...prev,
      [`${parcelNo}-${itemIndex}`]: selectedRack
    }))

    // 2. Call backend to update the rack field without marking packed
    try {
      await api.patch(
        `/api/dispatch/jobs/${job.jobId}/parcels/${parcelNo}/rack`,
        { items: [{ itemIndex, rack: selectedRack }] }
      )
      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update rack')
    }
  }

  // Handle bulk rack selection/update
  const handleUpdateBulkRack = async (parcelNo: number, selectedRack: string) => {
    // 1. Update bulk select state
    setParcelBulkRack(prev => ({ ...prev, [parcelNo]: selectedRack }))

    const parcel = job.parcels?.find((p: any) => p.parcelNo === parcelNo) || 
      (parcelNo === 1 ? { parcelNo: 1, status: 'PENDING', itemIndexes: Array.from({ length: job.totalItems || 0 }, (_, i) => i + 1), deliveryType: job.defaultDeliveryType } : null)
    if (!parcel) return

    // 2. Update all item racks in frontend state
    const newRacks: Record<string, string> = {}
    parcel.itemIndexes?.forEach((idx: number) => {
      newRacks[`${parcelNo}-${idx}`] = selectedRack
    })
    setItemRacks(prev => ({ ...prev, ...newRacks }))

    // 3. Call backend to update all item racks without marking packed
    try {
      const itemsList = (parcel.itemIndexes || []).map((idx: number) => ({
        itemIndex: idx,
        rack: selectedRack
      }))
      await api.patch(
        `/api/dispatch/jobs/${job.jobId}/parcels/${parcelNo}/rack`,
        { items: itemsList }
      )
      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update bulk rack')
    }
  }

  // Handle bulk pack: apply same rack to all items in parcel
  const handleBulkPackParcel = async (parcelNo: number) => {
    const selectedRack = parcelBulkRack[parcelNo]
    if (!selectedRack) return

    const parcel = job.parcels?.find((p: any) => p.parcelNo === parcelNo) || 
      (parcelNo === 1 ? { parcelNo: 1, status: 'PENDING', itemIndexes: Array.from({ length: job.totalItems || 0 }, (_, i) => i + 1), deliveryType: job.defaultDeliveryType } : null)
    if (!parcel) return

    setIsSubmitting(true)
    try {
      // Prepare items array with same rack for all
      const itemsList = (parcel.itemIndexes || []).map((idx: number) => ({
        itemIndex: idx,
        rack: selectedRack
      }))

      // Send to backend
      await api.patch(
        `/api/dispatch/jobs/${job.jobId}/parcels/${parcelNo}/pack`,
        { items: itemsList }
      )

      // Update frontend state
      const newRacks: Record<string, string> = {}
      parcel.itemIndexes?.forEach((idx: number) => {
        newRacks[`${parcelNo}-${idx}`] = selectedRack
      })
      setItemRacks(prev => ({ ...prev, ...newRacks }))

      // Mark all items as packed
      const newPacked: Record<string, boolean> = {}
      parcel.itemIndexes?.forEach((idx: number) => {
        newPacked[`${parcelNo}-${idx}`] = true
      })
      setPackedItems(prev => ({ ...prev, ...newPacked }))

      // Reset bulk dropdown
      setParcelBulkRack(prev => ({ ...prev, [parcelNo]: '' }))

      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Bulk packing failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle individual item pack
  const handlePackItem = async (parcelNo: number, itemIndex: number) => {
    const rack = itemRacks[`${parcelNo}-${itemIndex}`]
    if (!rack) return

    setIsSubmitting(true)
    try {
      // Send only this item
      await api.patch(
        `/api/dispatch/jobs/${job.jobId}/parcels/${parcelNo}/pack`,
        { items: [{ itemIndex, rack }] }
      )

      // Mark as packed
      setPackedItems(prev => ({
        ...prev,
        [`${parcelNo}-${itemIndex}`]: true
      }))

      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Item packing failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDispatch = async (parcelNo: number) => {
    if (!isAdmin && !isApproved && !isCreditCustomer) {
      alert('Cannot dispatch: Payment or Credit Account required')
      return
    }

    if (!window.confirm(`Are you sure you want to dispatch Parcel ${parcelNo}?`)) return

    setIsSubmitting(true)
    try {
      await api.patch(
        `/api/dispatch/jobs/${job.jobId}/parcels/${parcelNo}/dispatch`,
        {}
      )
      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Dispatch failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // @ts-ignore — implemented but not yet wired to a button; suppress unused-var error
  const _handleDispatchAll = async () => {
    if (!isAdmin && !isApproved && !isCreditCustomer) {
      alert('Cannot dispatch: Payment or Credit Account required')
      return
    }

    if (!window.confirm('Are you sure you want to dispatch ALL parcels?')) return

    setIsSubmitting(true)
    try {
      const parcelsToDispatch = job.parcels?.filter((p: any) => p.status !== 'DISPATCHED') || []
      
      if (parcelsToDispatch.length === 0) {
        alert('All parcels are already dispatched')
        setIsSubmitting(false)
        return
      }

      let successCount = 0
      let errorCount = 0

      for (const parcel of parcelsToDispatch) {
        try {
          await api.patch(
            `/api/dispatch/jobs/${job.jobId}/parcels/${parcel.parcelNo}/dispatch`,
            {}
          )
          successCount++
        } catch (err: any) {
          console.error(`Failed to dispatch parcel ${parcel.parcelNo}:`, err)
          errorCount++
        }
      }

      if (errorCount > 0) {
        alert(`Dispatched ${successCount} parcel(s). ${errorCount} failed.`)
      } else {
        alert(`Successfully dispatched all ${successCount} parcel(s)!`)
      }

      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Dispatch all failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Dispatch a single item only — other items in same parcel stay active
  const handleDispatchItem = async (parcelNo: number, itemIndex: number) => {
    if (!isAdmin && !isApproved && !isCreditCustomer) {
      alert('Cannot dispatch: Payment or Credit Account required')
      return
    }
    if (!window.confirm(`Dispatch Item #${itemIndex} only? Other items will remain active.`)) return

    setIsSubmitting(true)
    try {
      await api.patch(
        `/api/dispatch/jobs/${job.jobId}/items/${itemIndex}/dispatch`,
        {}
      )
      setDispatchedItems(prev => ({ ...prev, [`${parcelNo}-${itemIndex}`]: true }))
      onDispatched()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Item dispatch failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const startReorganizing = () => {
    setTempParcels(job.parcels?.length > 0 ? [...job.parcels] : [{
      parcelNo: 1,
      itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1),
      receiverType: 'SELF',
      receiverName: job.customerName,
      deliveryType: job.defaultDeliveryType || 'COURIER'
    }])
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
        deliveryType: newParcelType,
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

  // Progressive rendering for large job sets
  useEffect(() => {
    if (visibleItems < job.totalItems) {
      const timer = setTimeout(() => {
        setVisibleItems(prev => Math.min(prev + 20, job.totalItems))
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [visibleItems, job.totalItems])


  return (
    <>
      <div className="dispatch-modal-overlay">
        <div className="dispatch-modal-container">
          <div className="dispatch-modal-header">
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>Job #{job.jobId}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Customer: {job.customerName}</p>
                <div style={{ width: '4px', height: '4px', background: '#e5e7eb', borderRadius: '50%' }}></div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Items: {job.totalItems}</p>
                <div style={{ width: '4px', height: '4px', background: '#e5e7eb', borderRadius: '50%' }}></div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Pref: <span style={{ fontWeight: 700, color: '#000' }}>{job.packingPreference}</span></p>
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


          <div className="dispatch-modal-content" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1.5rem' }}>
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

                          // Skip rendering if not in current "progressive" batch
                          if (i > visibleItems) return <div key={i} style={{ width: '60px', height: '60px' }}></div>

                          return (
                            <div key={i} style={{ position: 'relative' }}>
                              <div
                                className={`item-node ${isAssigned ? 'assigned' : isSelected ? 'selected' : ''} ${fullUrl ? 'shimmer' : ''}`}
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
                                    loading="lazy"
                                    decoding="async"
                                    onLoad={(e) => (e.currentTarget.parentElement as HTMLElement).classList.remove('shimmer')}
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
                      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Delivery:</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className={`btn-outline ${newParcelType === 'COURIER' ? 'active' : ''}`}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: newParcelType === 'COURIER' ? '#000' : '#e5e7eb', background: newParcelType === 'COURIER' ? '#000' : '#fff', color: newParcelType === 'COURIER' ? '#fff' : '#000' }}
                            onClick={() => setNewParcelType('COURIER')}
                          >
                            Courier
                          </button>
                          <button
                            className={`btn-outline ${newParcelType === 'WALK_IN' ? 'active' : ''}`}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: newParcelType === 'WALK_IN' ? '#000' : '#e5e7eb', background: newParcelType === 'WALK_IN' ? '#000' : '#fff', color: newParcelType === 'WALK_IN' ? '#fff' : '#000' }}
                            onClick={() => setNewParcelType('WALK_IN')}
                          >
                            Walk-in
                          </button>
                        </div>
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
                        <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', padding: '2px 6px', background: p.deliveryType === 'WALK_IN' ? '#dbeafe' : '#f3f4f6', color: p.deliveryType === 'WALK_IN' ? '#1e40af' : '#374151', borderRadius: '4px', fontWeight: 600 }}>
                          {p.deliveryType === 'WALK_IN' ? 'Walk-in' : 'Courier'}
                        </span>
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
                <div className="dispatch-compact-info">
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    <div className="info-item">
                      <label>Payment</label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                        <span className={`status-badge ${isApproved ? 'status-paid' : 'status-unpaid'}`}>
                          {job.paymentStatus}
                        </span>
                        {!isApproved && isAdmin && (
                          <button
                            className="btn-primary"
                            style={{ padding: '0.125rem 0.5rem', fontSize: '0.625rem', height: '20px', minWidth: 'auto', background: '#059669' }}
                            onClick={async () => {
                              if (!window.confirm("Confirm: Mark this job as PAID manually?")) return;
                              try {
                                setIsSubmitting(true);
                                await api.patch(endpoints.markPaid(job.jobId));
                                onDispatched(); // Refresh parent
                              } catch (err: any) {
                                alert("Failed to mark paid");
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            disabled={isSubmitting}
                          >
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </div>
                    {job.filesArchived ? (
                      <div className="info-item">
                        <label>Screenshots</label>
                        <span className="status-badge" style={{ marginTop: '0.25rem', background: '#e5e7eb', color: '#6b7280' }}>
                          Files Archived
                        </span>
                      </div>
                    ) : job.itemScreenshots?.length > 0 && (
                      <div className="info-item">
                        <label>Screenshots</label>
                        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                          {job.itemScreenshots.slice(0, 4).map((path: string, idx: number) => (
                            <img
                              key={idx}
                              src={`${BACKEND_URL}/${path.replace(/\\/g, '/')}`}
                              className="screenshot-pill"
                              onClick={() => setViewImage(`${BACKEND_URL}/${path.replace(/\\/g, '/')}`)}
                              alt={`Item ${idx + 1}`}
                              loading="lazy"
                              decoding="async"
                            />
                          ))}
                          {job.itemScreenshots.length > 4 && (
                            <span className="screenshot-more" onClick={() => setViewImage(`${BACKEND_URL}/${job.itemScreenshots[4].replace(/\\/g, '/')}`)}>
                              +{job.itemScreenshots.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {!isApproved && isAdmin && !isCreditCustomer && (
                    <div style={{ fontSize: '0.75rem', color: '#991b1b', background: '#fee2e2', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', fontWeight: 600 }}>
                      Admin Override Enabled
                    </div>
                  )}
                  {isCreditCustomer && (
                    <div style={{ fontSize: '0.75rem', color: '#047857', background: '#d1fae5', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', fontWeight: 600 }}>
                      Credit Account
                    </div>
                  )}
                </div>

                <div className="parcel-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(job.parcels?.length > 0 ? job.parcels : [{ parcelNo: 1, status: 'PENDING', itemIndexes: Array.from({ length: job.totalItems || 0 }, (_, i) => i + 1), deliveryType: job.defaultDeliveryType }]).map((p: any) => {

                    const isPacked = p.status === 'PACKED'
                    const isOut = p.status === 'DISPATCHED'
                    const items = p.itemIndexes || []

                    const allItemsReady = isAdmin || items.every((i: number) => {
                      const stage = (job.items || []).find((it: any) => it.itemIndex === i)?.activeStage
                      return !stage || stage === 'done'
                    })

                    return (
                      <div key={p.parcelNo} className="parcel-card">
                        <div className="parcel-card-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.875rem' }}>P{p.parcelNo}</span>
                            <span className={`status-badge ${isOut ? 'status-dispatched' : isPacked ? 'status-packed' : 'status-pending'}`}>
                              {p.status || 'PENDING'}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>({items.length} items)</span>
                          </div>
                          {!isOut && (
                            <div className="parcel-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                              {p.deliveryType === 'WALK_IN' ? (
                                <button
                                  disabled={isSubmitting || !allItemsReady || (!isAdmin && !isApproved && !isCreditCustomer)}
                                  onClick={() => handleDispatch(p.parcelNo)}
                                  className="btn-primary"
                                  title={!allItemsReady ? 'Some items have not completed all finishing stages' : undefined}
                                  style={{
                                    padding: '0 0.75rem',
                                    fontSize: '0.75rem',
                                    height: '32px',
                                    minWidth: 'auto',
                                    background: (allItemsReady && (isAdmin || isApproved || isCreditCustomer)) ? '#2563eb' : '#e5e7eb',
                                    border: 'none',
                                    width: '100%'
                                  }}
                                >
                                  Hand Over (Walk-in)
                                </button>
                              ) : (
                                <>
                                  {/* Overall controls: Rack dropdown + Pack button for bulk application */}
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <select
                                      value={parcelBulkRack[p.parcelNo] || ''}
                                      onChange={(e) => handleUpdateBulkRack(p.parcelNo, e.target.value)}
                                      style={{
                                        padding: '0.4rem 0.5rem',
                                        borderRadius: '4px',
                                        border: '1px solid #d1d5db',
                                        backgroundColor: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                        minWidth: '120px'
                                      }}
                                    >
                                      <option value="">Select Rack</option>
                                      {rackOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>

                                    <button
                                      onClick={() => handleBulkPackParcel(p.parcelNo)}
                                      disabled={!parcelBulkRack[p.parcelNo] || isSubmitting || isPacked || !allItemsReady}
                                      title={!allItemsReady ? 'Some items have not completed all finishing stages' : undefined}
                                      style={{
                                        padding: '0.4rem 0.75rem',
                                        backgroundColor: parcelBulkRack[p.parcelNo] && !isPacked && allItemsReady ? '#000' : '#d1d5db',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: parcelBulkRack[p.parcelNo] && !isPacked && allItemsReady ? 'pointer' : 'not-allowed',
                                        fontWeight: 600,
                                        fontSize: '0.75rem',
                                        height: '32px',
                                        minWidth: '70px'
                                      }}
                                    >
                                      Pack
                                    </button>
                                  </div>

                                  {isPacked && (
                                    <button
                                      disabled={isSubmitting || (!isAdmin && !isApproved && !isCreditCustomer)}
                                      onClick={() => handleDispatch(p.parcelNo)}
                                      className="btn-primary"
                                      style={{ padding: '0 0.75rem', fontSize: '0.75rem', height: '32px', minWidth: 'auto', background: (isAdmin || isApproved || isCreditCustomer) ? '#10b981' : '#e5e7eb', border: 'none', cursor: (!isAdmin && !isApproved && !isCreditCustomer) ? 'not-allowed' : 'pointer' }}
                                      title={(!isAdmin && !isApproved && !isCreditCustomer) ? 'Payment required to dispatch' : 'Dispatch all items in this parcel'}
                                    >
                                      Dispatch All
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Items displayed in table/row format with individual pack/rack buttons */}
                        <div style={{ width: '100%', overflowX: 'auto', marginTop: '0.75rem' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                            <thead>
                              <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Item</th>
                                <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Image</th>
                                <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Rack</th>
                                <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Status</th>
                                <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Pack</th>
                                <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Dispatch</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items
                                .filter((idx: number) => {
                                  // Derive dispatched state from itemStatuses map, NOT parcel-level status.
                                  // isOut (parcel.status === DISPATCHED) must NOT be used here because
                                  // a parcel can be marked DISPATCHED even when only one item was
                                  // individually dispatched — the remaining items are NOT dispatched.
                                  const itemStatusEntry = (() => {
                                    if (!p.itemStatuses) return null
                                    const entries = p.itemStatuses instanceof Map
                                      ? p.itemStatuses
                                      : new Map(Object.entries(p.itemStatuses))
                                    return entries.get(String(idx))
                                  })()
                                  const itemDispatched =
                                    dispatchedItems[`${p.parcelNo}-${idx}`] ||
                                    itemStatusEntry?.status === 'DISPATCHED' ||
                                    // Only treat as dispatched via isOut when the whole parcel was
                                    // dispatched via the PARCEL-level route (no itemStatuses used),
                                    // i.e. itemStatuses map is empty meaning all items went together.
                                    (isOut && (!p.itemStatuses || (p.itemStatuses instanceof Map ? p.itemStatuses.size === 0 : Object.keys(p.itemStatuses).length === 0)))

                                  if (viewMode === 'history') return itemDispatched
                                  return !itemDispatched
                                })
                                .map((idx: number) => {
                                  const imgPath = job.itemScreenshots?.[idx - 1]
                                  const fullUrl = imgPath ? `${BACKEND_URL}/${imgPath.replace(/\\/g, '/')}` : null

                                  // Item-level dispatched: check itemStatuses first, fall back to
                                  // parcel-level only when no itemStatuses tracking exists.
                                  const itemStatusEntry = (() => {
                                    if (!p.itemStatuses) return null
                                    const entries = p.itemStatuses instanceof Map
                                      ? p.itemStatuses
                                      : new Map(Object.entries(p.itemStatuses))
                                    return entries.get(String(idx))
                                  })()
                                  const hasItemTracking = p.itemStatuses && (
                                    p.itemStatuses instanceof Map
                                      ? p.itemStatuses.size > 0
                                      : Object.keys(p.itemStatuses).length > 0
                                  )
                                  const isItemDispatched =
                                    dispatchedItems[`${p.parcelNo}-${idx}`] ||
                                    itemStatusEntry?.status === 'DISPATCHED' ||
                                    // Parcel-level fallback ONLY when no per-item tracking exists
                                    (isOut && !hasItemTracking)

                                  // Fix 2: isItemPacked must ONLY be true after a successful API /pack call
                                  // (packedItems set in handlePackItem/handleBulkPackParcel) or when the
                                  // parcel was dispatched via the legacy parcel-level route (no itemStatuses).
                                  // Do NOT use itemRacks here — selecting a rack in the dropdown must NOT
                                  // auto-trigger the packed state before the user clicks Pack.
                                  const isItemPacked =
                                    packedItems[`${p.parcelNo}-${idx}`] ||
                                    (isOut && !hasItemTracking)

                                  const itemStage = (job.items || []).find((it: any) => it.itemIndex === idx)?.activeStage
                                  const isItemReady = isAdmin || !itemStage || itemStage === 'done'

                                return (
                                  <tr key={idx} style={{
                                    borderBottom: '1px solid #e5e7eb',
                                    background: isItemDispatched ? '#f0fdf4' : idx % 2 === 0 ? '#f9fafb' : '#fff',
                                    opacity: isItemDispatched ? 0.75 : 1
                                  }}>
                                    <td style={{ padding: '0.75rem', fontWeight: 600, color: isItemDispatched ? '#16a34a' : '#1e293b' }}>
                                      Item #{idx}
                                      {isItemDispatched && <span style={{ marginLeft: '6px', fontSize: '0.6rem', background: '#dcfce7', color: '#16a34a', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>DISPATCHED</span>}
                                    </td>
                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                      {fullUrl ? (
                                        <div className="item-thumb shimmer" onClick={() => setViewImage(fullUrl)} style={{ width: '60px', height: '60px', cursor: 'pointer', margin: '0 auto' }}>
                                          <img
                                            src={fullUrl}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px', filter: isItemDispatched ? 'grayscale(40%)' : 'none' }}
                                            alt={`Item ${idx}`}
                                            loading="lazy"
                                            decoding="async"
                                            onLoad={(e) => (e.currentTarget.parentElement as HTMLElement).classList.remove('shimmer')}
                                          />
                                        </div>
                                      ) : (
                                        <div className="item-node-simple" style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', background: '#e5e7eb', borderRadius: '4px', fontWeight: 700 }}>
                                          #{idx}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                      {p.deliveryType !== 'WALK_IN' && !isItemDispatched && (
                                        <select
                                          className="rack-select"
                                          value={itemRacks[`${p.parcelNo}-${idx}`] || ''}
                                          onChange={e => handleUpdateItemRack(p.parcelNo, idx, e.target.value)}
                                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #e5e7eb' }}
                                        >
                                          <option value="">Select Rack</option>
                                          {rackOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                      )}
                                      {isItemDispatched && (
                                        <span style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 600 }}>
                                          {itemRacks[`${p.parcelNo}-${idx}`] || p.rack || '—'}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                      {isItemDispatched ? (
                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#16a34a', padding: '0.25rem 0.5rem' }}>✓ Dispatched</span>
                                      ) : p.deliveryType === 'WALK_IN' ? (
                                        <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 600 }}>Walk-in</span>
                                      ) : (
                                        <>
                                          {isItemPacked ? (
                                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#10b981', padding: '0.25rem 0.5rem' }}>✓ Packed</span>
                                          ) : itemRacks[`${p.parcelNo}-${idx}`] ? (
                                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#3b82f6', padding: '0.25rem 0.5rem' }}>Rack Selected ({itemRacks[`${p.parcelNo}-${idx}`]})</span>
                                          ) : (
                                            <span style={{ fontSize: '0.65rem', color: '#ef4444', padding: '0.25rem 0.5rem', fontWeight: 600 }}>⚠ Set Rack</span>
                                          )}
                                        </>
                                      )}
                                    </td>
                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                      {!isItemDispatched && p.deliveryType !== 'WALK_IN' && (
                                        <button
                                          onClick={() => handlePackItem(p.parcelNo, idx)}
                                          disabled={!itemRacks[`${p.parcelNo}-${idx}`] || isItemPacked || isSubmitting || !isItemReady}
                                          title={!isItemReady ? `Item is not ready — still at ${itemStage} stage` : undefined}
                                          style={{
                                            padding: '0.25rem 0.5rem',
                                            backgroundColor: isItemPacked ? '#10b981' : (isItemReady ? '#000' : '#d1d5db'),
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '4px',
                                            fontSize: '0.65rem',
                                            height: '24px',
                                            minWidth: '50px',
                                            cursor: (!itemRacks[`${p.parcelNo}-${idx}`] || isItemPacked || !isItemReady) ? 'not-allowed' : 'pointer',
                                            fontWeight: 600
                                          }}
                                        >
                                          {isItemPacked ? '✓ Packed' : 'Pack'}
                                        </button>
                                      )}
                                    </td>
                                    {/* Per-item dispatch button — only dispatches THIS item */}
                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                      {isItemDispatched ? (
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#16a34a' }}>✓ Sent</span>
                                      ) : !isItemPacked ? (
                                        <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Pack first</span>
                                      ) : !(isAdmin || isApproved || isCreditCustomer) ? (
                                        <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 600 }}>Unpaid</span>
                                      ) : (
                                        <button
                                          disabled={isSubmitting}
                                          onClick={() => handleDispatchItem(p.parcelNo, idx)}
                                          style={{
                                            padding: '0.25rem 0.5rem',
                                            backgroundColor: '#10b981',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '4px',
                                            fontSize: '0.65rem',
                                            height: '24px',
                                            minWidth: '60px',
                                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                            fontWeight: 600
                                          }}
                                        >
                                          Dispatch
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
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
      {viewImage && createPortal(
        <div
          className="lightbox-modal"
          onClick={() => setViewImage(null)}
          style={{ zIndex: 99999 }}
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
        </div>,
        document.body
      )}
    </>
  )
}

export default function DispatchDashboard() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [statusJob, setStatusJob] = useState<any | null>(null)
  const [listViewImage, setListViewImage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
  const [dateFilter, setDateFilter] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // Adjust dateFilter default when switching between active queue and history
  useEffect(() => {
    if (viewMode === 'active') {
      setDateFilter('')
    } else {
      setDateFilter(new Date().toISOString().split('T')[0])
    }
    setCurrentPage(1)
  }, [viewMode])
  const [packFilter, setPackFilter] = useState<'all' | 'packed' | 'not_packed'>('all')
  const itemsPerPage = 50

  const queryClient = useQueryClient()
  const { data: responseData, isPlaceholderData } = useQuery({
    queryKey: ['dispatch-jobs', viewMode, currentPage, dateFilter, searchQuery],
    queryFn: () => fetchDispatchJobs(viewMode, currentPage, itemsPerPage, dateFilter, searchQuery),
    refetchInterval: 10000,
    placeholderData: (previousData: any) => previousData,
  })

  // Handle both legacy (array) and new (object) API responses gracefully during migration
  const jobs = Array.isArray(responseData) ? responseData : (responseData?.jobs || [])
  const totalPages = responseData?.pages || 1



  const filteredJobs = useMemo(() => {
    return jobs.filter((job: any) => {
      if (packFilter === 'packed') {
        return job.parcels?.some((p: any) => p.status === 'PACKED' || p.status === 'DISPATCHED')
      }
      if (packFilter === 'not_packed') {
        return !job.parcels?.some((p: any) => p.status === 'PACKED' || p.status === 'DISPATCHED')
      }
      return true
    })
  }, [jobs, packFilter])

  const selectedJob = useMemo(() =>
    jobs.find((j: any) => j.jobId === selectedJobId),
    [jobs, selectedJobId]
  )

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    try {
      const parts = text.split(new RegExp(`(${query})`, 'gi'));
      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase()
              ? <mark key={i} style={{ backgroundColor: '#fef08a', color: '#000', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
              : part
          )}
        </>
      );
    } catch (e) {
      return text;
    }
  };

  const getSearchRowStyle = (index: number) => {
    if (viewMode !== 'active' || !searchQuery.trim()) return {};

    // Base color from user image: #c7d2fe (Approximated Light Indigo/Lavender)
    const colors = [
      { bg: '#c7d2fe', text: '#000', sub: '#4338ca' }, // 0: User's requested color
      { bg: '#ddd6fe', text: '#000', sub: '#5b21b6' }, 
      { bg: '#e0e7ff', text: '#000', sub: '#4338ca' }, 
      { bg: '#ede9fe', text: '#000', sub: '#6d28d9' }, 
      { bg: '#f5f3ff', text: '#000', sub: '#7c3aed' }, 
      { bg: '#faf5ff', text: '#000', sub: '#9333ea' }, 
      { bg: '#ffffff', text: '#000', sub: '#a855f7' }, 
    ];

    const style = colors[Math.min(index, colors.length - 1)];
    const halftonePattern = `radial-gradient(rgba(0,0,0,0.05) 1px, transparent 0)`;
    
    return {
      backgroundColor: style.bg,
      backgroundImage: index < 3 ? halftonePattern : 'none',
      backgroundSize: '4px 4px',
      color: style.text,
      '--row-text-color': style.text,
      '--row-sub-text-color': style.sub,
      transition: 'all 0.3s ease',
      borderLeft: `6px solid ${index === 0 ? '#4338ca' : 'transparent'}`
    };
  };


  return (
    <div className="dispatch-page">
      {/* Mobile Topbar (hidden on desktop) */}
      <div className="mobile-header-row">
        <span className="mobile-header-title">Dispatch</span>
        
        {/* Inline Search Bar */}
        <div className="mobile-header-search">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="mobile-header-search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>

        {/* Action Buttons */}
        <div className="mobile-header-actions">
          <ModuleNavigation />
          <button
            type="button"
            className="mobile-header-btn"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            title="Filters"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Desktop Navbar (hidden on mobile) */}
      <div className="dispatch-navbar desktop-navbar-only">
        <div className="dispatch-navbar-left">
          <h1 className="dispatch-title">Dispatch</h1>
          <div className="dashboard-tabs">
            <button
              onClick={() => setViewMode('active')}
              className={`dashboard-tab ${viewMode === 'active' ? 'active' : ''}`}
              title="Active Jobs"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
              <span className="tab-label">Active</span>
            </button>

            <button
              onClick={() => setViewMode('history')}
              className={`dashboard-tab ${viewMode === 'history' ? 'active' : ''}`}
              title="Job History"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span className="tab-label">History</span>
            </button>
          </div>
        </div>

        <div className="dispatch-navbar-right">
          <ModuleNavigation />
          <UserMenu />
        </div>
      </div>

      <div className={`dispatch-filters-bar ${showMobileFilters ? 'mobile-visible' : ''}`}>
        <div className="dispatch-header-actions">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
          <div className="dispatch-sort-wrapper">
            <label className="dispatch-sort-label">Pack Status</label>
            <select
              className="dispatch-sort-control"
              value={packFilter}
              onChange={e => setPackFilter(e.target.value as any)}
            >
              <option value="all">All Jobs</option>
              <option value="packed">Packed</option>
              <option value="not_packed">Not Packed</option>
            </select>
          </div>
          {/* Desktop Search Bar (hidden on mobile) */}
          <div className="search-wrapper desktop-search-only">
            <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="filter-input search"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>
      </div>
      {!!searchQuery.trim() && (
        <div style={{ margin: '0 0 1.5rem 0', padding: '0.625rem 1rem', background: '#f5f3ff', color: '#6d28d9', borderRadius: '0.75rem', border: '1px solid #ddd6fe', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.625rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', background: '#8b5cf6', borderRadius: '50%', color: '#fff' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.025em' }}>Global Search Active:</span>
          <span>Showing {viewMode === 'active' ? 'all undispatched' : 'all dispatched'} jobs for "{searchQuery}" across all dates</span>
        </div>
      )}

      {!responseData ? (
        <div className="dispatch-loading">
          <div className="dispatch-spinner"></div>
        </div>
      ) : (
        <div className={`dispatch-table-container ${isPlaceholderData ? 'stale-search' : ''}`}>
          <table className="dispatch-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Image</th>
                <th>Job ID</th>
                <th>Customer</th>
                <th className="mobile-label-submit">Submitted By</th>
                <th className="mobile-label-pack">Packing</th>
                <th>Rack</th>
                <th>Payment</th>
                {viewMode === 'history' ? <th>Dispatched At</th> : <th>Status</th>}
                {viewMode === 'active' && <th className="action-header">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                    No jobs found
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job: any, index: number) => {
                  // Dynamic styling for search results (recency scale)
                  const isSearchResult = !!searchQuery.trim();
                  const rowStyle = getSearchRowStyle(index);

                  return (
                    <tr
                      key={job.jobId}
                      className={`dispatch-row ${isSearchResult ? 'search-result-row' : ''}`}
                      style={rowStyle}
                      onClick={() => setSelectedJobId(job.jobId)}
                    >
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--row-sub-text-color, #64748b)' }}>
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const imgPath = job.itemScreenshots?.[0]
                          const fullUrl = imgPath ? `${BACKEND_URL}/${imgPath.replace(/\\/g, '/')}` : null
                          return fullUrl ? (
                              <div
                                className="press-item-preview-box"
                                style={{ width: 56, height: 56, minWidth: 56 }}
                                onClick={() => setListViewImage(fullUrl)}
                              >
                                <img className="press-item-preview-img" src={fullUrl} alt="" loading="lazy" decoding="async" />
                              </div>
                            ) : (
                              <div style={{ width: 56, height: 56, minWidth: 56, borderRadius: '0.5rem', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#94a3b8', border: '1px solid #e2e8f0', fontWeight: 700 }}>
                                —
                              </div>
                          )
                        })()}
                      </td>
                      <td>
                        <span style={{ fontWeight: 800 }}>
                          {isSearchResult ? highlightMatch(job.jobId, searchQuery) : job.jobId}
                        </span>
                        {job.defaultDeliveryType === 'WALK_IN' && (
                          <span style={{ display: 'block', fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontWeight: 700, width: 'fit-content', marginTop: '0.25rem' }}>
                            WALK-IN
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600, color: job.customerId?.isCreditCustomer ? ((rowStyle as any).color === '#fff' ? '#10b981' : '#047857') : 'inherit' }}>
                            {isSearchResult ? highlightMatch(job.customerName, searchQuery) : job.customerName}
                          </span>
                          {job.customerId?.isCreditCustomer && (
                            <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#d1fae5', color: '#047857', borderRadius: '4px', fontWeight: 700 }}>
                              CREDIT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="submit-cell">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--row-sub-text-color, #64748b)' }}>{job.createdBy?.name || '—'}</span>
                          {!!job.contactMe && (
                            <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#f5f3ff', color: '#6d28d9', borderRadius: '4px', fontWeight: 700, width: 'fit-content' }}>
                              CONTACT ME
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="pack-cell">{job.packingPreference || 'SINGLE'}</td>
                      <td className="rack-cell">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {[...new Set(job.parcels?.map((p: any) => p.rack).filter(Boolean) || [])].map((r: any) => (
                            <span key={r} className="status-badge" style={{ background: '#f8fafc', border: '1px solid #e1e4e8', color: '#475569', padding: '0.125rem 0.375rem', fontSize: '0.625rem' }}>{r}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${(job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED') ? 'status-paid' : 'status-unpaid'}`}>
                          {job.paymentStatus}
                        </span>
                      </td>
                      {viewMode === 'history' ? (
                        <td>
                          {(() => {
                            // Count how many items across all parcels are dispatched
                            let dispatchedCount = 0
                            let totalCount = 0
                            job.parcels?.forEach((p: any) => {
                              totalCount += (p.itemIndexes?.length || 0)
                              if (p.itemStatuses) {
                                const entries = Object.entries(p.itemStatuses as Record<string, any>)
                                dispatchedCount += entries.filter(([, v]) => v?.status === 'DISPATCHED').length
                              } else if (p.status === 'DISPATCHED') {
                                dispatchedCount += (p.itemIndexes?.length || 0)
                              }
                            })
                            const isPartial = dispatchedCount < totalCount
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {isPartial && (
                                  <span style={{ fontSize: '0.6rem', padding: '1px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: 700, width: 'fit-content' }}>
                                    PARTIAL — {dispatchedCount}/{totalCount} items
                                  </span>
                                )}
                                <span style={{ fontSize: '0.75rem', color: '#374151' }}>
                                  {job.dispatchedAt
                                    ? new Date(job.dispatchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                    : 'In Progress'}
                                </span>
                              </div>
                            )
                          })()}
                        </td>
                      ) : (                        <td>
                          <div style={{ fontSize: '0.75rem' }}>
                            <div><span className="status-badge status-packed" style={{ padding: '0.1rem 0.3rem', fontSize: '0.625rem' }}>P</span> {job.parcels?.filter((p: any) => p.status === 'PACKED' || p.status === 'DISPATCHED').length || 0}/{job.parcels?.length || 1}</div>
                            <div style={{ marginTop: '0.25rem' }}><span className="status-badge status-dispatched" style={{ padding: '0.1rem 0.3rem', fontSize: '0.625rem' }}>D</span> {job.parcels?.filter((p: any) => p.status === 'DISPATCHED').length || 0}/{job.parcels?.length || 1}</div>
                          </div>
                        </td>
                      )}
                      {viewMode === 'active' && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.3rem 0.65rem', fontSize: '0.72rem', fontWeight: 700 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setStatusJob(job);
                              }}
                            >
                              Status
                            </button>
                            <button
                              className="btn-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJobId(job.jobId);
                              }}
                            >
                              Manage
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Card List (visible on mobile viewports) */}
      {responseData && (
        <div className="dispatch-mobile-cards">
          {filteredJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontWeight: 600 }}>
              No jobs found
            </div>
          ) : (
            filteredJobs.map((job: any, index: number) => {
              const imgPath = job.itemScreenshots?.[0];
              const fullUrl = imgPath ? `${BACKEND_URL}/${imgPath.replace(/\\/g, '/')}` : null;
              const isPaid = job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED';
              
              // Calculate packed/dispatch counts
              let dispatchedCount = 0;
              let totalCount = 0;
              job.parcels?.forEach((p: any) => {
                totalCount += (p.itemIndexes?.length || 0);
                if (p.itemStatuses) {
                  const entries = Object.entries(p.itemStatuses as Record<string, any>);
                  dispatchedCount += entries.filter(([, v]) => v?.status === 'DISPATCHED').length;
                } else if (p.status === 'DISPATCHED') {
                  dispatchedCount += (p.itemIndexes?.length || 0);
                }
              });
              const packedCount = job.parcels?.filter((p: any) => p.status === 'PACKED' || p.status === 'DISPATCHED').length || 0;
              const totalParcels = job.parcels?.length || 1;

              return (
                <div
                  key={job.jobId}
                  className={`dispatch-mobile-card ${isPaid ? 'paid-card' : 'unpaid-card'}`}
                  onClick={() => setSelectedJobId(job.jobId)}
                >
                  {/* First Line */}
                  <div className="card-line-one">
                    <div className="card-left-group">
                      <span className="card-sno">{(currentPage - 1) * itemsPerPage + index + 1}</span>
                      <span className="card-job-id">{job.jobId}</span>
                      <span className="card-pack-badge">
                        Pack: {job.packingPreference || 'SINGLE'}
                      </span>
                    </div>
                    <span className={`card-payment-badge ${isPaid ? 'paid' : 'unpaid'}`}>
                      {job.paymentStatus}
                    </span>
                  </div>

                  {/* Second Line */}
                  <div className="card-line-two">
                    <div className="card-img-wrapper" onClick={(e) => { e.stopPropagation(); if (fullUrl) setListViewImage(fullUrl); }}>
                      {fullUrl ? (
                        <img src={fullUrl} alt="" className="card-thumb-img" />
                      ) : (
                        <span className="card-thumb-placeholder">—</span>
                      )}
                    </div>
                    <span className="card-customer-name">{job.customerName}</span>
                    <div className="card-counts-group">
                      <span className="count-pill pack">P: {packedCount}/{totalParcels}</span>
                      <span className="count-pill dispatch">D: {dispatchedCount}/{totalParcels}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="pagination-container admin-queue-footer" style={{ marginTop: '1.5rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1' }}>
        <div className="pagination-controls-hub">
          <div className="pagination-info">
            Page {currentPage} of {totalPages || 1} • {responseData?.total || 0} total
          </div>
          <div className="pagination-buttons">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn-page-luxury"
            >
              ← PREV
            </button>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages || 1, p + 1))
              }
              disabled={currentPage >= (totalPages || 1)}
              className="btn-page-luxury"
            >
              NEXT →
            </button>
          </div>
        </div>
      </div>
      {
        selectedJob && (
          <DispatchParcels
            job={selectedJob}
            onClose={() => setSelectedJobId(null)}
            // Fix 3: Use refetchQueries so data updates immediately (~500ms) instead
            // of waiting for the next 10-second background poll after invalidation.
            onDispatched={async () => {
              await queryClient.refetchQueries({
                queryKey: ['dispatch-jobs', viewMode, currentPage, dateFilter, searchQuery]
              })
            }}
            viewMode={viewMode}
          />
        )
      }

      {statusJob && (
        <WorkflowJobDetailsModal
          job={statusJob}
          onClose={() => setStatusJob(null)}
          workflowLabel="Workflow Status"
          workflowTask={null}
          showLogs={false}
        />
      )}

      {listViewImage && createPortal(
        <div
          className="lightbox-modal"
          onClick={() => setListViewImage(null)}
          style={{ zIndex: 99999 }}
        >
          <div className="lightbox-content">
            <img src={listViewImage} alt="Preview" className="lightbox-img" />
            <button
              className="lightbox-close-btn"
              onClick={() => setListViewImage(null)}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div >
  )
}
