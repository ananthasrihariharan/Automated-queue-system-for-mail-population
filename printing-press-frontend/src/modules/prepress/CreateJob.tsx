import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import './CreateJob.css'

export default function CreateJob() {
    const navigate = useNavigate()
    const { logout } = useAuth()
    const [loading, setLoading] = useState(false)

    const [formData, setFormData] = useState({
        jobId: '',
        totalItems: 0,
        packingPreference: 'SINGLE',
    })
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [isDragging, setIsDragging] = useState(false)

    const [viewImage, setViewImage] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (files.length !== formData.totalItems) {
            alert(`Upload exactly ${formData.totalItems} screenshots`)
            return
        }
        setLoading(true)

        try {
            const data = new FormData()
            data.append('jobId', formData.jobId)
            data.append('customerName', customerName)
            data.append('customerPhone', customerPhone)
            data.append('totalItems', String(formData.totalItems))

            files.forEach(file => {
                data.append('screenshots', file)
            })

            await api.post('/api/prepress/jobs', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            navigate('/prepress')
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to create job')
        } finally {
            setLoading(false)
        }
    }

    const fetchCustomer = async (phone: string) => {
        if (phone.length !== 10) return
        try {
            const res = await api.get(`/api/prepress/customer/by-phone/${phone}`)
            if (res.data) setCustomerName(res.data.name)
        } catch (e) { /* silent fail */ }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items
        const remaining = formData.totalItems - files.length
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
                            <h1>New Job</h1>
                            <span>Quick Entry</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
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
                                        placeholder="e.g. PPK-9902"
                                        className="form-input"
                                        value={formData.jobId}
                                        onChange={(e) => setFormData({ ...formData, jobId: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Customer Phone</label>
                                    <input
                                        required
                                        placeholder="10-digit number"
                                        className="form-input"
                                        value={customerPhone}
                                        onChange={(e) => {
                                            const val = e.target.value.slice(0, 10).replace(/\D/g, '')
                                            setCustomerPhone(val)
                                            if (val.length === 10) fetchCustomer(val)
                                        }}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Customer Name</label>
                                    <input
                                        required
                                        placeholder="Full name"
                                        className="form-input"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                    />
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
                            </div>

                            {/* Right Column - File Upload */}
                            <div>
                                <div className="form-group">
                                    <label>Item Screenshots</label>
                                </div>
                                <div
                                    onPaste={handlePaste}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                                        const remaining = formData.totalItems - files.length
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
                                            {files.length < formData.totalItems && (
                                                <div className="w-12 h-12 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-300 font-black text-[10px]">
                                                    +{formData.totalItems - files.length}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="submit-section">
                            <button
                                type="submit"
                                disabled={loading || files.length !== formData.totalItems}
                                className="btn-primary"
                                style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                            >
                                {loading && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin inline-block mr-2"></div>}
                                Create Job Entry
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
        </div>
    )
}

