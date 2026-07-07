import React from 'react';
import { BindingRow, LaminationRow } from './JobCardCommon';
import './CornerCheckboxes.css'; /* Isolated styles for corner checkboxes */
import type { JobCardState } from '../hooks/useJobCardForm';

interface SectionProps {
    jobData: { jobId: string; date?: Date; attBy?: string };
    customerName: string;
    formData: JobCardState;
    setFormData: React.Dispatch<React.SetStateAction<JobCardState>>;
    isPrint?: boolean;
    registry?: any;
}

// Helper to format date
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
// };

export const BindingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData, registry }) => {
    const customSteps = [
        ...(registry?.postPressStages || []),
        ...(registry?.finishingStages || [])
    ].map((step: any) => typeof step === 'string' ? step : step.key);

    const customBindings = customSteps.filter((stepName: string) => {
        return registry?.taskBasis?.[stepName] === 'binding';
    });

    return (
        <div className="card-section" data-checked={formData.processes.binding}>
            <div className="section-header">BINDING</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>

            <BindingRow
                label="CENTER PIN"
                isChecked={formData.binding.centerPin}
                onChange={(checked) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, centerPin: checked },
                    processes: { ...prev.processes, binding: true }
                }))}
                qty={formData.binding.centerPinQty}
                onQtyChange={(val) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, centerPinQty: val },
                    processes: { ...prev.processes, binding: true }
                }))}
                rowIndex={0}
            />
            {/* ... other binding rows would go here, duplicated for brevity in this initial split */}
            <BindingRow
                label="PERFECT BINDING"
                isChecked={formData.binding.perfect}
                onChange={(checked) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, perfect: checked },
                    processes: { ...prev.processes, binding: true }
                }))}
                qty={formData.binding.perfectQty}
                onQtyChange={(val) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, perfectQty: val },
                    processes: { ...prev.processes, binding: true }
                }))}
                rowIndex={1}
            />
            <BindingRow
                label="CASE BINDING"
                isChecked={formData.binding.caseBinding}
                onChange={(checked) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, caseBinding: checked },
                    processes: { ...prev.processes, binding: true }
                }))}
                qty={formData.binding.caseBindingQty}
                onQtyChange={(val) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, caseBindingQty: val },
                    processes: { ...prev.processes, binding: true }
                }))}
                rowIndex={2}
            />
            <BindingRow
                label="WIRO BINDING"
                isChecked={formData.binding.wiroBinding}
                onChange={(checked) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, wiroBinding: checked },
                    processes: { ...prev.processes, binding: true }
                }))}
                qty={formData.binding.wiroBindingQty}
                onQtyChange={(val) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, wiroBindingQty: val },
                    processes: { ...prev.processes, binding: true }
                }))}
                rowIndex={3}
            />
            <BindingRow
                label="POUCH LAMINATION"
                isChecked={formData.binding.pouchLamination}
                onChange={(checked) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, pouchLamination: checked },
                    processes: { ...prev.processes, binding: true }
                }))}
                qty={formData.binding.pouchLaminationQty}
                onQtyChange={(val) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, pouchLaminationQty: val },
                    processes: { ...prev.processes, binding: true }
                }))}
                rowIndex={4}
            />

            {customBindings.map((stepName, index) => {
                const displayName = stepName.replace(/([A-Z])/g, ' $1').toUpperCase();
                const isChecked = !!(formData.binding as any)[stepName];
                const qty = (formData.binding as any)[`${stepName}Qty`] || '';

                return (
                    <BindingRow
                        key={stepName}
                        label={displayName}
                        isChecked={isChecked}
                        onChange={(checked) => setFormData(prev => ({
                            ...prev,
                            binding: { ...prev.binding, [stepName]: checked },
                            processes: { ...prev.processes, binding: true }
                        }))}
                        qty={qty}
                        onQtyChange={(val) => setFormData(prev => ({
                            ...prev,
                            binding: { ...prev.binding, [`${stepName}Qty`]: val },
                            processes: { ...prev.processes, binding: true }
                        }))}
                        rowIndex={5 + index}
                    />
                );
            })}

            {/* SPECIAL — with free-text description input like Lamination Other */}
            <div className="binding-type-row-wrapper" data-row-checked={formData.binding.special}>
                <div className="binding-type-row creasing-item">
                    <label className="checkbox-item-sm">
                        <input
                            type="checkbox"
                            checked={formData.binding.special}
                            onChange={(e) => setFormData(prev => ({
                                ...prev,
                                binding: { ...prev.binding, special: e.target.checked, specialDesc: e.target.checked ? prev.binding.specialDesc : '', specialQty: e.target.checked ? prev.binding.specialQty : '' },
                                processes: { ...prev.processes, binding: e.target.checked }
                            }))}
                            data-grid-row={5}
                            data-grid-col={0}
                            style={{ display: 'none' }}
                        />
                        <span>SPECIAL</span>
                    </label>
                    <span className="field-label-sm" style={{ marginLeft: '4px', marginRight: '1px' }}>NO:</span>
                    <input
                        type="text"
                        className="field-input-box-sm-inline nav-input"
                        placeholder="-"
                        value={formData.binding.specialQty}
                        onChange={(e) => {
                            const val = e.target.value;
                            setFormData(prev => ({
                                ...prev,
                                binding: { ...prev.binding, specialQty: val, special: val.trim() !== '' || prev.binding.specialDesc.trim() !== '' },
                                processes: { ...prev.processes, binding: true }
                            }));
                        }}
                        data-grid-row={5}
                        data-grid-col={1}
                    />
                </div>
                {formData.binding.special && (
                    <div className="binding-special-details" style={{ padding: '0 0.5rem 0.5rem 0.5rem' }}>
                        <input
                            type="text"
                            className="field-input-inline nav-input"
                            placeholder="Specify type..."
                            value={formData.binding.specialDesc || ''}
                            onChange={(e) => setFormData(prev => ({
                                ...prev,
                                binding: { ...prev.binding, specialDesc: e.target.value, special: true },
                                processes: { ...prev.processes, binding: true }
                            }))}
                            data-grid-row={5}
                            data-grid-col={2}
                            style={{ width: '100%', marginTop: '0.25rem' }}
                        />
                    </div>
                )}
            </div>

        </div>
    );
};

