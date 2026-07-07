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
    CreasingSection,
    IdCardSection,
    FoilSection
} from './JobCardSections'

interface JobCardProps {
    jobData: {
        jobId: string
        customerName: string
        totalItems: number
        attBy?: string
        date?: Date
        isWalkIn?: boolean
    }
    formData: JobCardState
    setFormData: React.Dispatch<React.SetStateAction<JobCardState>>
    updateProcess: (process: string, value: boolean) => void
    registry?: any
}

export default function JobCard({ jobData, formData, setFormData, updateProcess, registry }: JobCardProps) {

    // Handle arrow key navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (!target.matches('input, textarea')) return;

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

            const nextInput = document.querySelector(
                `[data-grid-row="${nextRow}"][data-grid-col="${nextCol}"]`
            ) as HTMLInputElement;

            if (nextInput) {
                nextInput.focus();
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const customSteps = [
        ...(registry?.postPressStages || []),
        ...(registry?.finishingStages || [])
    ].map(step => typeof step === 'string' ? step : step.key);

    const defaultStages = [
        'lamination', 'foil', 'binding', 'fusing', 'holes',
        'cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2'
    ];

    const independentSteps = customSteps.filter(stepName => {
        if (defaultStages.includes(stepName)) return false;
        const basis = registry?.taskBasis?.[stepName] || 'independent';
        return basis === 'independent';
    });

    return (
        <div className="job-card-form-wrapper">
            <div className="job-card-a4-page">
                {/* Job Card Header */}
                <div className="job-card-header">
                    <div className='logo only-print'>
                        <div className='logo-img'> <img src="/SP-minimalist.png" alt="Siva Prints" /></div>
                        <div className='logo-text'><span>SIVA PRINTS</span></div>
                        <div className='logo-address'><span>Triplicane,Chennai</span></div>
                    </div>
                    <div className="header-row">
                        <div className="header-field header-id-row">
                            <span className="field-label">JOB ID:</span>
                            <span className="field-value">{jobData.jobId}</span>
                            {jobData.isWalkIn && (
                                <span className="walk-in-badge-inline">
                                    WALK-IN
                                </span>
                            )}
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
                            { key: 'foil', label: 'FOIL' },
                            { key: 'binding', label: 'BINDING' },
                            { key: 'creasing_perf', label: 'CREASING / PERF' },
                            { key: 'cornerCut', label: 'CORNER CUT' },
                            { key: 'ncBox', label: 'VC BOX' },
                            { key: 'idCard', label: 'ID CARD' },
                            ...independentSteps.map(stepName => ({
                                key: stepName,
                                label: stepName.replace(/([A-Z])/g, ' $1').toUpperCase()
                            }))
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
                    <label className="checkbox-item" data-checked={String(formData.processes.foil)}>
                        <input
                            type="checkbox"
                            checked={formData.processes.foil}
                            onChange={(e) => updateProcess('foil', e.target.checked)}
                        />
                        <span>FOIL</span>
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
                                // When unchecking, also reset all sub-checkboxes so the section hides
                                if (!e.target.checked) {
                                    setFormData(prev => ({
                                        ...prev,
                                        creasingPerforation: {
                                            ...prev.creasingPerforation,
                                            creasing: false,
                                            perforation: false,
                                            wheelPerforation: false,
                                        }
                                    }))
                                }
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
                    <label className="checkbox-item checkbox-item--idcard" data-checked={String(formData.processes.idCard)}>
                        <input
                            type="checkbox"
                            checked={formData.processes.idCard}
                            onChange={(e) => updateProcess('idCard', e.target.checked)}
                        />
                        <span>ID CARD</span>
                    </label>
                    
                    {independentSteps.map(stepName => {
                        const displayName = stepName.replace(/([A-Z])/g, ' $1').toUpperCase();
                        return (
                            <label key={stepName} className="checkbox-item" data-checked={String((formData.processes as any)[stepName])}>
                                <input
                                    type="checkbox"
                                    checked={!!(formData.processes as any)[stepName]}
                                    onChange={(e) => updateProcess(stepName, e.target.checked)}
                                />
                                <span>{displayName}</span>
                            </label>
                        );
                    })}
                </div>

                {/* Main Grid Layout — sections render only when their process is checked */}
                <div className="job-card-grid">
                    {formData.processes.lamination && (
                        <LaminationSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} registry={registry} />
                    )}
                    {formData.processes.foil && (
                        <FoilSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} />
                    )}
                    {formData.processes.binding && (
                        <BindingSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} registry={registry} />
                    )}
                    {(formData.processes.creasing || formData.processes.perforation) && (
                        <CreasingSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} registry={registry} />
                    )}
                    {formData.processes.cutting && (
                        <CuttingSection
                            jobData={jobData}
                            customerName={jobData.customerName}
                            formData={formData}
                            setFormData={setFormData}
                        />
                    )}
                    {formData.processes.dieCutting && (
                        <DieCuttingSection
                            jobData={jobData}
                            customerName={jobData.customerName}
                            formData={formData}
                            setFormData={setFormData}
                            registry={registry}
                        />
                    )}
                    {formData.processes.cornerCut && (
                        <CornerCuttingSection jobData={jobData} customerName={jobData.customerName} formData={formData} setFormData={setFormData} />
                    )}
                    {formData.processes.idCard && (
                        <IdCardSection
                            jobData={jobData}
                            customerName={jobData.customerName}
                            formData={formData}
                            setFormData={setFormData}
                        />
                    )}
                    
                    {independentSteps.map(stepName => {
                        const displayName = stepName.replace(/([A-Z])/g, ' $1').toUpperCase();
                        const isChecked = !!(formData.processes as any)[stepName];
                        if (!isChecked) return null;
                        const stepData = (formData as any)[stepName] || { qty: '', details: '' };
                        
                        return (
                            <div key={stepName} className="card-section" data-checked="true">
                                <div className="section-header">{displayName}</div>
                                <div className="section-identifiers">
                                    <div className="identifier-fields-stack">
                                        <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                                        <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                                        <span className="identifier-field only-print">C.NAME: {jobData.customerName}</span>
                                    </div>
                                    <div className="section-qr-code only-print">QR</div>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', minWidth: '80px' }}>QTY:</span>
                                        <input
                                            type="text"
                                            className="field-input-inline nav-input"
                                            placeholder="Enter quantity"
                                            value={stepData.qty || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    [stepName]: { ...((prev as any)[stepName] || {}), qty: val }
                                                }));
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>SPECIFICATIONS / DETAILS:</span>
                                        <textarea
                                            className="field-input nav-input"
                                            style={{ minHeight: '60px', padding: '0.35rem 0.5rem', fontFamily: 'inherit', fontSize: '0.8rem', resize: 'vertical' }}
                                            placeholder="Enter process details..."
                                            value={stepData.details || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    [stepName]: { ...((prev as any)[stepName] || {}), details: val }
                                                }));
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    )
}
