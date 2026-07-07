'use strict';
/**
 * scripts/rollbackMigration.js
 * Wipes all migrated PostgreSQL data and resets sequences to a clean slate.
 * Safe to run before a retry. Does NOT touch MongoDB.
 *
 * Usage: node scripts/rollbackMigration.js
 */

const prisma = require('../lib/prisma');

const TABLES = [
  '"JobParcelItem"',
  '"JobParcel"',
  '"DieCuttingRow"',
  '"DieCuttingSpec"',
  '"LaminationSpec"',
  '"BindingSpec"',
  '"CreasingSpec"',
  '"CuttingSpec"',
  '"CornerCuttingSpec"',
  '"FoilSpec"',
  '"IdCardSpec"',
  '"JobItemWorkflowStep"',
  '"JobItem"',
  '"JobItemScreenshot"',
  '"JobTaskLog"',
  '"PackingOverride"',
  '"Job"',
  '"Parcel"',
  '"JobEvent"',
  '"QueueMessage"',
  '"JobCardDieCuttingRow"',
  '"JobCard"',
  '"QueueJob"',
  '"WalkinRequest"',
  '"QueueRequest"',
  '"QueueUnread"',
  '"QueueSession"',
  '"CustomerPreference"',
  '"Customer"',
  '"QueueStats"',
  '"IngestionTask"',
  '"UserRole"',
  '"User"',
  '"Role"',
  '"SystemConfig"',
  '"MigrationMap"',
  '"SyncFailureQueue"',
  '"WriteSyncLog"',
  '"EmailAccount"',
];

async function main() {
  console.log('[rollback] Starting rollback — truncating all tables...');

  const sql = `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`;
  await prisma.$executeRawUnsafe(sql);

  console.log('[rollback] All tables truncated and sequences reset.');
  console.log('[rollback] Database is now in a clean state. Safe to re-run migration.');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[rollback] Fatal error:', err.message);
  process.exit(1);
});
