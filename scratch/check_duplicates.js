const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../../media_stock.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const nameCounts = {};
data.forEach(item => {
  const name = item.media_name;
  nameCounts[name] = (nameCounts[name] || 0) + 1;
});

const duplicates = Object.keys(nameCounts).filter(name => nameCounts[name] > 1);
console.log('Total items:', data.length);
console.log('Duplicates:', duplicates.map(name => `${name}: ${nameCounts[name]} times`));
process.exit(0);