export const CornerCuttingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
    const noOfCardsRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        const timer = setTimeout(() => {
            const input = noOfCardsRef.current
            if (input) {
                input.focus()
                input.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className="card-section" data-checked={formData.processes.cornerCut}>
            <div className="section-header">CORNER CUTTING</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>
            <div className="field-row no-print-row no-print">
                <span className="field-label-sm no-print">NO OF CARDS</span>
                <input
                    ref={noOfCardsRef}
                    type="text"
                    className="field-input-inline no-print corner-qty-input"
                    value={formData.cornerCutting.noOfCards}
                    onChange={(e) => setFormData(prev => ({
                        ...prev,
                        cornerCutting: { ...prev.cornerCutting, noOfCards: e.target.value },
                        processes: { ...prev.processes, cornerCut: true }
                    }))}
                />
                <label className="checkbox-item-sm corner-label-all" style={{ marginLeft: '10px' }}>
                    <input
                        type="checkbox"
                        checked={Object.values(formData.cornerCutting.corners).every(Boolean)}
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setFormData(prev => ({
                                ...prev,
                                cornerCutting: {
                                    ...prev.cornerCutting,
                                    corners: {
                                        tl: checked,
                                        tr: checked,
                                        bl: checked,
                                        br: checked
                                    }
                                },
                                processes: { ...prev.processes, cornerCut: true }
                            }));
                        }}
                    />
                    <span>All Sides</span>
                </label>
            </div>

            <div className="corner-diagram">
                <div className="corner-label">CORNER SIDE</div>
                <div className={`corner-box 
                    ${formData.cornerCutting.corners.tl ? 'cut-tl' : ''} 
                    ${formData.cornerCutting.corners.tr ? 'cut-tr' : ''} 
                    ${formData.cornerCutting.corners.bl ? 'cut-bl' : ''} 
                    ${formData.cornerCutting.corners.br ? 'cut-br' : ''}
                `}>
                    <div className="corner-qty-display">{formData.cornerCutting.noOfCards}</div>
                    {Object.keys(formData.cornerCutting.corners).map((corner) => (
                        <React.Fragment key={corner}>
                            <div className={`corner-checkbox-wrapper corner-${corner} ${(formData.cornerCutting.corners as any)[corner] ? 'checked-state' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={(formData.cornerCutting.corners as any)[corner]}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        cornerCutting: {
                                            ...prev.cornerCutting,
                                            corners: { ...prev.cornerCutting.corners, [corner]: e.target.checked }
                                        },
                                        processes: { ...prev.processes, cornerCut: true }
                                    }))}
                                />
                                <span className="custom-checkbox-visual" />
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const LaminationSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData, registry }) => {
    const customSteps = [
        ...(registry?.postPressStages || []),
        ...(registry?.finishingStages || [])
    ].map((step: any) => typeof step === 'string' ? step : step.key);

    const customLaminationSteps = customSteps.filter((stepName: string) => {
        return registry?.taskBasis?.[stepName] === 'lamination';
    });

    const laminationTypes = ['glossy', 'matt', 'velvet', ...customLaminationSteps];

    return (
        <div className="card-section" data-checked={formData.processes.lamination}>
            <div className="section-header">LAMINATION</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>

            {
                laminationTypes.map((type, i) => (
                    <LaminationRow
                        key={type}
                        label={type.charAt(0).toUpperCase() + type.slice(1)}
                        isChecked={!!(formData.lamination as any)[type]}
                        onChange={(checked) => setFormData(prev => ({
                            ...prev,
                            lamination: { ...prev.lamination, [type]: checked },
                            processes: { ...prev.processes, lamination: true }
                        }))}
                        qty={(formData.lamination as any)[`${type}Qty`]}
                        onQtyChange={(val) => setFormData(prev => ({
                            ...prev,
                            lamination: { ...prev.lamination, [`${type}Qty`]: val },
                            processes: { ...prev.processes, lamination: true }
                        }))}
                        side={(formData.lamination as any)[`${type}Side`]}
                        onSideChange={(val) => setFormData(prev => ({
                            ...prev,
                            lamination: { ...prev.lamination, [`${type}Side`]: val },
                            processes: { ...prev.processes, lamination: true }
                        }))}
                        rowIndex={i}
                    />
                ))
            }

            {/* Other - Custom Lamination Type */}
            <div className="lamination-type-row" data-row-checked={formData.lamination.other}>
                <label className="checkbox-item-sm" style={{ flexShrink: 0 }}>
                    <input
                        type="checkbox"
                        checked={formData.lamination.other}
                        onChange={(e) => setFormData(prev => ({
                            ...prev,
                            lamination: { ...prev.lamination, other: e.target.checked },
                            processes: { ...prev.processes, lamination: true }
                        }))}
                        data-grid-row={3}
                        data-grid-col="0"
                        className="nav-input"
                    />
                    <span className="no-print">Other</span>
                </label>
                {formData.lamination.other && (
                    <div className="lamination-details" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                        <div className="field-row">
                            <input
                                type="text"
                                className="field-input-inline nav-input"
                                placeholder="Specify type..."
                                value={formData.lamination.otherType || ''}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    lamination: { ...prev.lamination, otherType: e.target.value, other: true },
                                    processes: { ...prev.processes, lamination: true }
                                }))}
                                data-grid-row={3}
                                data-grid-col="1"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div className="field-row">
                            <input
                                type="text"
                                className="field-input-inline nav-input"
                                placeholder="Qty"
                                value={formData.lamination.otherQty}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    lamination: { ...prev.lamination, otherQty: e.target.value },
                                    processes: { ...prev.processes, lamination: true }
                                }))}
                                data-grid-row={3}
                                data-grid-col="2"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div className={`side-selection side-${formData.lamination.otherSide || 'none'}`} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <label className={`radio-item-sm ${formData.lamination.otherSide === 'single' ? 'is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    checked={formData.lamination.otherSide === 'single'}
                                    onChange={() => setFormData(prev => ({
                                        ...prev,
                                        lamination: { ...prev.lamination, otherSide: 'single' },
                                        processes: { ...prev.processes, lamination: true }
                                    }))}
                                    data-grid-row={3}
                                    data-grid-col="3"
                                    className="nav-input"
                                />
                                <span>Single Side</span>
                            </label>
                            <label className={`radio-item-sm ${formData.lamination.otherSide === 'double' ? 'is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    checked={formData.lamination.otherSide === 'double'}
                                    onChange={() => setFormData(prev => ({
                                        ...prev,
                                        lamination: { ...prev.lamination, otherSide: 'double' },
                                        processes: { ...prev.processes, lamination: true }
                                    }))}
                                    data-grid-row={3}
                                    data-grid-col="4"
                                    className="nav-input"
                                />
                                <span>Double Side</span>
                            </label>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
};

export const CreasingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData, registry }) => {
    const noOfSheetsRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        const timer = setTimeout(() => {
            const input = noOfSheetsRef.current
            if (input) {
                input.focus()
                input.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [])

    const customSteps = [
        ...(registry?.postPressStages || []),
        ...(registry?.finishingStages || [])
    ].map((step: any) => typeof step === 'string' ? step : step.key);

    const customCreaseSteps = customSteps.filter((stepName: string) => {
        return registry?.taskBasis?.[stepName] === 'creasing';
    });

    return (
        <div className="card-section" data-checked={formData.processes.creasing || formData.processes.perforation}>
            <div className="section-header">CREASING / PERF</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                    {formData.creasingPerforation.noOfSheets && (
                        <span className="identifier-field only-print">SHEETS: {formData.creasingPerforation.noOfSheets}</span>
                    )}
                    {formData.creasingPerforation.noOfStock && (
                        <span className="identifier-field only-print">STOCK: {formData.creasingPerforation.noOfStock}</span>
                    )}
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>
            <div className="field-row no-print-row no-print">
                <span className="field-label-sm">NO OF SHEETS</span>
                <input
                    ref={noOfSheetsRef}
                    type="text"
                    className="field-input-inline"
                    value={formData.creasingPerforation.noOfSheets}
                    onChange={(e) => setFormData(prev => ({
                        ...prev,
                        creasingPerforation: { ...prev.creasingPerforation, noOfSheets: e.target.value },
                        processes: { ...prev.processes, creasing: true }
                    }))}
                />
            </div>


            <div className="creasing-grid">
                {[
                    { key: 'creasing', label: 'CREASING', noKey: 'creasingNo', proc: 'creasing' },
                    { key: 'perforation', label: 'PERFORATION', noKey: 'perforationNo', proc: 'perforation' },
                    { key: 'wheelPerforation', label: 'WHEEL PERFORATION', noKey: 'wheelPerforationNo', proc: 'perforation' },
                    ...customCreaseSteps.map(step => ({
                        key: step,
                        label: step.replace(/([A-Z])/g, ' $1').toUpperCase(),
                        noKey: `${step}No`,
                        proc: 'creasing'
                    }))
                ].map((item) => (
                    <div className="creasing-item" key={item.key} data-row-checked={(formData.creasingPerforation as any)[item.key] || !!((formData.creasingPerforation as any)[item.noKey]?.trim())}>
                        <label className="checkbox-item-sm">
                            <input
                                type="checkbox"
                                checked={(formData.creasingPerforation as any)[item.key]}
                                onChange={(e) => setFormData(prev => {
                                    const updatedCp = { ...prev.creasingPerforation, [item.key]: e.target.checked }
                                    const creasingActive = updatedCp.creasing || customCreaseSteps.some(s => (updatedCp as any)[s])
                                    const perforationActive = updatedCp.perforation || updatedCp.wheelPerforation
                                    return {
                                        ...prev,
                                        creasingPerforation: updatedCp,
                                        processes: {
                                            ...prev.processes,
                                            creasing: item.proc === 'creasing' ? creasingActive : prev.processes.creasing,
                                            perforation: item.proc === 'perforation' ? perforationActive : prev.processes.perforation,
                                        }
                                    }
                                })}
                                style={{ display: 'none' }}
                            />
                            <span>{item.label}</span>
                        </label>
                        <span className="field-label-sm" style={{ marginLeft: '4mm', marginRight: '1mm' }}>NO:</span>
                        <input
                            type="text"
                            className="field-input-box-sm-inline nav-input"
                            placeholder="-"
                            value={(formData.creasingPerforation as any)[item.noKey]}
                            onChange={(e) => {
                                const val = e.target.value
                                const shouldCheck = val.trim() !== ''
                                setFormData(prev => {
                                    const updatedCp = {
                                        ...prev.creasingPerforation,
                                        [item.noKey]: val,
                                        // auto-check when typing, auto-uncheck when cleared
                                        [item.key]: shouldCheck ? true : (prev.creasingPerforation as any)[item.key],
                                    }
                                    const creasingActive = updatedCp.creasing || customCreaseSteps.some(s => (updatedCp as any)[s])
                                    const perforationActive = updatedCp.perforation || updatedCp.wheelPerforation
                                    return {
                                        ...prev,
                                        creasingPerforation: updatedCp,
                                        processes: {
                                            ...prev.processes,
                                            creasing: item.proc === 'creasing' ? creasingActive : prev.processes.creasing,
                                            perforation: item.proc === 'perforation' ? perforationActive : prev.processes.perforation,
                                        }
                                    }
                                })
                            }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};



export const DieCuttingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData, registry }) => {
    const sheetsInputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        const timer = setTimeout(() => {
            const input = sheetsInputRef.current
            if (input) {
                input.focus()
                input.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [])

    const customSteps = [
        ...(registry?.postPressStages || []),
        ...(registry?.finishingStages || [])
    ].map((step: any) => typeof step === 'string' ? step : step.key);

    const customDieCutSteps = customSteps.filter((stepName: string) => {
        return registry?.taskBasis?.[stepName] === 'dieCutting';
    });

    const rowItems = [
        { key: 'default', label: 'DEFAULT' },
        ...customDieCutSteps.map(s => ({ key: s, label: s.replace(/([A-Z])/g, ' $1').toUpperCase() }))
    ];

    return (
        <div className="card-section" data-checked={formData.processes.dieCutting}>
            <div className="section-header">DIE CUTTING</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>
            <div className="die-cutting-table">
                <div className="die-table-header">
                    <div className="die-table-cell">PROCESS</div>
                    <div className="die-table-cell">SHEETS</div>
                    <div className="die-table-cell">CUT</div>
                    <div className="die-table-cell">TIMING</div>
                </div>
                {rowItems.map((item, i) => {
                    // Ensure formData has enough rows
                    const row = formData.dieCutting.rows[i] || { sheets: '', halfCut: '', throughCut: '', timing: '' };
                    const hasData = row.sheets || row.halfCut || row.throughCut || row.timing;

                    return (
                        <div key={item.key} className="die-table-row" data-has-content={!!hasData}>
                            {/* Column 0: Label */}
                            <div className="die-table-cell" style={{ fontWeight: 700, fontSize: '0.7rem', color: '#475569', textTransform: 'capitalize', display: 'flex', alignItems: 'center' }}>
                                {item.label}
                            </div>

                            {/* Column 1: Sheets */}
                            <div className="die-table-cell">
                                <input
                                    ref={i === 0 ? sheetsInputRef : undefined}
                                    type="text"
                                    className="table-input"
                                    placeholder="-"
                                    value={row.sheets}
                                    onChange={(e) => {
                                        const newRows = [...formData.dieCutting.rows];
                                        while (newRows.length <= i) {
                                            newRows.push({ sheets: '', halfCut: '', throughCut: '', timing: '' });
                                        }
                                        newRows[i] = { ...newRows[i], sheets: e.target.value };
                                        setFormData(prev => ({
                                            ...prev,
                                            dieCutting: { ...prev.dieCutting, rows: newRows },
                                            processes: { ...prev.processes, dieCutting: true }
                                        }));
                                    }}
                                    data-grid-row={i}
                                    data-grid-col={0}
                                />
                            </div>

                            {/* Column 2: Cut Type (Stored in halfCut field) */}
                            <div className="die-table-cell">
                                <select
                                    className="table-input"
                                    value={row.halfCut}
                                    onChange={(e) => {
                                        const newRows = [...formData.dieCutting.rows];
                                        while (newRows.length <= i) {
                                            newRows.push({ sheets: '', halfCut: '', throughCut: '', timing: '' });
                                        }
                                        newRows[i] = { ...newRows[i], halfCut: e.target.value };
                                        setFormData(prev => ({
                                            ...prev,
                                            dieCutting: { ...prev.dieCutting, rows: newRows },
                                            processes: { ...prev.processes, dieCutting: true }
                                        }));
                                    }}
                                    data-grid-row={i}
                                    data-grid-col={1}
                                >
                                    <option value="">-</option>
                                    <option value="HALF CUT">HALF CUT</option>
                                    <option value="THROUGH CUT">THROUGH CUT</option>
                                    <option value="SHAPE CUT">SCORING</option>
                                </select>
                            </div>

                            {/* Column 3: Timing */}
                            <div className="die-table-cell">
                                <input
                                    type="text"
                                    className="table-input"
                                    placeholder="-"
                                    value={row.timing}
                                    onChange={(e) => {
                                        const newRows = [...formData.dieCutting.rows];
                                        while (newRows.length <= i) {
                                            newRows.push({ sheets: '', halfCut: '', throughCut: '', timing: '' });
                                        }
                                        newRows[i] = { ...newRows[i], timing: e.target.value };
                                        setFormData(prev => ({
                                            ...prev,
                                            dieCutting: { ...prev.dieCutting, rows: newRows },
                                            processes: { ...prev.processes, dieCutting: true }
                                        }));
                                    }}
                                    data-grid-row={i}
                                    data-grid-col={2}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


export const CuttingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
    const heightInputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        // Wait for modal open animation + all click events to fully settle before grabbing focus
        const timer = setTimeout(() => {
            const input = heightInputRef.current
            if (input) {
                input.focus()
                input.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className="card-section" data-checked={formData.processes.cutting}>
            <div className="section-header">CUTTING</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>

            <div className="cutting-grid">
                {/* No. of Cutting — inline row above the H/W grid */}
                <div className="cutting-no-row">
                    <span className="field-label-sm">NO. OF CUTTING</span>
                    <input
                        type="text"
                        className="field-input-box-sm-inline nav-input"
                        placeholder="-"
                        tabIndex={3}
                        value={formData.cutting.noOfCutting}
                        onChange={(e) => setFormData(prev => ({
                            ...prev,
                            cutting: { ...prev.cutting, noOfCutting: e.target.value },
                            processes: { ...prev.processes, cutting: true }
                        }))}
                    />
                </div>
                {/* H × W header */}
                <div className="cutting-grid-header cutting-grid-header--single">
                    <div className="cutting-grid-cell">H</div>
                    <div className="cutting-grid-cell">W</div>
                </div>
                {/* Single slot — one H×W measurement */}
                {Array.from({ length: 1 }).map((_, rowIndex) => {
                    const index = rowIndex;
                    const size = formData.cutting.sizes[index] || '';
                    const [h, w] = size.split('*').map(v => v.trim());
                    const hasData = !!(h || w);

                    return (
                        <div key={rowIndex} className="cutting-grid-row cutting-grid-row--single" data-has-content={!!hasData}>
                            <div className="cutting-grid-cell">
                                <input
                                    ref={heightInputRef}
                                    type="text"
                                    className="grid-input"
                                    placeholder="00"
                                    tabIndex={1}
                                    value={h || ''}
                                    onChange={(e) => {
                                        const newSizes = [...formData.cutting.sizes];
                                        while (newSizes.length <= index) newSizes.push('');
                                        newSizes[index] = `${e.target.value}*${w || ''}`;
                                        setFormData(prev => ({
                                            ...prev,
                                            cutting: { ...prev.cutting, sizes: newSizes },
                                            processes: { ...prev.processes, cutting: true }
                                        }));
                                    }}
                                    data-grid-row={rowIndex}
                                    data-grid-col={0}
                                />
                            </div>
                            <div className="cutting-grid-cell">
                                <input
                                    type="text"
                                    className="grid-input"
                                    placeholder="00"
                                    tabIndex={2}
                                    value={w || ''}
                                    onChange={(e) => {
                                        const newSizes = [...formData.cutting.sizes];
                                        while (newSizes.length <= index) newSizes.push('');
                                        newSizes[index] = `${h || ''}*${e.target.value}`;
                                        setFormData(prev => ({
                                            ...prev,
                                            cutting: { ...prev.cutting, sizes: newSizes },
                                            processes: { ...prev.processes, cutting: true }
                                        }));
                                    }}
                                    data-grid-row={rowIndex}
                                    data-grid-col={1}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const IdCardSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
    const idCard = formData.idCard || {
        cutting: false,
        fusing: false,
        cornerCutting: false,
        holes: false,
        fusingType: 'glossy',
        fusingQty: '',
        holesType: 'square',
        cuttingValue: ''
    };

    const updateIdCard = (fields: Partial<typeof idCard>) => {
        setFormData(prev => ({
            ...prev,
            idCard: {
                ...(prev.idCard || idCard),
                ...fields
            },
            processes: { ...prev.processes, idCard: true }
        }));
    };

    return (
        <div className="card-section" data-checked={formData.processes.idCard}>
            <div className="section-header">ID CARD</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>

            <div className="idcard-flow-options">
                {/* Fusing Option */}
                <div className="idcard-option-row" data-row-checked={idCard.fusing}>
                    <label className="checkbox-item-sm">
                        <input
                            type="checkbox"
                            checked={idCard.fusing}
                            onChange={(e) => updateIdCard({ fusing: e.target.checked })}
                        />
                        <span>FUSING</span>
                    </label>
                    {idCard.fusing && (
                        <div className="idcard-sub-fields">
                            <span className="field-label-sm">TYPE:</span>
                            <select
                                className="field-input-inline nav-input"
                                value={idCard.fusingType || 'glossy'}
                                onChange={(e) => updateIdCard({ fusingType: e.target.value })}
                            >
                                <option value="glossy">GLOSSY</option>
                                <option value="matt">MATT</option>
                                <option value="thick glossy">THICK GLOSSY</option>
                                <option value="thick matt">THICK MATT</option>
                            </select>
                            <span className="field-label-sm" style={{ marginLeft: '10px' }}>QTY:</span>
                            <input
                                type="text"
                                className="field-input-box-sm-inline nav-input"
                                placeholder="Qty"
                                value={idCard.fusingQty || ''}
                                onChange={(e) => updateIdCard({ fusingQty: e.target.value })}
                            />
                        </div>
                    )}
                </div>

                {/* Holes Option */}
                <div className="idcard-option-row" data-row-checked={idCard.holes}>
                    <label className="checkbox-item-sm">
                        <input
                            type="checkbox"
                            checked={idCard.holes}
                            onChange={(e) => updateIdCard({ holes: e.target.checked })}
                        />
                        <span>HOLES</span>
                    </label>
                    {idCard.holes && (
                        <div className="idcard-sub-fields">
                            <span className="field-label-sm">TYPE:</span>
                            <select
                                className="field-input-inline nav-input"
                                value={idCard.holesType || 'square'}
                                onChange={(e) => updateIdCard({ holesType: e.target.value })}
                            >
                                <option value="square">SQUARE</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


const FOIL_TYPES = [
    'Single Side UV',
    'Single Side Gold Foil',
    'Single Side UV & S/S Gold Foil',
    'D/S print + S/S UV',
    'D/S print + D/S UV',
    'D/S print + S/S Gold Foil',
    'D/S print + D/S Gold Foil',
    'D/S print + S/S UV & S/S Gold Foil',
    'D/S print + D/S UV & D/S Gold Foil',
    'D/S print + D/S UV & S/S Gold Foil',
    'D/S print + D/S Gold Foil & S/S UV',
]

export const FoilSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
    return (
        <div className="card-section" data-checked={formData.processes.foil}>
            <div className="section-header">FOIL</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>

            <div className="field-row" style={{ marginTop: '0.5rem', flexDirection: 'column', gap: '0.5rem' }}>
                <select
                    className="field-input-inline nav-input"
                    value={formData.foil.type}
                    onChange={(e) => setFormData(prev => ({
                        ...prev,
                        foil: { ...prev.foil, type: e.target.value },
                        processes: { ...prev.processes, foil: true, lamination: true }
                    }))}
                    style={{ width: '100%' }}
                >
                    <option value="">— Select Foil Type —</option>
                    {FOIL_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="field-label-sm">QTY</span>
                    <input
                        type="text"
                        className="field-input-inline nav-input"
                        placeholder="Qty"
                        value={formData.foil.qty}
                        onChange={(e) => setFormData(prev => ({
                            ...prev,
                            foil: { ...prev.foil, qty: e.target.value },
                            processes: { ...prev.processes, foil: true, lamination: true }
                        }))}
                        style={{ width: '80px' }}
                    />
                </div>
            </div>
        </div>
    )
}
