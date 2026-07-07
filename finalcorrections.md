Apply the following final corrections to the existing PostgreSQL User Migration Phase 1 implementation plan.

Do NOT change the broader architecture plan.

Only implement these corrections.

Current rollbackUsers.js deletes migrated users directly.

This is unsafe.

Do NOT silently delete records.

Before deleting migrated PostgreSQL users, count records and log the deletion.

Replace rollback logic with:

Count migrated users first:

await prisma.user.count({
where: {
legacyMongoId: {
not: null
}
}
})

Log count before deletion.

Example:

Deleting 428 migrated users from PostgreSQL...

Then execute delete:

await prisma.user.deleteMany({
where: {
legacyMongoId: {
not: null
}
}
})

Log completion.

Example:

Rollback completed successfully.

Requirements:

Never silently delete records
Always log number of deleted users before deletion

validatePostgresRepo.js must NOT pollute the real PostgreSQL database.

Do NOT use static test users such as:

hari@test.com
test@test.com

Instead:

Generate dynamic test data.

Example:

const testEmail =
test_${Date.now()}@example.com

const testPhone =
9999${Date.now()}

Requirements:

Every validation run must create unique temporary records
Avoid duplicate constraint collisions from previous runs

After validation completes:

Delete test records automatically.

Example cleanup:

await prisma.user.deleteMany({
where: {
email: {
startsWith: "test_"
}
}
})

Rules:

Validation script must leave database clean
No permanent test records allowed

Create a migration logging system.

Add folder:

migration-logs/

Create log file:

migration-logs/users_migration.log

During migrateUsers.js execution:

Log every successful migration.

Example:

SUCCESS:
user@email.com migrated successfully

Log every failure.

Example:

FAILED:
duplicate email detected for user@email.com

FAILED:
missing role for admin@test.com

FAILED:
invalid phone number for staff@test.com

Implementation example:

fs.appendFileSync(
"./migration-logs/users_migration.log",
logEntry
)

Requirements:

Log all successful migrations
Log all failed migrations
Preserve permanent migration history

Purpose:

If migration partially fails, identify exact failed users without rerunning entire migration blindly.

Do NOT modify:

Prisma schema design
PgUserRepository methods
Mongo production repository
Existing migration architecture
Validation logic outside test cleanup
PostgreSQL connection logic

Only apply these 3 corrections.

Expected result:

rollbackUsers.js becomes safe
validatePostgresRepo.js leaves database clean
migrateUsers.js produces permanent audit logs