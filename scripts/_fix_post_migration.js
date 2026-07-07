'use strict';
// One-time post-migration cleanup script. Delete after running.
const prisma = require('../lib/prisma');
const { normalizeUserRoles } = require('../utils/normalizeUserRoles');

async function main() {
  // 1. Remove duplicate QueueStats row (resume run inserted a second snapshot)
  const stats = await prisma.queueStats.findMany({ orderBy: { id: 'asc' } });
  if (stats.length > 1) {
    const extra = stats[stats.length - 1];
    await prisma.queueStats.delete({ where: { id: extra.id } });
    console.log(`[fix] Deleted duplicate QueueStats id=${extra.id}`);
  } else {
    console.log('[fix] QueueStats count OK, nothing to delete');
  }

  // 2. Insert missing ghost user 699d5cd4d4daf4cd072e9c5e
  //    (referenced by 1 QueueUnread, deleted from MongoDB)
  const MISSING_GHOST = '699d5cd4d4daf4cd072e9c5e';
  const existing = await prisma.user.findUnique({ where: { legacyMongoId: MISSING_GHOST } });
  if (!existing) {
    const ghost = await prisma.user.create({
      data: {
        legacyMongoId: MISSING_GHOST,
        name:          `Deleted Staff (${MISSING_GHOST.slice(-6)})`,
        phone:         `ghost-${MISSING_GHOST.slice(-8)}`,
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
    });
    await prisma.migrationMap.upsert({
      where: { entityType_mongoId: { entityType: 'USER', mongoId: MISSING_GHOST } },
      create: { entityType: 'USER', mongoId: MISSING_GHOST, postgresId: ghost.id },
      update: { postgresId: ghost.id },
    });
    console.log(`[fix] Inserted ghost user for ${MISSING_GHOST} → pgId ${ghost.id}`);

    // Now find the orphaned QueueUnread and link it
    const unread = await prisma.queueUnread.findFirst({
      where: { legacyMongoId: '69eae61fc761bf6a5a16e35c' }
    });
    if (!unread) {
      // Re-create it
      await prisma.queueUnread.create({
        data: {
          legacyMongoId: '69eae61fc761bf6a5a16e35c',
          userId:        ghost.id,
          threadId:      '69eae61fc761bf6a5a16e35c',
          count:         0,
        },
      });
      console.log('[fix] Re-inserted orphaned QueueUnread');
    }
  } else {
    console.log('[fix] Ghost user already exists');
  }

  console.log('[fix] Done.');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[fix] Error:', err.message);
  process.exit(1);
});
