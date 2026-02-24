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

export const BindingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
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
            <BindingRow
                label="SPECIAL"
                isChecked={formData.binding.special}
                onChange={(checked) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, special: checked },
                    processes: { ...prev.processes, binding: true }
                }))}
                qty={formData.binding.specialQty}
                onQtyChange={(val) => setFormData(prev => ({
                    ...prev,
                    binding: { ...prev.binding, specialQty: val },
                    processes: { ...prev.processes, binding: true }
                }))}
                rowIndex={5}
            />

        </div>
    );
};

export const CornerCuttingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
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
                    type="text"
                    className="field-input-inline no-print"
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
                    <div className="print-corner-qty only-print">{formData.cornerCutting.noOfCards}</div>
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

export const LaminationSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
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
                (['glossy', 'matt', 'velvet'] as const).map((type, i) => (
                    <LaminationRow
                        key={type}
                        label={type.charAt(0).toUpperCase() + type.slice(1)}
                        isChecked={(formData.lamination as any)[type]}
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
                <input
                    type="text"
                    className="lamination-other-type-input nav-input"
                    placeholder="Specify type..."
                    value={formData.lamination.otherType || ''}
                    onChange={(e) => setFormData(prev => ({
                        ...prev,
                        lamination: { ...prev.lamination, otherType: e.target.value, other: true },
                        processes: { ...prev.processes, lamination: true }
                    }))}
                    data-grid-row={3}
                    data-grid-col="1"
                />
                {formData.lamination.other && (
                    <div className="lamination-details">
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
                            />
                        </div>
                        <div className={`side-selection side-${formData.lamination.otherSide || 'none'}`}>
                            <label className="radio-item-sm">
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
                            <label className="radio-item-sm">
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

export const CreasingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
    return (
        <div className="card-section" data-checked={formData.processes.creasing || formData.processes.perforation}>
            <div className="section-header">CREASING / PERF</div>
            <div className="section-identifiers">
                <div className="identifier-fields-stack">
                    <span className="identifier-field">JOB ID: {jobData.jobId}</span>
                    <span className="identifier-field">JOB BY: {jobData.attBy || 'N/A'}</span>
                    <span className="identifier-field only-print">C.NAME: {customerName}</span>
                </div>
                <div className="section-qr-code only-print">QR</div>
            </div>
            <div className="field-row no-print">
                <span className="field-label-sm">NO OF SHEETS</span>
                <input
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
                    { key: 'wheelPerforation', label: 'WHEEL PERFORATION', noKey: 'wheelPerforationNo', proc: 'perforation' }
                ].map((item) => (
                    <div className="creasing-item" key={item.key} data-row-checked={(formData.creasingPerforation as any)[item.key]}>
                        <label className="checkbox-item-sm">
                            <input
                                type="checkbox"
                                checked={(formData.creasingPerforation as any)[item.key]}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    creasingPerforation: { ...prev.creasingPerforation, [item.key]: e.target.checked },
                                    processes: { ...prev.processes, [item.proc]: true }
                                }))}
                            />
                            <span>{item.label}</span>
                        </label>
                        <span className="field-label-sm" style={{ marginLeft: '4mm', marginRight: '1mm' }}>NO:</span>
                        <input
                            type="text"
                            className="field-input-box-sm-inline"
                            value={(formData.creasingPerforation as any)[item.noKey]}
                            onChange={(e) => setFormData(prev => ({
                                ...prev,
                                creasingPerforation: { ...prev.creasingPerforation, [item.noKey]: e.target.value },
                                processes: { ...prev.processes, [item.proc]: true }
                            }))}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};



export const DieCuttingSection: React.FC<SectionProps> = ({ jobData, customerName, formData, setFormData }) => {
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
            <div className="field-row no-print">
                <span className="field-label-sm">NO OF SHEETS</span>
                <input
                    type="text"
                    className="field-input-inline"
                    value={formData.dieCutting.noOfSheets}
                    onChange={(e) => setFormData(prev => ({
                        ...prev,
                        dieCutting: { ...prev.dieCutting, noOfSheets: e.target.value },
                        processes: { ...prev.processes, dieCutting: true }
                    }))}
                />
            </div>

            <div className="die-cutting-table">
                <div className="die-table-header">
                    <div className="die-table-cell">SHEETS</div>
                    <div className="die-table-cell">CUT</div>
                    <div className="die-table-cell">TIMING</div>
                </div>
                {/* Always render exactly 8 rows */}
                {Array.from({ length: 8 }).map((_, i) => {
                    // Ensure formData has enough rows
                    const row = formData.dieCutting.rows[i] || { sheets: '', halfCut: '', throughCut: '', timing: '' };
                    const hasData = row.sheets || row.halfCut || row.throughCut || row.timing;

                    return (
                        <div key={i} className="die-table-row" data-has-content={!!hasData}>
                            {/* Column 1: Sheets */}
                            <div className="die-table-cell">
                                <input
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
                                    <option value="SHAPE CUT">SHAPE CUT</option>
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
            <div className="field-row">
                <span className="field-label-sm">NO OF CUTTING</span>
                <input
                    type="text"
                    className="field-input-inline"
                    value={formData.cutting.noOfCutting}
                    onChange={(e) => setFormData(prev => ({
                        ...prev,
                        cutting: { ...prev.cutting, noOfCutting: e.target.value },
                        processes: { ...prev.processes, cutting: true }
                    }))}
                />
            </div>

            <div className="cutting-grid">
                <div className="cutting-grid-header">
                    <div className="cutting-grid-cell">H</div>
                    <div className="cutting-grid-cell">W</div>
                    <div className="cutting-grid-cell">H</div>
                    <div className="cutting-grid-cell">W</div>
                </div>
                {/* Always render exactly 5 rows for 10 slots total (2 measurements per row) */}
                {Array.from({ length: 5 }).map((_, rowIndex) => {
                    // Check if this row has any data in its 2 slots
                    const idx1 = rowIndex * 2;
                    const idx2 = rowIndex * 2 + 1;
                    const hasData = (formData.cutting.sizes[idx1] && formData.cutting.sizes[idx1].length > 1) ||
                        (formData.cutting.sizes[idx2] && formData.cutting.sizes[idx2].length > 1);

                    return (
                        <div key={rowIndex} className="cutting-grid-row" data-has-content={!!hasData}>
                            {[0, 1].map((colOffset) => {
                                const index = rowIndex * 2 + colOffset;
                                const size = formData.cutting.sizes[index] || '';
                                const [h, w] = size.split('*').map(v => v.trim());

                                return (
                                    <React.Fragment key={colOffset}>
                                        <div className="cutting-grid-cell">
                                            <input
                                                type="text"
                                                className="grid-input"
                                                placeholder="H"
                                                value={h || ''}
                                                onChange={(e) => {
                                                    const newSizes = [...formData.cutting.sizes];
                                                    // Ensure array has enough slots
                                                    while (newSizes.length <= index) {
                                                        newSizes.push('');
                                                    }
                                                    const newW = w || '';
                                                    newSizes[index] = `${e.target.value}*${newW}`;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        cutting: { ...prev.cutting, sizes: newSizes },
                                                        processes: { ...prev.processes, cutting: true }
                                                    }));
                                                }}
                                                data-grid-row={rowIndex}
                                                data-grid-col={colOffset * 2}
                                            />
                                        </div>
                                        <div className="cutting-grid-cell">
                                            <input
                                                type="text"
                                                className="grid-input"
                                                placeholder="W"
                                                value={w || ''}
                                                onChange={(e) => {
                                                    const newSizes = [...formData.cutting.sizes];
                                                    // Ensure array has enough slots
                                                    while (newSizes.length <= index) {
                                                        newSizes.push('');
                                                    }
                                                    const newH = h || '';
                                                    newSizes[index] = `${newH}*${e.target.value}`;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        cutting: { ...prev.cutting, sizes: newSizes },
                                                        processes: { ...prev.processes, cutting: true }
                                                    }));
                                                }}
                                                data-grid-row={rowIndex}
                                                data-grid-col={colOffset * 2 + 1}
                                            />
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
