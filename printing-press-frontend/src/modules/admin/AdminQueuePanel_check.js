
import fs from 'fs';

const content = fs.readFileSync('c:/Users/anand/Downloads/despatch systemm/despatch system/printing-press-frontend/src/modules/admin/AdminQueuePanel.tsx', 'utf8');

const stack = [];
const lines = content.split('\n');

lines.forEach((line, i) => {
    // Very naive regex for JSX tags
    const tags = line.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)|<\/([a-zA-Z][a-zA-Z0-9]*)>/g);
    for (const match of tags) {
        if (match[1]) {
            // Opening tag
            const tagName = match[1];
            // Check if self-closing
            if (!line.includes(`</${tagName}>`) && !line.match(new RegExp(`<${tagName}[^>]*\/>`))) {
                stack.push({ name: tagName, line: i + 1 });
            }
        } else if (match[2]) {
            // Closing tag
            const tagName = match[2];
            if (stack.length === 0) {
                console.log(`ERROR: Closing tag </${tagName}> without opening at line ${i + 1}`);
            } else {
                const last = stack.pop();
                if (last.name !== tagName) {
                    console.log(`ERROR: Mismatched tag at line ${i + 1}: expected </${last.name}> (from line ${last.line}), found </${tagName}>`);
                }
            }
        }
    }
});

console.log('Open tags at end:');
stack.forEach(t => console.log(`  <${t.name}> from line ${t.line}`));
