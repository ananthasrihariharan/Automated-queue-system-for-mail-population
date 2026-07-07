require('dotenv').config({ path: '../.env' });
const prisma = require('../lib/prisma');

async function check() {
  try {
    const count = await prisma.board.count();
    console.log('Current boards count in DB:', count);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

check();
