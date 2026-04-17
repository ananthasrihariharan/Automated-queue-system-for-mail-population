import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import JobCardModal from '../../components/JobCardModal'
import { useRef } from 'react'
import './CreateJob.css'

export default function CreateJob() {
    const { id } = useParams()
    const isEdit = !!id
    const navigate = useNavigate()
    const { user, logout } = useAuth()
    const [loading, setLoading] = useState(false)
    const [showJobCard, setShowJobCard] = useState(false)


    const [formData, setFormData] = useState({
        jobId: '',
        totalItems: 0,
        packingPreference: 'SINGLE',
    })
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [existingScreenshots, setExistingScreenshots] = useState<string[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const [isWalkIn, setIsWalkIn] = useState(false)
    const [isContactMe, setIsContactMe] = useState(false)
    const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([])
    const [showDropdown, setShowDropdown] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const searchTimeoutRef = useRef<any>(null)

    const [viewImage, setViewImage] = useState<string | null>(null)
    const BACKEND_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_BACKEND_URL || '')

    // Load existing job details if in Edit Mode
    useEffect(() => {
        if (isEdit) {
            const fetchJob = async () => {
                try {
                    const res = await api.get('/api/prepress/jobs')
                    const job = res.data.find((j: any) => j.jobId === id)
                    if (job) {
                        setFormData({
                            jobId: job.jobId,
                            totalItems: job.totalItems,
                            packingPreference: job.packingPreference || 'SINGLE'
                        })
                        setCustomerName(job.customerName)
                        setCustomerPhone(job.customerPhone || '')
                        setExistingScreenshots(job.itemScreenshots || [])
                        setIsWalkIn(job.defaultDeliveryType === 'WALK_IN')
                        setIsContactMe(!!job.contactMe)
                    }
                } catch (e) {
                    console.error('Failed to fetch job for edit', e)
                }
            }
            fetchJob()
        }
    }, [isEdit, id])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const totalCount = files.length + existingScreenshots.length

        if (totalCount !== formData.totalItems) {
            alert(`Total screenshots (${totalCount}) must match total items (${formData.totalItems}). Currently: ${existingScreenshots.length} kept, ${files.length} new.`)
            return
        }

        setLoading(true)

        try {
            const data = new FormData()
            data.append('totalItems', String(formData.totalItems))
            data.append('defaultDeliveryType', isWalkIn ? 'WALK_IN' : 'COURIER')
            data.append('contactMe', String(isContactMe))

            if (isEdit) {
                // Send list of kept existing screenshots
                data.append('keptScreenshots', JSON.stringify(existingScreenshots))
            }

            files.forEach(file => {
                data.append('screenshots', file)
            })

            if (isEdit) {
                await api.patch(`/api/prepress/jobs/${id}`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
            } else {
                data.append('jobId', formData.jobId)
                data.append('customerName', customerName)
                data.append('customerPhone', customerPhone)
                await api.post('/api/prepress/jobs', data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
            }
            navigate('/prepress')
        } catch (err: any) {
            alert(err.response?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} job`)
        } finally {
            setLoading(false)
        }
    }

    const fetchCustomer = async (phone: string) => {
        if (phone.length !== 10 || isEdit) return
        try {
            const res = await api.get(`/api/prepress/customer/by-phone/${phone}`)
            if (res.data) setCustomerName(res.data.name)
        } catch (e) { /* silent fail */ }
    }

    const searchCustomers = async (name: string) => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }

        if (name.length < 2 || isEdit) {
            setCustomerSearchResults([])
            setShowDropdown(false)
            return
        }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await api.get(`/api/prepress/customers/search?name=${encodeURIComponent(name)}`)
                setCustomerSearchResults(res.data)
                setShowDropdown(res.data.length > 0)
                setHighlightedIndex(-1)
            } catch (e) {
                /* silent fail */
                setCustomerSearchResults([])
                setShowDropdown(false)
            }
        }, 300) // 300ms debounce
    }

    const handleSelectCustomer = (customer: any) => {
        setCustomerName(customer.name)
        setCustomerPhone(customer.phone)
        setShowDropdown(false)
        setCustomerSearchResults([])
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showDropdown) return

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIndex(prev => (prev < customerSearchResults.length - 1 ? prev + 1 : prev))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev))
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault()
            handleSelectCustomer(customerSearchResults[highlightedIndex])
        } else if (e.key === 'Escape') {
            setShowDropdown(false)
        }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items
        const remaining = formData.totalItems - (files.length + existingScreenshots.length)
        if (remaining <= 0) return

        let addedCount = 0
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (item.type.startsWith('image/') && addedCount < remaining) {
                const file = item.getAsFile()
                if (file) {
                    setFiles(prev => [...prev, file])
                    addedCount++
                }
            }
        }
    }

    return (
        <div className="create-job-page">
            <div className="create-job-container">
                {/* Header */}
                <div className="create-job-header">
                    <div className="header-left">
                        <div className="header-icon">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        </div>
                        <div className="header-title">
                            <h1>{isEdit ? 'Edit Job' : 'New Job'}</h1>
                            <span>{isEdit ? 'Modify Entry' : 'Quick Entry'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => {
                                // Validate required fields before opening modal
                                if (!formData.jobId) {
                                    alert('Please enter a Job ID before previewing the job card.')
                                    return
                                }

                                if (!customerName) {
                                    alert('Please enter a Customer Name before previewing the job card.')
                                    return
                                }

                                if (!formData.totalItems || formData.totalItems <= 0) {
                                    alert('Please enter a valid Total Items count before previewing the job card.')
                                    return
                                }

                                setShowJobCard(true)
                            }}
                            className="btn-royal-outline"
                        >

                            Preview Job Card
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/prepress')}
                            className="btn-outline"
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={() => { logout(); navigate('/login'); }}
                            className="logout-btn"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* Card */}
                <div className="create-job-card">
                    <form onSubmit={handleSubmit} className="create-job-form">
                        <div className="form-grid">
                            {/* Left Column */}
                            <div className="space-y-6">
                                <div className="form-group">
                                    <label>Job ID</label>
                                    <input
                                        required
                                        disabled={isEdit}
                                        placeholder="e.g. PPK-9902"
                                        className={`form-input ${isEdit ? 'bg-slate-100' : ''}`}
                                        value={formData.jobId}
                                        onChange={(e) => setFormData({ ...formData, jobId: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Customer Phone</label>
                                    <input
                                        required
                                        disabled={isEdit}
                                        placeholder="10-digit number"
                                        className={`form-input ${isEdit ? 'bg-slate-100' : ''}`}
                                        value={customerPhone}
                                        onChange={(e) => {
                                            const val = e.target.value.slice(0, 10).replace(/\D/g, '')
                                            setCustomerPhone(val)
                                            if (val.length === 10) fetchCustomer(val)
                                        }}
                                    />
                                </div>

                                <div className="form-group relative">
                                    <label>Customer Name</label>
                                    <div className="relative">
                                        <input
                                            required
                                            disabled={isEdit}
                                            placeholder="Full name"
                                            className={`form-input ${isEdit ? 'bg-slate-100' : ''}`}
                                            value={customerName}
                                            onChange={(e) => {
                                                setCustomerName(e.target.value)
                                                searchCustomers(e.target.value)
                                            }}
                                            onKeyDown={handleKeyDown}
                                            onBlur={() => {
                                                // Short delay to allow click on dropdown
                                                setTimeout(() => setShowDropdown(false), 200)
                                            }}
                                            onFocus={() => {
                                                if (customerName.length >= 2 && customerSearchResults.length > 0) {
                                                    setShowDropdown(true)
                                                }
                                            }}
                                        />
                                        {showDropdown && (
                                            <div className="customer-dropdown">
                                                {customerSearchResults.map((customer, idx) => (
                                                    <div
                                                        key={customer._id}
                                                        className={`dropdown-item ${idx === highlightedIndex ? 'highlighted' : ''}`}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault() // Keep focus on input while selecting
                                                            handleSelectCustomer(customer)
                                                        }}
                                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                                    >
                                                        <div className="customer-info">
                                                            <span className="customer-name">{customer.name}</span>
                                                            <span className="customer-phone">{customer.phone}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Total Items</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        className="form-input big"
                                        value={formData.totalItems || ''}
                                        onChange={(e) => setFormData({ ...formData, totalItems: parseInt(e.target.value) || 0 })}
                                    />
                                </div>

                                <div className="checkbox-pills-container">
                                    <label className="checkbox-pill walk-in" data-checked={String(isWalkIn)}>
                                        <input
                                            type="checkbox"
                                            checked={isWalkIn}
                                            onChange={(e) => setIsWalkIn(e.target.checked)}
                                        />
                                        <svg fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                                        </svg>
                                        <span>Walk-in</span>
                                    </label>

                                    <label className="checkbox-pill contact-me" data-checked={String(isContactMe)}>
                                        <input
                                            type="checkbox"
                                            checked={isContactMe}
                                            onChange={(e) => setIsContactMe(e.target.checked)}
                                        />
                                        <svg fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"></path>
                                        </svg>
                                        <span>Contact Me</span>
                                    </label>
                                </div>
                            </div>

                            {/* Right Column - File Upload */}
                            <div>
                                <div className="form-group">
                                    <label>Item Screenshots {isEdit && '(Leave empty to keep current)'}</label>
                                </div>
                                <div
                                    onPaste={handlePaste}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                                        const remaining = formData.totalItems - (files.length + existingScreenshots.length)
                                        setFiles(prev => [...prev, ...dropped.slice(0, remaining)]);
                                    }}
                                    onDoubleClick={() => document.getElementById('file-drop')?.click()}
                                    tabIndex={0}
                                    className={`file-drop ${isDragging ? 'dragging' : ''}`}
                                >
                                    <div className="bg-white p-4 rounded-full shadow-lg mb-4">
                                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2-0 00-2-2H6a2 2-0 00-2 2v12a2 2-0 002 2z"></path></svg>
                                    </div>
                                    <span className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Drop or Paste Here</span>
                                    <div className="text-center">
                                        <p className="text-[10px] text-slate-400 font-bold mb-1">SINGLE CLICK TO FOCUS & PASTE</p>
                                        <p className="text-[10px] text-slate-400 font-bold">DOUBLE CLICK TO BROWSE FILES</p>
                                    </div>

                                    {/* Display existing screenshots */}
                                    {isEdit && existingScreenshots.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-6 justify-center">
                                            {existingScreenshots.map((path, index) => (
                                                <div
                                                    key={`old-${index}`}
                                                    className="thumbnail-wrapper"
                                                >
                                                    <img
                                                        src={`${BACKEND_URL}/${path.replace(/\\/g, '/')}`}
                                                        alt={`Existing ${index + 1}`}
                                                        className="thumbnail-img"
                                                        onClick={() => setViewImage(`${BACKEND_URL}/${path.replace(/\\/g, '/')}`)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setExistingScreenshots(prev => prev.filter((_, i) => i !== index));
                                                        }}
                                                        className="thumbnail-delete-btn"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {files.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-6 justify-center">
                                            {files.map((file, index) => (
                                                <div
                                                    key={index}
                                                    className="thumbnail-wrapper"
                                                    onDoubleClick={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setViewImage(URL.createObjectURL(file))
                                                    }}
                                                >
                                                    <img
                                                        src={URL.createObjectURL(file)}
                                                        alt={`Item ${index + 1}`}
                                                        className="thumbnail-img"
                                                    />

                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setFiles(prev => prev.filter((_, i) => i !== index));
                                                        }}
                                                        className="thumbnail-delete-btn"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                            {files.length + existingScreenshots.length < formData.totalItems && (
                                                <div className="w-12 h-12 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-300 font-black text-[10px]">
                                                    +{formData.totalItems - (files.length + existingScreenshots.length)}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <input
                                        type="file"
                                        id="file-drop"
                                        multiple
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const selected = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
                                            const remaining = formData.totalItems - (files.length + existingScreenshots.length);
                                            if (remaining > 0) {
                                                setFiles(prev => [...prev, ...selected.slice(0, remaining)]);
                                            }
                                            // Reset input value so same file can be selected again if deleted
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="submit-section">
                            <button
                                type="submit"
                                disabled={loading || (files.length + existingScreenshots.length !== formData.totalItems)}
                                className="btn-primary"
                                style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                            >
                                {loading && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin inline-block mr-2"></div>}
                                {isEdit ? 'Update Job Entry' : 'Create Job Entry'}
                            </button>
                        </div>
                    </form>
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

            {/* Job Card Modal */}
            {showJobCard && (
                <JobCardModal
                    jobData={{
                        jobId: formData.jobId,
                        customerName: customerName,
                        totalItems: formData.totalItems,
                        attBy: user?.name || user?.username || 'N/A',
                        date: new Date(),
                        isWalkIn: isWalkIn
                    }}
                    onClose={() => setShowJobCard(false)}
                />
            )}
        </div>
    )
}

