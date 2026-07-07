const prisma = require('../lib/prisma');

async function main() {
  console.log('Recreating unique_active_staff_session index on QueueSession...');
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_staff_session 
    ON "QueueSession" ("staffId") 
    WHERE "isActive" = true;
  `);
  console.log('Partial unique index created successfully.');
}

main()
  .catch(e => {
    console.error('Failed to recreate index:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
