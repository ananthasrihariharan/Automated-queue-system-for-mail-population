const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../modules/prepress/frontend/CreateJob.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

// 1. Add upsSuggestion property to JobItem interface
const interfaceTarget = `interface JobItem {
    id: string
    orderDescription: string
    media: string
    sheetSize?: string
    type: string`;

const interfaceReplacement = `interface JobItem {
    id: string
    orderDescription: string
    media: string
    sheetSize?: string
    type: string
    upsSuggestion?: { sheetSize: string; text: string }`;

if (content.includes(interfaceTarget)) {
  console.log('JobItem interface found! Updating...');
  content = content.replace(interfaceTarget, interfaceReplacement);
} else {
  console.error('JobItem interface NOT found!');
}

// 2. Add upsSuggestion: undefined to createEmptyRow
const emptyRowTarget = `    const createEmptyRow = (): JobItem => ({
        id: Math.random().toString(36).substr(2, 9),
        orderDescription: '', media: '', sheetSize: '', type: '', printType: '',`;

const emptyRowReplacement = `    const createEmptyRow = (): JobItem => ({
        id: Math.random().toString(36).substr(2, 9),
        orderDescription: '', media: '', sheetSize: '', type: '', printType: '',
        upsSuggestion: undefined,`;

if (content.includes(emptyRowTarget)) {
  console.log('createEmptyRow found! Updating...');
  content = content.replace(emptyRowTarget, emptyRowReplacement);
} else {
  console.error('createEmptyRow NOT found!');
}

// 3. Update recalcRow to compute smaller sheet size suggestion
const recalcTarget = `        const result = calculateUps({
            sheetWidth: sheet.width,
            sheetHeight: sheet.height,
            jobWidth: jobW,
            jobHeight: jobH,
            quantity: qty,
            cutType: (row.cutType as CutType) || 'none',
            cutGap: parseFloat(row.cutGap || '') || 0,
            printableMargin: margin,
        })
        if (result.ups <= 0) return { ...row, upsInfo: undefined, upsHint: 'Job does not fit the sheet' }

        // Sheets calculation:
        // Single-side: Math.ceil(Qty / Ups) * Pages
        // Double-side: Math.ceil(Qty / Ups) * Math.ceil(Pages / 2)
        const isDouble = isDoubleSidedType(row.type)
        let rowPages = row.pages ? row.pages.trim() : ''
        if (!rowPages) {
            rowPages = isDouble ? '2' : '1'
        }
        const pagesVal = parseInt(rowPages) || 1

        const baseSheets = Math.ceil(qty / result.ups)
        const calcSheets = isDouble
            ? baseSheets * Math.ceil(pagesVal / 2)
            : baseSheets * pagesVal

        return {
            ...row,
            pages: rowPages,
            sheetSize: sheet.name,
            ups: String(result.ups),
            sheets: String(calcSheets),
            upsInfo: { orientation: result.orientation, jobsAcross: result.jobsAcross, rows: result.rows },
            upsHint: undefined,
        }`;

const recalcReplacement = `        const result = calculateUps({
            sheetWidth: sheet.width,
            sheetHeight: sheet.height,
            jobWidth: jobW,
            jobHeight: jobH,
            quantity: qty,
            cutType: (row.cutType as CutType) || 'none',
            cutGap: parseFloat(row.cutGap || '') || 0,
            printableMargin: margin,
        })
        if (result.ups <= 0) return { ...row, upsInfo: undefined, upsHint: 'Job does not fit the sheet' }

        // Find smaller sheet recommendation
        let upsSuggestion: { sheetSize: string; text: string } | undefined = undefined
        const currentArea = sheet.width * sheet.height
        let bestSuggestion: { name: string; ups: number; area: number } | null = null

        for (const s of board.sheets) {
            const sArea = s.width * s.height
            if (sArea >= currentArea) continue

            const resS = calculateUps({
                sheetWidth: s.width,
                sheetHeight: s.height,
                jobWidth: jobW,
                jobHeight: jobH,
                quantity: qty,
                cutType: (row.cutType as CutType) || 'none',
                cutGap: parseFloat(row.cutGap || '') || 0,
                printableMargin: margin,
            })

            if (resS.ups >= result.ups && resS.ups > 0) {
                if (!bestSuggestion || 
                    resS.ups > bestSuggestion.ups || 
                    (resS.ups === bestSuggestion.ups && sArea < bestSuggestion.area)) {
                    bestSuggestion = { name: s.name, ups: resS.ups, area: sArea }
                }
            }
        }

        if (bestSuggestion) {
            upsSuggestion = {
                sheetSize: bestSuggestion.name,
                text: \`\${bestSuggestion.name} produces \${bestSuggestion.ups} UPS (same or greater) using a smaller sheet.\`
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

        const baseSheets = Math.ceil(qty / result.ups)
        const calcSheets = isDouble
            ? baseSheets * Math.ceil(pagesVal / 2)
            : baseSheets * pagesVal

        return {
            ...row,
            pages: rowPages,
            sheetSize: sheet.name,
            ups: String(result.ups),
            sheets: String(calcSheets),
            upsInfo: { orientation: result.orientation, jobsAcross: result.jobsAcross, rows: result.rows },
            upsHint: undefined,
            upsSuggestion,
        }`;

