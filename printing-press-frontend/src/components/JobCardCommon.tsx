import React from 'react';

// Common interface for the row props
interface BaseRowProps {
    label: string;
    isChecked: boolean;
    onChange: (checked: boolean) => void;
    qty: string;
    onQtyChange: (val: string) => void;
    rowIndex?: number;
}

interface LaminationRowProps extends BaseRowProps {
    side?: string;
    onSideChange?: (val: string) => void;
}

export const BindingRow: React.FC<BaseRowProps> = ({
    label,
    isChecked,
    onChange,
    qty,
    onQtyChange,
    rowIndex
}) => {
    return (
        <div className="binding-type-row" data-row-checked={isChecked}>
            <label className="checkbox-item-sm">
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onChange(e.target.checked)}
                    data-grid-row={rowIndex}
                    data-grid-col="0"
                    className="nav-input"
                />
                <span>{label}</span>
            </label>
            {isChecked && (
                <div className="binding-details">
                    <div className="field-row">
                        {/* <span className="field-label-sm">NO OF BOOKS:</span> */}
                        <input
                            type="text"
                            className="field-input-inline nav-input"
                            placeholder="Qty"
                            value={qty}
                            onChange={(e) => onQtyChange(e.target.value)}
                            data-grid-row={rowIndex}
                            data-grid-col="1"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export const LaminationRow: React.FC<LaminationRowProps> = ({
    label,
    isChecked,
    onChange,
    qty,
    onQtyChange,
    side,
    onSideChange,
    rowIndex
}) => {
    return (
        <div className="lamination-type-row" data-row-checked={isChecked}>
            <label className="checkbox-item-sm">
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onChange(e.target.checked)}
                    data-grid-row={rowIndex}
                    data-grid-col="0"
                    className="nav-input"
                />
                <span>{label}</span>
            </label>
            {isChecked && (
                <div className="lamination-details">
                    <div className="field-row">
                        <input
                            type="text"
                            className="field-input-inline nav-input"
                            placeholder="Qty"
                            value={qty}
                            onChange={(e) => onQtyChange(e.target.value)}
                            data-grid-row={rowIndex}
                            data-grid-col="1"
                        />
                    </div>
                    {onSideChange && (
                        <div className={`side-selection side-${side || 'none'}`}>
                            <label className="radio-item-sm">
                                <input
                                    type="radio"
                                    checked={side === 'single'}
                                    onChange={() => onSideChange('single')}
                                    data-grid-row={rowIndex}
                                    data-grid-col="2"
                                    className="nav-input"
                                />
                                <span>Single Side</span>
                            </label>
                            <label className="radio-item-sm">
                                <input
                                    type="radio"
                                    checked={side === 'double'}
                                    onChange={() => onSideChange('double')}
                                    data-grid-row={rowIndex}
                                    data-grid-col="3"
                                    className="nav-input"
                                />
                                <span>Double Side</span>
                            </label>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
