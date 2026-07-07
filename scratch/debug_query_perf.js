const prisma = require('../lib/prisma');
const { getPressJobs } = require('../services/jobWorkflow');

async function main() {
  console.log('Measuring performance of getPressJobs...');
  const start = Date.now();
  const result = await getPressJobs({ page: 1, limit: 50, date: '', search: '' });
  console.log(`getPressJobs took ${Date.now() - start}ms`);
  console.log(`Fetched ${result.jobs.length} jobs.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
