const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../modules/prepress/frontend/CreateJob.tsx');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

for (let i = 875; i <= 905; i++) {
  console.log(`${i}: ${JSON.stringify(lines[i - 1])}`);
}
process.exit(0);
