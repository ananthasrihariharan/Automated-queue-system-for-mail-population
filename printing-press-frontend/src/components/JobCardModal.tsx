import { useState, useEffect } from 'react'
import JobCard from './JobCard'
import { useJobCardForm } from '../hooks/useJobCardForm'
import { api } from '../services/api'
import './JobCardModal.css'

interface JobCardModalProps {
    jobData: {
        jobId: string
        customerName: string
        totalItems: number
        attBy?: string
        date?: Date
    }
    onClose: () => void
}

export default function JobCardModal({ jobData, onClose }: JobCardModalProps) {
    const { formData, setFormData, updateProcess } = useJobCardForm()
    const [isSaving, setIsSaving] = useState(false)

    // Load existing data if available
    useEffect(() => {
        const loadExistingData = async () => {
            if (!jobData.jobId) return
            try {
                const res = await api.get(`/api/job-cards/${jobData.jobId}`)
                if (res.data) {
                    // Update form data with saved values
                    setFormData(prev => ({
                        ...prev,
                        ...res.data
                    }))
                }
            } catch (err) {
                // If 404, it just means no card has been saved yet, which is fine
                if ((err as any).response?.status !== 404) {
                    console.error('Error loading job card:', err)
                }
            }
        }
        loadExistingData()
    }, [jobData.jobId, setFormData])

    const handleSave = async (silent = false) => {
        if (!jobData.jobId || !jobData.customerName) {
            alert('Cannot save: Job ID and Customer Name are required.')
            return false
        }

        setIsSaving(true)
        try {
            await api.post('/api/job-cards', {
                ...formData,
                jobId: jobData.jobId,
                customerName: jobData.customerName,
                totalItems: jobData.totalItems,
                attBy: jobData.attBy,
                date: jobData.date
            })
            if (!silent) alert('Job Card saved successfully!')
            return true
        } catch (err) {
            console.error('Error saving job card:', err)
            alert('Failed to save job card.')
            return false
        } finally {
            setIsSaving(false)
        }
    }

    const handlePrint = () => {
        window.print()
    }

    const handleSaveAndPrint = async () => {
        const success = await handleSave(true)
        if (success) {
            handlePrint()
        }
    }

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    return (
        <div className="job-card-modal-overlay" onClick={handleBackdropClick}>
            <div className="job-card-modal-content">
                <div className="job-card-modal-header no-print">
                    <div className="modal-title-desc">
                        <h2>Job Card</h2>
                        <span className="job-meta">{jobData.jobId} - {jobData.customerName}</span>
                    </div>
                    <div className="job-card-modal-actions">
                        <button
                            onClick={() => handleSave(false)}
                            className="btn-secondary"
                            disabled={isSaving}
                        >
                            Save
                        </button>
                        <button
                            onClick={handlePrint}
                            className="btn-outline"
                            disabled={isSaving}
                        >
                            Print
                        </button>
                        <button
                            onClick={handleSaveAndPrint}
                            className="btn-primary"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save & Print'}
                        </button>
                        <button onClick={onClose} className="btn-danger-outline">
                            Close
                        </button>
                    </div>
                </div>

                <div className="job-card-modal-body">
                    <JobCard
                        jobData={jobData}
                        formData={formData}
                        setFormData={setFormData}
                        updateProcess={updateProcess}
                    />
                </div>
            </div>
        </div>
    )
}
