const prisma = require('../lib/prisma');

async function main() {
  console.log('Profiling query parts...');
  
  let start = Date.now();
  const count = await prisma.job.count({
    where: {
      isDeleted: false,
      jobStatus: {
        notIn: ['PACKED', 'DISPATCHED']
      },
      jobItems: {
        some: {
          activeStage: 'press'
        }
      }
    }
  });
  console.log(`Prisma count took ${Date.now() - start}ms (result: ${count})`);

  start = Date.now();
  const rawJobs = await prisma.job.findMany({
    where: {
      isDeleted: false,
      jobStatus: {
        notIn: ['PACKED', 'DISPATCHED']
      },
      jobItems: {
        some: {
          activeStage: 'press'
        }
      }
    },
    include: {
      jobItems: {
        include: {
          laminationSpec:    true,
          bindingSpec:       true,
          creasingSpec:      true,
          cuttingSpec:       true,
          dieCuttingSpec:    { include: { rows: true } },
          cornerCuttingSpec: true,
          foilSpec:          true,
          idCardSpec:        true,
          workflowSteps:     true
        }
      },
      jobParcels: {
        include: {
          parcelItems: true
        }
      },
      taskLogs:        true,
      packingOverride: true,
      screenshots:     true
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  console.log(`Prisma findMany took ${Date.now() - start}ms (returned ${rawJobs.length} rows)`);

  start = Date.now();
  const { adaptJobToLegacyShape } = require('../lib/responseAdapters');
  const { attachSaveJob } = require('../repositories/postgres/PgJobRepository');
  const normalized = rawJobs.map(row => attachSaveJob(adaptJobToLegacyShape(row)));
  console.log(`Mapping/normalization took ${Date.now() - start}ms`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
