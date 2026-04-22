import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import '../prepress/CreateJob.css' // Mapped directly to CreateJob CSS to maintain elite UI

export default function WhatsAppJob() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [toast, setToast] = useState<string | null>(null)

    // Form Data
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [alternatePhones, setAlternatePhones] = useState('')
    const [description, setDescription] = useState('')
    const [jobTitle, setJobTitle] = useState('')
    const [priority, setPriority] = useState('NORMAL')
    const [files, setFiles] = useState<File[]>([])
    const [activeSearchField, setActiveSearchField] = useState<'phone' | 'name' | null>(null)
    
    // Staff & Search
    const [staffList, setStaffList] = useState<any[]>([])
    const [preferredStaffId, setPreferredStaffId] = useState('')
    const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([])
    const [showDropdown, setShowDropdown] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    
    const [isDragging, setIsDragging] = useState(false)
    const [viewImage, setViewImage] = useState<string | null>(null)
    const searchTimeoutRef = useRef<any>(null)
    const submissionLock = useRef(false)

    // Recent Jobs Table State
    const [recentJobs, setRecentJobs] = useState<any[]>([])
    const [loadingJobs, setLoadingJobs] = useState(true)

    const fetchRecentJobs = async () => {
        try {
            setLoadingJobs(true)
            const res = await api.get('/api/whatsapp/jobs/recent')
            if (res.data) setRecentJobs(res.data)
        } catch (e) {
            console.error('Failed to load recent WhatsApp jobs', e)
        } finally {
            setLoadingJobs(false)
        }
    }

    useEffect(() => {
        const fetchStaff = async () => {
            try {
                const res = await api.get('/api/queue/staff-list')
                if (res.data) setStaffList(res.data)
            } catch (e) {
                console.error('Failed to load staff list', e)
            }
        }
        fetchStaff()
        fetchRecentJobs()

        // Auto-poll for new jobs every 5 seconds
        const interval = setInterval(fetchRecentJobs, 5000);
        return () => clearInterval(interval);
    }, [])

    const searchCustomers = async (query: string) => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
        if (query.length < 2) {
            setCustomerSearchResults([])
            setShowDropdown(false)
            return
        }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await api.get(`/api/prepress/customers/search?name=${encodeURIComponent(query)}`)
                setCustomerSearchResults(res.data)
                setShowDropdown(res.data.length > 0)
                setHighlightedIndex(-1)
            } catch (e) {
                setCustomerSearchResults([])
                setShowDropdown(false)
            }
        }, 300)
    }

    const handleSelectCustomer = (customer: any) => {
        setCustomerName(customer.name)
        setCustomerPhone(customer.phone)
        if (customer.alternatePhones && customer.alternatePhones.length > 0) {
            setAlternatePhones(customer.alternatePhones.join(', '))
        }
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
        let added = false
        for (let i = 0; i < items.length; i++) {
            // Allow images, PDFs, and common design files if detected as blobs
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile()
                if (file) {
                    setFiles(prev => [...prev, file])
                    added = true
                }
            }
        }
        if (added && document.activeElement) {
           (document.activeElement as HTMLElement).blur()
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (submissionLock.current) return

        if (!customerPhone || files.length === 0) {
            alert('Phone number and at least one file are required.')
            return
        }

        submissionLock.current = true
        setLoading(true)

        try {
            const formData = new FormData()
            formData.append('customerName', customerName)
            formData.append('customerPhone', customerPhone.replace(/\D/g, ''))
            
            const altPhonesArray = alternatePhones.split(',').map(p => p.replace(/\D/g, '').trim()).filter(Boolean)
            formData.append('alternatePhones', JSON.stringify(altPhonesArray))
            
            formData.append('description', description)
            formData.append('jobTitle', jobTitle)
            formData.append('priority', priority)
            
            if (preferredStaffId) {
                formData.append('preferredStaffId', preferredStaffId)
            }
            files.forEach(file => {
                formData.append('files', file)
            })

            await api.post('/api/whatsapp/jobs/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            
            setToast('WhatsApp Job Uploaded! It is now being ingested into the queue.')
            // Form Reset
            setFiles([])
            setDescription('')
            setJobTitle('')
            setPriority('NORMAL')
            setCustomerPhone('')
            setCustomerName('')
            setAlternatePhones('')
            setPreferredStaffId('')
            
            fetchRecentJobs() // Refresh the table below
            setTimeout(() => setToast(null), 3000)
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to upload WhatsApp job')
        } finally {
            setLoading(false)
            submissionLock.current = false
        }
    }


    return (
        <div className="create-job-page" style={{ paddingBottom: '5rem' }}>
            {toast && (
                <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#059669', color: 'white', padding: '1rem 2rem', borderRadius: '1rem', fontWeight: 'bold', zIndex: 1000, boxShadow: '0 10px 25px rgba(5,150,105,0.3)' }}>
                    ✓ {toast}
                </div>
            )}
            
            <div className="create-job-container" style={{ maxWidth: '1600px' }}>
                <div className="create-job-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="header-left">
                        <div className="header-icon" style={{ background: '#2563eb' }}>
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                        </div>
                        <div className="header-title">
                            <h1>WHATSAPP INTAKE</h1>
                            <span style={{ color: '#2563eb' }}>AUTOMATED QUEUE INJECTION</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate('/admin/queue')} className="btn-outline">
                            Exit to Admin
                        </button>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 420px)', gap: '2rem', alignItems: 'start' }}>
                    <div className="create-job-card">
                        <form onSubmit={handleSubmit} className="create-job-form">
                            <div className="form-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2.5rem' }}>
                                {/* COLUMN 1: CUSTOMER & DETAILS */}
                            <div className="space-y-6">
                                <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Customer Details</h3>
                                
                                <div className="form-group relative">
                                    <label>Primary Phone / WhatsApp No.</label>
                                    <div className="relative">
                                        <input
                                            required
                                            placeholder="e.g. 9876543210"
                                            className="form-input"
                                            value={customerPhone}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '')
                                                setCustomerPhone(val)
                                                searchCustomers(val)
                                            }}
                                            onFocus={() => {
                                                setActiveSearchField('phone')
                                                if (customerPhone.length >= 2 && customerSearchResults.length > 0) setShowDropdown(true)
                                            }}
                                            onBlur={() => setTimeout(() => {
                                                if (activeSearchField === 'phone') setShowDropdown(false)
                                            }, 200)}
                                            onKeyDown={handleKeyDown}
                                        />
                                        {showDropdown && activeSearchField === 'phone' && (
                                            <div className="customer-dropdown">
                                                {customerSearchResults.map((customer, idx) => (
                                                    <div
                                                        key={customer._id}
                                                        className={`dropdown-item ${idx === highlightedIndex ? 'highlighted' : ''}`}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault()
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

                                <div className="form-group relative">
                                    <label>Customer Name</label>
                                    <div className="relative">
                                        <input
                                            required
                                            placeholder="Full name"
                                            className="form-input"
                                            value={customerName}
                                            onChange={(e) => {
                                                setCustomerName(e.target.value)
                                                searchCustomers(e.target.value)
                                            }}
                                            onFocus={() => {
                                                setActiveSearchField('name')
                                                if (customerName.length >= 2 && customerSearchResults.length > 0) setShowDropdown(true)
                                            }}
                                            onBlur={() => setTimeout(() => {
                                                if (activeSearchField === 'name') setShowDropdown(false)
                                            }, 200)}
                                            onKeyDown={handleKeyDown}
                                        />
                                        {showDropdown && activeSearchField === 'name' && (
                                            <div className="customer-dropdown">
                                                {customerSearchResults.map((customer, idx) => (
                                                    <div
                                                        key={customer._id}
                                                        className={`dropdown-item ${idx === highlightedIndex ? 'highlighted' : ''}`}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault()
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
                                    <label>Alternate Phones (Optional)</label>
                                    <input
                                        placeholder="Comma separated numbers"
                                        className="form-input"
                                        value={alternatePhones}
                                        onChange={(e) => setAlternatePhones(e.target.value)}
                                        title="Additional phone numbers to attach to this customer"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Job Title (Subject Override)</label>
                                    <input
                                        placeholder="e.g. Visiting Card 100pk"
                                        className="form-input"
                                        value={jobTitle}
                                        onChange={(e) => setJobTitle(e.target.value)}
                                    />
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Priority</label>
                                        <select className="form-input" value={priority} onChange={e => setPriority(e.target.value)}>
                                            <option value="NORMAL">Normal Priority</option>
                                            <option value="URGENT">Urgent (Orange)</option>
                                            <option value="CRITICAL">Critical (Red)</option>
                                            <option value="IMMEDIATE">Immediate (Blinking Red)</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div style={{ height: '30px' }}></div>
                                <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Queue Settings</h3>

                                <div className="form-group">
                                    <label>Preferred Staff (Continuity Routing)</label>
                                    <select
                                        className="form-input"
                                        value={preferredStaffId}
                                        onChange={(e) => setPreferredStaffId(e.target.value)}
                                    >
                                        <option value="">No Preference (Auto-Assign)</option>
                                        {staffList.map((staff: any) => (
                                            <option key={staff._id || staff.id} value={staff._id || staff.id}>
                                                {staff.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Message / Description</label>
                                    <textarea
                                        placeholder="Client's instructions or requirements..."
                                        className="form-input"
                                        rows={4}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* RIGHT SIDE: FILES */}
                            <div>
                                <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Job Files & Assets</h3>
                                
                                <div
                                    onPaste={handlePaste}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        const dropped = Array.from(e.dataTransfer.files)
                                        setFiles(prev => [...prev, ...dropped]);
                                    }}
                                    onDoubleClick={() => document.getElementById('file-drop')?.click()}
                                    tabIndex={0}
                                    className={`file-drop ${isDragging ? 'dragging' : ''}`}
                                    style={{ minHeight: files.length > 0 ? 'auto' : '400px' }}
                                >
                                    <div className="bg-white p-4 rounded-full shadow-lg mb-4">
                                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2-0 00-2-2H6a2 2-0 00-2 2v12a2 2-0 002 2z"></path></svg>
                                    </div>
                                    <span className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Drop or Paste Files</span>
                                    <div className="text-center">
                                        <p className="text-[10px] text-slate-400 font-bold mb-1">SINGLE CLICK TO FOCUS & PASTE</p>
                                        <p className="text-[10px] text-slate-400 font-bold">DOUBLE CLICK TO BROWSE</p>
                                    </div>

                                    {files.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-6 justify-center">
                                            {files.map((file, index) => {
                                                const isImage = file.type.startsWith('image/');
                                                const fileUrl = isImage ? URL.createObjectURL(file) : null;
                                                return (
                                                    <div
                                                        key={index}
                                                        className="thumbnail-wrapper"
                                                        onDoubleClick={(e) => e.stopPropagation()}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            if (isImage) setViewImage(fileUrl)
                                                        }}
                                                    >
                                                        {isImage ? (
                                                            <img src={fileUrl!} alt={`Asset ${index}`} className="thumbnail-img" />
                                                        ) : (
                                                            <div style={{ width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#cbd5e1', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                                                {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                                                            </div>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault(); e.stopPropagation();
                                                                setFiles(prev => prev.filter((_, i) => i !== index));
                                                            }}
                                                            className="thumbnail-delete-btn"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    <input
                                        type="file"
                                        id="file-drop"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const selected = Array.from(e.target.files || [])
                                            setFiles(prev => [...prev, ...selected]);
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* FOOTER ACTION */}
                        <div className="submit-section">
                            <button
                                type="submit"
                                disabled={loading || files.length === 0 || !customerPhone}
                                className="btn-primary"
                                style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                            >
                                {loading && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin inline-block mr-2"></div>}
                                {loading ? 'CREATING...' : 'INJECT JOB INTO QUEUE'}
                                            </button>
                        </div>
                    </form>
                </div>
                
                {/* RECENT UPLOADS SIDEBAR */}
                <div style={{ position: 'sticky', top: '2rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                        <h2 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', margin: 0 }}>
                            Live Status Feed
                        </h2>
                        <span style={{ fontSize: '9px', fontWeight: 800, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>POLLING</span>
                    </div>
                    
                    <div className="create-job-card" style={{ padding: '0', borderRadius: '1.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.05)' }}>
                       {loadingJobs ? (
                           <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontWeight: 'bold' }}>Loading...</div>
                       ) : recentJobs.length === 0 ? (
                           <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontWeight: 'bold' }}>No recent activity.</div>
                       ) : (
                           <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                               <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                   <thead>
                                       <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                                           <th style={{ padding: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.1em' }}>Log</th>
                                           <th style={{ padding: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.1em' }}>Customer</th>
                                           <th style={{ padding: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.1em' }}>Status</th>
                                       </tr>
                                   </thead>
                                   <tbody>
                                       {recentJobs.map(job => (
                                           <tr key={job._id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                               <td style={{ padding: '0.75rem' }}>
                                                   <div style={{ 
                                                       fontSize: '0.95rem', 
                                                       fontWeight: 800, 
                                                       color: '#4338ca', 
                                                       background: '#eef2ff', 
                                                       padding: '0.3rem 0.6rem', 
                                                       borderRadius: '0.5rem', 
                                                       border: '1px solid #c7d2fe',
                                                       lineHeight: 1, 
                                                       marginBottom: '4px',
                                                       display: 'inline-block',
                                                       fontFamily: 'Inter, system-ui, sans-serif'
                                                   }}>
                                                       {new Date(job.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                   </div>
                                                   <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', paddingLeft: '4px' }}>
                                                       {new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                   </div>
                                               </td>
                                               <td style={{ padding: '0.75rem' }}>
                                                   <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                                                       {job.customerName || 'Walk-in'}
                                                   </div>
                                                   <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                                                       {job.emailSubject?.substring(0, 25)}...
                                                   </div>
                                               </td>
                                               <td style={{ padding: '0.75rem' }}>
                                                   <span style={{ 
                                                       display: 'inline-block',
                                                       padding: '0.2rem 0.6rem', 
                                                       borderRadius: '4px', 
                                                       fontSize: '9px', 
                                                       fontWeight: 800,
                                                       background: job.status === 'QUEUED' ? '#fef08a' : (job.status === 'ASSIGNED' ? '#e0e7ff' : (job.status === 'COMPLETED' ? '#bbf7d0' : '#f1f5f9')),
                                                       color: job.status === 'QUEUED' ? '#854d0e' : (job.status === 'ASSIGNED' ? '#4338ca' : (job.status === 'COMPLETED' ? '#166534' : '#64748b'))
                                                   }}>
                                                       {job.status === 'ASSIGNED' ? '✓ READY' : job.status}
                                                   </span>
                                               </td>
                                           </tr>
                                       ))}
                                   </tbody>
                               </table>
                           </div>
                       )}
                    </div>
                </div>
            </div>
        </div>

            {/* LIGHTBOX */}
            {viewImage && (
                <div className="lightbox-modal" onClick={() => setViewImage(null)}>
                    <div className="lightbox-content">
                        <img src={viewImage} alt="Preview" className="lightbox-img" />
                        <button className="lightbox-close-btn" onClick={() => setViewImage(null)}>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