if (content.includes(recalcTarget)) {
  console.log('recalcRow calculation logic found! Updating to include suggestion calculation...');
  content = content.replace(recalcTarget, recalcReplacement);
} else {
  console.error('recalcRow calculation logic NOT found!');
}

// 4. Update the Sheet Size dropdown select rendering to render suggestion
const sheetSizeSelectTarget = `                                                 {/* Sheet Size */}
                                                 <td>
                                                     {(() => {
                                                         const matchedBoard = matchBoard(item.media)
                                                         if (matchedBoard && matchedBoard.sheets.length > 0) {
                                                             return (
                                                                 <select
                                                                     value={item.sheetSize || ''}
                                                                     onChange={(e) => {
                                                                         const val = e.target.value
                                                                         setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sheetSize: val }) : it))
                                                                     }}
                                                                     className="table-cell-select"
                                                                 >
                                                                     {matchedBoard.sheets.map((s) => (
                                                                         <option key={s.id || s.name} value={s.name}>
                                                                             {s.name} {s.qty && s.qty > 1 ? \`(\${s.qty}qty)\` : ''}
                                                                         </option>
                                                                     ))}
                                                                 </select>
                                                             )
                                                         }
                                                         return (
                                                             <input
                                                                 type="text"
                                                                 disabled
                                                                 className="table-cell-input text-center"
                                                                 placeholder="—"
                                                                 value=""
                                                             />
                                                         )
                                                     })()}
                                                 </td>`;

const sheetSizeSelectReplacement = `                                                 {/* Sheet Size */}
                                                 <td>
                                                     {(() => {
                                                         const matchedBoard = matchBoard(item.media)
                                                         if (matchedBoard && matchedBoard.sheets.length > 0) {
                                                             return (
                                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                                     <select
                                                                         value={item.sheetSize || ''}
                                                                         onChange={(e) => {
                                                                             const val = e.target.value
                                                                             setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, sheetSize: val }) : it))
                                                                         }}
                                                                         className="table-cell-select"
                                                                     >
                                                                         {matchedBoard.sheets.map((s) => (
                                                                             <option key={s.id || s.name} value={s.name}>
                                                                                 {s.name} {s.qty && s.qty > 1 ? \`(\${s.qty}qty)\` : ''}
                                                                             </option>
                                                                         ))}
                                                                     </select>
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
                                                         }
                                                         return (
                                                             <input
                                                                 type="text"
                                                                 disabled
                                                                 className="table-cell-input text-center"
                                                                 placeholder="—"
                                                                 value=""
                                                             />
                                                         )
                                                     })()}
                                                 </td>`;

if (content.includes(sheetSizeSelectTarget)) {
  console.log('sheetSizeSelectTarget found! Updating to include suggestion badge...');
  content = content.replace(sheetSizeSelectTarget, sheetSizeSelectReplacement);
} else {
  console.error('sheetSizeSelectTarget NOT found!');
}

// Write back with CRLF endings
fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
console.log('CreateJob.tsx sheet size recommendation logic added successfully!');
process.exit(0);
