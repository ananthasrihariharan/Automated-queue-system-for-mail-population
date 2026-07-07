'use strict';
/**
 * scripts/migrateMongoToPg.js
 * Full ETL: MongoDB (Despatch_System) → PostgreSQL (despatch via Prisma).
 *
 * Usage:
 *   node scripts/migrateMongoToPg.js            # full wipe + migrate
 *   node scripts/migrateMongoToPg.js --resume   # skip already-migrated docs
 *   node scripts/migrateMongoToPg.js --dry-run  # no writes, just logs
 *
 * Prerequisites:  npm install mongodb
 */

const path   = require('path');
const fs     = require('fs');
const { MongoClient } = require('mongodb');
const prisma = require('../lib/prisma');
const { normalizeUserRoles } = require('../utils/normalizeUserRoles');

// ─── CLI flags ───────────────────────────────────────────────────────────────
const RESUME  = process.argv.includes('--resume');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Config ──────────────────────────────────────────────────────────────────
const MONGO_URI  = process.env.MONGO_URI  || 'mongodb://127.0.0.1:27017/Despatch_System';
const BATCH_SIZE = 100;

// ─── In-memory ID caches (mongoId string → pgId number) ──────────────────────
const cache = {
  USER:     new Map(),
  CUSTOMER: new Map(),
  QUEUEJOB: new Map(),
  JOBCARD:  new Map(),
  JOB:      new Map(),
};

// ─── Error accumulator ────────────────────────────────────────────────────────
const errors = [];
function logErr(entity, mongoId, err) {
  errors.push({ entity, mongoId, message: err.message, stack: err.stack });
  console.warn(`  [SKIP] ${entity} ${mongoId}: ${err.message}`);
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function oid(v)  { return v ? v.toString() : null; }
function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function safeBigInt(v) {
  try { return BigInt(v ?? 0); } catch { return 0n; }
}
function cleanEnum(v, valid, fallback) {
  if (v == null) return fallback;
  const s = String(v).trim().toUpperCase().replace(/[\s-]+/g, '_');
  return valid.includes(s) ? s : fallback;
}
function cleanEnumLower(v, valid, fallback) {
  if (v == null) return fallback;
  const s = String(v).trim();
  if (valid.includes(s)) return s;
  const lower = s.toLowerCase();
  return valid.includes(lower) ? lower : fallback;
}

// Specific enum coercers matching Prisma schema
const VALID_JOB_STATUS       = ['PENDING','CREATED','PRINTED','PACKED','DISPATCHED','PARTIAL_DISPATCH'];
const VALID_PAYMENT_STATUS   = ['UNPAID','PAID','ADMIN_APPROVED'];
const VALID_PAYMENT_MODE     = ['CASH','UPI','CARD','ONLINE','CREDIT'];
const VALID_PACKING          = ['SINGLE','MULTIPLE','MIXED'];
const VALID_DELIVERY         = ['COURIER','WALK_IN'];
const VALID_QUEUE_STATUS     = ['QUEUED','ASSIGNED','IN_PROGRESS','PAUSED','COMPLETED','DUPLICATE','JUNK','ADMIN_REVIEW'];
const VALID_QUEUE_TYPE       = ['EMAIL','WALKIN','WHATSAPP'];
const VALID_COMPLEXITY       = ['easy','medium','complex'];
const VALID_HOLD_BEHAVIOR    = ['RETURN_TO_POOL','STAY_HOLD'];
const VALID_WALKIN_STATUS    = ['PENDING','APPROVED','REJECTED'];
const VALID_QUEUE_REQ_TYPE   = ['WALKIN','REASSIGN'];
const VALID_QUEUE_REQ_STATUS = ['PENDING','APPROVED','REJECTED'];
const VALID_QUEUE_MSG_TYPE   = ['DIRECT','BROADCAST'];
const VALID_JOB_EVENT_ACTION = ['CREATED','ASSIGNED','IN_PROGRESS','PAUSED','RESUMED','COMPLETED','REASSIGNED','MERGED','DUPLICATE_FLAGGED','JUNK_FLAGGED'];
const VALID_WORKFLOW_STATUS  = ['NONE','PENDING','IN_PROGRESS','COMPLETED'];
const VALID_ACTIVE_STAGE     = ['press','lamination','foil','binding','fusing','holes','cutting','creasing','dieCutting','cornerCutting','cutting2','done'];
const VALID_PARCEL_STATUS    = ['PENDING','PACKED','DISPATCHED'];
const VALID_RECEIVER_TYPE    = ['SELF','OTHER'];
const VALID_LAM_SIDE         = ['SINGLE','DOUBLE'];
const VALID_CORNER_POS       = ['TL','TR','BL','BR'];
const VALID_INGESTION_STATUS = ['PENDING','PROCESSING','COMPLETED','FAILED'];
const VALID_PARCEL_RECV_TYPE = ['SELF','OTHER'];

function cleanActiveStage(v) {
  if (!v) return 'press';
  const s = String(v).trim();
  if (VALID_ACTIVE_STAGE.includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'diecutting') return 'dieCutting';
  if (lower === 'cornercutting') return 'cornerCutting';
  return VALID_ACTIVE_STAGE.includes(lower) ? lower : 'press';
}

function cleanWorkflowStatus(v) {
  if (!v) return 'NONE';
  const s = String(v).trim().toUpperCase();
  return VALID_WORKFLOW_STATUS.includes(s) ? s : 'NONE';
}

function cleanLamSide(v) {
  if (!v) return 'SINGLE';
  const s = String(v).toUpperCase().trim();
  if (s === 'DOUBLE' || s === 'DOUBLE_SIDE' || s === 'DOUBLE-SIDE') return 'DOUBLE';
  return 'SINGLE';
}

function getCornerPositions(obj) {
  if (!obj) return [];
  const positions = [];
  if (obj.tl) positions.push('TL');
  if (obj.tr) positions.push('TR');
  if (obj.bl) positions.push('BL');
  if (obj.br) positions.push('BR');
  return positions;
}

// Resolve a Mongo ObjectId ref to a PG integer via in-memory cache
function pgId(entityType, mongoId) {
  if (!mongoId) return null;
  const id = cache[entityType]?.get(oid(mongoId));
  return id ?? null;
}

// ─── Roles seed (idempotent) ──────────────────────────────────────────────────
const ALL_ROLES = [
  'ADMIN','PREPRESS','CASHIER','DISPATCH','PRESS','POST_PRESS',
  'FINISHING','FINISHING_CUTTING','FINISHING_DIE_CUTTING',
  'FINISHING_CREASING','FINISHING_CORNER_CUT',
];

async function seedRoles() {
  console.log('[seed] Seeding roles...');
  if (DRY_RUN) { console.log('  [dry-run] skip'); return; }
  await prisma.role.createMany({
    data: ALL_ROLES.map(roleName => ({ roleName })),
    skipDuplicates: true,
  });
}

// ─── Phase 0: Truncate ───────────────────────────────────────────────────────
async function truncateAll() {
  if (RESUME) {
    console.log('[truncate] --resume: skipping truncate.');
    return;
  }
  if (DRY_RUN) {
    console.log('[truncate] [dry-run] would TRUNCATE all tables.');
    return;
  }
  console.log('[truncate] Truncating all tables (RESTART IDENTITY CASCADE)...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "JobParcelItem","JobParcel",
      "DieCuttingRow","DieCuttingSpec",
      "LaminationSpec","BindingSpec","CreasingSpec","CuttingSpec",
      "CornerCuttingSpec","FoilSpec","IdCardSpec",
      "JobItemWorkflowStep","JobItem",
      "JobItemScreenshot","JobTaskLog","PackingOverride",
      "Job","Parcel","JobEvent","QueueMessage",
      "JobCardDieCuttingRow","JobCard",
      "QueueJob","WalkinRequest","QueueRequest",
      "QueueUnread","QueueSession","CustomerPreference",
      "Customer","QueueStats","IngestionTask",
      "UserRole","User","Role","SystemConfig",
      "MigrationMap","SyncFailureQueue","WriteSyncLog",
      "EmailAccount"
    RESTART IDENTITY CASCADE
  `);
  console.log('[truncate] Done.');
}

// ─── Load caches for --resume mode ───────────────────────────────────────────
async function loadCachesForResume() {
  if (!RESUME) return;
  console.log('[resume] Loading existing MigrationMap into memory...');
  const maps = await prisma.migrationMap.findMany();
  for (const m of maps) {
    if (cache[m.entityType]) {
      cache[m.entityType].set(m.mongoId, m.postgresId);
    }
  }
  console.log(`[resume] Loaded ${maps.length} existing mappings.`);
}

// ─── MigrationMap writer ──────────────────────────────────────────────────────
async function writeMap(entityType, mongoId, postgresId) {
  if (DRY_RUN) return;
  await prisma.migrationMap.upsert({
    where: { entityType_mongoId: { entityType, mongoId } },
    create: { entityType, mongoId, postgresId },
    update: { postgresId },
  });
}

// ─── Phase 1a: SystemConfig ───────────────────────────────────────────────────
async function migrateSystemConfig(db) {
  const col = db.collection('systemconfigs');
  const count = await col.countDocuments();
  console.log(`[SystemConfig] Migrating ${count} documents...`);
  if (count === 0) { console.log('  (empty collection, skipping)'); return; }

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    try {
      if (!DRY_RUN) {
        await prisma.systemConfig.upsert({
          where: { key: String(doc.key) },
          create: {
            key:         String(doc.key),
            value:       doc.value ?? {},
            description: doc.description || null,
            updatedAt:   safeDate(doc.updatedAt) || new Date(),
          },
          update: {
            value:       doc.value ?? {},
            description: doc.description || null,
            updatedAt:   safeDate(doc.updatedAt) || new Date(),
          },
        });
      }
      done++;
    } catch (err) { logErr('SystemConfig', oid(doc._id), err); }
  }
  console.log(`[SystemConfig] Done — ${done}/${count}`);
}

// ─── Phase 1b: User + UserRole ────────────────────────────────────────────────
async function migrateUsers(db) {
  const col = db.collection('users');
  const count = await col.countDocuments();
  console.log(`[User] Migrating ${count} documents...`);
  if (count === 0) return;

  // Fetch all roles for UserRole linking
  const roleRows = DRY_RUN ? [] : await prisma.role.findMany();
  const roleMap  = new Map(roleRows.map(r => [r.roleName, r.id]));

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      // --resume: skip if already mapped
      if (RESUME && cache.USER.has(mongoId)) { done++; continue; }

      const rawRoles  = normalizeUserRoles(Array.isArray(doc.roles) ? doc.roles : (doc.role ? [doc.role] : []));
      const primaryRole = rawRoles[0] || 'OPERATOR';

      if (!DRY_RUN) {
        const user = await prisma.user.upsert({
          where: { legacyMongoId: mongoId },
          create: {
            legacyMongoId:      mongoId,
            name:               doc.name || 'Unknown',
            email:              doc.email || null,
            phone:              doc.phone || null,
            password:           doc.password || '',
            role:               primaryRole,
            rawRoles:           rawRoles,
            isActive:           doc.isActive !== false,
            lastLoginAt:        safeDate(doc.lastLoginAt),
            lastJobCompletedAt: safeDate(doc.lastJobCompletedAt),
            syncTimestamp:      safeBigInt(doc.syncTimestamp),
            isDeleted:          !!doc.isDeleted,
            deletedAt:          safeDate(doc.deletedAt),
            createdAt:          safeDate(doc.createdAt) || new Date(),
            updatedAt:          safeDate(doc.updatedAt) || new Date(),
          },
          update: {},
        });

        cache.USER.set(mongoId, user.id);
        await writeMap('USER', mongoId, user.id);

        // UserRole links
        for (const roleName of rawRoles) {
          const roleId = roleMap.get(roleName);
          if (!roleId) continue;
          await prisma.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId } },
            create: { userId: user.id, roleId },
            update: {},
          });
        }
      } else {
        cache.USER.set(mongoId, done + 1);
      }
      done++;
      if (done % 50 === 0) console.log(`  [User] ${done}/${count}`);
    } catch (err) { logErr('User', mongoId, err); }
  }
  console.log(`[User] Done — ${done}/${count}`);
}

// ─── Phase 1c: Customer ───────────────────────────────────────────────────────
async function migrateCustomers(db) {
  const col = db.collection('customers');
  const count = await col.countDocuments();
  console.log(`[Customer] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME && cache.CUSTOMER.has(mongoId)) { done++; continue; }

      if (!DRY_RUN) {
        const customer = await prisma.customer.upsert({
          where: { legacyMongoId: mongoId },
          create: {
            legacyMongoId:   mongoId,
            name:            doc.name || 'Unknown',
            phone:           doc.phone || '',
            alternatePhones: Array.isArray(doc.alternatePhones) ? doc.alternatePhones.map(String) : [],
            password:        doc.password || '',
            isCreditCustomer: !!doc.isCreditCustomer,
            isPremium:        !!doc.isPremium,
            emails:           Array.isArray(doc.emails) ? doc.emails.map(String) : [],
            syncTimestamp:    safeBigInt(doc.syncTimestamp),
            isDeleted:        !!doc.isDeleted,
            deletedAt:        safeDate(doc.deletedAt),
            createdAt:        safeDate(doc.createdAt) || new Date(),
            updatedAt:        safeDate(doc.updatedAt) || new Date(),
          },
          update: {},
        });
        cache.CUSTOMER.set(mongoId, customer.id);
        await writeMap('CUSTOMER', mongoId, customer.id);
      } else {
        cache.CUSTOMER.set(mongoId, done + 1);
      }
      done++;
      if (done % 50 === 0) console.log(`  [Customer] ${done}/${count}`);
    } catch (err) { logErr('Customer', mongoId, err); }
  }
  console.log(`[Customer] Done — ${done}/${count}`);
}

