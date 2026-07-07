You are working on a production-grade Node.js + Express backend for a printing press ERP/despatch workflow system.

Current architecture:

Backend: Node.js + Express
Current database: MongoDB using Mongoose
Target database: PostgreSQL using Prisma 7
Prisma 7 is already installed and configured
PostgreSQL is already installed locally and working
Prisma migrations are already tested successfully
Repository layer refactor has already been completed
Production system MUST remain fully functional on MongoDB during this phase

Current project architecture:

Routes
→ Services
→ Repositories
→ MongoDB (Mongoose)

Important constraints:

DO NOT break production MongoDB code
DO NOT modify routes
DO NOT modify services
DO NOT introduce RepositoryFactory or runtime DB switching
DO NOT replace production Mongo repositories yet
PostgreSQL implementation must remain completely isolated from production code
DO NOT use generic CRUD repositories or BaseRepository inheritance
DO NOT mirror MongoDB schema blindly into SQL
DO NOT preserve Mongoose query chaining behavior (.populate(), .select(), .lean())

Goal:

Implement Phase 1 of SQL migration by migrating ONLY the User model into isolated PostgreSQL infrastructure.

No other models should be touched.

Update prisma/schema.prisma.

Replace current User model with:

model User {
id Int @id @default(autoincrement())

legacyMongoId String? @unique

name String
email String @unique
phone String? @unique

password String

role String
rawRoles Json?

isActive Boolean @default(true)

lastLoginAt DateTime?
lastJobCompletedAt DateTime?

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

@@index([legacyMongoId])
}

Rules:

Keep legacyMongoId for gradual migration tracking
Preserve original Mongo roles array inside rawRoles JSON
role field stores primary role only

After schema update run:

npx prisma migrate dev --name user_migration_v1

Then run:

npx prisma generate

DO NOT use prisma db push.

Create:

lib/prisma.js

Requirements:

Single PrismaClient instance
Shared globally across future Postgres repositories

Implementation:

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

module.exports = prisma

Path must be:

despatch system/lib/prisma.js

NOT project root.

Create:

repositories/postgres/PgUserRepository.js

DO NOT use generic CRUD methods.

Implement ONLY business-specific methods.

Required methods:

getUserById(id)
getUserByEmail(email)
getUserByPhone(phone)
createUser(data)
updateLastLogin(userId)
deactivateUser(userId)

Requirements:

Use Prisma client from lib/prisma.js
Return plain JavaScript objects
No generic CRUD wrapper
No BaseRepository inheritance
No Mongoose compatibility layer

Example repository style:

getUserByEmail(email)
updateLastLogin(userId)
deactivateUser(userId)

NOT:

find()
findOne()
update()

Current production code must remain unchanged.

UserRepository.js must continue exporting Mongo repository only.

Use:

const MongoUserRepository =
require('./mongo/MongoUserRepository')

module.exports = MongoUserRepository

Do NOT add factory switching.

Do NOT add DB_TYPE environment switching.

Production MongoDB code path must remain identical.

Create:

scripts/migrateUsers.js

Requirements:

Connect to existing MongoDB User collection
Read all Mongo users
Transform data for SQL schema

Field mapping:

Mongo _id
→ legacyMongoId

Mongo roles array
→ rawRoles JSON

Primary role:
→ role field

If multiple roles exist:

role = roles[0] ?? "UNKNOWN"

Log warning:

console.warn(
"User has multiple roles"
)

Use Prisma upsert().

DO NOT use create().

Required pattern:

await prisma.user.upsert()

Use:

legacyMongoId as unique lookup key

Migration script must be safely re-runnable.

DO NOT insert users sequentially.

DO NOT do:

for (...) {
await prisma.user.create()
}

Instead:

Process users in batches of 50 or 100
Use prisma.$transaction()

Example flow:

Read 100 Mongo users
→ Transform
→ Build upsert operations
→ Execute transaction batch

Add progress logging.

Example:

Found 842 users
Migrated 100 users
Migrated 200 users
Migrated 300 users

Create:

scripts/validatePostgresRepo.js

Must NOT boot Express server.

Test all repository methods.

Normal tests:

createUser()
getUserByEmail()
getUserByPhone()
getUserById()
updateLastLogin()
deactivateUser()

Edge case tests:

duplicate email rejection
duplicate phone rejection
invalid user id
updateLastLogin on missing user
deactivate already inactive user
null phone values

Security test:

Verify password hash remains unchanged.

Example:

Mongo password hash
=== Postgres password hash

DO NOT rehash passwords.

Create:

scripts/rollbackUsers.js

Purpose:

Delete migrated SQL users quickly if migration fails.

Implementation:

Delete all Postgres users where legacyMongoId exists.

Example:

await prisma.user.deleteMany({})

Must allow fast rollback and rerun.

All scripts MUST close database connections.

Required:

finally {
await prisma.$disconnect()
await mongoose.disconnect()
}

Applies to:

migrateUsers.js
validatePostgresRepo.js
rollbackUsers.js

Prevent hanging Node process on Windows.

Run:

node --check server.js

npx prisma migrate dev --name user_migration_v1

npx prisma generate

node scripts/migrateUsers.js

node scripts/validatePostgresRepo.js

node scripts/rollbackUsers.js

node server.js

Expected result:

Mongo production backend continues working unchanged

PostgreSQL User table created successfully

Users migrated safely from MongoDB to PostgreSQL

Migration script can be rerun safely

Validation tests pass

Rollback script works correctly

DO NOT TOUCH:

Job model
QueueJob model
QueueSession model
JobEvent model
Customer model
Payment logic
Dispatch module
Workflow engine
Queue engine
Services layer
Routes layer
Authentication middleware

Only implement isolated PostgreSQL migration for User model.

Do not proceed beyond User migration phase.