import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'

export default function CreateJob() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        jobId: '',
        customerName: '',
        totalItems: 0,
        packingPreference: 'Single Parcel',
    })
    const [files, setFiles] = useState<File[]>([])
    const [isDragging, setIsDragging] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        if (files.length !== formData.totalItems) {
            alert(`Upload exactly ${formData.totalItems} screenshots`)
            setLoading(false)
            return
        }

        try {
            const data = new FormData()
            data.append('jobId', formData.jobId)
            data.append('customerName', formData.customerName)
            data.append('totalItems', String(formData.totalItems))
            data.append('packingPreference', formData.packingPreference)

            files.forEach(file => {
                data.append('screenshots', file)
            })

            // Assuming POST /api/prepress/jobs creates a new job
            await api.post('/api/prepress/jobs', data, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })
            navigate('/prepress')
        } catch (err: any) {
            console.error('Failed to create job', err)
            const message = err.response?.data?.message || 'Failed to create job'
            alert(message)
        } finally {
            setLoading(false)
        }
    }

    // Basic styling matching PrepressDashBoard
    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Create New Job</h1>
                <button
                    onClick={() => navigate('/prepress')}
                    className="text-gray-600 hover:text-black"
                >
                    &larr; Back to Dashboard
                </button>
            </div>

            <div className="bg-white p-6 border rounded shadow-sm max-w-lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Job ID</label>
                        <input
                            type="text"
                            required
                            className="mt-1 block w-full border rounded p-2"
                            value={formData.jobId}
                            onChange={(e) => setFormData({ ...formData, jobId: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                        <input
                            type="text"
                            required
                            className="mt-1 block w-full border rounded p-2"
                            value={formData.customerName}
                            onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Total Items</label>
                        <input
                            type="number"
                            required
                            min="1"
                            className="mt-1 block w-full border rounded p-2"
                            value={formData.totalItems}
                            onChange={(e) => setFormData({ ...formData, totalItems: parseInt(e.target.value) || 0 })}
                        />
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Item Screenshots</label>

                            <div
                                onDragOver={(e) => {
                                    e.preventDefault()
                                    setIsDragging(true)
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    setIsDragging(false)
                                    const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'))
                                    setFiles(droppedFiles)
                                }}
                                className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors
                                    ${isDragging ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'}`}
                            >
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    className="hidden"
                                    id="file-upload"
                                    onChange={(e) => {
                                        const selected = Array.from(e.target.files || [])
                                        setFiles(selected)
                                    }}
                                />
                                <label htmlFor="file-upload" className="cursor-pointer block w-full h-full">
                                    <div className="flex flex-col items-center">
                                        <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <p className="text-sm text-gray-600">
                                            <span className="font-semibold text-black">Click to upload</span> or drag and drop
                                        </p>
                                    </div>
                                </label>
                            </div>

                            {files.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    <p className="text-sm font-medium text-gray-700">
                                        Selected files ({files.length} / {formData.totalItems}):
                                    </p>
                                    <ul className="text-sm text-gray-500 bg-gray-50 rounded p-2">
                                        {files.map((file, idx) => (
                                            <li key={idx} className="truncate">• {file.name}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Packing Preference</label>
                        <select
                            className="mt-1 block w-full border rounded p-2"
                            value={formData.packingPreference}
                            onChange={(e) => setFormData({ ...formData, packingPreference: e.target.value })}
                        >
                            <option value="Single Parcel">Single Parcel</option>
                            <option value="Multiple Parcels">Multiple Parcels</option>
                        </select>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-black text-white px-4 py-2 rounded disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Job'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
