/**
 * File Watcher — Bridges n8n email output to the queue system
 * 
 * Watches the InboundJobs folder for new email subfolders.
 * Structure: InboundJobs / sender@email.com / timestamp_subject / files
 */

const chokidar = require('chokidar')
const path = require('path')
const fs = require('fs')

// Track already-processed folders to avoid duplicates
const processedFolders = new Set()
let ioInstance = null

/**
 * Parse the sender email from the parent folder name.
 * Strips the " (N)" suffix from duplicates.
 * e.g. "msivasivam4@gmail.com (2)" → "msivasivam4@gmail.com"
 */
function parseSenderEmail(folderName) {
  return folderName.replace(/\s*\(\d+\)$/, '').trim()
}

/**
 * Parse the email subject and timestamp from subfolder name.
 * e.g. "2026-03-09T14-25-08_Print_file" → { timestamp: "2026-03-09T14:25:08", subject: "Print file" }
 */
function parseSubfolderName(folderName) {
  // Match: YYYY-MM-DDTHH-MM-SS_rest_of_subject
  const match = folderName.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})_(.+)$/)
  if (match) {
    const timestamp = match[1].replace(/-(\d{2})-(\d{2})$/, ':$1:$2') // fix time separators
    const subject = match[2].replace(/_/g, ' ').trim()
    return { timestamp, subject }
  }

  // Fallback: treat entire name as subject
  return { timestamp: null, subject: folderName.replace(/_/g, ' ') }
}

/**
 * Process a new email subfolder: create an IngestionTask for the worker.
 */
async function processEmailFolder(emailFolderPath) {
  const normalizedPath = path.normalize(emailFolderPath)
  if (processedFolders.has(normalizedPath)) return null

  try {
    const IngestionTask = require('../models/IngestionTask')
    const QueueJob = require('../models/QueueJob')
    const eventBus = require('./eventBus')

    // Verify it's a directory
    const stats = fs.statSync(normalizedPath)
    if (!stats.isDirectory()) return null

    // Check depth and roots (Robust Windows handling)
    const n8nRoot = process.env.N8N_WATCH_PATH ? path.resolve(process.env.N8N_WATCH_PATH).toLowerCase() : null;
    const waRoot = process.env.WHATSAPP_WATCH_PATH ? path.resolve(process.env.WHATSAPP_WATCH_PATH).toLowerCase() : null;
    const absPath = path.resolve(normalizedPath).toLowerCase();
    
    // Valid jobs are subdirectories of the roots, but not the roots themselves
    const isInsideN8n = n8nRoot && absPath.startsWith(n8nRoot) && absPath !== n8nRoot;
    const isInsideWA = waRoot && absPath.startsWith(waRoot) && absPath !== waRoot;

    if (!isInsideN8n && !isInsideWA) {
      console.warn(`[FileWatcher] Skipping folder outside watch roots: ${normalizedPath}`);
      return null
    }

    // Skip the first-level "sender" folders (they hold job subfolders, not files directly)
    // E:\InboundJobs\sender@email.com  <- skip
    // E:\WhatsappJobs\9840401538@whatsapp.local <- skip  
    // E:\InboundJobs\sender@email.com\job_folder <- process
    // E:\WhatsappJobs\9840401538@whatsapp.local\job_folder <- process
    const parentDir = path.dirname(absPath);
    const isFirstLevelN8n = isInsideN8n && parentDir === n8nRoot;
    const isFirstLevelWA = isInsideWA && parentDir === waRoot;
    if (isFirstLevelN8n || isFirstLevelWA) {
      return null;
    }

    // Check if a valid QueueJob already exists for this folder (already ingested and in queue)
    const existingJob = await QueueJob.findOne({
      folderPath: normalizedPath
    })
    if (existingJob) {
      // Already live in the queue — skip silently
      processedFolders.add(normalizedPath)
      return null
    }

    // Anti-Duplication: If a task already exists for this folder and hasn't finished,
    // don't overwrite it. This prevents the watcher from interfering with manual uploads.
    const IngestionTaskModel = require('../models/IngestionTask')
    const existingTask = await IngestionTaskModel.findOne({ 
      folderPath: normalizedPath,
      status: { $in: ['PENDING', 'PROCESSING'] }
    })
    if (existingTask) {
      console.log(`[FileWatcher] Task already in-flight for: ${normalizedPath} - skipping duplicate trigger.`)
      return null
    }

    // Create or RESET IngestionTask to PENDING so the worker re-processes it
    const task = await IngestionTask.findOneAndUpdate(
      { folderPath: normalizedPath },
      { $set: { folderPath: normalizedPath, status: 'PENDING', error: null, attempts: 0 } },
      { upsert: true, new: true }
    )


    processedFolders.add(normalizedPath)
    console.log(`[FileWatcher] Task queued for: ${normalizedPath}`)
    
    // Notify worker
    eventBus.emit('task:new', task)

    return task
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[FileWatcher] Error processing ${normalizedPath}:`, err.message)
    }
    return null
  }
}

/**
 * Scan existing folders on startup to ingest any unprocessed emails.
 */
async function scanExistingFolders(roots) {
  let ingested = 0
  for (const watchPath of roots) {
    if (!fs.existsSync(watchPath)) {
      console.log(`[FileWatcher] Watch path does not exist: ${watchPath}`)
      continue
    }

    const senderFolders = fs.readdirSync(watchPath)

    for (const senderFolder of senderFolders) {
      const senderPath = path.join(watchPath, senderFolder)
      if (!fs.statSync(senderPath).isDirectory()) continue

      const subfolders = fs.readdirSync(senderPath)
      for (const subfolder of subfolders) {
        const subPath = path.join(senderPath, subfolder)
        if (!fs.statSync(subPath).isDirectory()) continue

        const result = await processEmailFolder(subPath)
        if (result) ingested++
      }
    }
  }
  console.log(`[FileWatcher] Startup scan complete. Ingested ${ingested} new jobs.`)
}

/**
 * Start watching the output folders.
 */
function startWatcher(io) {
  ioInstance = io
  
  const rootsToWatch = []
  
  if (process.env.N8N_WATCH_PATH) {
     rootsToWatch.push(process.env.N8N_WATCH_PATH)
  }
  if (process.env.WHATSAPP_WATCH_PATH) {
     rootsToWatch.push(process.env.WHATSAPP_WATCH_PATH)
  }

  if (rootsToWatch.length === 0) {
    console.warn('[FileWatcher] No watch paths set in .env — file watcher disabled')
    return null
  }

  console.log(`[FileWatcher] Watching paths:`, rootsToWatch)

  // First scan existing folders
  scanExistingFolders(rootsToWatch)

  // Watch for new directories (depth 2: sender/timestamp_subject)
  const watcher = chokidar.watch(rootsToWatch, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,       // we already scanned
    depth: 2,
    awaitWriteFinish: {
      stabilityThreshold: 2000, // wait 2s for n8n to finish writing
      pollInterval: 500
    }
  })

  watcher.on('addDir', async (dirPath) => {
    // Small delay to let system finish writing all files
    setTimeout(async () => {
      await processEmailFolder(dirPath)
    }, 3000)
  })

  watcher.on('error', (err) => {
    console.error('[FileWatcher] Error:', err.message)
  })

  return watcher
}

module.exports = { startWatcher, processEmailFolder, parseSenderEmail, parseSubfolderName }
