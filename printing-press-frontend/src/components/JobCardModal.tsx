import { useState, useEffect, useRef } from 'react'
import JobCard from './JobCard'
import { useJobCardForm, type JobCardState } from '../hooks/useJobCardForm'
import { api, fetchProductionTimings, fetchProcessRegistry } from '../services/api'
import { estimateJobCardTime, formatEstimateLabel, DEFAULT_TIMINGS, type ProductionTimings } from '../utils/productionTime'
import './JobCardModal.css'

interface JobCardModalProps {
    jobData: {
        jobId: string
        customerName: string
        totalItems: number
        attBy?: string
        date?: Date
        isWalkIn?: boolean
        itemType?: string
    }
    onClose: () => void
    onSaved?: (formData: JobCardState) => void
}

const draftKey = (jobId: string) => `jobcard_draft_${jobId}`

function getInitialFormDataFromProduct(productName: string, sequence: string[], prevForm: JobCardState): JobCardState {
    const pName = String(productName || '').toLowerCase()
    const nextForm = JSON.parse(JSON.stringify(prevForm)) as JobCardState

    const hasStage = (stage: string) => sequence.includes(stage)

    // 1. Determine processes
    nextForm.processes = {
        ...nextForm.processes,
        cutting: hasStage('cutting') || hasStage('cutting2'),
        dieCutting: hasStage('dieCutting'),
        lamination: hasStage('lamination'),
        perforation: hasStage('creasing') || hasStage('perforation'),
        creasing: hasStage('creasing'),
        cornerCut: hasStage('cornerCutting'),
        binding: hasStage('binding'),
        foil: hasStage('foil'),
        idCard: pName.includes('id card') || hasStage('idCard')
    }

    // 2. Pre-fill binding details
    if (nextForm.processes.binding) {
        if (pName.includes('pouch') || pName.includes('laminated card')) {
            nextForm.binding.pouchLamination = true
            nextForm.binding.pouchLaminationQty = '100'
        } else if (pName.includes('wiro') || pName.includes('spiral') || pName.includes('notebook')) {
            nextForm.binding.wiroBinding = true
            nextForm.binding.wiroBindingQty = '100'
        } else if (pName.includes('perfect') || pName.includes('book')) {
            nextForm.binding.perfect = true
            nextForm.binding.perfectQty = '100'
        } else if (pName.includes('center') || pName.includes('pin') || pName.includes('booklet')) {
            nextForm.binding.centerPin = true
            nextForm.binding.centerPinQty = '100'
        } else if (pName.includes('case')) {
            nextForm.binding.caseBinding = true
            nextForm.binding.caseBindingQty = '100'
        } else {
            nextForm.binding.centerPin = true
            nextForm.binding.centerPinQty = '100'
        }
    }

    // 3. Pre-fill lamination details
    if (nextForm.processes.lamination) {
        if (pName.includes('matt') || pName.includes('matte')) {
            nextForm.lamination.matt = true
            nextForm.lamination.mattQty = '100'
            nextForm.lamination.mattSide = 'single'
            nextForm.lamination.singleSide = true
        } else if (pName.includes('velvet')) {
            nextForm.lamination.velvet = true
            nextForm.lamination.velvetQty = '100'
            nextForm.lamination.velvetSide = 'single'
            nextForm.lamination.singleSide = true
        } else {
            nextForm.lamination.glossy = true
            nextForm.lamination.glossyQty = '100'
            nextForm.lamination.glossySide = 'single'
            nextForm.lamination.singleSide = true
        }
    }

    // 4. Pre-fill ID Card details
    if (nextForm.processes.idCard) {
        nextForm.idCard.fusing = true
        nextForm.idCard.fusingQty = '100'
        nextForm.idCard.holes = true
    }

    // 5. Pre-fill Cutting details
    if (nextForm.processes.cutting) {
        nextForm.cutting.noOfCutting = '1'
        nextForm.cutting.sizes = ['']
    }

    return nextForm
}

