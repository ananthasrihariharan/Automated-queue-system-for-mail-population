const prisma = require('../lib/prisma');
const { JobRepository, UserRepository, JobCardRepository } = require('../repositories');
const { syncPostPressFromJobCards } = require('../services/jobWorkflow');

async function main() {
  const jobId = 'TEST-ADMIN-MOD-56033';
  const userId = '1'; // Or some valid user ID

  console.log(`Profiling confirmPressItem steps for job ${jobId}...`);

  let start = Date.now();
  const job = await JobRepository.findOne({ jobId });
  console.log(`Step 1: findOne(job) took ${Date.now() - start}ms`);

  if (!job) {
    console.log('Job not found!');
    return;
  }

  start = Date.now();
  await syncPostPressFromJobCards(job);
  console.log(`Step 2: syncPostPressFromJobCards took ${Date.now() - start}ms`);

  start = Date.now();
  const user = await UserRepository.findById(userId).select('name').lean();
  console.log(`Step 3: findById(user) took ${Date.now() - start}ms`);

  start = Date.now();
  // Measure save time
  await job.save();
  console.log(`Step 4: job.save() took ${Date.now() - start}ms`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