// ─── Phase 1d: IngestionTask ──────────────────────────────────────────────────
async function migrateIngestionTasks(db) {
  const col = db.collection('ingestiontasks');
  const count = await col.countDocuments();
  console.log(`[IngestionTask] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    try {
      if (!DRY_RUN) {
        await prisma.ingestionTask.upsert({
          where: { folderPath: String(doc.folderPath || '') },
          create: {
            folderPath:  String(doc.folderPath || ''),
            status:      cleanEnum(doc.status, VALID_INGESTION_STATUS, 'PENDING'),
            attempts:    Number(doc.attempts) || 0,
            error:       doc.error || null,
            startedAt:   safeDate(doc.startedAt),
            completedAt: safeDate(doc.completedAt),
            createdAt:   safeDate(doc.createdAt) || new Date(),
            updatedAt:   safeDate(doc.updatedAt) || new Date(),
          },
          update: {},
        });
      }
      done++;
    } catch (err) { logErr('IngestionTask', oid(doc._id), err); }
  }
  console.log(`[IngestionTask] Done — ${done}/${count}`);
}

// ─── Phase 1e: QueueStats ─────────────────────────────────────────────────────
async function migrateQueueStats(db) {
  // Real data is in `queue_stats` — `queuestats` is empty in this DB
  const col = db.collection('queue_stats');
  const count = await col.countDocuments();
  console.log(`[QueueStats] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    try {
      if (!DRY_RUN) {
        await prisma.queueStats.create({
          data: {
            snapshotAt:      safeDate(doc.snapshotAt) || new Date(),
            queued:          Number(doc.queued)          || 0,
            assigned:        Number(doc.assigned)        || 0,
            paused:          Number(doc.paused)          || 0,
            completedToday:  Number(doc.completedToday)  || 0,
            adminReview:     Number(doc.adminReview)     || 0,
            junk:            Number(doc.junk)            || 0,
            totalInProgress: Number(doc.totalInProgress) || 0,
            activeSessions:  Number(doc.activeSessions)  || 0,
            breachRisk15:    Number(doc.breachRisk15)    || 0,
            breachRisk5:     Number(doc.breachRisk5)     || 0,
            staleJobs:       Number(doc.staleJobs)       || 0,
            lastUpdated:     safeDate(doc.lastUpdated)   || new Date(),
          },
        });
      }
      done++;
    } catch (err) { logErr('QueueStats', oid(doc._id), err); }
  }
  console.log(`[QueueStats] Done — ${done}/${count}`);
}

