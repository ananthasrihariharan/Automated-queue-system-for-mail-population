IngestionTask Migration (Phase 7) — FINAL
IMPLEMENTATION PLAN
Implement Phase 7 PostgreSQL migration for IngestionTask.
Production MongoDB code must remain untouched.
No RepositoryFactory.
No BaseRepository inheritance.
PostgreSQL implementation must remain isolated.
Current Mongo Schema
const IngestionTaskSchema = new mongoose.Schema(
{
folderPath: {
type: String,
required: true,
unique: true
},
status: {
type: String,
enum: [
'PENDING',
'PROCESSING',
'COMPLETED',
'FAILED'
],
default: 'PENDING',
index: true
},
attempts: {
type: Number,
default: 0
},
error: {
type: String,
1
default: ''
},
startedAt: Date,
completedAt: Date
},
{ timestamps: true }
)
Architecture Rules
This model has:
• 
• 
• 
NO ObjectId references
NO foreign dependencies
NO Queue dependency
Therefore:
DO NOT use MigrationMap.
DO NOT add legacyMongoId.
This is standalone infrastructure data.
STEP 1 — Update Prisma Schema
Add enum:
enum IngestionTaskStatus {
PENDING
PROCESSING
COMPLETED
FAILED
}
Add model:
2
model IngestionTask {
id          
Int      
@id @default(autoincrement())
folderPath  String   @unique
status      
attempts    
error       
startedAt   
IngestionTaskStatus
@default(PENDING)
Int      
String?
DateTime?
completedAt DateTime?
createdAt   
@default(0)
DateTime @default(now())
updatedAt   
DateTime @updatedAt
@@index([folderPath])
@@index([status])
}
Run:
npx prisma migrate dev--name ingestiontask_v1
Then:
npx prisma generate
STEP 2 — Create Repository
Create:
repositories/postgres/PgIngestionTaskRepository.js
Methods:
3
getTaskByFolder(folderPath)
createTask(data)
updateStatus(id, status)
incrementAttempts(id)
setError(id, error)
markStarted(id)
markCompleted(id)
deleteTask(id)
getPendingTasks()
getFailedTasks()
Rules:
• 
• 
No BaseRepository
No generic CRUD wrapper
STEP 3 — Create Migration Script
Create:
scripts/migrateIngestionTasks.js
Create log:
migration-logs/ingestiontask_migration.log
Define:
const BATCH_SIZE = 50
Read Mongo tasks.
For EACH task:
4
Check if PostgreSQL record exists using:
folderPath
Example:
const existing =
await prisma.ingestionTask.findUnique({
where: {
folderPath: task.folderPath
}
})
If exists:
Skip migration.
Log warning.
Example:
Skipped task
Reason: folderPath already migrated
If NOT exists:
Create record.
Transfer:
folderPath
status
attempts
error
startedAt
completedAt
5
Rules:
• 
• 
NO upsert()
Never overwrite existing rows
STEP 4 — Validation Script
Create:
scripts/validateIngestionTaskRepo.js
Validation tests:
Basic CRUD:
createTask()
getTaskByFolder()
updateStatus()
deleteTask()
Worker behavior:
incrementAttempts()
setError()
markStarted()
markCompleted()
Query methods:
getPendingTasks()
getFailedTasks()
6
Required Edge Case Tests
Test duplicate folderPath.
Expected:
Prisma unique constraint rejection.
Test failed task.
Example:
status = FAILED
error = "OCR crashed"
Verify both stored correctly.
Test retry behavior.
Example:
attempts = 0
incrementAttempts()
attempts = 1
Verify increment.
Test timestamps.
Example:
markStarted()
Verify startedAt populated.
markCompleted()
Verify completedAt populated.
7
STEP 5 — Rollback Script
Create:
scripts/rollbackIngestionTasks.js
Count rows first.
Delete all rows.
Example:
const count =
await prisma.ingestionTask.count()
await prisma.ingestionTask.deleteMany()
Log:
Deleted X ingestion tasks
No MigrationMap cleanup required.
STEP 6 — Verification Commands
Run:
npx prisma migrate dev--name ingestiontask_v1
npx prisma generate
node scripts/migrateIngestionTasks.js
node scripts/validateIngestionTaskRepo.js
8
node scripts/rollbackIngestionTasks.js
node server.js
HARD RULES
DO NOT:
❌ Use MigrationMap
❌ Add legacyMongoId
❌ Use Prisma upsert()
❌ Touch production Mongo code
❌ Use BaseRepository
❌ Introduce RepositoryFactory
Expected Final Flow
Read Mongo IngestionTask
↓
Check existing by folderPath
↓
If exists
Skip + Log
↓
If not exists
↓
Create PostgreSQL record
↓
Continue next record
Standalone migration only.
No relationships.
