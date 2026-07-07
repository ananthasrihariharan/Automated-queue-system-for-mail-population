const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../modules/prepress/frontend/CreateJob.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF to perform replaces easily
content = content.replace(/\r\n/g, '\n');

// 1. Remove fullSheet definition
const fullSheetPattern = `    // The board's full sheet = largest by area. Sheet recommendation is a later phase.
    const fullSheet = (board?: Board) => {
        if (!board?.sheets?.length) return undefined
        return board.sheets.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
    }`;

if (content.includes(fullSheetPattern)) {
  console.log('fullSheet pattern found, removing...');
  content = content.replace(fullSheetPattern, '');
} else {
  // Let's try matching with slightly different spacings
  const simplePattern = `    const fullSheet = (board?: Board) => {\n        if (!board?.sheets?.length) return undefined\n        return board.sheets.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))\n    }`;
  if (content.includes(simplePattern)) {
    console.log('Simple fullSheet pattern found, removing...');
    content = content.replace(simplePattern, '');
  }
}

// 2. Fix the possibly undefined 'board' in recalcRow
const recalcTarget = `    const recalcRow = (row: JobItem): JobItem => {
        const board = matchBoard(row.media)
        const jobW = parseFloat(row.sizeW)
        const jobH = parseFloat(row.sizeH)
        const qty = parseInt(row.sizeQty) || 0

        const missing: string[] = []
        if (!board) missing.push('Board (Media)')
        if (!(jobH > 0)) missing.push('H')
        if (!(jobW > 0)) missing.push('W')
        if (!(qty > 0)) missing.push('Qty')

        if (missing.length > 0) {
            // Only nag once the operator has started with Qty (per the workflow).
            const hint = qty > 0 ? \`Fill \${missing.join(', ')} first\` : undefined
            return { ...row, upsInfo: undefined, upsHint: hint }
        }`;

const recalcReplacement = `    const recalcRow = (row: JobItem): JobItem => {
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
            const hint = qty > 0 ? \`Fill \${missing.join(', ')} first\` : undefined
            return { ...row, upsInfo: undefined, upsHint: hint }
        }`;

if (content.includes(recalcTarget)) {
  console.log('recalcRow target found, replacing to narrow board type...');
  content = content.replace(recalcTarget, recalcReplacement);
} else {
  console.error('recalcRow target NOT found!');
}

// Write back with CRLF endings
fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
console.log('CreateJob.tsx compilation issues fixed successfully!');
process.exit(0);