// ─── Phase 1f: Ghost users (deleted from Mongo but still referenced) ─────────
// These user IDs were deleted from MongoDB but are referenced in sessions/
// preferences/requests. Insert placeholder records so FK links survive.
const GHOST_USER_MONGO_IDS = [
  '695f39f4616f49660c9fd10e',
  '695d032d80631df8f7735dcf',
  '695dd724c8f07ed73e13adea',
];

async function insertGhostUsers() {
  console.log(`[ghost users] Inserting ${GHOST_USER_MONGO_IDS.length} placeholder deleted-user records...`);
  if (DRY_RUN) { console.log('  [dry-run] skip'); return; }
  for (const mongoId of GHOST_USER_MONGO_IDS) {
    if (cache.USER.has(mongoId)) continue;
    try {
      const user = await prisma.user.upsert({
        where: { legacyMongoId: mongoId },
        create: {
          legacyMongoId: mongoId,
          name:          `Deleted Staff (${mongoId.slice(-6)})`,
          phone:         `ghost-${mongoId.slice(-8)}`,
          password:      '',
          role:          'OPERATOR',
          rawRoles:      ['OPERATOR'],
          isActive:      false,
          isDeleted:     true,
          deletedAt:     new Date(),
          syncTimestamp: 0n,
          createdAt:     new Date(),
          updatedAt:     new Date(),
        },
        update: {},
      });
      cache.USER.set(mongoId, user.id);
      await writeMap('USER', mongoId, user.id);
      console.log(`  [ghost] inserted placeholder for ${mongoId} → pgId ${user.id}`);
    } catch (err) { logErr('ghost-user', mongoId, err); }
  }
}

// ─── Phase 1g: Legacy staffs merge ───────────────────────────────────────────
// `staffs` is a single old-format document (staffId string, role lowercase).
// We merge it into User after the main `users` pass, skipping if email/phone already exists.
async function migrateLegacyStaffs(db) {
  const col = db.collection('staffs');
  const count = await col.countDocuments();
  console.log(`[staffs] Merging ${count} legacy staff document(s)...`);
  if (count === 0) return;

  const roleRows = DRY_RUN ? [] : await prisma.role.findMany();
  const roleMap  = new Map(roleRows.map(r => [r.roleName, r.id]));

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME && cache.USER.has(mongoId)) { done++; continue; }

      // Normalize legacy lowercase role (e.g. 'prepress' → 'PREPRESS')
      const rawRoles = normalizeUserRoles([doc.role || 'OPERATOR']);
      const primaryRole = rawRoles[0] || 'OPERATOR';

      // Use staffId as a unique phone surrogate to avoid conflicts
      // Legacy docs have no phone/email — use staffId as identifier
      const syntheticPhone = doc.staffId ? `legacy-${doc.staffId}` : null;

      if (!DRY_RUN) {
        // Check if already exists by legacyMongoId
        const existing = await prisma.user.findUnique({ where: { legacyMongoId: mongoId }, select: { id: true } });
        if (existing) {
          cache.USER.set(mongoId, existing.id);
          done++;
          continue;
        }

        const user = await prisma.user.create({
          data: {
            legacyMongoId: mongoId,
            name:          doc.name || 'Legacy Staff',
            email:         null,
            phone:         syntheticPhone,
            password:      doc.password || '',
            role:          primaryRole,
            rawRoles,
            isActive:      true,
            syncTimestamp: 0n,
            isDeleted:     false,
            createdAt:     new Date(),
            updatedAt:     new Date(),
          },
        });
        cache.USER.set(mongoId, user.id);
        await writeMap('USER', mongoId, user.id);

        for (const roleName of rawRoles) {
          const roleId = roleMap.get(roleName);
          if (!roleId) continue;
          await prisma.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId } },
            create: { userId: user.id, roleId },
            update: {},
          });
        }
      } else {
        cache.USER.set(mongoId, done + 9000);
      }
      done++;
    } catch (err) { logErr('staffs(legacy)', mongoId, err); }
  }
  console.log(`[staffs] Done — ${done}/${count}`);
}

// ─── Phase 1g: EmailAccount (from onlinejobs) ────────────────────────────────
async function migrateEmailAccounts(db) {
  const col = db.collection('onlinejobs');
  const count = await col.countDocuments();
  console.log(`[EmailAccount] Migrating ${count} document(s) from onlinejobs...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    try {
      const email = String(doc.Email || doc.email || '').trim();
      if (!email) { logErr('EmailAccount', oid(doc._id), new Error('Missing email field')); continue; }
      if (!DRY_RUN) {
        await prisma.emailAccount.upsert({
          where: { email },
          create: {
            email,
            isActive:  doc.Active !== false,
            isBusy:    !!doc.Busy,
            createdAt: new Date(doc.createdAt || Date.now()),
            updatedAt: new Date(doc.updatedAt || Date.now()),
          },
          update: {
            isActive: doc.Active !== false,
            isBusy:   !!doc.Busy,
          },
        });
      }
      done++;
    } catch (err) { logErr('EmailAccount', oid(doc._id), err); }
  }
  console.log(`[EmailAccount] Done — ${done}/${count}`);
}

// ─── Phase 2a: CustomerPreference ────────────────────────────────────────────
async function migrateCustomerPreferences(db) {
  const col = db.collection('customerpreferences');
  const count = await col.countDocuments();
  console.log(`[CustomerPreference] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    try {
      const staffMongoId = oid(doc.preferredStaff || doc.preferredStaffId);
      const staffPgId    = pgId('USER', staffMongoId);
      if (!staffPgId) {
        logErr('CustomerPreference', oid(doc._id), new Error(`User not found: ${staffMongoId}`));
        continue;
      }
      if (!DRY_RUN) {
        await prisma.customerPreference.upsert({
          where: { customerEmail_preferredStaffId: {
            customerEmail:   String(doc.customerEmail || ''),
            preferredStaffId: staffPgId,
          }},
          create: {
            customerEmail:              String(doc.customerEmail || ''),
            customerName:               doc.customerName || null,
            preferredStaffId:           staffPgId,
            legacyPreferredStaffMongoId: staffMongoId,
            confirmedCount:             Number(doc.confirmedCount) || 1,
            createdAt:                  safeDate(doc.createdAt) || new Date(),
            updatedAt:                  safeDate(doc.updatedAt) || new Date(),
          },
          update: {},
        });
      }
      done++;
    } catch (err) { logErr('CustomerPreference', oid(doc._id), err); }
  }
  console.log(`[CustomerPreference] Done — ${done}/${count}`);
}

