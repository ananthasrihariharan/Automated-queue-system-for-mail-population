import { useEffect } from 'react'
import './JobCard.css'
import './JobCardPrint.css'
import type { JobCardState } from '../hooks/useJobCardForm'
import {
    BindingSection,
    CornerCuttingSection,
    LaminationSection,
    DieCuttingSection,
    CuttingSection,
    CreasingSection
} from './JobCardSections'

interface JobCardProps {
    jobData: {
        jobId: string
        customerName: string
        totalItems: number
        attBy?: string
        date?: Date
    }
    formData: JobCardState
    setFormData: React.Dispatch<React.SetStateAction<JobCardState>>
    updateProcess: (process: string, value: boolean) => void
}

export default function JobCard({ jobData, formData, setFormData, updateProcess }: JobCardProps) {

    // const formatDate = (date?: Date) => {
    //     const d = date ? new Date(date) : new Date();
    //     return d.toLocaleString('en-GB', {
    //         day: '2-digit',
    //         month: '2-digit',
    //         year: 'numeric',
    //         hour: '2-digit',
    //         minute: '2-digit',
    //         hour12: true
    //     }).toUpperCase();
    // }

    // Handle arrow key navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (!target.matches('input')) return;

            const currentRow = parseInt(target.getAttribute('data-grid-row') || '-1');
            const currentCol = parseInt(target.getAttribute('data-grid-col') || '-1');

            if (currentRow === -1 || currentCol === -1) return;

            let nextRow = currentRow;
            let nextCol = currentCol;

            switch (e.key) {
                case 'ArrowUp':
                    nextRow--;
                    break;
                case 'ArrowDown':
                    nextRow++;
                    break;
                case 'ArrowLeft':
                    nextCol--;
                    break;
                case 'ArrowRight':
                    nextCol++;
                    break;
                default:
                    return;
            }

            // Find the closest common ancestor (section) to constraint navigation within sections if needed
            const section = target.closest('.card-section');
            if (section) {
                const nextInput = section.querySelector(`input[data-grid-row="${nextRow}"][data-grid-col="${nextCol}"]`) as HTMLElement;
                if (nextInput) {
                    e.preventDefault();
                    nextInput.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="job-card-container">
            <div className="job-card">
                {/* Header Section with Job Info */}
                <div className="job-card-header">
                    <div className='logo only-print'>
                        <div className='logo-img'> <img src="/SP-minimalist.png" alt="Siva Prints" /></div>
                        <div className='logo-text'><span>SIVA PRINTS</span></div>
                        <div className='logo-address'><span>Triplicane,Chennai</span></div>
                    </div>
                    <div className="header-row">
                        <div className="header-field">
                            <span className="field-label">JOB ID:</span>
                            <span className="field-value">{jobData.jobId}</span>
                        </div>
                        <div className="header-field">
                            <span className="field-label">CUS NAME:</span>
                            <span className="field-value">{jobData.customerName}</span>
                        </div>
                    </div>
                    <div className="header-row">
                        <div className="header-field">
                            <span className="field-label">ATT BY:</span>
                            <span className="field-value">{jobData.attBy || '_______________'}</span>
                        </div>
                        <div className="header-field">
                            <span className="field-label">TOTAL ITEMS:</span>
                            <span className="field-value">{jobData.totalItems}</span>
                        </div>
                    </div>
                    {/* Print-only selected processes summary */}
                    <div className="header-processes only-print">
                        {[
                            { key: 'cutting', label: 'CUTTING' },
                            { key: 'dieCutting', label: 'DIE CUT' },
                            { key: 'lamination', label: 'LAMINATION' },
                            { key: 'binding', label: 'BINDING' },
                            { key: 'creasing_perf', label: 'CREASING / PERF' },
                            { key: 'cornerCut', label: 'CORNER CUT' },
                            { key: 'ncBox', label: 'VC BOX' }
                        ].filter(p => {
                            if (p.key === 'creasing_perf') {
                                return formData.processes.creasing || formData.processes.perforation;
                            }
                            return (formData.processes as any)[p.key];
                        }).map(p => (
                            <span key={p.key} className="process-label-tag">{p.label}</span>
                        ))}
                    </div>
                    {/* Total Items & VC Box Row */}
                    <div className="header-row header-row-separator">
                        {formData.processes.ncBox && (
                            <div className="header-field">
                                <span className="field-label">VC BOX QTY:</span>
                                <span className="field-value">{formData.vcBox.count || '0'}</span>
                            </div>
                        )}

                    </div>
                </div>

                {/* Top Checkbox Section */}
                <div className="top-checkbox-section">
                    <label className="checkbox-item" data-checked={String(formData.processes.cutting)}>
                        <input
                            type="checkbox"
                            checked={formData.processes.cutting}
                            onChange={(e) => updateProcess('cutting', e.target.checked)}
                        />
                        <span>CUTTING</span>
                    </label>
                    <label className="checkbox-item" data-checked={String(formData.processes.dieCutting)}>
                        <input
                            type="checkbox"
                            checked={formData.processes.dieCutting}
                            onChange={(e) => updateProcess('dieCutting', e.target.checked)}
                        />
                        <span>DIE CUT</span>
                    </label>
                    <label className="checkbox-item" data-checked={String(formData.processes.lamination)}>
                        <input
                            type="checkbox"
                            checked={formData.processes.lamination}
                            onChange={(e) => updateProcess('lamination', e.target.checked)}
                        />
                        <span>LAMINATION</span>
                    </label>

                    <label className="checkbox-item" data-checked={String(formData.processes.binding)}>
                        <input
                            type="checkbox"
                            checked={formData.processes.binding}
                            onChange={(e) => updateProcess('binding', e.target.checked)}
                        />
                        <span>BINDING</span>
                    </label>
                    <div className="vc-box-wrapper" data-checked={String(formData.processes.ncBox)}>
                        <label className="checkbox-item" data-checked={String(formData.processes.ncBox)}>
                            <input
                                type="checkbox"
                                checked={formData.processes.ncBox}
                                onChange={(e) => updateProcess('ncBox', e.target.checked)}
                            />
                            <span>VC BOX</span>
                        </label>
                        {formData.processes.ncBox && (
                            <input
                                type="text"
                                className="field-input-box-sm-inline"
                                placeholder="Qty"
                                value={formData.vcBox.count}
                                onChange={(e) => setFormData(formData => ({
                                    ...formData,
                                    vcBox: { count: e.target.value },
                                    processes: { ...formData.processes, ncBox: true }
                                }))}
                            />
                        )}
                    </div>
                    <label className="checkbox-item" data-checked={String(formData.processes.creasing || formData.processes.perforation)}>
                        <input
                            type="checkbox"
                            checked={formData.processes.creasing || formData.processes.perforation}
                            onChange={(e) => {
                                updateProcess('creasing', e.target.checked);
                                updateProcess('perforation', e.target.checked);
                            }}
                        />
                        <span>CREASING / PERF</span>
                    </label>
                    <label className="checkbox-item" data-checked={String(formData.processes.cornerCut)}>
                        <input
                            type="checkbox"
                            checked={formData.processes.cornerCut}
                            onChange={(e) => updateProcess('cornerCut', e.target.checked)}
                        />
                        <span>CORNER CUT</span>
                    </label>
                </div>

                {/* Main Grid Layout */}
                <div className="job-card-grid">
                    {/* ROW 1: Binding + Lamination */}
                    <div className={`grid-row-pair ${formData.processes.binding && !formData.processes.lamination ? 'expand-left' : ''
                        } ${!formData.processes.binding && formData.processes.lamination ? 'expand-right' : ''
                        }`}>
                        <BindingSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} />
                        <LaminationSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} />
                    </div>

                    {/* ROW 2: Creasing + Die Cutting */}
                    <div className={`grid-row-pair ${(formData.processes.creasing || formData.processes.perforation) && !formData.processes.dieCutting ? 'expand-left' : ''
                        } ${!(formData.processes.creasing || formData.processes.perforation) && formData.processes.dieCutting ? 'expand-right' : ''
                        }`}>
                        <CreasingSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} />
                        <DieCuttingSection
                            jobData={jobData}
                            customerName={jobData.customerName}
                            formData={formData}
                            setFormData={setFormData}
                        />
                    </div>

                    {/* ROW 3: Cutting + Corner Cutting */}
                    <div className={`grid-row-pair ${formData.processes.cutting && !formData.processes.cornerCut ? 'expand-left' : ''
                        } ${!formData.processes.cutting && formData.processes.cornerCut ? 'expand-right' : ''
                        }`}>
                        <CuttingSection
                            jobData={jobData}
                            customerName={jobData.customerName}
                            formData={formData}
                            setFormData={setFormData}
                        />
                        <CornerCuttingSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} />
                    </div>
                </div>
            </div>
        </div>
    )
}
