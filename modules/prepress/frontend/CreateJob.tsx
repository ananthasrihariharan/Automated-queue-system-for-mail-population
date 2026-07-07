import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '@core/services/api'
import { useAuth } from '@core/hooks/useAuth'
import JobCardModal from '@core/components/JobCardModal'
import { jobCardToPostPressFields } from '@core/utils/jobCardToPostPress'
import { downloadWithAuth } from '@core/utils/queueHelpers'
import LinkifiedText from '@core/shared/components/LinkifiedText'
import { estimateItemTime, formatEstimateLabel, DEFAULT_TIMINGS, type ProductionTimings } from '@core/utils/productionTime'
import { fetchProductionTimings, fetchProducts, fetchBoards, fetchMachines, type Board, type Machine } from '@core/services/api'
import { type CutType } from '@core/utils/upsCalculator'
import { CompatibilityEngine } from '@core/utils/compatibilityEngine'
import { getBackendUrl } from '@core/utils/backendUrl'
import { LayoutEngine, type LayoutResult } from '@core/utils/layoutEngine'
import { LayoutPreviewModal } from '@core/components/LayoutPreviewModal'
import './CreateJob.css'

interface JobItem {
    id: string
    orderDescription: string
    media: string
    sheetSize?: string
    type: string
    upsSuggestion?: { sheetSize: string; text: string }
    printType: string
    sizeDefault: string
    sizeH: string
    sizeW: string
    sizeQty: string
    ups?: string
    // UPS calculator inputs (transient — not persisted this phase).
    // The board comes from the Media field (matched against the Board Master).
    cutType?: CutType
    cutGap?: string
    upsInfo?: { orientation: 'original' | 'rotated'; jobsAcross: number; rows: number }
    upsHint?: string
    pages: string
    sheets: string
    mc: string
    fc: string
    ac: string
    screenshot: string
    newFile?: File
    pouchLamination: boolean
    lamination: string
    laminationQty?: number
    creasing: string
    binding: string
    dieCutting: string
    cornerCutting: string
    cutting: string
    foil?: string
    idCard?: boolean
    laminationStatus?: string
    creasingStatus?: string
    bindingStatus?: string
    dieCuttingStatus?: string
    cornerCuttingStatus?: string
    cuttingStatus?: string
    openingDirection?: string
    bindingSide?: string
    bindingMargin?: string
}

const KNOWN_JOB_TYPES = [
    'One side',
    'Double side',
    'Both side full color',
    'Black& White',
    'one side color, other Side B&W',
    'Multi color options'
]

const isDoubleSidedType = (typeText: string): boolean => {
    const t = (typeText || '').toLowerCase()
    return t.includes('double') || t.includes('both side') || t.includes('other side') || t.includes('f&&b')
}