// ─── Phase 2b: QueueSession ───────────────────────────────────────────────────
async function migrateQueueSessions(db) {
  const col = db.collection('queuesessions');
  const count = await col.countDocuments();
  console.log(`[QueueSession] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME) {
        const exists = await prisma.queueSession.findUnique({ where: { legacyMongoId: mongoId }, select: { id: true } });
        if (exists) { done++; continue; }
      }
      const staffPgId = pgId('USER', oid(doc.staffId || doc.staff));
      if (!staffPgId) {
        logErr('QueueSession', mongoId, new Error(`User not found: ${oid(doc.staffId)}`));
        continue;
      }
      if (!DRY_RUN) {
        await prisma.queueSession.create({
          data: {
            legacyMongoId:                mongoId,
            staffId:                      staffPgId,
            loginAt:                      safeDate(doc.loginAt) || new Date(),
            logoutAt:                     safeDate(doc.logoutAt),
            isActive:                     doc.isActive !== false,
            isQueuePaused:                !!doc.isQueuePaused,
            legacyCurrentQueueJobMongoId: oid(doc.currentQueueJob) || null,
            legacyCurrentWalkinJobMongoId:oid(doc.currentWalkinJob) || null,
            pinnedJobs:                   doc.pinnedJobs || null,
            pausedJobs:                   doc.pausedJobs || null,
            serverVersion:                doc.serverVersion || '1.0.6-trojan',
            lastSeenAt:                   safeDate(doc.lastSeenAt),
            syncTimestamp:                safeBigInt(doc.syncTimestamp),
            isDeleted:                    !!doc.isDeleted,
            deletedAt:                    safeDate(doc.deletedAt),
            createdAt:                    safeDate(doc.createdAt) || new Date(),
            updatedAt:                    safeDate(doc.updatedAt) || new Date(),
          },
        });
      }
      done++;
      if (done % 50 === 0) console.log(`  [QueueSession] ${done}/${count}`);
    } catch (err) { logErr('QueueSession', mongoId, err); }
  }
  console.log(`[QueueSession] Done — ${done}/${count}`);
}

// ─── Phase 2c: QueueUnread ────────────────────────────────────────────────────
async function migrateQueueUnreads(db) {
  const col = db.collection('queueunreads');
  const count = await col.countDocuments();
  console.log(`[QueueUnread] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      const userPgId = pgId('USER', oid(doc.userId || doc.user));
      if (!userPgId) {
        logErr('QueueUnread', mongoId, new Error(`User not found: ${oid(doc.userId)}`));
        continue;
      }
      if (!DRY_RUN) {
        await prisma.queueUnread.upsert({
          where: { userId_threadId: { userId: userPgId, threadId: String(doc.threadId || mongoId) }},
          create: {
            legacyMongoId: mongoId,
            userId:        userPgId,
            threadId:      String(doc.threadId || mongoId),
            count:         Number(doc.count) || 0,
            createdAt:     safeDate(doc.createdAt) || new Date(),
            updatedAt:     safeDate(doc.updatedAt) || new Date(),
          },
          update: {},
        });
      }
      done++;
    } catch (err) { logErr('QueueUnread', mongoId, err); }
  }
  console.log(`[QueueUnread] Done — ${done}/${count}`);
}

// ─── Phase 2d: QueueRequest ───────────────────────────────────────────────────
async function migrateQueueRequests(db) {
  const col = db.collection('queuerequests');
  const count = await col.countDocuments();
  console.log(`[QueueRequest] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME) {
        const exists = await prisma.queueRequest.findUnique({ where: { legacyMongoId: mongoId }, select: { id: true } });
        if (exists) { done++; continue; }
      }
      const requesterPgId = pgId('USER', oid(doc.requestedBy || doc.requestedById));
      if (!requesterPgId) {
        logErr('QueueRequest', mongoId, new Error(`User not found: ${oid(doc.requestedBy)}`));
        continue;
      }
      if (!DRY_RUN) {
        await prisma.queueRequest.create({
          data: {
            legacyMongoId:          mongoId,
            type:                   cleanEnum(doc.type, VALID_QUEUE_REQ_TYPE, 'WALKIN'),
            description:            String(doc.description || ''),
            requestedById:          requesterPgId,
            legacyJobMongoId:       oid(doc.job || doc.jobId) || null,
            status:                 cleanEnum(doc.status, VALID_QUEUE_REQ_STATUS, 'PENDING'),
            adminAction:            doc.adminAction || null,
            legacyResultJobMongoId: oid(doc.resultJob || doc.resultJobId) || null,
            createdAt:              safeDate(doc.createdAt) || new Date(),
            updatedAt:              safeDate(doc.updatedAt) || new Date(),
          },
        });
      }
      done++;
    } catch (err) { logErr('QueueRequest', mongoId, err); }
  }
  console.log(`[QueueRequest] Done — ${done}/${count}`);
}

// ─── Phase 2e: WalkinRequest ──────────────────────────────────────────────────
async function migrateWalkinRequests(db) {
  const col = db.collection('walkinrequests');
  const count = await col.countDocuments();
  console.log(`[WalkinRequest] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME) {
        const exists = await prisma.walkinRequest.findUnique({ where: { legacyMongoId: mongoId }, select: { id: true } });
        if (exists) { done++; continue; }
      }
      const requesterPgId = pgId('USER', oid(doc.requestedBy || doc.requestedById));
      if (!requesterPgId) {
        logErr('WalkinRequest', mongoId, new Error(`User not found: ${oid(doc.requestedBy)}`));
        continue;
      }
      const assignedPgId = pgId('USER', oid(doc.assignedTo || doc.assignedToId)) || null;

      if (!DRY_RUN) {
        await prisma.walkinRequest.create({
          data: {
            legacyMongoId:         mongoId,
            description:           String(doc.description || ''),
            requestedById:         requesterPgId,
            assignedToId:          assignedPgId,
            status:                cleanEnum(doc.status, VALID_WALKIN_STATUS, 'PENDING'),
            adminAction:           doc.adminAction || null,
            legacyQueueJobMongoId: oid(doc.queueJob || doc.queueJobId) || null,
            createdAt:             safeDate(doc.createdAt) || new Date(),
            updatedAt:             safeDate(doc.updatedAt) || new Date(),
          },
        });
      }
      done++;
    } catch (err) { logErr('WalkinRequest', mongoId, err); }
  }
  console.log(`[WalkinRequest] Done — ${done}/${count}`);
}

