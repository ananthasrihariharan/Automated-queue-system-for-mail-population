const prisma = require('../lib/prisma');

async function main() {
  const job = await prisma.job.findFirst({
    where: { jobId: '88-240626' }
  });
  if (!job) {
    console.log('Job not found');
    return;
  }
  const items = await prisma.jobItem.findMany({
    where: { jobId: job.id },
    orderBy: { itemIndex: 'asc' }
  });
  console.log(`Job ID: ${job.id}, Job Number: ${job.jobId}`);
  items.forEach(item => {
    console.log(`Item ID: ${item.id}, itemIndex: ${item.itemIndex}, orderDescription: "${item.orderDescription}", activeStage: "${item.activeStage}"`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