export default function CreateJob() {
    const { id } = useParams()
    const isEdit = !!id
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { user, logout } = useAuth()
    const [loading, setLoading] = useState(false)
    const [activeRowIndexForJobCard, setActiveRowIndexForJobCard] = useState<number | null>(null)
    const [queueJob, setQueueJob] = useState<any>(null)

    const [formData, setFormData] = useState({
        jobId: '',
        packingPreference: 'SINGLE',
    })
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [activeRowIndex, setActiveRowIndex] = useState<number>(0)
    const activeRowIndexRef = useRef<number>(0)
    const [isDragActive, setIsDragActive] = useState(false)
    const dropzoneInputRef = useRef<HTMLInputElement>(null)
    // Holds the row index to focus AFTER items are loaded/rendered in edit mode
    const pendingActiveRowRef = useRef<number | null>(null)
    // Track which rows have Cut/Gap fields visible
    const [cutVisibleRows, setCutVisibleRows] = useState<Set<number>>(new Set())
    const toggleCutRow = (idx: number) => {
        setCutVisibleRows(prev => {
            const next = new Set(prev)
            next.has(idx) ? next.delete(idx) : next.add(idx)
            return next
        })
    }
    // Track which row path was copied for brief UI feedback
    const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null)

    const handleFileAttachToRow = (index: number, file: File) => {
        setItems(prev => {
            const updated = prev.map((row, idx) => {
                if (idx !== index) return row
                return { ...row, newFile: file, screenshot: URL.createObjectURL(file) }
            })
            if (index === prev.length - 1) updated.push(createEmptyRow())
            return updated
        })
        // Auto-advance cursor to the next row after upload
        const nextIndex = index + 1
        activeRowIndexRef.current = nextIndex
        setActiveRowIndex(nextIndex)
    }

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragActive(true) }
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragActive(false) }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0]
            if (file.type.startsWith('image/')) handleFileAttachToRow(activeRowIndex, file)
        }
    }

    const handleDropzoneClick = () => { dropzoneInputRef.current?.click() }

    const handleDropzoneFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0]
            if (file.type.startsWith('image/')) handleFileAttachToRow(activeRowIndex, file)
        }
    }

    const handleDropzonePaste = (e: React.ClipboardEvent) => {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
            const file = e.clipboardData.files[0]
            if (file.type.startsWith('image/')) {
                e.preventDefault()
                handleFileAttachToRow(activeRowIndex, file)
            }
        }
    }

    useEffect(() => {
        const handleGlobalPaste = (e: ClipboardEvent) => {
            if (e.defaultPrevented) return
            const activeElem = document.activeElement
            if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA' || activeElem.getAttribute('contenteditable') === 'true')) return
            if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
                const file = e.clipboardData.files[0]
                if (file.type.startsWith('image/')) {
                    e.preventDefault()
                    handleFileAttachToRow(activeRowIndexRef.current, file)
                }
            }
        }
        window.addEventListener('paste', handleGlobalPaste)
        return () => window.removeEventListener('paste', handleGlobalPaste)
    }, [])

    // Product types — admin-configurable via the process registry, with the former
    // hardcoded list as a fallback so job creation still works if the API is down.
    const FALLBACK_PRODUCT_TYPES = [
        { id: 'P001', name: 'Digital Print', template: 'none' },
        { id: 'P002', name: 'Offset Print', template: 'none' },
        { id: 'P003', name: 'Sticker', template: 'none' },
        { id: 'P004', name: 'Visiting Card', template: 'none' },
        { id: 'P005', name: 'Booklet', template: 'booklet', openingDirection: 'portrait', bindingSide: 'left', bindingMargin: 10 },
        { id: 'P006', name: 'Lanyard', template: 'none' },
        { id: 'P007', name: 'Id Card', template: 'none' },
        { id: 'P008', name: 'Tags', template: 'none' },
        { id: 'P009', name: 'Envelope', template: 'none' },
        { id: 'P010', name: 'Bill Book', template: 'none' },
        { id: 'P011', name: 'Custom', template: 'none' }
    ]
    const [knownTypes, setKnownTypes] = useState<{ id: string; name: string; template?: string; openingDirection?: string; bindingSide?: string; bindingMargin?: number }[]>(FALLBACK_PRODUCT_TYPES)
    useEffect(() => {
        fetchProducts().then(data => {
            if (Array.isArray(data) && data.length) setKnownTypes(data)
        }).catch(() => { })
    }, [])

    const extractTypeFromDescription = (desc: string, existingType: string): string => {
        if (existingType) return existingType
        if (!desc) return ''
        for (const t of knownTypes) {
            // Escape regex metacharacters — product names are now admin-entered.
            const safe = t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            if (new RegExp(`\\b${safe}\\b`, 'i').test(desc)) return t.name
        }
        return ''
    }

    const createEmptyRow = (): JobItem => ({
        id: Math.random().toString(36).substr(2, 9),
        orderDescription: '', media: '', sheetSize: '', type: '', printType: '',
        upsSuggestion: undefined,
        sizeDefault: 'Custom', sizeH: '', sizeW: '', sizeQty: '', ups: '',
        cutType: 'none', cutGap: '', upsInfo: undefined, upsHint: undefined,
        pages: '', sheets: '', mc: '', fc: '', ac: '', screenshot: '',
        pouchLamination: false,
        lamination: 'NONE', creasing: 'NONE', binding: 'NONE',
        dieCutting: 'NONE', cornerCutting: 'NONE', cutting: 'NONE',
        laminationStatus: 'NONE', creasingStatus: 'NONE', bindingStatus: 'NONE',
        dieCuttingStatus: 'NONE', cornerCuttingStatus: 'NONE', cuttingStatus: 'NONE',
        openingDirection: 'none', bindingSide: 'none', bindingMargin: '0'
    })

    const [items, setItems] = useState<JobItem[]>([createEmptyRow()])
    const [isWalkIn, setIsWalkIn] = useState(false)
    const [isContactMe, setIsContactMe] = useState(false)

    // Production timings (admin-configurable)
    const [timings, setTimings] = useState<ProductionTimings>(DEFAULT_TIMINGS)
    useEffect(() => {
        fetchProductionTimings().then(data => {
            if (data) setTimings({ ...DEFAULT_TIMINGS, ...data })
        }).catch(() => { })
    }, [])

    // Board Master + Machines — used by the UPS calculator.
    const [boards, setBoards] = useState<Board[]>([])
    const [machines, setMachines] = useState<Machine[]>([])
    useEffect(() => {
        fetchBoards().then(data => { if (Array.isArray(data)) setBoards(data) }).catch(() => { })
        fetchMachines().then(data => { if (Array.isArray(data)) setMachines(data) }).catch(() => { })
    }, [])
    const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([])
    const [showDropdown, setShowDropdown] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const searchTimeoutRef = useRef<any>(null)
    const [viewImage, setViewImage] = useState<string | null>(null)
    const BACKEND_URL = getBackendUrl()
    const [activeLayout, setActiveLayout] = useState<LayoutResult | null>(null)

    const handleViewLayout = (row: JobItem) => {
        const board = matchBoard(row.media)
        const jobW = parseFloat(row.sizeW)
        const jobH = parseFloat(row.sizeH)
        const qty = parseInt(row.sizeQty) || 0
        if (!board || !(jobW > 0) || !(jobH > 0)) return

        let sheet = board.sheets.find(s => s.name === row.sheetSize)
        if (!sheet && board.sheets.length > 0) {
            sheet = board.sheets.find(s => s.name === board.storingSize) || board.sheets[0]
        }
        if (!sheet) return

        const selectedMachine = machines.find(m => m.name === row.mc)
        const margin = selectedMachine ? selectedMachine.printableMargin : 5

        const jobParam = {
            width: jobW,
            height: jobH,
            qty,
            cutType: (row.cutType as CutType) || 'none',
            cutGap: parseFloat(row.cutGap || '') || 0,
            printableMargin: margin,
        }

        const matchedProduct = knownTypes.find(t => t.name === row.orderDescription)
        const templateType = matchedProduct?.template || (row.orderDescription?.toLowerCase().includes('booklet') ? 'booklet' : 'none')

        const productRequest = {
            productType: row.orderDescription || '',
            templateType,
            binding: row.binding,
            openingDirection: row.openingDirection || (templateType === 'booklet' ? 'portrait' : 'none'),
            bindingSide: row.bindingSide || (templateType === 'booklet' ? 'left' : 'none'),
            bindingMargin: row.bindingMargin !== undefined ? parseFloat(row.bindingMargin) || 0 : (templateType === 'booklet' ? 10 : 0),
        }

        const compResult = CompatibilityEngine.validate(
            sheet,
            board.sheets,
            jobParam,
            productRequest
        )

        if (compResult) {
            const layoutResult = LayoutEngine.generate(
                sheet,
                compResult.compatibleSheet,
                jobParam,
                productRequest,
                compResult.upsResult
            )
            setActiveLayout(layoutResult)
        }
    }

    // ── Pre-fill from URL params (viaMarkComplete flow) ──────────────────────
    useEffect(() => {
        if (!isEdit) {
            const nameParam = searchParams.get('customerName')
            const phoneParam = searchParams.get('customerPhone')
            if (nameParam) setCustomerName(nameParam)
            if (phoneParam) {
                setCustomerPhone(phoneParam)
                // Resolve the real customer name from the DB (overrides the generic queue name)
                if (phoneParam.length >= 10) {
                    api.get(`/api/prepress/customer/by-phone/${encodeURIComponent(phoneParam)}`)
                        .then(res => { if (res.data?.name) setCustomerName(res.data.name) })
                        .catch(() => { /* silent — keep URL param name as fallback */ })
                }
            }
        }
    }, [isEdit, searchParams])

    // ── Load completed queue job for the preview panel ────────────────────────
    useEffect(() => {
        const qJobId = searchParams.get('queueJobId')
        const viaMarkComplete = searchParams.get('viaMarkComplete') === 'true'
        if (qJobId && viaMarkComplete) {
            const fetchQueueJob = async () => {
                try {
                    const res = await api.get(`/api/queue/jobs/${qJobId}`)
                    if (res.data) {
                        const job = { ...res.data }
                        if (!job.customerName) job.customerName = searchParams.get('customerName') || ''
                        setQueueJob(job)
                    }
                } catch (e) {
                    console.error('Failed to fetch completed queue job', e)
                }
            }
            fetchQueueJob()
        } else {
            setQueueJob(null)
        }
    }, [searchParams])

    // ── Load existing job for edit ────────────────────────────────────────────
    useEffect(() => {
        if (isEdit) {
            const fetchJob = async () => {
                try {
                    const res = await api.get(`/api/prepress/jobs/${id}`)
                    const job = res.data
                    if (job) {
                        setFormData({ jobId: job.jobId, packingPreference: job.packingPreference || 'SINGLE' })
                        setCustomerName(job.customerName)
                        setCustomerPhone(job.customerPhone || '')
                        setIsWalkIn(job.defaultDeliveryType === 'WALK_IN')
                        setIsContactMe(!!job.contactMe)
                        if (job.items && job.items.length > 0) {
                            const loadedItems = [
                                ...job.items.map((it: any) => ({
                                    id: Math.random().toString(36).substr(2, 9),
                                    orderDescription: it.orderDescription || '',
                                    media: it.media || '',
                                    type: extractTypeFromDescription(it.orderDescription || '', it.type || ''),
                                    printType: it.printType || 'Default',
                                    sizeDefault: it.size?.defaultVal || 'Custom',
                                    sizeH: it.size?.h || '',
                                    sizeW: it.size?.w || '',
                                    sizeQty: it.size?.qty || '',
                                    ups: it.size?.ups || ((it.size?.qty && it.sheets && parseInt(it.sheets) > 0) ? Math.ceil(parseInt(it.size.qty) / parseInt(it.sheets)).toString() : ''),
                                    pages: it.pages || '',
                                    sheets: it.sheets || '',
                                    mc: it.mc || '',
                                    fc: it.fc || '',
                                    ac: it.ac || '',
                                    screenshot: it.screenshot || '',
                                    pouchLamination: !!it.pouchLamination,
                                    lamination: it.lamination || 'NONE',
                                    laminationQty: it.laminationQty || 0,
                                    creasing: it.creasing || 'NONE',
                                    binding: it.binding || 'NONE',
                                    dieCutting: it.dieCutting || 'NONE',
                                    cornerCutting: it.cornerCutting || 'NONE',
                                    cutting: it.cutting || 'NONE',
                                    laminationStatus: it.laminationStatus || 'NONE',
                                    creasingStatus: it.creasingStatus || 'NONE',
                                    bindingStatus: it.bindingStatus || 'NONE',
                                    dieCuttingStatus: it.dieCuttingStatus || 'NONE',
                                    cornerCuttingStatus: it.cornerCuttingStatus || 'NONE',
                                    cuttingStatus: it.cuttingStatus || 'NONE',
                                    openingDirection: it.openingDirection || (it.orderDescription?.toLowerCase().includes('booklet') ? 'portrait' : 'none'),
                                    bindingSide: it.bindingSide || (it.orderDescription?.toLowerCase().includes('booklet') ? 'left' : 'none'),
                                    bindingMargin: it.bindingMargin !== undefined ? String(it.bindingMargin) : (it.orderDescription?.toLowerCase().includes('booklet') ? '10' : '0')
                                })),
                                createEmptyRow() // auto-append empty row for adding new items
                            ]
                            setItems(loadedItems)
                            pendingActiveRowRef.current = loadedItems.length - 1 // will be applied after render
                        } else if (job.itemScreenshots && job.itemScreenshots.length > 0) {
                            const loadedItems = [
                                ...job.itemScreenshots.map((shot: string) => ({ ...createEmptyRow(), screenshot: shot })),
                                createEmptyRow() // auto-append empty row
                            ]
                            setItems(loadedItems)
                            pendingActiveRowRef.current = loadedItems.length - 1 // will be applied after render
                        } else {
                            setItems([createEmptyRow()])
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch job for edit', e)
                }
            }
            fetchJob()
        }
    }, [isEdit, id])

    // After items are loaded in edit mode, apply the pending active row index.
    // Using useEffect ensures this runs AFTER React has painted the rows,
    // so it wins over any implicit focus/render that would reset to row 0.
    useEffect(() => {
        if (pendingActiveRowRef.current !== null) {
            const idx = pendingActiveRowRef.current
            pendingActiveRowRef.current = null
            setActiveRowIndex(idx)
            activeRowIndexRef.current = idx
        }
    }, [items])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (items.length === 0) { alert('Please add at least one item.'); return }

        const rowHasData = (item: JobItem): boolean => !!(
            item.orderDescription?.trim() || item.media?.trim() || item.type?.trim() ||
            item.printType?.trim() || item.sizeH?.trim() || item.sizeW?.trim() ||
            item.sizeQty?.trim() || item.pages?.trim() || item.sheets?.trim() ||
            item.mc?.trim() || item.fc?.trim() || item.ac?.trim() ||
            (item.lamination && item.lamination !== 'NONE') ||
            (item.binding && item.binding !== 'NONE') ||
            (item.foil && item.foil !== 'NONE') ||
            (item.cutting && item.cutting !== 'NONE') ||
            (item.creasing && item.creasing !== 'NONE') ||
            (item.dieCutting && item.dieCutting !== 'NONE') ||
            (item.cornerCutting && item.cornerCutting !== 'NONE') ||
            item.pouchLamination === true || item.idCard === true
        )

        const rowsToSubmit = items.filter(item => rowHasData(item) || item.newFile || item.screenshot)
        if (rowsToSubmit.length === 0) { alert('Please add at least one item with data.'); return }

        const missingImageRows = rowsToSubmit
            .map((item) => ({ item, originalIdx: items.indexOf(item) }))
            .filter(({ item }) => !item.newFile && !item.screenshot)

        if (missingImageRows.length > 0) {
            const rowNums = missingImageRows.map(({ originalIdx }) => originalIdx + 1).join(', ')
            alert(`⚠️ Image missing for row${missingImageRows.length > 1 ? 's' : ''}: ${rowNums}\n\nEvery item must have a screenshot attached.`)
            setActiveRowIndex(missingImageRows[0].originalIdx)
            return
        }

        setLoading(true)
        try {
            const data = new FormData()
            data.append('defaultDeliveryType', isWalkIn ? 'WALK_IN' : 'COURIER')
            data.append('contactMe', String(isContactMe))
            data.append('packingPreference', formData.packingPreference)

            let fileCounter = 0
            const itemsToSend = rowsToSubmit.map((item, idx) => {
                const serializedItem: any = {
                    orderDescription: item.orderDescription || `Item ${idx + 1}`,
                    media: item.media || '-',
                    type: item.type || '',
                    printType: item.printType || '',
                    size: { defaultVal: item.sizeDefault || 'Custom', h: item.sizeH || '', w: item.sizeW || '', qty: item.sizeQty || '1', ups: item.ups || '' },
                    pages: item.pages || '',
                    sheets: item.sheets || '',
                    mc: item.mc || '',
                    fc: item.fc || '',
                    ac: item.ac || '',
                    screenshot: item.screenshot && !item.screenshot.startsWith('blob:') ? item.screenshot : '',
                    pouchLamination: item.pouchLamination,
                    lamination: item.lamination,
                    laminationQty: item.laminationQty || 0,
                    creasing: item.creasing,
                    creasingQty: (item as any).creasingQty || 0,
                    binding: item.binding,
                    bindingQty: (item as any).bindingQty || 0,
                    dieCutting: item.dieCutting,
                    dieCuttingQty: (item as any).dieCuttingQty || 0,
                    cornerCutting: item.cornerCutting,
                    cornerCuttingQty: (item as any).cornerCuttingQty || 0,
                    cornerCuttingValue: (item as any).cornerCuttingValue || '',
                    cornerCuttingCorners: (item as any).cornerCuttingCorners || { tl: false, tr: false, bl: false, br: false },
                    cutting: item.cutting,
                    cuttingValue: (item as any).cuttingValue || '',
                    cuttingSizes: (item as any).cuttingSizes || [],
                    foil: (item as any).foil || 'NONE',
                    foilQty: (item as any).foilQty || '',
                    fusing: (item as any).fusing || 'NONE',
                    fusingQty: (item as any).fusingQty || '',
                    holes: (item as any).holes || 'NONE',
                    idCard: (item as any).idCard || false,
                    idCardQty: (item as any).idCardQty || 0,
                    laminationStatus: item.lamination === 'NONE' ? 'NONE' : (item.laminationStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
                    creasingStatus: item.creasing === 'NONE' ? 'NONE' : (item.creasingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
                    bindingStatus: item.binding === 'NONE' ? 'NONE' : (item.bindingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
                    dieCuttingStatus: item.dieCutting === 'NONE' ? 'NONE' : (item.dieCuttingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
                    cornerCuttingStatus: item.cornerCutting === 'NONE' ? 'NONE' : (item.cornerCuttingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
                    cuttingStatus: item.cutting === 'NONE' ? 'NONE' : (item.cuttingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
                    openingDirection: item.openingDirection || 'none',
                    bindingSide: item.bindingSide || 'none',
                    bindingMargin: item.bindingMargin !== undefined ? Number(item.bindingMargin) || 0 : 0
                }
                if (item.newFile) {
                    data.append('screenshots', item.newFile)
                    serializedItem.newFileIndex = fileCounter++
                }
                return serializedItem
            })

            data.append('items', JSON.stringify(itemsToSend))

            if (isEdit) {
                data.append('totalItems', String(itemsToSend.length))
                await api.patch(`/api/prepress/jobs/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
            } else {
                data.append('jobId', formData.jobId)
                data.append('customerName', customerName)
                data.append('customerPhone', customerPhone)
                data.append('totalItems', String(itemsToSend.length))
                await api.post('/api/prepress/jobs', data, { headers: { 'Content-Type': 'multipart/form-data' } })
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
        } catch (e) { /* silent */ }
    }

    const searchCustomers = async (name: string) => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
        if (name.length < 2 || isEdit) { setCustomerSearchResults([]); setShowDropdown(false); return }
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await api.get(`/api/prepress/customers/search?name=${encodeURIComponent(name)}`)
                setCustomerSearchResults(res.data)
                setShowDropdown(res.data.length > 0)
                setHighlightedIndex(-1)
            } catch (e) { setCustomerSearchResults([]); setShowDropdown(false) }
        }, 300)
    }

    const handleSelectCustomer = (customer: any) => {
        setCustomerName(customer.name)
        setCustomerPhone(customer.phone)
        setShowDropdown(false)
        setCustomerSearchResults([])
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showDropdown) return
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(prev => Math.min(prev + 1, customerSearchResults.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(prev => Math.max(prev - 1, 0)) }
        else if (e.key === 'Enter' && highlightedIndex >= 0) { e.preventDefault(); handleSelectCustomer(customerSearchResults[highlightedIndex]) }
        else if (e.key === 'Escape') setShowDropdown(false)
    }


    const handleDeleteRow = (index: number) => {
        if (items.length === 1) { alert('You must have at least one row.'); return }
        setItems(prev => prev.filter((_, idx) => idx !== index))
    }

    const handlePasteInRow = (e: React.ClipboardEvent, index: number) => {
        const pasteItems = e.clipboardData.items
        for (let i = 0; i < pasteItems.length; i++) {
            const item = pasteItems[i]
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile()
                if (file) {
                    e.preventDefault()
                    e.stopPropagation()
                    setItems(prev => {
                        const updated = prev.map((row, idx) => idx !== index ? row : { ...row, newFile: file, screenshot: URL.createObjectURL(file) })
                        if (index === prev.length - 1) updated.push(createEmptyRow())
                        return updated
                    })
                    // Auto-advance cursor to the next row after paste
                    const nextIndex = index + 1
                    activeRowIndexRef.current = nextIndex
                    setActiveRowIndex(nextIndex)
                    break
                }
            }
        }
    }

    const handleRowFileChange = (index: number, filesList: FileList | null) => {
        if (!filesList || filesList.length === 0) return
        const file = filesList[0]
        setItems(prev => {
            const updated = prev.map((row, idx) => idx !== index ? row : { ...row, newFile: file, screenshot: URL.createObjectURL(file) })
            if (index === prev.length - 1) updated.push(createEmptyRow())
            return updated
        })
        // Auto-advance cursor to the next row after upload
        const nextIndex = index + 1
        activeRowIndexRef.current = nextIndex
        setActiveRowIndex(nextIndex)
    }

    const triggerFileInput = (index: number) => { document.getElementById(`file-input-${index}`)?.click() }

    // Match the Media text to a board in the master (case-insensitive; the board
    // name may appear anywhere in the media string, e.g. "Art 300 300gsm").
    const matchBoard = (media?: string): Board | undefined => {
        const m = (media || '').trim().toLowerCase()
        if (!m) return undefined
        let best: Board | undefined
        for (const b of boards) {
            const n = b.name.trim().toLowerCase()
            if (n && m.includes(n) && (!best || n.length > best.name.trim().length)) best = b
        }
        return best
    }



    const generateFolderPath = (item: JobItem, index: number) => {
        const jobId = formData.jobId || 'N/A'
        const itemNum = index + 1

        // Sheets breakdown (1 waste + remaining)
        const totalSheets = parseInt(item.sheets) || 0
        const sheetsStr = totalSheets > 0 ? `1+${totalSheets - 1}` : '0+0'

        // Board matching (Media name)
        const board = matchBoard(item.media)
        const boardName = board ? board.name : (item.media || 'N/A')

        // Sheet size name matching (e.g. 13*19)
        const sheetName = item.sheetSize || 'N/A'

        // Type column value (e.g. single or f&&b (black && white))
        const typeVal = (item.type || '').trim()

        // Pages (e.g. 2 pages)
        const pagesStr = item.pages ? `${item.pages} pages` : ''

        // Submitted by name
        const submittedBy = user?.name || user?.username || 'test'

        // Combine parts: jobId -itemNum) sheetsStr boardName sheetName typeVal pagesStr (submittedBy ).pdf
        const parts = [
            `${jobId} -${itemNum})`,
            sheetsStr,
            boardName,
            sheetName,
            typeVal,
            pagesStr,
            `(${submittedBy} )`
        ].filter(Boolean)

        return parts.join(' ') + '.pdf'
    }

    const handleCopyPath = (item: JobItem, index: number) => {
        const path = generateFolderPath(item, index)
        navigator.clipboard.writeText(path).then(() => {
            setCopiedRowIdx(index)
            setTimeout(() => setCopiedRowIdx(null), 1500)
        }).catch((err) => {
            console.error('Failed to copy folder path: ', err)
        })
    }

    // Recompute UPS + required sheets for a row. UPS is shown only when ALL
    // required fields are present: board (via Media), Size H, Size W, and Qty.
    // Once Qty is entered, any still-missing fields are surfaced as a hint.
    const recalcRow = (row: JobItem): JobItem => {
        const board = matchBoard(row.media)
        const jobW = parseFloat(row.sizeW)
        const jobH = parseFloat(row.sizeH)
        const qty = parseInt(row.sizeQty) || 0

        if (!board) {
            return { ...row, upsInfo: undefined, upsHint: qty > 0 ? 'Fill Board (Media) first' : undefined }
        }

        const missing: string[] = []
        if (!(jobH > 0)) missing.push('H')
        if (!(jobW > 0)) missing.push('W')
        if (!(qty > 0)) missing.push('Qty')

        if (missing.length > 0) {
            // Only nag once the operator has started with Qty (per the workflow).
            const hint = qty > 0 ? `Fill ${missing.join(', ')} first` : undefined
            return { ...row, upsInfo: undefined, upsHint: hint }
        }

        // Sheet selection: check row.sheetSize or default to storingSize or first sheet
        let sheet = board.sheets.find(s => s.name === row.sheetSize)
        if (!sheet && row.sheetSize) {
            // Check if sheetSize can be parsed as W*H (e.g., "12*18", "13 * 19", "12x18")
            const match = row.sheetSize.match(/(\d+(?:\.\d+)?)\s*[*xX×\s]\s*(\d+(?:\.\d+)?)/)
            if (match) {
                sheet = {
                    name: row.sheetSize,
                    width: parseFloat(match[1]),
                    height: parseFloat(match[2])
                }
            }
        }
        if (!sheet && board.sheets.length > 0) {
            sheet = board.sheets.find(s => s.name === board.storingSize) || board.sheets[0]
        }
        if (!sheet) return { ...row, upsInfo: undefined, upsHint: `No sheet configured for ${board!.name}` }

        const selectedMachine = machines.find(m => m.name === row.mc)
        const margin = selectedMachine ? selectedMachine.printableMargin : 5

        const jobParam = {
            width: jobW,
            height: jobH,
            qty,
            cutType: (row.cutType as CutType) || 'none',
            cutGap: parseFloat(row.cutGap || '') || 0,
            printableMargin: margin,
        }

        const matchedProduct = knownTypes.find(t => t.name === row.orderDescription)
        const templateType = matchedProduct?.template || (row.orderDescription?.toLowerCase().includes('booklet') ? 'booklet' : 'none')

        const productRequest = {
            productType: row.orderDescription || '',
            templateType,
            binding: row.binding,
            openingDirection: row.openingDirection || (templateType === 'booklet' ? 'portrait' : 'none'),
            bindingSide: row.bindingSide || (templateType === 'booklet' ? 'left' : 'none'),
            bindingMargin: row.bindingMargin !== undefined ? parseFloat(row.bindingMargin) || 0 : (templateType === 'booklet' ? 10 : 0),
        }

        const compResult = CompatibilityEngine.validate(
            sheet,
            board.sheets,
            jobParam,
            productRequest
        )

        if (!compResult) {
            return {
                ...row,
                upsInfo: undefined,
                ups: '',
                sheets: '',
                upsHint: templateType === 'booklet' ? 'No compatible sheet found (Booklet requires even UPS)' : 'Job does not fit the sheet',
                upsSuggestion: undefined
            }
        }

        const { compatibleSheet, upsResult } = compResult
        const finalUps = upsResult.ups

        // Find smaller sheet recommendation
        let upsSuggestion: { sheetSize: string; text: string } | undefined = undefined
        const currentArea = compatibleSheet.width * compatibleSheet.height
        let bestSuggestion: { name: string; ups: number; area: number } | null = null

        for (const s of board.sheets) {
            const sArea = s.width * s.height
            if (sArea >= currentArea) continue

            const sComp = CompatibilityEngine.validate(s, [s], jobParam, productRequest)
            if (sComp) {
                const suggestionUps = sComp.upsResult.ups
                if (suggestionUps >= finalUps && suggestionUps > 0) {
                    if (!bestSuggestion ||
                        suggestionUps > bestSuggestion.ups ||
                        (suggestionUps === bestSuggestion.ups && sArea < bestSuggestion.area)) {
                        bestSuggestion = { name: s.name, ups: suggestionUps, area: sArea }
                    }
                }
            }
        }

        if (bestSuggestion) {
            upsSuggestion = {
                sheetSize: bestSuggestion.name,
                text: `${bestSuggestion.name} produces ${bestSuggestion.ups} UPS (same or greater) using a smaller sheet.`
            }
        }

        // Sheets calculation:
        // Single-side: Math.ceil(Qty / Ups) * Pages
        // Double-side: Math.ceil(Qty / Ups) * Math.ceil(Pages / 2)
        const isDouble = isDoubleSidedType(row.type)
        let rowPages = row.pages ? row.pages.trim() : ''
        if (!rowPages) {
            rowPages = isDouble ? '2' : '1'
        }
        const pagesVal = parseInt(rowPages) || 1

        const baseSheets = Math.ceil(qty / finalUps)
        const calcSheets = isDouble
            ? baseSheets * Math.ceil(pagesVal / 2)
            : baseSheets * pagesVal

        return {
            ...row,
            pages: rowPages,
            sheetSize: compatibleSheet.name,
            ups: String(finalUps),
            sheets: String(calcSheets),
            upsInfo: { orientation: upsResult.orientation, jobsAcross: upsResult.jobsAcross, rows: upsResult.rows },
            upsHint: undefined,
            upsSuggestion,
        }
    }

    return (
        <div className="create-job-page">
            <div className="create-job-container" style={queueJob ? { maxWidth: '90rem' } : undefined}>
                <div className={queueJob ? 'create-job-split-workspace' : ''}>

                    {/* ── Main form section ─────────────────────────────────── */}
                    <div className="create-job-form-section" style={{ flex: 1 }}>

                        {/* Header */}
                        <div className="create-job-header">
                            <div className="header-left">
                                <div className="header-title-container">
                                    <span className="order-details-title">Order Details</span>
                                    <span className="title-colon">:</span>
                                    <svg width="20" height="20" className="header-icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button type="button" onClick={() => navigate('/prepress')} className="btn-back-premium">Back</button>
                                <button type="button" onClick={() => { logout(); navigate('/login') }} className="logout-btn">Logout</button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="create-job-form-wrapper">
                            {/* Top card: job fields + dropzone */}
                            <div className="create-job-main-card">

                                {/* Left: inputs */}
                                <div className="main-card-left">
                                    <div className="form-group-premium">
                                        <label className="label-premium">JOB ID</label>
                                        <input required disabled={isEdit} placeholder="ENTER JOB ID" className="form-input-premium" value={formData.jobId} onChange={(e) => setFormData({ ...formData, jobId: e.target.value })} />
                                    </div>
                                    <div className="form-group-premium">
                                        <label className="label-premium">CUSTOMER PHONE</label>
                                        <input required disabled={isEdit} placeholder="10-digit number" className="form-input-premium" value={customerPhone}
                                            onChange={(e) => { const val = e.target.value.slice(0, 10).replace(/\D/g, ''); setCustomerPhone(val); if (val.length === 10) fetchCustomer(val) }} />
                                    </div>
                                    <div className="form-group-premium relative">
                                        <label className="label-premium">CUSTOMER NAME</label>
                                        <input required disabled={isEdit} placeholder="Full name" className="form-input-premium" value={customerName}
                                            onChange={(e) => { setCustomerName(e.target.value); searchCustomers(e.target.value) }}
                                            onKeyDown={handleKeyDown}
                                            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                            onFocus={() => { if (customerName.length >= 2 && customerSearchResults.length > 0) setShowDropdown(true) }}
                                        />
                                        {showDropdown && (
                                            <div className="customer-dropdown">
                                                {customerSearchResults.map((customer, idx) => (
                                                    <div key={customer._id} className={`dropdown-item ${idx === highlightedIndex ? 'highlighted' : ''}`}
                                                        onMouseDown={(e) => { e.preventDefault(); handleSelectCustomer(customer) }}
                                                        onMouseEnter={() => setHighlightedIndex(idx)}>
                                                        <div className="customer-info">
                                                            <span className="customer-name">{customer.name}</span>
                                                            <span className="customer-phone">{customer.phone}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="delivery-pills-row">
                                        <button type="button" className={`delivery-pill ${isWalkIn ? 'active' : ''}`} onClick={() => setIsWalkIn(!isWalkIn)}>
                                            <svg width="14" height="14" className="pill-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            WALK-IN
                                        </button>
                                        <button type="button" className={`delivery-pill ${isContactMe ? 'active' : ''}`} onClick={() => setIsContactMe(!isContactMe)}>
                                            <svg width="14" height="14" className="pill-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                            </svg>
                                            CONTACT ME
                                        </button>
                                    </div>
                                </div>

                                {/* Right: dropzone */}
                                <div className="main-card-right">
                                    <label className="label-premium uppercase">Item Screenshots</label>
                                    <div
                                        className={`screenshot-dropzone-container-premium ${isDragActive ? 'active' : ''}`}
                                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                                        onClick={handleDropzoneClick} onPaste={handleDropzonePaste} tabIndex={0}
                                    >
                                        <div className="screenshot-dropzone-content">
                                            <svg width="40" height="40" className="dropzone-icon-svg-premium" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <div className="drag-paste-title-premium">Drop or Paste Here</div>
                                            <div className="drag-paste-subtitle-premium">SINGLE CLICK TO FOCUS & PASTE</div>
                                            <div className="drag-paste-subtitle-premium">DOUBLE CLICK TO BROWSE FILES</div>
                                            {items[activeRowIndex]?.screenshot && (
                                                <div className="dropzone-attached-badge-premium">
                                                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4" />
                                                    </svg>
                                                    Attached to Row {activeRowIndex + 1}
                                                </div>
                                            )}
                                        </div>
                                        <input type="file" ref={dropzoneInputRef} style={{ display: 'none' }} onChange={handleDropzoneFileChange} accept="image/*" />
                                    </div>
                                </div>
                            </div>
                            {/* Items table */}
                            <div className="items-table-wrapper mb-6">
                                {/* Board names for the Media autocomplete (drives the UPS calc) */}
                                <datalist id="board-master-names">
                                    {boards.map((b) => <option key={b.id} value={b.name} />)}
                                </datalist>
                                <table className="items-table-supreme">
                                    <thead>
                                        <tr>
                                            <th rowSpan={2} style={{ width: '3%' }}>Sl.no</th>
                                            <th rowSpan={2} style={{ width: '11.5%' }}>Product</th>
                                            <th rowSpan={2} style={{ width: '6%' }}>Machine</th>
                                            <th rowSpan={2} style={{ width: '14%' }}>Media</th>
                                            <th rowSpan={2} style={{ width: '10.5%' }}>Sheet Size</th>
                                            <th rowSpan={2} style={{ width: '7%' }}>Type</th>
                                            <th colSpan={4} style={{ width: '26%' }}>Size</th>
                                            <th rowSpan={2} style={{ width: '3.5%' }}>Pages</th>
                                            <th rowSpan={2} style={{ width: '4.5%' }}>Sheets</th>
                                            <th rowSpan={2} style={{ width: '5.5%' }}>PPA</th>
                                            <th rowSpan={2} style={{ width: '8.5%' }}>Action</th>
                                        </tr>
                                        <tr>
                                            <th>W</th>
                                            <th>H</th>
                                            <th>Qty</th>
                                            <th>Ups</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => {
                                            const isCutVisible = cutVisibleRows.has(idx)
                                            return (
                                                <React.Fragment key={item.id}>
                                                    <tr
                                                        onPaste={(e) => handlePasteInRow(e, idx)}
                                                        onFocus={() => setActiveRowIndex(idx)}
                                                        onClick={() => setActiveRowIndex(idx)}
                                                        className={[activeRowIndex === idx ? 'active-row' : '', !item.newFile && !item.screenshot ? 'row-missing-image' : ''].filter(Boolean).join(' ')}
                                                    >
                                                        {/* Sl.no checkbox + number */}
                                                        <td className="text-center font-bold table-slno-cell">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <input type="checkbox" className="row-check-checkbox" defaultChecked />
                                                                <span>{idx + 1}</span>
                                                            </div>
                                                        </td>

                                                        {/* Order Description */}
                                                        <td>
                                                            <select
                                                                value={item.orderDescription || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    const matchedProduct = knownTypes.find(t => t.name === val)
                                                                    setItems(prev => prev.map((it, i) => {
                                                                        if (i !== idx) return it
                                                                        const oldType = it.type || ''
                                                                        const shouldAutoFill = !oldType || knownTypes.some(kt => kt.name === oldType) || oldType === ''
                                                                        const template = matchedProduct?.template || (val?.toLowerCase().includes('booklet') ? 'booklet' : 'none')
                                                                        
                                                                        const updatedItem = {
                                                                            ...it,
                                                                            orderDescription: val,
                                                                            type: shouldAutoFill ? val : oldType,
                                                                            openingDirection: matchedProduct?.openingDirection || (template === 'booklet' ? 'portrait' : 'none'),
                                                                            bindingSide: matchedProduct?.bindingSide || (template === 'booklet' ? 'left' : 'none'),
                                                                            bindingMargin: matchedProduct?.bindingMargin !== undefined ? String(matchedProduct.bindingMargin) : (template === 'booklet' ? '10' : '0')
                                                                        }
                                                                        return recalcRow(updatedItem)
                                                                    }))
                                                                }}
                                                                className="table-cell-select"
                                                            >
                                                                <option value="">-- Select Product --</option>
                                                                {knownTypes.map((p) => (
                                                                    <option key={p.id} value={p.name}>{p.name}</option>
                                                                ))}
                                                            </select>
                                                        </td>

                                                        {/* Machine (MC) — moved here */}
                                                        <td>
                                                            <select
                                                                value={item.mc || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, mc: val }) : it))
                                                                }}
                                                                className="table-cell-select"
                                                            >
                                                                <option value="">-- Select Machine --</option>
                                                                {machines.map((m) => (
                                                                    <option key={m.id} value={m.name}>{m.name}</option>
                                                                ))}
                                                            </select>
                                                        </td>

                                                        {/* Media (also the board name for the UPS calc) — moved here */}
                                                        <td>
                                                            <input
                                                                type="text"
                                                                list="board-master-names"
                                                                value={item.media || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    const matched = matchBoard(val)
                                                                    const defaultSize = matched ? (matched.storingSize || (matched.sheets.length ? matched.sheets[0].name : '')) : ''
                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, media: val, sheetSize: defaultSize }) : it))
                                                                }}
                                                                className="table-cell-input"
                                                                placeholder="e.g. Art 300"
                                                            />
                                                        </td>

                                                        {/* Sheet Size */}
                                                        <td>
                                                            {(() => {
                                                                const matchedBoard = matchBoard(item.media)
                                                                const sheets = matchedBoard ? matchedBoard.sheets : []
                                                                const isPreconfigured = sheets.some(s => s.name === item.sheetSize)
                                                                const showCustomInput = !isPreconfigured || item.sheetSize === 'custom'

                                                                return (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                                        <select
                                                                            value={isPreconfigured ? (item.sheetSize || '') : 'custom'}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value
                                                                                if (val === 'custom') {
                                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sheetSize: 'custom' }) : it))
                                                                                } else {
                                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sheetSize: val }) : it))
                                                                                }
                                                                            }}
                                                                            className="table-cell-select"
                                                                        >
                                                                            <option value="" disabled>-- Select Size --</option>
                                                                            {sheets.map((s) => (
                                                                                <option key={s.id || s.name} value={s.name}>
                                                                                    {s.name} {s.qty && s.qty > 1 ? `(${s.qty} cuts)` : ''}
                                                                                </option>
                                                                            ))}
                                                                            <option value="custom">-- Custom Size --</option>
                                                                        </select>
                                                                        
                                                                        {showCustomInput && (
                                                                            <input
                                                                                type="text"
                                                                                value={item.sheetSize === 'custom' ? '' : (item.sheetSize || '')}
                                                                                onChange={(e) => {
                                                                                    const val = e.target.value
                                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sheetSize: val }) : it))
                                                                                }}
                                                                                className="table-cell-input"
                                                                                placeholder="e.g. 12*18"
                                                                                style={{ marginTop: '0.15rem' }}
                                                                            />
                                                                        )}

                                                                        {item.upsSuggestion && (
                                                                            <div
                                                                                onClick={() => {
                                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sheetSize: item.upsSuggestion!.sheetSize }) : it))
                                                                                }}
                                                                                style={{
                                                                                    fontSize: '0.68rem',
                                                                                    color: '#059669',
                                                                                    cursor: 'pointer',
                                                                                    textDecoration: 'underline',
                                                                                    fontWeight: 700,
                                                                                    display: 'inline-block',
                                                                                    whiteSpace: 'nowrap',
                                                                                    textAlign: 'center'
                                                                                }}
                                                                                title={item.upsSuggestion.text}
                                                                            >
                                                                                💡 Use {item.upsSuggestion.sheetSize}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )
                                                            })()}
                                                        </td>

                                                        {/* Type */}
                                                        <td>
                                                            <select
                                                                value={item.type || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, type: val }) : it))
                                                                }}
                                                                className="table-cell-select"
                                                            >
                                                                <option value="">-- Select Type --</option>
                                                                {KNOWN_JOB_TYPES.map((t) => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ))}
                                                                {item.type && !KNOWN_JOB_TYPES.includes(item.type) && (
                                                                    <option value={item.type}>{item.type}</option>
                                                                )}
                                                            </select>
                                                        </td>

                                                        {/* Size W */}
                                                        <td>
                                                            <input
                                                                type="text"
                                                                value={item.sizeW || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sizeW: val }) : it))
                                                                }}
                                                                className="table-cell-input text-center"
                                                                placeholder="W"
                                                            />
                                                        </td>

                                                        {/* Size H */}
                                                        <td>
                                                            <input
                                                                type="text"
                                                                value={item.sizeH || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sizeH: val }) : it))
                                                                }}
                                                                className="table-cell-input text-center"
                                                                placeholder="H"
                                                            />
                                                        </td>

                                                        {/* Size Qty */}
                                                        <td>
                                                            <input
                                                                type="text"
                                                                value={item.sizeQty || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sizeQty: val }) : it))
                                                                }}
                                                                className="table-cell-input text-center"
                                                                placeholder="Qty"
                                                            />
                                                        </td>

                                                        {/* Size Ups */}
                                                        <td>
                                                            <input
                                                                type="text"
                                                                value={item.ups || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, ups: val }) : it))
                                                                }}
                                                                className="table-cell-input text-center"
                                                                placeholder="Ups"
                                                            />
                                                            {item.upsInfo ? (
                                                                <div
                                                                    className="ups-layout-badge"
                                                                    title={`${item.upsInfo.orientation === 'rotated' ? 'Rotated' : 'Original'} orientation — ${item.upsInfo.jobsAcross} across × ${item.upsInfo.rows} rows. Click to preview layout.`}
                                                                    onClick={() => handleViewLayout(item)}
                                                                    style={{ cursor: 'pointer' }}
                                                                >
                                                                    {item.upsInfo.orientation === 'rotated' ? '⟳' : '▭'} {item.upsInfo.jobsAcross}×{item.upsInfo.rows}
                                                                </div>
                                                            ) : item.upsHint ? (
                                                                <div className="ups-hint-badge" title={item.upsHint}>{item.upsHint}</div>
                                                            ) : null}
                                                        </td>



                                                        {/* Pages */}
                                                        <td>
                                                            <input
                                                                type="text"
                                                                value={item.pages || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, pages: val }) : it))
                                                                }}
                                                                className="table-cell-input text-center"
                                                                placeholder="Pages"
                                                            />
                                                        </td>

                                                        {/* Sheets */}
                                                        <td>
                                                            <input
                                                                type="text"
                                                                value={item.sheets || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value
                                                                    setItems(prev => prev.map((it, i) => i === idx ? { ...it, sheets: val } : it))
                                                                }}
                                                                className="table-cell-input text-center"
                                                                placeholder="Sheets"
                                                            />
                                                        </td>

                                                        {/* PPA */}
                                                        <td className="text-center">
                                                            <button
                                                                type="button"
                                                                className="table-ppa-pill"
                                                                onClick={() => {
                                                                    if (!formData.jobId) { alert('Please enter a Job ID before opening the job card.'); return }
                                                                    if (!customerName) { alert('Please enter a Customer Name before opening the job card.'); return }
                                                                    setActiveRowIndexForJobCard(idx)
                                                                }}
                                                            >
                                                                job card
                                                            </button>
                                                        </td>

                                                        {/* Action */}
                                                        <td className="actions-cell-narrow">
                                                            <div className="table-actions-flex">
                                                                <button type="button" title="Delete row" onClick={() => handleDeleteRow(idx)} className="action-icon-wrapper delete">
                                                                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    title={item.screenshot ? "View screenshot" : "Upload screenshot"}
                                                                    onClick={() => {
                                                                        if (item.screenshot) {
                                                                            setViewImage(item.screenshot.startsWith('blob:') || item.screenshot.startsWith('http') ? item.screenshot : `${BACKEND_URL}/${item.screenshot.replace(/\\/g, '/')}`)
                                                                        } else {
                                                                            triggerFileInput(idx)
                                                                        }
                                                                    }}
                                                                    className={`action-icon-wrapper screenshot ${item.screenshot ? 'has-shot' : 'missing-image'}`}
                                                                >
                                                                    {item.screenshot ? (
                                                                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                                <input type="file" id={`file-input-${idx}`} accept="image/*" style={{ display: 'none' }} onChange={(e) => handleRowFileChange(idx, e.target.files)} />
                                                                <button
                                                                    type="button"
                                                                    title="Copy Folder Path"
                                                                    onClick={() => handleCopyPath(item, idx)}
                                                                    className={`action-icon-wrapper copy ${copiedRowIdx === idx ? 'copied' : ''}`}
                                                                >
                                                                    {copiedRowIdx === idx ? (
                                                                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    title="Configure Job Card"
                                                                    onClick={() => {
                                                                        if (!formData.jobId) { alert('Please enter a Job ID before opening the job card.'); return }
                                                                        if (!customerName) { alert('Please enter a Customer Name before opening the job card.'); return }
                                                                        setActiveRowIndexForJobCard(idx)
                                                                    }}
                                                                    className="action-icon-wrapper jobcard"
                                                                >
                                                                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                                    </svg>
                                                                </button>
                                                                {/* ✂ Cut toggle button */}
                                                                <button
                                                                    type="button"
                                                                    title={isCutVisible ? 'Hide Cut & Gap' : 'Show Cut & Gap'}
                                                                    onClick={() => toggleCutRow(idx)}
                                                                    className={`action-icon-wrapper cut-toggle ${isCutVisible ? 'cut-active' : ''}`}
                                                                >
                                                                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.121 14.121A3 3 0 109.88 9.88m4.242 4.242L3 21m11.121-6.879L21 3M9.879 9.879L3 3m6.879 6.879L21 21" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {(() => {
                                                         const matchedProduct = knownTypes.find(t => t.name === item.orderDescription)
                                                         const templateType = matchedProduct?.template || (item.orderDescription?.toLowerCase().includes('booklet') ? 'booklet' : 'none')
                                                         const showSubrow = isCutVisible || templateType === 'booklet'
                                                         if (!showSubrow) return null
                                                         return (
                                                             <tr className="cut-subrow">
                                                                 <td colSpan={13}>
                                                                     <div className="cut-subrow-inner" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', padding: '0.5rem 1rem' }}>
                                                                         {isCutVisible && (
                                                                             <>
                                                                                 <div className="cut-subrow-field">
                                                                                     <label className="cut-subrow-label">Cut Type</label>
                                                                                     <select
                                                                                         value={item.cutType || 'none'}
                                                                                         onChange={(e) => {
                                                                                             const val = e.target.value as CutType
                                                                                             setItems(prev => prev.map((it, i) =>
                                                                                                 i === idx ? recalcRow({ ...it, cutType: val, cutGap: val === 'none' ? '' : it.cutGap }) : it))
                                                                                         }}
                                                                                         className="table-cell-select cut-subrow-select"
                                                                                     >
                                                                                         <option value="none">No Cut</option>
                                                                                         <option value="single">Single</option>
                                                                                         <option value="double">Double</option>
                                                                                     </select>
                                                                                 </div>
                                                                                 <div className="cut-subrow-field">
                                                                                     <label className="cut-subrow-label">Gap (mm)</label>
                                                                                     <input
                                                                                         type="text"
                                                                                         value={item.cutGap || ''}
                                                                                         disabled={!item.cutType || item.cutType === 'none'}
                                                                                         onChange={(e) => {
                                                                                             const val = e.target.value
                                                                                             setItems(prev => prev.map((it, i) =>
                                                                                                 i === idx ? recalcRow({ ...it, cutGap: val }) : it))
                                                                                         }}
                                                                                         className="table-cell-input text-center cut-subrow-input"
                                                                                         placeholder="mm"
                                                                                     />
                                                                                 </div>
                                                                             </>
                                                                         )}
                                                                         {templateType === 'booklet' && (
                                                                             <>
                                                                                 <div className="cut-subrow-field">
                                                                                     <label className="cut-subrow-label">Opening Direction</label>
                                                                                     <select
                                                                                         value={item.openingDirection || 'portrait'}
                                                                                         onChange={(e) => {
                                                                                             const val = e.target.value
                                                                                             setItems(prev => prev.map((it, i) =>
                                                                                                 i === idx ? recalcRow({ ...it, openingDirection: val }) : it))
                                                                                         }}
                                                                                         className="table-cell-select cut-subrow-select"
                                                                                     >
                                                                                         <option value="portrait">Portrait</option>
                                                                                         <option value="landscape">Landscape</option>
                                                                                     </select>
                                                                                 </div>
                                                                                 <div className="cut-subrow-field">
                                                                                     <label className="cut-subrow-label">Binding Side</label>
                                                                                     <select
                                                                                         value={item.bindingSide || 'left'}
                                                                                         onChange={(e) => {
                                                                                             const val = e.target.value
                                                                                             setItems(prev => prev.map((it, i) =>
                                                                                                 i === idx ? recalcRow({ ...it, bindingSide: val }) : it))
                                                                                         }}
                                                                                         className="table-cell-select cut-subrow-select"
                                                                                     >
                                                                                         <option value="left">Left</option>
                                                                                         <option value="top">Top</option>
                                                                                     </select>
                                                                                 </div>
                                                                                 <div className="cut-subrow-field">
                                                                                     <label className="cut-subrow-label">Binding Margin (mm)</label>
                                                                                     <input
                                                                                         type="number"
                                                                                         min={0}
                                                                                         value={item.bindingMargin !== undefined ? item.bindingMargin : '10'}
                                                                                         onChange={(e) => {
                                                                                             const val = e.target.value
                                                                                             setItems(prev => prev.map((it, i) =>
                                                                                                 i === idx ? recalcRow({ ...it, bindingMargin: val }) : it))
                                                                                         }}
                                                                                         className="table-cell-input text-center cut-subrow-input"
                                                                                         placeholder="mm"
                                                                                         style={{ width: '80px' }}
                                                                                     />
                                                                                 </div>
                                                                             </>
                                                                         )}
                                                                     </div>
                                                                 </td>
                                                             </tr>
                                                         )
                                                     })()}
                                                </React.Fragment>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                <div className="table-footer-actions">
                                    <button type="button" onClick={() => {
                                        setItems(prev => {
                                            const updated = [...prev, createEmptyRow()]
                                            const newIndex = updated.length - 1
                                            setActiveRowIndex(newIndex)
                                            activeRowIndexRef.current = newIndex
                                            return updated
                                        })
                                    }} className="btn-add-table-row">
                                        + Add Row
                                    </button>
                                    {(() => {
                                        const totalMins = items.reduce((sum, it) => sum + estimateItemTime(it, timings), 0)
                                        if (totalMins <= 0) return null
                                        return (
                                            <span style={{
                                                fontSize: '0.8rem',
                                                fontWeight: 800,
                                                color: totalMins >= 1440 ? '#dc2626' : '#0f172a',
                                                marginLeft: '1rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                            }}>
                                                ⏱ Total Est. Ready: <span style={{ color: totalMins >= 1440 ? '#dc2626' : '#2563eb' }}>{formatEstimateLabel(totalMins)}</span>
                                            </span>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* Centered Submit & Cancel buttons */}
                            <div className="submit-section-supreme" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', marginBottom: '2.5rem' }}>
                                <button type="submit" disabled={loading} className="btn-submit-premium-teal">
                                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    {loading ? 'Saving...' : 'Preview Job& Generate QR code'}
                                </button>
                                <button type="button" onClick={() => navigate('/prepress')} className="btn-cancel-premium-grey">
                                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    Cancel Job
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* ── Queue job preview panel (viaMarkComplete flow) ────── */}
                    {queueJob && (
                        <div className="queue-job-preview-panel">
                            <div className="preview-panel-header">
                                <h2>Completed Queue Job</h2>
                                <span className={`preview-badge ${queueJob.type === 'WALKIN' ? 'walkin' : ''}`}>
                                    {queueJob.type === 'WALKIN' ? '🚶 Walk-in' : queueJob.type === 'WHATSAPP' ? '💬 WhatsApp' : '📧 Email'}
                                </span>
                            </div>

                            <div className="queue-preview-card">
                                <div className="preview-section">
                                    <label>Customer Name</label>
                                    <div className="preview-val name">{queueJob.customerName || searchParams.get('customerName') || 'N/A'}</div>
                                </div>

                                {(queueJob.customerEmail || queueJob.customerPhone) && (
                                    <div className="preview-section">
                                        <label>{queueJob.customerEmail ? 'Email' : 'Phone'}</label>
                                        <div className="preview-val" style={{ fontSize: '0.85rem', color: '#4b5563' }}>
                                            {queueJob.customerEmail || queueJob.customerPhone}
                                        </div>
                                    </div>
                                )}

                                <div className="preview-section">
                                    <label>Subject / Job Type</label>
                                    <div className="preview-val subject">
                                        {queueJob.emailSubject || (queueJob.type === 'WALKIN' ? '(Walk-in Job)' : 'No Subject')}
                                    </div>
                                </div>

                                <div className="preview-section">
                                    <label>Instructions / Description</label>
                                    <div className="preview-val body" style={{ whiteSpace: 'pre-wrap' }}>
                                        {queueJob.mailBody || queueJob.walkinDescription || queueJob.handoffNotes ? (
                                            <LinkifiedText text={queueJob.mailBody || queueJob.walkinDescription || queueJob.handoffNotes} />
                                        ) : 'No details provided.'}
                                    </div>
                                </div>

                                <div className="preview-timings-strip">
                                    <div className="timing-item">
                                        <span className="timing-label">📨 Received</span>
                                        <span className="timing-val">{queueJob.createdAt ? new Date(queueJob.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</span>
                                    </div>
                                    <div className="timing-item">
                                        <span className="timing-label">🧑‍💻 Assigned</span>
                                        <span className="timing-val">{queueJob.assignedAt ? new Date(queueJob.assignedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</span>
                                    </div>
                                    <div className="timing-item">
                                        <span className="timing-label">✅ Done</span>
                                        <span className="timing-val done">{queueJob.completedAt ? new Date(queueJob.completedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</span>
                                    </div>
                                </div>

                                {Array.isArray(queueJob.externalLinks) && queueJob.externalLinks.length > 0 && (
                                    <div className="preview-section">
                                        <label>Cloud Files</label>
                                        <div className="preview-links">
                                            {queueJob.externalLinks.map((link: any, i: number) => (
                                                <a key={i} href={link.url} target="_blank" rel="noreferrer" className="preview-link-item">🔗 {link.title}</a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {Array.isArray(queueJob.attachments) && queueJob.attachments.filter((f: string) => !/\.(txt|html|htm)$/i.test(f)).length > 0 && (
                                    <div className="preview-section">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                            <label style={{ margin: 0 }}>Attachments ({queueJob.attachments.filter((f: string) => !/\.(txt|html|htm)$/i.test(f)).length})</label>
                                            <button type="button" className="preview-download-all-btn"
                                                onClick={() => {
                                                    const url = `${(BACKEND_URL || '').replace(/\/$/, '')}/api/attachments/${queueJob._id}/download-all`
                                                    const cleanSubject = (queueJob.emailSubject || 'Job').replace(/[/\\?%*:|"<>]/g, '-')
                                                    downloadWithAuth(url, `${cleanSubject}.zip`)
                                                }}>
                                                ⬇ Download All
                                            </button>
                                        </div>
                                        <div className="preview-attachments">
                                            {queueJob.attachments.filter((f: string) => !/\.(txt|html|htm)$/i.test(f)).map((file: string, idx: number) => {
                                                const token = localStorage.getItem('token')
                                                const fileUrl = `${(BACKEND_URL || '').replace(/\/$/, '')}/api/queue/files/${queueJob._id}/${file}?token=${token}`
                                                const ext = file.split('.').pop()?.toLowerCase() || ''
                                                const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
                                                const isPdf = ext === 'pdf'
                                                const meta = queueJob.attachmentMeta
                                                const displayName = (meta && meta[file]) ? meta[file] : file
                                                return (
                                                    <div key={idx} className="preview-att-item" title={`Click to ${isImg ? 'preview' : 'download'}: ${displayName}`}
                                                        onClick={() => {
                                                            if (isImg) setViewImage(fileUrl)
                                                            else if (isPdf) window.open(fileUrl, '_blank')
                                                            else downloadWithAuth(fileUrl.split('?')[0], displayName)
                                                        }}>
                                                        {isImg ? (
                                                            <img src={fileUrl} alt={displayName} className="preview-att-thumb" />
                                                        ) : isPdf ? (
                                                            <div className="preview-att-placeholder pdf">
                                                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '1.5rem', height: '1.5rem', marginBottom: '0.25rem' }}>
                                                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17h8v1H8v-1zm0-3h8v1H8v-1zm0-3h5v1H8v-1z" />
                                                                </svg>
                                                                <span>PDF</span>
                                                            </div>
                                                        ) : (
                                                            <div className="preview-att-placeholder"><span>{ext.toUpperCase() || 'FILE'}</span></div>
                                                        )}
                                                        <div className="preview-att-name" title={displayName}>{displayName}</div>
                                                        <div className="preview-att-action">{isImg ? '🔍 Preview' : isPdf ? '📄 Open' : '⬇ Download'}</div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox */}
            {viewImage && (
                <div className="lightbox-modal" onClick={() => setViewImage(null)}>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <img src={viewImage} alt="Preview" className="lightbox-img" />
                        <button className="lightbox-close-btn" onClick={() => setViewImage(null)}>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Row-specific Job Card Modal */}
            {activeRowIndexForJobCard !== null && (
                <JobCardModal
                    jobData={{
                        jobId: `${formData.jobId}_${activeRowIndexForJobCard}`,
                        customerName: customerName,
                        totalItems: 1,
                        attBy: user?.name || user?.username || 'N/A',
                        date: new Date(),
                        isWalkIn: isWalkIn,
                        itemType: items[activeRowIndexForJobCard]?.type || ''
                    }}
                    onClose={() => setActiveRowIndexForJobCard(null)}
                    onSaved={(cardData: any) => {
                        const ppa = jobCardToPostPressFields(cardData)
                        const rowIdx = activeRowIndexForJobCard
                        setItems(prev => prev.map((it, i) => {
                            if (i !== rowIdx) return it
                            const merged = { ...it, ...ppa }
                            // Preserve completed statuses when the spec value hasn't changed
                            if (ppa.lamination === it.lamination) merged.laminationStatus = it.laminationStatus || 'NONE'
                            if (ppa.creasing === it.creasing) merged.creasingStatus = it.creasingStatus || 'NONE'
                            if (ppa.binding === it.binding) merged.bindingStatus = it.bindingStatus || 'NONE'
                            if (ppa.dieCutting === it.dieCutting) merged.dieCuttingStatus = it.dieCuttingStatus || 'NONE'
                            if (ppa.cornerCutting === it.cornerCutting) merged.cornerCuttingStatus = it.cornerCuttingStatus || 'NONE'
                            if (ppa.cutting === it.cutting) merged.cuttingStatus = it.cuttingStatus || 'NONE'
                            return merged
                        }))
                    }}
                />
            )}

            {activeLayout && (
                <LayoutPreviewModal
                    layout={activeLayout}
                    onClose={() => setActiveLayout(null)}
                />
            )}
        </div>
    )
}
