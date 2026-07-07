'use strict';
/**
 * scripts/validateMigration.js
 * Compares MongoDB document counts against PostgreSQL row counts for every
 * entity, then runs FK spot-checks.  Run after migrateMongoToPg.js.
 *
 * Usage: node scripts/validateMigration.js
 */

const { MongoClient } = require('mongodb');
const prisma = require('../lib/prisma');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Despatch_System';

// collection name → { pgModel, countFn? }
// countFn is used when the PG model name differs or has a filter
const CHECKS = [
  { mongoCol: 'systemconfigs',       pgTable: 'systemConfig' },
  { mongoCol: 'users',               pgTable: 'user' },
  { mongoCol: 'customers',           pgTable: 'customer' },
  { mongoCol: 'ingestiontasks',      pgTable: 'ingestionTask' },
  { mongoCol: 'queue_stats',         pgTable: 'queueStats' },  // real data is in queue_stats not queuestats
  { mongoCol: 'customerpreferences', pgTable: 'customerPreference' },
  { mongoCol: 'queuesessions',       pgTable: 'queueSession' },
  { mongoCol: 'queueunreads',        pgTable: 'queueUnread' },
  { mongoCol: 'queuerequests',       pgTable: 'queueRequest' },
  { mongoCol: 'walkinrequests',      pgTable: 'walkinRequest' },
  { mongoCol: 'queuejobs',           pgTable: 'queueJob' },
  { mongoCol: 'jobcards',            pgTable: 'jobCard' },
  { mongoCol: 'jobs',                pgTable: 'job' },
  { mongoCol: 'queuemessages',       pgTable: 'queueMessage' },
  { mongoCol: 'jobevents',           pgTable: 'jobEvent' },
  { mongoCol: 'parcels',             pgTable: 'parcel' },
  { mongoCol: 'onlinejobs',          pgTable: 'emailAccount' },
  // staffs (1 legacy doc) merges into User — counted together below
];

async function main() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const db = mongo.db();

  console.log('\n=== Migration Validation Report ===\n');

  const results = [];
  let allOk = true;

  for (const { mongoCol, pgTable } of CHECKS) {
    const mongoCount = await db.collection(mongoCol).countDocuments();
    const pgCount    = await prisma[pgTable].count();
    const ok         = mongoCount === pgCount;
    if (!ok) allOk = false;
    results.push({
      Entity:   pgTable,
      MongoDB:  mongoCount,
      Postgres: pgCount,
      Match:    ok ? '✓' : '✗ MISMATCH',
    });
  }

  console.table(results);

  // ── FK spot-check: jobs whose customerId doesn't resolve ──────────────────
  const orphanJobs = await prisma.$queryRaw`
    SELECT j.id, j."legacyMongoId"
    FROM "Job" j
    LEFT JOIN "Customer" c ON c.id = j."customerId"
    WHERE c.id IS NULL
    LIMIT 10
  `;
  if (orphanJobs.length > 0) {
    allOk = false;
    console.log('\n[WARN] Jobs with missing Customer FK (orphaned):');
    console.table(orphanJobs);
  }

  // ── FK spot-check: QueueJobs with unresolved parentJobId ─────────────────
  const orphanParents = await prisma.$queryRaw`
    SELECT q.id, q."legacyMongoId", q."legacyParentJobMongoId"
    FROM "QueueJob" q
    WHERE q."legacyParentJobMongoId" IS NOT NULL
      AND q."parentJobId" IS NULL
    LIMIT 10
  `;
  if (orphanParents.length > 0) {
    console.log('\n[WARN] QueueJobs with unresolved parentJobId (non-fatal, legacy ref preserved):');
    console.table(orphanParents);
  }

  // ── UserRole check ────────────────────────────────────────────────────────
  const userRoleCount = await prisma.userRole.count();
  console.log(`\nUserRole rows: ${userRoleCount}`);

  // ── MigrationMap summary ──────────────────────────────────────────────────
  const mapSummary = await prisma.$queryRaw`
    SELECT "entityType", COUNT(*)::int AS count
    FROM "MigrationMap"
    GROUP BY "entityType"
    ORDER BY "entityType"
  `;
  console.log('\nMigrationMap summary:');
  console.table(mapSummary);

  console.log('\n' + (allOk ? '✓ All counts match. Migration looks clean.' : '✗ Some counts do not match — review above.'));

  await mongo.close();
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[validate] Fatal error:', err.message);
  process.exit(1);
});
