const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../../media_stock.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const names = new Set();
const duplicates = [];

data.forEach((item, index) => {
  const name = item.original_name ? item.original_name.trim() : item.media_name.trim();
  if (names.has(name)) {
    duplicates.push({ index, name, item });
  } else {
    names.add(name);
  }
});

console.log('Duplicate display names:', duplicates);
process.exit(0);
