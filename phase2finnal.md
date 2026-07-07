Apply the following corrections to the existing Phase 2 PostgreSQL SystemConfig Migration plan.

Do NOT change the overall migration architecture.

Only apply these corrections.

Current design uses:

setConfig(key, value, description)

with automatic upsert behavior.

This is unsafe.

Problem:

A typo in configuration key could silently create invalid configuration.

Example:

setConfig("GSTT_PERCENT", 18)

This incorrectly creates a bad config entry.

DO NOT use automatic upsert in repository methods.

Replace repository methods with:

getConfigByKey(key)
createConfig(key, value, description)
updateConfig(key, value, description)
deleteConfig(key)
getAllConfigs()

Rules:

createConfig()

Creates only new configuration
Must throw duplicate key error if key already exists

updateConfig()

Updates only existing configuration
If key does not exist, return null
Must NOT create missing config automatically

Remove:

setConfig()

completely from PgSystemConfigRepository.js

Current rollbackSystemConfig.js connects to MongoDB to fetch migrated keys.

This is unnecessary.

SystemConfig migration uses:

key

as unique identifier.

Unlike User migration:

no legacyMongoId exists
no Mongo lookup needed

Remove all MongoDB logic from:

rollbackSystemConfig.js

Remove:

mongoose.connect()

Remove:

Mongo SystemConfig model import

Rollback should use PostgreSQL only.

Implementation:

Count existing PostgreSQL records:

const count =
await prisma.systemConfig.count()

Log count:

Deleting 14 SystemConfig records...

Delete:

await prisma.systemConfig.deleteMany()

Log completion:

Rollback completed successfully.

Requirements:

PostgreSQL only
No MongoDB connection in rollback

Current validation script tests:

nested JSON
array JSON

This is insufficient.

Add realistic ERP configuration stress test.

Insert this JSON:

{
"queueSettings": {
"timeout": 30,
"retry": 5
},
"billing": {
"gst": 18,
"rounding": true
},
"whatsapp": {
"enabled": true,
"apiKey": "abc123"
}
}

Validation requirements:

Store JSON object.

Retrieve JSON object.

Verify deep equality.

Example assertions:

queueSettings.timeout === 30

billing.gst === 18

whatsapp.enabled === true

Purpose:

Validate Mongo Mixed → PostgreSQL Json serialization integrity.

migrateSystemConfig.js must validate record count integrity.

Before migration:

Count Mongo records:

const mongoCount =
await SystemConfig.countDocuments()

Log:

Mongo SystemConfig count: 14

After migration:

Count PostgreSQL records:

const pgCount =
await prisma.systemConfig.count()

Log:

Postgres SystemConfig count: 14

Compare:

If mismatch:

console.warn(
"WARNING: Migration count mismatch"
)

Rules:

Migration cannot be declared successful without count verification
Must compare source and target record count

Do NOT modify:

Prisma schema
Production Mongo repository
Production routes
Production services
PostgreSQL isolation architecture
Existing migration logging design

Only apply these 4 corrections.

Expected result:

No unsafe config upsert logic
rollbackSystemConfig.js becomes PostgreSQL-only
JSON serialization thoroughly validated
Migration count integrity verified