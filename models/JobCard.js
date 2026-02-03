const mongoose = require('mongoose');

const JobCardSchema = new mongoose.Schema({
    jobId: {
        type: String,
        required: true,
        unique: true
    },
    customerName: {
        type: String,
        required: true
    },
    totalItems: {
        type: Number,
        required: true
    },
    attBy: String,
    date: Date,

    // Process flags
    processes: {
        cutting: { type: Boolean, default: false },
        dieCutting: { type: Boolean, default: false },
        lamination: { type: Boolean, default: false },
        perforation: { type: Boolean, default: false },
        ncBox: { type: Boolean, default: false },
        creasing: { type: Boolean, default: false },
        cornerCut: { type: Boolean, default: false },
        binding: { type: Boolean, default: false }
    },

    vcBox: {
        count: String
    },

    binding: {
        noOfBooks: String,
        centerPinQty: String,
        perfectQty: String,
        caseBindingQty: String,
        wiroBindingQty: String,
        pouchLaminationQty: String,
        specialQty: String,
        date: String,
        centerPin: { type: Boolean, default: false },
        perfect: { type: Boolean, default: false },
        caseBinding: { type: Boolean, default: false },
        wiroBinding: { type: Boolean, default: false },
        pouchLamination: { type: Boolean, default: false },
        special: { type: Boolean, default: false }
    },

    dieCutting: {
        noOfSheets: String,
        date: String,
        rows: [{
            sheets: String,
            halfCut: String,
            throughCut: String,
            timing: String
        }]
    },

    cornerCutting: {
        noOfCards: String,
        date: String,
        corners: {
            tl: { type: Boolean, default: false },
            tr: { type: Boolean, default: false },
            bl: { type: Boolean, default: false },
            br: { type: Boolean, default: false }
        }
    },

    cutting: {
        noOfCutting: String,
        date: String,
        sizes: [String]
    },

    lamination: {
        date: String,
        glossy: { type: Boolean, default: false },
        matt: { type: Boolean, default: false },
        velvet: { type: Boolean, default: false },
        glossyQty: String,
        glossySide: String,
        mattQty: String,
        mattSide: String,
        velvetQty: String,
        velvetSide: String,
        singleSide: { type: Boolean, default: false },
        doubleSide: { type: Boolean, default: false },
        other: { type: Boolean, default: false },
        otherType: String,
        otherQty: String,
        otherSide: String
    },

    creasingPerforation: {
        noOfSheets: String,
        date: String,
        creasing: { type: Boolean, default: false },
        creasingNo: String,
        perforation: { type: Boolean, default: false },
        perforationNo: String,
        wheelPerforation: { type: Boolean, default: false },
        wheelPerforationNo: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('JobCard', JobCardSchema);