// ─── Phase 2f: QueueJob (without parentJobId — resolved in post-pass) ─────────
async function migrateQueueJobs(db) {
  const col = db.collection('queuejobs');
  const count = await col.countDocuments();
  console.log(`[QueueJob] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME && cache.QUEUEJOB.has(mongoId)) { done++; continue; }

      const status = cleanEnum(doc.status, VALID_QUEUE_STATUS, 'QUEUED');
      const type   = cleanEnum(doc.type,   VALID_QUEUE_TYPE,   'EMAIL');

      // complexity — case-sensitive enum (easy/medium/complex)
      let complexityTag = null;
      if (doc.complexityTag) {
        const ct = String(doc.complexityTag).toLowerCase().trim();
        if (VALID_COMPLEXITY.includes(ct)) complexityTag = ct;
      }

      if (!DRY_RUN) {
        const qj = await prisma.queueJob.upsert({
          where: { legacyMongoId: mongoId },
          create: {
            legacyMongoId:           mongoId,
            emailSubject:            doc.emailSubject   || null,
            customerName:            doc.customerName   || null,
            customerEmail:           doc.customerEmail  || null,
            customerPhone:           doc.customerPhone  || null,
            mailBody:                doc.mailBody       || null,
            folderPath:              String(doc.folderPath || ''),
            relativeFolderPath:      doc.relativeFolderPath || null,
            attachments:             Array.isArray(doc.attachments) ? doc.attachments.map(String) : [],
            attachmentMeta:          doc.attachmentMeta || null,
            externalLinks:           doc.externalLinks  || null,
            status,
            priorityScore:           Number(doc.priorityScore) || 0,
            queuePosition:           safeBigInt(doc.queuePosition),
            pinnedToStaffId:         pgId('USER', oid(doc.pinnedTo || doc.pinnedToStaff || doc.pinnedToStaffId)),
            isHardPinned:            !!doc.isHardPinned,
            assignedToId:            pgId('USER', oid(doc.assignedTo || doc.assignedToId)),
            assignedAt:              safeDate(doc.assignedAt),
            completedAt:             safeDate(doc.completedAt),
            dueBy:                   safeDate(doc.dueBy),
            complexityTag,
            lastPausedById:          pgId('USER', oid(doc.lastPausedBy || doc.lastPausedById)),
            type,
            handoffNotes:            doc.handoffNotes       || null,
            staffHandoffReason:      doc.staffHandoffReason || null,
            adminHandoffNotes:       doc.adminHandoffNotes  || null,
            reassignedFromId:        pgId('USER', oid(doc.reassignedFrom || doc.reassignedFromId)),
            returnReason:            doc.returnReason  || null,
            pauseReason:             doc.pauseReason   || null,
            holdUntil:               safeDate(doc.holdUntil),
            holdBehavior:            cleanEnum(doc.holdBehavior, VALID_HOLD_BEHAVIOR, 'STAY_HOLD'),
            fingerprint:             doc.fingerprint   || null,
            threadId:                doc.threadId      || null,
            version:                 Number(doc.version) || 1,
            isAutoAssigned:          !!doc.isAutoAssigned,
            continuityContext:       doc.continuityContext || null,
            // parentJobId resolved in post-pass
            legacyParentJobMongoId:  oid(doc.parentJob || doc.parentJobId) || null,
            isSuperseded:            !!doc.isSuperseded,
            auditLog:                doc.auditLog || null,
            syncTimestamp:           safeBigInt(doc.syncTimestamp),
            isDeleted:               !!doc.isDeleted,
            deletedAt:               safeDate(doc.deletedAt),
            createdAt:               safeDate(doc.createdAt) || new Date(),
            updatedAt:               safeDate(doc.updatedAt) || new Date(),
          },
          update: {},
        });
        cache.QUEUEJOB.set(mongoId, qj.id);
        await writeMap('QUEUEJOB', mongoId, qj.id);
      } else {
        cache.QUEUEJOB.set(mongoId, done + 1);
      }
      done++;
      if (done % 50 === 0) console.log(`  [QueueJob] ${done}/${count}`);
    } catch (err) { logErr('QueueJob', mongoId, err); }
  }
  console.log(`[QueueJob] Done — ${done}/${count}`);
}

// ─── Phase 2g: JobCard + DieCuttingRows ──────────────────────────────────────
async function migrateJobCards(db) {
  const col = db.collection('jobcards');
  const count = await col.countDocuments();
  console.log(`[JobCard] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME && cache.JOBCARD.has(mongoId)) { done++; continue; }

      if (!DRY_RUN) {
        const jc = await prisma.jobCard.upsert({
          where: { legacyMongoId: mongoId },
          create: {
            legacyMongoId:        mongoId,
            jobId:                String(doc.jobId || mongoId),
            customerName:         String(doc.customerName || ''),
            totalItems:           Number(doc.totalItems) || 0,
            attBy:                doc.attBy       || null,
            date:                 safeDate(doc.date),
            hasCutting:           !!doc.hasCutting,
            hasDieCutting:        !!doc.hasDieCutting,
            hasLamination:        !!doc.hasLamination,
            hasPerforation:       !!doc.hasPerforation,
            hasNcBox:             !!doc.hasNcBox,
            hasCreasing:          !!doc.hasCreasing,
            hasCornerCut:         !!doc.hasCornerCut,
            hasBinding:           !!doc.hasBinding,
            hasFoil:              !!doc.hasFoil,
            hasIdCard:            !!doc.hasIdCard,
            vcBoxCount:           doc.vcBoxCount      || null,
            foilType:             doc.foilType        || null,
            foilQty:              doc.foilQty         || null,
            idFusing:             !!doc.idFusing,
            idFusingType:         doc.idFusingType    || null,
            idFusingQty:          doc.idFusingQty     || null,
            idHoles:              !!doc.idHoles,
            idHolesType:          doc.idHolesType     || null,
            cornerNoOfCards:      doc.cornerNoOfCards || null,
            cornerDate:           doc.cornerDate      || null,
            cornerTl:             !!(doc.cornerTl ?? doc.corner?.tl),
            cornerTr:             !!(doc.cornerTr ?? doc.corner?.tr),
            cornerBl:             !!(doc.cornerBl ?? doc.corner?.bl),
            cornerBr:             !!(doc.cornerBr ?? doc.corner?.br),
            cuttingNoOfCutting:   doc.cuttingNoOfCutting || null,
            cuttingDate:          doc.cuttingDate        || null,
            cuttingSizes:         Array.isArray(doc.cuttingSizes) ? doc.cuttingSizes.map(String) : [],
            bindingNoOfBooks:     doc.bindingNoOfBooks    || null,
            bindingCenterPin:     !!doc.bindingCenterPin,
            bindingCenterPinQty:  doc.bindingCenterPinQty || null,
            bindingPerfect:       !!doc.bindingPerfect,
            bindingPerfectQty:    doc.bindingPerfectQty   || null,
            bindingCase:          !!doc.bindingCase,
            bindingCaseQty:       doc.bindingCaseQty      || null,
            bindingWiro:          !!doc.bindingWiro,
            bindingWiroQty:       doc.bindingWiroQty      || null,
            bindingPouchLam:      !!doc.bindingPouchLam,
            bindingPouchLamQty:   doc.bindingPouchLamQty  || null,
            bindingSpecial:       !!doc.bindingSpecial,
            bindingSpecialQty:    doc.bindingSpecialQty   || null,
            bindingSpecialDesc:   doc.bindingSpecialDesc  || null,
            bindingDate:          doc.bindingDate          || null,
            lamDate:              doc.lamDate              || null,
            lamGlossy:            !!doc.lamGlossy,
            lamGlossyQty:         doc.lamGlossyQty         || null,
            lamGlossySide:        doc.lamGlossySide        || null,
            lamMatt:              !!doc.lamMatt,
            lamMattQty:           doc.lamMattQty           || null,
            lamMattSide:          doc.lamMattSide          || null,
            lamVelvet:            !!doc.lamVelvet,
            lamVelvetQty:         doc.lamVelvetQty         || null,
            lamVelvetSide:        doc.lamVelvetSide        || null,
            lamSingleSide:        !!doc.lamSingleSide,
            lamDoubleSide:        !!doc.lamDoubleSide,
            lamOther:             !!doc.lamOther,
            lamOtherType:         doc.lamOtherType         || null,
            lamOtherQty:          doc.lamOtherQty          || null,
            lamOtherSide:         doc.lamOtherSide         || null,
            cpNoOfSheets:         doc.cpNoOfSheets         || null,
            cpNoOfStock:          doc.cpNoOfStock          || null,
            cpDate:               doc.cpDate               || null,
            cpCreasing:           !!doc.cpCreasing,
            cpCreasingNo:         doc.cpCreasingNo         || null,
            cpPerforation:        !!doc.cpPerforation,
            cpPerforationNo:      doc.cpPerforationNo      || null,
            cpWheelPerforation:   !!doc.cpWheelPerforation,
            cpWheelPerforationNo: doc.cpWheelPerforationNo || null,
            dieCuttingNoOfSheets: doc.dieCuttingNoOfSheets || null,
            dieCuttingDate:       doc.dieCuttingDate       || null,
            syncTimestamp:        safeBigInt(doc.syncTimestamp),
            isDeleted:            !!doc.isDeleted,
            deletedAt:            safeDate(doc.deletedAt),
            createdAt:            safeDate(doc.createdAt) || new Date(),
            updatedAt:            safeDate(doc.updatedAt) || new Date(),
            dieCuttingRows: {
              create: (Array.isArray(doc.dieCuttingRows) ? doc.dieCuttingRows : []).map((r, i) => ({
                sheets:     r.sheets     ? String(r.sheets)     : null,
                halfCut:    r.halfCut    ? String(r.halfCut)    : null,
                throughCut: r.throughCut ? String(r.throughCut) : null,
                timing:     r.timing     ? String(r.timing)     : null,
                sortOrder:  Number(r.sortOrder ?? i),
              })),
            },
          },
          update: {},
        });
        cache.JOBCARD.set(mongoId, jc.id);
        await writeMap('JOBCARD', mongoId, jc.id);
      } else {
        cache.JOBCARD.set(mongoId, done + 1);
      }
      done++;
    } catch (err) { logErr('JobCard', mongoId, err); }
  }
  console.log(`[JobCard] Done — ${done}/${count}`);
}

