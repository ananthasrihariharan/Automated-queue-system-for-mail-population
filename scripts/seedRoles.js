/**
 * scripts/seedRoles.js
 * Seeds all application roles into the Postgres Role table.
 * Safe to run multiple times — uses upsert (createMany skipDuplicates).
 *
 * Usage:  node scripts/seedRoles.js
 */

const prisma = require('../lib/prisma')

const ALL_ROLES = [
  'ADMIN',
  'PREPRESS',
  'CASHIER',
  'DISPATCH',
  'PRESS',
  'POST_PRESS',
  'FINISHING',
  'FINISHING_CUTTING',
  'FINISHING_DIE_CUTTING',
  'FINISHING_CREASING',
  'FINISHING_CORNER_CUT'
]

async function main() {
  console.log('[seedRoles] Seeding roles...')

  const result = await prisma.role.createMany({
    data: ALL_ROLES.map(roleName => ({ roleName })),
    skipDuplicates: true
  })

  console.log(`[seedRoles] Done — ${result.count} new role(s) inserted.`)

  const all = await prisma.role.findMany({ orderBy: { id: 'asc' } })
  console.table(all.map(r => ({ id: r.id, roleName: r.roleName })))

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[seedRoles] Error:', err)
  process.exit(1)
})
