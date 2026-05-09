const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\anand\\Downloads\\despatch systemm\\despatch system\\services\\queueEngine.js', 'utf8');

let balance = 0;
const lines = content.split('\n');
lines.forEach((line, i) => {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    balance += opens - closes;
    if (balance > 0) {
        // console.log(`Balance positive at line ${i + 1}: ${balance}`);
    }
});
console.log(`Final Balance: ${balance}`);

// Find where functions start and end
let currentFunc = null;
let funcStartLine = 0;
balance = 0;
lines.forEach((line, i) => {
    const funcMatch = line.match(/async function (\w+)/);
    if (funcMatch && balance === 0) {
        currentFunc = funcMatch[1];
        funcStartLine = i + 1;
    }
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    balance += opens - closes;
    if (balance === 0 && currentFunc) {
        // console.log(`Function ${currentFunc} (started line ${funcStartLine}) ended line ${i + 1}`);
        currentFunc = null;
    }
});
if (balance !== 0) {
    console.log(`UNCLOSED BLOCK: balance is ${balance} at the end of the file.`);
}
