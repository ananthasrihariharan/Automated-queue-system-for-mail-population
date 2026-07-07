const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../../media_stock.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const linenItems = data.filter(item => item.media_name === 'linen white');
console.log('Linen items:', JSON.stringify(linenItems, null, 2));

const artItems = data.filter(item => item.media_name === 'art 300');
console.log('Art items:', JSON.stringify(artItems, null, 2));
process.exit(0);
