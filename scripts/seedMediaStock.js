require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');

async function seed() {
  try {
    console.log('Reading media_stock.json...');
    const jsonPath = path.join(__dirname, '../../media_stock.json');
    const items = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    console.log(`Clearing existing BoardSheet and Board records (Cascade delete)...`);
    await prisma.boardSheet.deleteMany();
    await prisma.board.deleteMany();

    console.log(`Seeding ${items.length} media stock items...`);

    for (const item of items) {
      const name = item.original_name ? String(item.original_name).trim() : String(item.media_name).trim();
      const productId = item.product_id ? String(item.product_id).trim() : null;
      const originalName = item.original_name ? String(item.original_name).trim() : null;
      const masterSize = item.master_size ? String(item.master_size).trim() : null;
      const storingSize = item.storing_size ? String(item.storing_size).trim() : null;
      const mediaBehavior = String(item.media_behavior || 'DIRECT').trim();

      // Normalize sheet sizes
      const sheets = [];

      if (mediaBehavior === 'DIRECT' && storingSize) {
        // Direct media behavior has no cuts, so the storing size is the printable sheet size
        const [w, h] = storingSize.split('*').map(Number);
        if (w > 0 && h > 0) {
          sheets.push({
            name: storingSize,
            width: w,
            height: h,
            qty: 1
          });
        }
      } else if (Array.isArray(item.cut_sizes) && item.cut_sizes.length > 0) {
        for (const cs of item.cut_sizes) {
          const sizeName = String(cs.size).trim();
          const [w, h] = sizeName.split('*').map(Number);
          if (w > 0 && h > 0) {
            sheets.push({
              name: sizeName,
              width: w,
              height: h,
              qty: Number(cs.qty) || 1
            });
          }
        }
      }

      // If still no sheets, fall back to storing size or master size if possible
      if (sheets.length === 0 && storingSize) {
        const [w, h] = storingSize.split('*').map(Number);
        if (w > 0 && h > 0) {
          sheets.push({
            name: storingSize,
            width: w,
            height: h,
            qty: 1
          });
        }
      }

      await prisma.board.create({
        data: {
          name,
          productId,
          originalName,
          masterSize,
          storingSize,
          mediaBehavior,
          sheets: {
            create: sheets
          }
        }
      });
    }

    console.log('Database seeded successfully!');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    process.exit(0);
  }
}

seed();
