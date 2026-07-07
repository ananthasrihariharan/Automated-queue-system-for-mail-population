const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../modules/prepress/frontend/CreateJob.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Target search block:
const targetString = `                                                {/* Media (also the board name for the UPS calc) — moved here */}
                                                <td>
                                                    <input
                                                        type="text"
                                                        list="board-master-names"
                                                        value={item.media || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value
                                                            const matched = matchBoard(val)
                                                            const defaultSize = matched ? (matched.storingSize || (matched.sheets.length ? matched.sheets[0].name : '')) : ''
                                                            setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, media: val, sheetSize: defaultSize }) : it))
                                                        }}
                                                        className="table-cell-input"
                                                        placeholder="e.g. Art 300"
                                                    />
                                                </td>`;

// Replacement block:
const replacementString = `                                                {/* Media (also the board name for the UPS calc) — moved here */}
                                                <td>
                                                    <input
                                                        type="text"
                                                        list="board-master-names"
                                                        value={item.media || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value
                                                            const matched = matchBoard(val)
                                                            const defaultSize = matched ? (matched.storingSize || (matched.sheets.length ? matched.sheets[0].name : '')) : ''
                                                            setItems(prev => prev.map((it, i) => i === idx ? recalcRow({ ...it, media: val, sheetSize: defaultSize }) : it))
                                                        }}
                                                        className="table-cell-input"
                                                        placeholder="e.g. Art 300"
                                                    />
                                                </td>

                                                {/* Sheet Size */}
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

// To ensure we match regardless of line ending (\r\n vs \n), we normalize line endings before replacement or we do a regex replace
const normalize = (str) => str.replace(/\r\n/g, '\n').trim();

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = normalize(targetString);
const normalizedReplacement = replacementString.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTarget)) {
  console.log('Target block found! Replacing...');
  const updatedContent = normalizedContent.replace(normalizedTarget, normalizedReplacement);
  // Write back keeping original line ending format if preferred, or just write as standard \r\n for Windows
  fs.writeFileSync(filePath, updatedContent.replace(/\n/g, '\r\n'), 'utf8');
  console.log('CreateJob.tsx updated successfully!');
} else {
  console.error('Target block NOT found in CreateJob.tsx!');
}
process.exit(0);
