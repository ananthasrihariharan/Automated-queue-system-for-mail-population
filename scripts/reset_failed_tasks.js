/**
 * reset_failed_tasks.js
 * 
 * Run this ONCE after the server bug-fix to recover all IngestionTasks
 * that were stuck as FAILED or hung in PROCESSING because the
 * processingWorker was never started.
 * 
 * Usage:
 *   node scripts/reset_failed_tasks.js
 */

require('dotenv').config()
const mongoose = require('mongoose')
const IngestionTask = require('../models/IngestionTask')

async function main() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('[Recovery] Connected to MongoDB')

  // Reset FAILED tasks that haven't exhausted retry limit
  const failedReset = await IngestionTask.updateMany(
    { status: 'FAILED', attempts: { $lt: 3 } },
    { $set: { status: 'PENDING' }, $unset: { error: '' } }
  )

  // Reset tasks that got stuck in PROCESSING (server crashed mid-run)
  const processingReset = await IngestionTask.updateMany(
    { status: 'PROCESSING' },
    { $set: { status: 'PENDING' } }
  )

  console.log(`[Recovery] Reset ${failedReset.modifiedCount} FAILED tasks back to PENDING`)
  console.log(`[Recovery] Reset ${processingReset.modifiedCount} stuck PROCESSING tasks back to PENDING`)

  // Show remaining summary
  const summary = await IngestionTask.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ])
  console.log('\n[Recovery] Task Status Summary:')
  summary.forEach(s => console.log(`  ${s._id}: ${s.count}`))

  await mongoose.disconnect()
  console.log('\n[Recovery] Done. Restart your server — the worker will now process these tasks.')
}

main().catch(err => {
  console.error('[Recovery] Error:', err.message)
  process.exit(1)
})
