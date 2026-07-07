require('dotenv').config({ path: '../.env' });
const prisma = require('../lib/prisma');

async function test() {
  try {
    console.log('Testing prisma.machine...');
    const result = await prisma.machine.findMany();
    console.log('Success! Count:', result.length);
  } catch (err) {
    console.error('Error occurred:', err);
  } finally {
    process.exit(0);
  }
}

test();