// ─── Phase 3a: Job (complex nested entity) ───────────────────────────────────
async function migrateJobs(db) {
  const col = db.collection('jobs');
  const count = await col.countDocuments();
  console.log(`[Job] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(50);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME && cache.JOB.has(mongoId)) { done++; continue; }

      const customerId = pgId('CUSTOMER', oid(doc.customer || doc.customerId));
      if (!customerId) {
        logErr('Job', mongoId, new Error(`Customer not found: ${oid(doc.customer || doc.customerId)}`));
        continue;
      }

      if (DRY_RUN) { cache.JOB.set(mongoId, done + 1); done++; continue; }

      await prisma.$transaction(async (tx) => {
        const job = await tx.job.upsert({
          where: { legacyMongoId: mongoId },
          create: {
            legacyMongoId:                     mongoId,
            jobId:                             String(doc.jobId || mongoId),
            customerName:                      String(doc.customerName || ''),
            totalItems:                        Number(doc.totalItems) || 0,
            filesArchived:                     !!doc.filesArchived,
            packingPreference:                 cleanEnum(doc.packingPreference, VALID_PACKING, 'SINGLE'),
            packingMode:                       doc.packingMode ? cleanEnum(doc.packingMode, VALID_PACKING, null) : null,
            defaultDeliveryType:               cleanEnum(doc.defaultDeliveryType, VALID_DELIVERY, 'COURIER'),
            contactMe:                         !!doc.contactMe,
            paymentStatus:                     cleanEnum(doc.paymentStatus, VALID_PAYMENT_STATUS, 'UNPAID'),
            jobStatus:                         cleanEnum(doc.jobStatus || doc.status, VALID_JOB_STATUS, 'PENDING'),
            dispatchedAt:                      safeDate(doc.dispatchedAt),
            rackLocation:                      doc.rackLocation || null,
            customerId,
            customerPhone:                     String(doc.customerPhone || ''),
            customerConfirmedAt:               safeDate(doc.customerConfirmedAt),
            approvalRequested:                 !!doc.approvalRequested,
            paymentMode:                       doc.paymentMode ? cleanEnum(doc.paymentMode, VALID_PAYMENT_MODE, null) : null,
            createdById:                       pgId('USER', oid(doc.createdBy || doc.createdById)),
            legacyCreatedByMongoId:            oid(doc.createdBy || doc.createdById),
            printedById:                       pgId('USER', oid(doc.printedBy || doc.printedById)),
            legacyPrintedByMongoId:            oid(doc.printedBy || doc.printedById),
            ppsCompletedById:                  pgId('USER', oid(doc.ppsCompletedBy || doc.ppsCompletedById)),
            legacyPpsCompletedByMongoId:       oid(doc.ppsCompletedBy || doc.ppsCompletedById),
            ppsCompletedAt:                    safeDate(doc.ppsCompletedAt),
            finishingCompletedById:            pgId('USER', oid(doc.finishingCompletedBy || doc.finishingCompletedById)),
            legacyFinishingCompletedByMongoId: oid(doc.finishingCompletedBy || doc.finishingCompletedById),
            finishingCompletedAt:              safeDate(doc.finishingCompletedAt),
            adminApprovalNote:                 doc.adminApprovalNote || null,
            adminApprovedAt:                   safeDate(doc.adminApprovedAt),
            paymentHandledById:                pgId('USER', oid(doc.paymentHandledBy || doc.paymentHandledById)),
            legacyPaymentHandledByMongoId:     oid(doc.paymentHandledBy || doc.paymentHandledById),
            dispatchedById:                    pgId('USER', oid(doc.dispatchedBy || doc.dispatchedById)),
            legacyDispatchedByMongoId:         oid(doc.dispatchedBy || doc.dispatchedById),
            packedById:                        pgId('USER', oid(doc.packedBy || doc.packedById)),
            legacyPackedByMongoId:             oid(doc.packedBy || doc.packedById),
            syncTimestamp:                     safeBigInt(doc.syncTimestamp),
            isDeleted:                         !!doc.isDeleted,
            deletedAt:                         safeDate(doc.deletedAt),
            createdAt:                         safeDate(doc.createdAt) || new Date(),
            updatedAt:                         safeDate(doc.updatedAt) || new Date(),
          },
          update: {},
          select: { id: true },
        });

        const jobId = job.id;
        cache.JOB.set(mongoId, jobId);

        // Screenshots
        const screenshots = Array.isArray(doc.itemScreenshots) ? doc.itemScreenshots : [];
        if (screenshots.length > 0) {
          await tx.jobItemScreenshot.createMany({
            data: screenshots.map((screenshotPath, i) => ({ jobId, screenshotPath: String(screenshotPath), sortOrder: i })),
          });
        }

        // Task logs
        const taskLog = Array.isArray(doc.taskLog) ? doc.taskLog : [];
        if (taskLog.length > 0) {
          await tx.jobTaskLog.createMany({
            data: taskLog.map(log => ({
              jobId,
              task:        String(log.task || ''),
              itemIndex:   Number(log.itemIndex) || 0,
              startedAt:   safeDate(log.startedAt),
              completedAt: safeDate(log.completedAt),
              durationMs:  log.durationMs != null ? Math.min(Number(log.durationMs), 2147483647) : null,
              staffName:   log.staffName || null,
              staffId:     log.staffId   ? Number(log.staffId) : null,
              module:      log.module    ? String(log.module)  : null,
            })),
          });
        }

        // Packing override
        if (doc.packingOverride) {
          const o = doc.packingOverride;
          await tx.packingOverride.create({
            data: {
              jobId,
              overridden:     !!o.overridden,
              reason:         o.reason || null,
              overriddenById: (o.overriddenBy || o.overriddenById) ? Number(o.overriddenBy || o.overriddenById) : null,
              overriddenAt:   safeDate(o.overriddenAt),
            },
          });
        }

        // Items
        const items = Array.isArray(doc.items) ? doc.items : [];
        const jobItemIds = [];

        if (items.length > 0) {
          const itemsData = items.map((item, index) => {
            let sizeDefault = 'Custom', sizeH = null, sizeW = null, qty = '1';
            if (item.size) {
              sizeDefault = item.size.defaultVal || 'Custom';
              sizeH = item.size.h  ? String(item.size.h)  : null;
              sizeW = item.size.w  ? String(item.size.w)  : null;
              qty   = item.size.qty ? String(item.size.qty) : '1';
            } else {
              sizeDefault = item.sizeDefault || 'Custom';
              sizeH = item.sizeH ? String(item.sizeH) : null;
              sizeW = item.sizeW ? String(item.sizeW) : null;
              qty   = item.qty   ? String(item.qty)   : '1';
            }
            return {
              jobId,
              itemIndex:      index,
              orderDescription: item.orderDescription || null,
              media:          item.media     || null,
              type:           item.type      || null,
              printType:      item.printType || null,
              sizeDefault, sizeH, sizeW, qty,
              pages:          item.pages   ? String(item.pages)   : null,
              sheets:         item.sheets  ? String(item.sheets)  : null,
              mc:             item.mc      ? String(item.mc)      : null,
              fc:             item.fc      ? String(item.fc)      : null,
              ac:             item.ac      ? String(item.ac)      : null,
              screenshot:     item.screenshot || null,
              printConfirmed: !!item.printConfirmed,
              pressStatus:    cleanWorkflowStatus(item.pressStatus || item.status),
              activeStage:    cleanActiveStage(item.activeStage),
              printedById:    (item.printedById || item.printedBy) ? Number(item.printedById || item.printedBy) : null,
              pouchLamination: !!item.pouchLamination,
              idCard:          !!item.idCard,
              syncTimestamp:  0n,
            };
          });

          const createdItems = await tx.jobItem.createManyAndReturn({ data: itemsData });
          for (let i = 0; i < createdItems.length; i++) jobItemIds[i] = createdItems[i].id;

          // Specs
          const laminationSpecs = [], bindingSpecs = [], creasingSpecs = [];
          const cuttingSpecs = [], cornerCuttingSpecs = [], foilSpecs = [], idCardSpecs = [];
          const dieCuttingItems = [];
          const pendingWorkflowSteps = [];

          for (let i = 0; i < items.length; i++) {
            const item      = items[i];
            const jobItemId = createdItems[i].id;

            if (item.lamination && item.lamination !== 'NONE')
              laminationSpecs.push({ jobItemId, variant: item.lamination, quantity: Number(item.laminationQty) || 0, side: cleanLamSide(item.laminationSide) });
            if (item.binding && item.binding !== 'NONE' && item.binding !== 'POUCH_LAMINATION')
              bindingSpecs.push({ jobItemId, variant: item.binding, quantity: Number(item.bindingQty) || 0, bindingNo: item.bindingNo || null });
            if (item.creasing && item.creasing !== 'NONE')
              creasingSpecs.push({ jobItemId, variant: item.creasing, quantity: Number(item.creasingQty) || 0, creasingNo: item.creasingNo || null });
            if (item.cutting && item.cutting !== 'NONE')
              cuttingSpecs.push({ jobItemId, variant: item.cutting, value: item.cuttingValue || null, sizes: Array.isArray(item.cuttingSizes) ? item.cuttingSizes.filter(Boolean).map(String) : [] });
            if (item.cornerCutting && item.cornerCutting !== 'NONE')
              cornerCuttingSpecs.push({ jobItemId, variant: item.cornerCutting, quantity: Number(item.cornerCuttingQty) || 0, corners: getCornerPositions(item.cornerCuttingCorners) });
            if (item.foil && item.foil !== 'NONE')
              foilSpecs.push({ jobItemId, variant: item.foil, quantity: Number(item.foilQty) || 0 });
            if (item.dieCutting && item.dieCutting !== 'NONE')
              dieCuttingItems.push({ jobItemId, item });

            const hasIdCardSpec = !!item.idCard || (item.fusing && item.fusing !== 'NONE') || (item.holes && item.holes !== 'NONE') || (item.cutting2 && item.cutting2 !== 'NONE');
            if (hasIdCardSpec)
              idCardSpecs.push({ jobItemId, fusing: !!(item.fusing && item.fusing !== 'NONE'), holes: !!(item.holes && item.holes !== 'NONE'), cutting2: !!(item.cutting2 && item.cutting2 !== 'NONE'), qty: Number(item.idCardQty || item.fusingQty) || 0 });

            const STAGES = [
              ['press', cleanWorkflowStatus(item.pressStatus || item.status)],
              ['lamination',    cleanWorkflowStatus(item.laminationStatus)],
              ['binding',       cleanWorkflowStatus(item.bindingStatus)],
              ['creasing',      cleanWorkflowStatus(item.creasingStatus)],
              ['cutting',       cleanWorkflowStatus(item.cuttingStatus)],
              ['dieCutting',    cleanWorkflowStatus(item.dieCuttingStatus)],
              ['cornerCutting', cleanWorkflowStatus(item.cornerCuttingStatus)],
              ['foil',          cleanWorkflowStatus(item.foilStatus)],
              ['fusing',        cleanWorkflowStatus(item.fusingStatus)],
              ['holes',         cleanWorkflowStatus(item.holesStatus)],
              ['cutting2',      cleanWorkflowStatus(item.cutting2Status)],
            ].filter(([, s]) => s && s !== 'NONE');
            for (const [stepName, status] of STAGES) pendingWorkflowSteps.push({ jobItemId, stepName, status });
          }

          // Batch spec inserts (all in parallel)
          await Promise.all([
            laminationSpecs.length    && tx.laminationSpec.createMany({ data: laminationSpecs }),
            bindingSpecs.length       && tx.bindingSpec.createMany({ data: bindingSpecs }),
            creasingSpecs.length      && tx.creasingSpec.createMany({ data: creasingSpecs }),
            cuttingSpecs.length       && tx.cuttingSpec.createMany({ data: cuttingSpecs }),
            cornerCuttingSpecs.length && tx.cornerCuttingSpec.createMany({ data: cornerCuttingSpecs }),
            foilSpecs.length          && tx.foilSpec.createMany({ data: foilSpecs }),
            idCardSpecs.length        && tx.idCardSpec.createMany({ data: idCardSpecs }),
          ].filter(Boolean));

          // Die cutting — sequential (rows need parent spec ID)
          for (const { jobItemId, item } of dieCuttingItems) {
            await tx.dieCuttingSpec.create({
              data: {
                jobItemId,
                variant:  item.dieCutting,
                quantity: Number(item.dieCuttingQty) || 0,
                rows: {
                  create: (item.dieCuttingRows || []).map((r, rIdx) => ({
                    sheets:     r.sheets     != null ? Number(r.sheets)     : null,
                    halfCut:    r.halfCut    != null ? Number(r.halfCut)    : null,
                    throughCut: r.throughCut != null ? Number(r.throughCut) : null,
                    timing:     r.timing     ? String(r.timing) : null,
                    sortOrder:  Number(r.sortOrder ?? rIdx),
                  })),
                },
              },
            });
          }

          if (pendingWorkflowSteps.length > 0)
            await tx.jobItemWorkflowStep.createMany({ data: pendingWorkflowSteps });
        }

        // Parcels — deduplicate by parcelNo (Mongo sometimes has duplicate entries)
        const rawParcels = Array.isArray(doc.parcels) ? doc.parcels : [];
        const seenParcelNos = new Set();
        const parcels = rawParcels.filter(p => {
          const no = Number(p.parcelNo) || 1;
          if (seenParcelNos.has(no)) return false;
          seenParcelNos.add(no);
          return true;
        });
        for (const p of parcels) {
          const jobParcel = await tx.jobParcel.create({
            data: {
              jobId,
              parcelNo:      Number(p.parcelNo) || 1,
              receiverType:  cleanEnum(p.receiverType, VALID_RECEIVER_TYPE, 'SELF'),
              deliveryType:  cleanEnum(p.deliveryType, VALID_DELIVERY, 'COURIER'),
              receiverName:  p.receiverName  || '',
              receiverPhone: p.receiverPhone || '',
              qrCode:        p.qrCode        || '',
              status:        cleanEnum(p.status, VALID_PARCEL_STATUS, 'PENDING'),
              packedAt:      safeDate(p.packedAt),
              dispatchedAt:  safeDate(p.dispatchedAt),
              dispatchedBy:  p.dispatchedBy  || '',
              rack:          p.rack          || '',
              rackLocation:  p.rackLocation  || '',
            },
          });

          const itemIndexes = Array.isArray(p.itemIndexes) ? p.itemIndexes : [];
          const parcelItemData = [];
          for (const itemIndex of itemIndexes) {
            const jiId  = jobItemIds[Number(itemIndex) - 1];
            if (!jiId) continue;
            const itemStatuses = p.itemStatuses || {};
            const itemStatus   = itemStatuses[String(itemIndex)] || itemStatuses[Number(itemIndex)] || {};
            const rackName     = (p.itemRacks || {})[String(itemIndex)] || (p.itemRacks instanceof Map ? p.itemRacks.get(String(itemIndex)) : null);
            parcelItemData.push({
              jobParcelId:  jobParcel.id,
              jobItemId:    jiId,
              itemIndex:    Number(itemIndex),
              status:       cleanEnum(itemStatus.status, VALID_PARCEL_STATUS, 'PENDING'),
              dispatchedAt: safeDate(itemStatus.dispatchedAt),
              rackName:     rackName || null,
            });
          }
          if (parcelItemData.length > 0)
            await tx.jobParcelItem.createMany({ data: parcelItemData });
        }
      }); // end $transaction

      await writeMap('JOB', mongoId, cache.JOB.get(mongoId));
      done++;
      if (done % 25 === 0) console.log(`  [Job] ${done}/${count}`);
    } catch (err) { logErr('Job', mongoId, err); }
  }
  console.log(`[Job] Done — ${done}/${count}`);
}

// ─── Phase 3b: QueueMessage ───────────────────────────────────────────────────
async function migrateQueueMessages(db) {
  const col = db.collection('queuemessages');
  const count = await col.countDocuments();
  console.log(`[QueueMessage] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME) {
        const exists = await prisma.queueMessage.findUnique({ where: { legacyMongoId: mongoId }, select: { id: true } });
        if (exists) { done++; continue; }
      }
      const senderPgId    = pgId('USER', oid(doc.sender    || doc.senderId));
      const recipientPgId = pgId('USER', oid(doc.recipient || doc.recipientId));
      if (!senderPgId || !recipientPgId) {
        logErr('QueueMessage', mongoId, new Error(`User not found sender=${oid(doc.sender)} recipient=${oid(doc.recipient)}`));
        continue;
      }
      if (!DRY_RUN) {
        await prisma.queueMessage.create({
          data: {
            legacyMongoId:    mongoId,
            senderId:         senderPgId,
            senderName:       String(doc.senderName || ''),
            recipientId:      recipientPgId,
            body:             String(doc.body || ''),
            type:             cleanEnum(doc.type, VALID_QUEUE_MSG_TYPE, 'DIRECT'),
            legacyJobMongoId: oid(doc.job || doc.jobId) || null,
            timestamp:        safeDate(doc.timestamp) || new Date(),
            createdAt:        safeDate(doc.createdAt) || new Date(),
            updatedAt:        safeDate(doc.updatedAt) || new Date(),
          },
        });
      }
      done++;
    } catch (err) { logErr('QueueMessage', mongoId, err); }
  }
  console.log(`[QueueMessage] Done — ${done}/${count}`);
}

