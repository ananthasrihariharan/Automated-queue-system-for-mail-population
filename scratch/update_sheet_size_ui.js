const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../modules/prepress/frontend/CreateJob.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize to LF
content = content.replace(/\r\n/g, '\n');

const target = `                                                 {/* Sheet Size */}
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

const replacement = `                                                 {/* Sheet Size */}
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

const normalize = (str) => str.replace(/\r\n/g, '\n').trim();

const normalizedTarget = normalize(target);
const normalizedReplacement = replacement.replace(/\r\n/g, '\n');

if (content.includes(normalizedTarget)) {
  console.log('Target found! Replacing...');
  content = content.replace(normalizedTarget, normalizedReplacement);
  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('CreateJob.tsx UI updated successfully!');
} else {
  // Let's try direct replacement of normalized content
  const normContent = content.replace(/\s+/g, ' ');
  const normTarget = normalizedTarget.replace(/\s+/g, ' ');
  if (normContent.includes(normTarget)) {
    console.log('Normalized target matches! Replacing using a regex fallback...');
    // We can do standard indexOf
    const idx = content.replace(/\s+/g, ' ').indexOf(normTarget);
    // Let's write a smarter search that matches regardless of leading indentation
    const lines = content.split('\n');
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('{/* Sheet Size */}')) {
        startIdx = i;
      }
      if (startIdx !== -1 && lines[i].includes('})()}')) {
        // Find next </td>
        for (let j = i; j < i + 10; j++) {
          if (lines[j].includes('</td>')) {
            endIdx = j;
            break;
          }
        }
        break;
      }
    }
    if (startIdx !== -1 && endIdx !== -1) {
      console.log(`Found lines range: ${startIdx + 1} to ${endIdx + 1}`);
      lines.splice(startIdx, endIdx - startIdx + 1, replacement);
      fs.writeFileSync(filePath, lines.join('\n').replace(/\n/g, '\r\n'), 'utf8');
      console.log('CreateJob.tsx UI updated successfully via lines split!');
    } else {
      console.error('Lines split match failed!');
    }
  } else {
    console.error('Target block NOT found at all!');
  }
}
process.exit(0);