export default function JobCardModal({ jobData, onClose, onSaved }: JobCardModalProps) {
    const { formData, setFormData, updateProcess } = useJobCardForm()
    const [isSaving, setIsSaving] = useState(false)
    const [draftRestored, setDraftRestored] = useState(false)
    const [timings, setTimings] = useState<ProductionTimings>(DEFAULT_TIMINGS)
    const [registry, setRegistry] = useState<any>(null)
    // Prevent auto-save to localStorage until initial load is complete.
    // Using useState (not useRef) so the auto-save effect re-evaluates after load.
    const [isLoaded, setIsLoaded] = useState(false)
    const loadedRef = useRef(false)

    // Fetch production timings
    useEffect(() => {
        fetchProductionTimings()
            .then(data => setTimings(data || DEFAULT_TIMINGS))
            .catch(() => setTimings(DEFAULT_TIMINGS))
    }, [])

    // Load existing data: DB is fetched first; localStorage draft wins only if
    // it is newer than the last DB save (prevents a partial/stale draft from
    // hiding saved binding/creasing/cutting values).
    useEffect(() => {
        const loadExistingData = async () => {
            if (!jobData.jobId) return

            // Load registry to dynamically initialize custom step states
            let reg: any = null
            let customSteps: string[] = []
            try {
                reg = await fetchProcessRegistry()
                setRegistry(reg)
                customSteps = [
                    ...(reg?.postPressStages || []),
                    ...(reg?.finishingStages || [])
                ].map(step => typeof step === 'string' ? step : step.key)
            } catch (e) {
                console.error('Failed to load process registry in JobCardModal:', e)
            }

            const mergeCustomSteps = (baseData: any) => {
                if (!baseData) return baseData
                const res = JSON.parse(JSON.stringify(baseData))
                if (!res.processes) res.processes = {}

                const customCreaseSteps = customSteps.filter(s => reg?.taskBasis?.[s] === 'creasing')
                const customDieCutSteps = customSteps.filter(s => reg?.taskBasis?.[s] === 'dieCutting')
                const customBindingSteps = customSteps.filter(s => reg?.taskBasis?.[s] === 'binding')
                const customLaminationSteps = customSteps.filter(s => reg?.taskBasis?.[s] === 'lamination')

                const defaultStages = [
                    'lamination', 'foil', 'binding', 'fusing', 'holes',
                    'cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2'
                ];

                for (const stepName of customSteps) {
                    if (defaultStages.includes(stepName)) continue;
                    if (res.processes[stepName] === undefined) {
                        res.processes[stepName] = false
                    }
                    const basis = reg?.taskBasis?.[stepName] || 'independent'
                    if (basis === 'independent') {
                        if (!res[stepName]) {
                            res[stepName] = { qty: '', details: '' }
                        }
                    }
                }

                // Initialize creasing fields
                if (!res.creasingPerforation) res.creasingPerforation = {}
                for (const step of customCreaseSteps) {
                    if (res.creasingPerforation[step] === undefined) {
                        res.creasingPerforation[step] = false
                    }
                    if (res.creasingPerforation[`${step}No`] === undefined) {
                        res.creasingPerforation[`${step}No`] = ''
                    }
                }

                // Initialize binding fields
                if (!res.binding) res.binding = {}
                for (const step of customBindingSteps) {
                    if (res.binding[step] === undefined) {
                        res.binding[step] = false
                    }
                    if (res.binding[`${step}Qty`] === undefined) {
                        res.binding[`${step}Qty`] = ''
                    }
                }

                // Initialize lamination fields
                if (!res.lamination) res.lamination = {}
                for (const step of customLaminationSteps) {
                    if (res.lamination[step] === undefined) {
                        res.lamination[step] = false
                    }
                    if (res.lamination[`${step}Qty`] === undefined) {
                        res.lamination[`${step}Qty`] = ''
                    }
                    if (res.lamination[`${step}Side`] === undefined) {
                        res.lamination[`${step}Side`] = ''
                    }
                }

                // Initialize die cutting rows
                if (!res.dieCutting) res.dieCutting = { rows: [] }
                if (!res.dieCutting.rows) res.dieCutting.rows = []
                const targetLen = 1 + customDieCutSteps.length
                while (res.dieCutting.rows.length < targetLen) {
                    res.dieCutting.rows.push({ sheets: '', halfCut: '', throughCut: '', timing: '' })
                }

                return res
            }

            // 1. Always fetch from DB first to get the authoritative updatedAt timestamp
            let dbData: any = null
            let dbUpdatedAt: Date | null = null
            try {
                const res = await api.get(`/api/job-cards/${jobData.jobId}`)
                if (res.data) {
                    const { _id, __v, createdAt, updatedAt, ...cardData } = res.data
                    dbData = mergeCustomSteps(cardData)
                    dbUpdatedAt = updatedAt ? new Date(updatedAt) : null
                }
            } catch (err) {
                if ((err as any).response?.status !== 404) {
                    console.error('Error loading job card:', err)
                }
            }

            // 2. Check for a localStorage draft
            let draftData: any = null
            let draftSavedAt: Date | null = null
            try {
                const raw = localStorage.getItem(draftKey(jobData.jobId))
                if (raw) {
                    const parsed = JSON.parse(raw) as any
                    const { _id, __v, createdAt, updatedAt, _savedAt, ...rest } = parsed
                    // Discard drafts where cutting.noOfCutting is still the hardcoded
                    // default '1' — these are T+1ms auto-saves before any user input.
                    const isStaleDraft = rest?.cutting?.noOfCutting === '1'
                    if (!isStaleDraft) {
                        draftData = mergeCustomSteps(rest)
                        draftSavedAt = _savedAt ? new Date(_savedAt) : null
                    } else {
                        localStorage.removeItem(draftKey(jobData.jobId))
                    }
                }
            } catch {
                localStorage.removeItem(draftKey(jobData.jobId))
            }

            // 3. Decide which source wins
            // Draft wins only when it was saved AFTER the last DB save.
            // If DB is newer (user saved from another device/session) → use DB.
            // If no timestamp comparison is possible, prefer DB to be safe.
            const draftIsNewer =
                draftData !== null &&
                draftSavedAt !== null &&
                (dbUpdatedAt === null || draftSavedAt > dbUpdatedAt)

            if (draftIsNewer) {
                setFormData(prev => ({ ...prev, ...draftData }))
                setDraftRestored(true)
            } else {
                // Use DB data (or keep form defaults if no DB record exists)
                if (dbData) {
                    setFormData(prev => ({ ...prev, ...dbData }))
                } else if (jobData.itemType) {
                    // It's a new job card — auto-fill from product sequence template
                    try {
                        const sequence = reg?.productSequences?.[jobData.itemType]
                        if (sequence && sequence.length > 0) {
                            setFormData(prev => mergeCustomSteps(getInitialFormDataFromProduct(jobData.itemType!, sequence, prev)))
                        } else {
                            setFormData(prev => mergeCustomSteps(prev))
                        }
                    } catch (err) {
                        console.error('Failed to load product sequences for auto-fill:', err)
                        setFormData(prev => mergeCustomSteps(prev))
                    }
                } else {
                    setFormData(prev => mergeCustomSteps(prev))
                }
                // If a stale draft existed, it was already removed above
                if (draftData !== null && !draftIsNewer) {
                    // Draft is older than DB — discard it silently
                    localStorage.removeItem(draftKey(jobData.jobId))
                }
            }

            loadedRef.current = true
            setIsLoaded(true)
        }
        loadExistingData()
    }, [jobData.jobId, setFormData])

    // Auto-save to localStorage on every formData change (after initial load).
    // _savedAt is written so the load logic can compare draft age vs DB updatedAt.
    useEffect(() => {
        if (!isLoaded) return   // wait until DB load (or draft load) has completed
        if (!jobData.jobId) return
        try {
            localStorage.setItem(draftKey(jobData.jobId), JSON.stringify({
                ...formData,
                _savedAt: new Date().toISOString()
            }))
        } catch {
            // localStorage full or unavailable — silent fail
        }
    }, [formData, jobData.jobId, isLoaded])

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
            // Clear the draft — data is now safely in the database
            localStorage.removeItem(draftKey(jobData.jobId))
            setDraftRestored(false)
            onSaved?.(formData)
            if (!silent) alert('Job Card saved successfully!')
            return true
        } catch (err) {
            console.error('Error saving job card:', err)
            const msg = (err as any)?.response?.data?.message || (err as any)?.message || 'Failed to save job card.'
            alert(`Save failed: ${msg}`)
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span className="job-meta">{jobData.jobId} - {jobData.customerName}</span>
                            {(() => {
                                const estimatedMins = estimateJobCardTime(formData, timings)
                                if (estimatedMins <= 0) return null
                                return (
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        color: estimatedMins >= 1440 ? '#dc2626' : estimatedMins >= 180 ? '#f59e0b' : '#16a34a',
                                        background: estimatedMins >= 1440 ? '#fee2e2' : estimatedMins >= 180 ? '#fef3c7' : '#dcfce7',
                                        padding: '4px 12px',
                                        borderRadius: '12px',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        ⏱ {formatEstimateLabel(estimatedMins)}
                                    </span>
                                )
                            })()}
                        </div>
                        {draftRestored && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    fontSize: '0.7rem',
                                    background: '#fef9c3',
                                    color: '#92400e',
                                    border: '1px solid #fde68a',
                                    borderRadius: '4px',
                                    padding: '2px 8px',
                                    fontWeight: 700,
                                    marginLeft: '8px'
                                }}>
                                    ⚡ Draft restored — click Save to confirm
                                </span>
                                <button
                                    onClick={() => {
                                        localStorage.removeItem(draftKey(jobData.jobId))
                                        setDraftRestored(false)
                                        // Reload form from DB
                                        api.get(`/api/job-cards/${jobData.jobId}`)
                                            .then(res => {
                                                if (res.data) {
                                                    const { _id, __v, createdAt, updatedAt, ...cardData } = res.data
                                                    setFormData(prev => ({ ...prev, ...cardData }))
                                                }
                                            })
                                            .catch(() => {})
                                    }}
                                    style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        background: '#fee2e2',
                                        color: '#b91c1c',
                                        border: '1px solid #fca5a5',
                                        borderRadius: '4px',
                                        padding: '2px 8px',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    ✕ Discard draft
                                </button>
                            </span>
                        )}
                    </div>
                    <div className="job-card-modal-actions">
                        <button
                            onClick={() => handleSave(false)}
                            className="btn-secondary"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save'}
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
                        jobData={{
                            ...jobData,
                            isWalkIn: jobData.isWalkIn
                        }}
                        formData={formData}
                        setFormData={setFormData}
                        updateProcess={updateProcess}
                        registry={registry}
                    />
                </div>
            </div>
        </div>
    )
}