// ─── Phase 3c: JobEvent ───────────────────────────────────────────────────────
async function migrateJobEvents(db) {
  const col = db.collection('jobevents');
  const count = await col.countDocuments();
  console.log(`[JobEvent] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME) {
        const exists = await prisma.jobEvent.findUnique({ where: { legacyMongoId: mongoId }, select: { id: true } });
        if (exists) { done++; continue; }
      }
      const userPgId    = pgId('USER',     oid(doc.user    || doc.userId));
      const queueJobPgId = pgId('QUEUEJOB', oid(doc.queueJob || doc.queueJobId));

      if (!DRY_RUN) {
        await prisma.jobEvent.create({
          data: {
            legacyMongoId:         mongoId,
            queueJobId:            queueJobPgId || null,
            legacyQueueJobMongoId: oid(doc.queueJob || doc.queueJobId) || null,
            userId:                userPgId || null,
            actionType:            cleanEnum(doc.actionType || doc.action, VALID_JOB_EVENT_ACTION, 'CREATED'),
            details:               doc.details || null,
            timestamp:             safeDate(doc.timestamp) || new Date(),
          },
        });
      }
      done++;
    } catch (err) { logErr('JobEvent', mongoId, err); }
  }
  console.log(`[JobEvent] Done — ${done}/${count}`);
}

// ─── Phase 3d: Parcel (standalone) ───────────────────────────────────────────
async function migrateParcels(db) {
  const col = db.collection('parcels');
  const count = await col.countDocuments();
  console.log(`[Parcel] Migrating ${count} documents...`);
  if (count === 0) return;

  const cursor = col.find().batchSize(BATCH_SIZE);
  let done = 0;
  for await (const doc of cursor) {
    const mongoId = oid(doc._id);
    try {
      if (RESUME) {
        const exists = await prisma.parcel.findUnique({ where: { legacyMongoId: mongoId }, select: { id: true } });
        if (exists) { done++; continue; }
      }
      if (!DRY_RUN) {
        await prisma.parcel.upsert({
          where: { legacyMongoId: mongoId },
          create: {
            legacyMongoId: mongoId,
            parcelId:      String(doc.parcelId || mongoId),
            jobId:         String(doc.jobId || ''),
            itemCount:     Number(doc.itemCount) || 0,
            receiverType:  cleanEnum(doc.receiverType, VALID_PARCEL_RECV_TYPE, 'SELF'),
            receiverName:  String(doc.receiverName  || ''),
            receiverPhone: String(doc.receiverPhone || ''),
            qrPayload:     doc.qrPayload || null,
            createdAt:     safeDate(doc.createdAt) || new Date(),
            updatedAt:     safeDate(doc.updatedAt) || new Date(),
          },
          update: {},
        });
      }
      done++;
    } catch (err) { logErr('Parcel', mongoId, err); }
  }
  console.log(`[Parcel] Done — ${done}/${count}`);
}

// ─── Post-pass: resolve QueueJob.parentJobId self-reference ──────────────────
async function resolveQueueJobParents() {
  console.log('[post-pass] Resolving QueueJob.parentJobId self-references...');
  if (DRY_RUN) { console.log('  [dry-run] skip'); return; }

  const rows = await prisma.queueJob.findMany({
    where: { legacyParentJobMongoId: { not: null }, parentJobId: null },
    select: { id: true, legacyParentJobMongoId: true },
  });

  let resolved = 0;
  for (const row of rows) {
    const parentPgId = cache.QUEUEJOB.get(row.legacyParentJobMongoId);
    if (!parentPgId) continue;
    await prisma.queueJob.update({
      where: { id: row.id },
      data:  { parentJobId: parentPgId },
    });
    resolved++;
  }
  console.log(`[post-pass] Resolved ${resolved}/${rows.length} parent references.`);
}

// ─── Error log writer ─────────────────────────────────────────────────────────
function writeErrorLog() {
  if (errors.length === 0) { console.log('\n[errors] No errors.'); return; }
  const logDir  = path.join(__dirname, '..', 'migration-logs');
  const logFile = path.join(logDir, `migration-errors-${Date.now()}.json`);
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(logFile, JSON.stringify(errors, null, 2));
  console.log(`\n[errors] ${errors.length} error(s) logged to: ${logFile}`);
  for (const e of errors.slice(0, 10)) {
    console.log(`  - [${e.entity}] ${e.mongoId}: ${e.message}`);
  }
  if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Despatch System: MongoDB → PostgreSQL Migration ===');
  console.log(`Mode: ${RESUME ? 'RESUME' : 'FULL'} | Dry-run: ${DRY_RUN}`);
  console.log(`Mongo: ${MONGO_URI}`);
  console.log('');

  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const db = mongo.db();
  console.log('[connect] MongoDB connected.');

  await prisma.$connect();
  console.log('[connect] PostgreSQL connected.\n');

  try {
    await truncateAll();
    await loadCachesForResume();
    await seedRoles();

    // Phase 1: independent entities
    console.log('\n── Phase 1: Independent entities ──────────────────────');
    await migrateSystemConfig(db);
    await migrateUsers(db);
    await migrateCustomers(db);
    await migrateIngestionTasks(db);
    await migrateQueueStats(db);
    await migrateLegacyStaffs(db);
    await migrateEmailAccounts(db);
    await insertGhostUsers();

    // Phase 2: user/customer dependent
    console.log('\n── Phase 2: User/Customer dependent ───────────────────');
    await migrateCustomerPreferences(db);
    await migrateQueueSessions(db);
    await migrateQueueUnreads(db);
    await migrateQueueRequests(db);
    await migrateWalkinRequests(db);
    await migrateQueueJobs(db);
    await migrateJobCards(db);

    // Phase 3: job/queue dependent
    console.log('\n── Phase 3: Job/Queue dependent ────────────────────────');
    await migrateJobs(db);
    await migrateQueueMessages(db);
    await migrateJobEvents(db);
    await migrateParcels(db);

    // Post-pass
    console.log('\n── Post-pass ────────────────────────────────────────────');
    await resolveQueueJobParents();

  } finally {
    await mongo.close();
    await prisma.$disconnect();
    writeErrorLog();
    console.log('\n=== Migration complete ===');
  }
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  console.error(err.stack);
  process.exit(1);
});
