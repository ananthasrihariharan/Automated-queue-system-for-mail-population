import { useState } from 'react';

export interface JobCardState {
    processes: {
        cutting: boolean;
        dieCutting: boolean;
        lamination: boolean;
        perforation: boolean;
        ncBox: boolean;
        creasing: boolean;
        cornerCut: boolean;
        binding: boolean;
    };
    vcBox: { count: string };
    binding: {
        noOfBooks: string;
        centerPinQty: string;
        perfectQty: string;
        caseBindingQty: string;
        wiroBindingQty: string;
        pouchLaminationQty: string;
        specialQty: string;
        date: string;
        centerPin: boolean;
        perfect: boolean;
        caseBinding: boolean;
        wiroBinding: boolean;
        pouchLamination: boolean;
        special: boolean;
    };
    dieCutting: {
        noOfSheets: string;
        date: string;
        rows: Array<{ sheets: string; halfCut: string; throughCut: string; timing: string }>;
    };
    cornerCutting: {
        noOfCards: string;
        date: string;
        corners: { tl: boolean; tr: boolean; bl: boolean; br: boolean };
    };
    cutting: {
        noOfCutting: string;
        date: string;
        sizes: string[];
    };
    lamination: {
        date: string;
        glossy: boolean;
        matt: boolean;
        velvet: boolean;
        glossyQty: string;
        glossySide: string;
        mattQty: string;
        mattSide: string;
        velvetQty: string;
        velvetSide: string;
        singleSide: boolean;
        doubleSide: boolean;
        other: boolean;
        otherType: string;
        otherQty: string;
        otherSide: string;
    };
    creasingPerforation: {
        noOfSheets: string;
        date: string;
        creasing: boolean;
        creasingNo: string;
        perforation: boolean;
        perforationNo: string;
        wheelPerforation: boolean;
        wheelPerforationNo: string;
    };
}

export const useJobCardForm = () => {
    // State for dynamic form data
    const [formData, setFormData] = useState<JobCardState>({
        processes: {
            cutting: false,
            dieCutting: false,
            lamination: false,
            perforation: false,
            ncBox: false,
            creasing: false,
            cornerCut: false,
            binding: false
        },
        // VC Box Section (Top checkbox only)
        vcBox: {
            count: ''
        },
        // Binding section
        binding: {
            noOfBooks: '',
            centerPinQty: '',
            perfectQty: '',
            caseBindingQty: '',
            wiroBindingQty: '',
            pouchLaminationQty: '',
            specialQty: '',
            date: '',
            centerPin: false,
            perfect: false,
            caseBinding: false,
            wiroBinding: false,
            pouchLamination: false,
            special: false
        },
        // Die Cutting section
        dieCutting: {
            noOfSheets: '',
            date: '',
            rows: [{ sheets: '', halfCut: '', throughCut: '', timing: '' }]
        },
        // Corner Cutting section
        cornerCutting: {
            noOfCards: '',
            date: '',
            corners: { tl: false, tr: false, bl: false, br: false }
        },
        // Cutting section
        cutting: {
            noOfCutting: '',
            date: '',
            sizes: ['']
        },
        // Lamination section
        lamination: {
            date: '',
            glossy: false,
            matt: false,
            velvet: false,
            glossyQty: '',
            glossySide: '',
            mattQty: '',
            mattSide: '',
            velvetQty: '',
            velvetSide: '',
            singleSide: false,
            doubleSide: false,
            other: false,
            otherType: '',
            otherQty: '',
            otherSide: ''
        },
        // Creasing & Perforation section
        creasingPerforation: {
            noOfSheets: '',
            date: '',
            creasing: false,
            creasingNo: '',
            perforation: false,
            perforationNo: '',
            wheelPerforation: false,
            wheelPerforationNo: ''
        }
    });

    const updateProcess = (process: string, value: boolean) => {
        setFormData(prev => ({
            ...prev,
            processes: { ...prev.processes, [process]: value }
        }));
    };

    // Cutting Row Handlers
    const addCuttingRow = () => {
        setFormData(prev => ({
            ...prev,
            cutting: {
                ...prev.cutting,
                sizes: [...prev.cutting.sizes, '']
            }
        }));
    };

    const removeCuttingRow = (index: number) => {
        setFormData(prev => ({
            ...prev,
            cutting: {
                ...prev.cutting,
                sizes: prev.cutting.sizes.filter((_, i) => i !== index)
            }
        }));
    };

    // Die Cutting Row Handlers
    const addDieCuttingRow = () => {
        setFormData(prev => ({
            ...prev,
            dieCutting: {
                ...prev.dieCutting,
                rows: [...prev.dieCutting.rows, { sheets: '', halfCut: '', throughCut: '', timing: '' }]
            }
        }));
    };

    const removeDieCuttingRow = (index: number) => {
        setFormData(prev => ({
            ...prev,
            dieCutting: {
                ...prev.dieCutting,
                rows: prev.dieCutting.rows.filter((_, i) => i !== index)
            }
        }));
    };

    return {
        formData,
        setFormData,
        updateProcess,
        addCuttingRow,
        removeCuttingRow,
        addDieCuttingRow,
        removeDieCuttingRow
    };
};
