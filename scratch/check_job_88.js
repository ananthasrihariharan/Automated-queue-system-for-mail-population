const prisma = require('../lib/prisma');
const { JobRepository } = require('../repositories');

async function main() {
  const jobId = '88-240626';
  const job = await JobRepository.findOne({ jobId });
  if (!job) {
    console.log('Job not found!');
    return;
  }
  console.log(`Job: ${job.jobId}, Status: ${job.jobStatus}, Payment: ${job.paymentStatus}`);
  job.items.forEach((item, index) => {
    console.log(`  Item ${index}: orderDescription: "${item.orderDescription}", activeStage: ${item.activeStage}, pressStatus: ${item.pressStatus}, printConfirmed: ${item.printConfirmed}`);
    console.log(`    lamination: ${item.lamination}, laminationStatus: ${item.laminationStatus}`);
    console.log(`    creasing: ${item.creasing}, creasingStatus: ${item.creasingStatus}`);
    console.log(`    binding: ${item.binding}, bindingStatus: ${item.bindingStatus}`);
    console.log(`    dieCutting: ${item.dieCutting}, dieCuttingStatus: ${item.dieCuttingStatus}`);
    console.log(`    cornerCutting: ${item.cornerCutting}, cornerCuttingStatus: ${item.cornerCuttingStatus}`);
    console.log(`    cutting: ${item.cutting}, cuttingStatus: ${item.cuttingStatus}`);
    console.log(`    foil: ${item.foil}, foilStatus: ${item.foilStatus}`);
    console.log(`    fusing: ${item.fusing}, fusingStatus: ${item.fusingStatus}`);
    console.log(`    holes: ${item.holes}, holesStatus: ${item.holesStatus}`);
    console.log(`    cutting2: ${item.cutting2}, cutting2Status: ${item.cutting2Status}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
