require('dotenv').config();
const prisma = require('../lib/prisma');

async function main() {
  const machines = await prisma.machine.findMany();
  console.log('MACHINES:', JSON.stringify(machines, null, 2));
  
  const systemConfig = await prisma.systemConfig.findMany();
  console.log('SYSTEM CONFIG:', JSON.stringify(systemConfig, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
