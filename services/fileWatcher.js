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
    const eventBus = require('./eventBus')

    // Verify it's a directory
    const stats = fs.statSync(normalizedPath)
    if (!stats.isDirectory()) return null

    // Check depth
    const watchPath = path.normalize(process.env.N8N_WATCH_PATH || '')
    const grandparent = path.normalize(path.dirname(path.dirname(normalizedPath)))
    if (grandparent !== watchPath) return null

    // Create IngestionTask
    const task = await IngestionTask.findOneAndUpdate(
      { folderPath: normalizedPath },
      { folderPath: normalizedPath },
      { upsert: true, new: true }
    )

    processedFolders.add(normalizedPath)
    console.log(`[FileWatcher] Task created for: ${normalizedPath}`)
    
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
async function scanExistingFolders(watchPath) {
  if (!fs.existsSync(watchPath)) {
    console.log(`[FileWatcher] Watch path does not exist: ${watchPath}`)
    return
  }

  const senderFolders = fs.readdirSync(watchPath)
  let ingested = 0

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

  console.log(`[FileWatcher] Startup scan complete. Ingested ${ingested} new jobs.`)
}

/**
 * Start watching the n8n output folder.
 */
function startWatcher(io) {
  ioInstance = io
  const watchPath = process.env.N8N_WATCH_PATH

  if (!watchPath) {
    console.warn('[FileWatcher] N8N_WATCH_PATH not set in .env — file watcher disabled')
    return null
  }

  console.log(`[FileWatcher] Watching: ${watchPath}`)

  // First scan existing folders
  scanExistingFolders(watchPath)

  // Watch for new directories (depth 2: sender/timestamp_subject)
  const watcher = chokidar.watch(watchPath, {
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
    // Small delay to let n8n finish writing all files
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
