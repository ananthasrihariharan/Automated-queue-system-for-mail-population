/**
 * File Watcher â€” Bridges n8n email output to the queue system
 * 
 * Watches the InboundJobs folder for new email subfolders.
 * Structure: InboundJobs / sender@email.com / timestamp_subject / files
 */

const chokidar = require('chokidar')
const path = require('path')
const fs = require('fs')
const { ingestionTaskRepo } = require('../repositories')
const { queueJobRepo } = require('../repositories')

// Track already-processed folders to avoid duplicates
const processedFolders = new Set()
let ioInstance = null

/**
 * Parse the sender email from the parent folder name.
 * Strips the " (N)" suffix from duplicates.
 * e.g. "msivasivam4@gmail.com (2)" â†’ "msivasivam4@gmail.com"
 */
function parseSenderEmail(folderName) {
  return folderName.replace(/\s*\(\d+\)$/, '').trim()
}

/**
 * Parse the email subject and timestamp from subfolder name.
 * e.g. "2026-03-09T14-25-08_Print_file" â†’ { timestamp: "2026-03-09T14:25:08", subject: "Print file" }
 */
function parseSubfolderName(folderName) {
  // Match: YYYY-MM-DDTHH-MM-SS or YYYY-MM-DDTHH-MM-SS-mmm followed by _subject
  const match = folderName.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?)_(.+)$/)
  if (match) {
    const timestampStr = match[1];
    const parts = timestampStr.split('T');
    const timePart = parts[1].replace(/-/g, ':').replace(/:(\d{3})$/, '.$1'); 
    const timestamp = `${parts[0]}T${timePart}`;
    
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
    const eventBus = require('./eventBus')

    // Verify it's a directory
    if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isDirectory()) return null

    // Check depth and roots (Robust Windows handling)
    const n8nRoot = process.env.N8N_WATCH_PATH ? path.resolve(process.env.N8N_WATCH_PATH).toLowerCase() : null;
    const waRoot = process.env.WHATSAPP_WATCH_PATH ? path.resolve(process.env.WHATSAPP_WATCH_PATH).toLowerCase() : null;
    const wiRoot = process.env.WALKIN_UPLOAD_PATH ? path.resolve(process.env.WALKIN_UPLOAD_PATH).toLowerCase() : null;
    const absPath = path.resolve(normalizedPath).toLowerCase();
    
    // Valid jobs are subdirectories of the roots, but not the roots themselves
    const isInsideN8n = n8nRoot && absPath.startsWith(n8nRoot) && absPath !== n8nRoot;
    const isInsideWA = waRoot && absPath.startsWith(waRoot) && absPath !== waRoot;
    const isInsideWI = wiRoot && absPath.startsWith(wiRoot) && absPath !== wiRoot;

    if (!isInsideN8n && !isInsideWA && !isInsideWI) {
      // console.warn(`[FileWatcher] Skipping folder outside watch roots: ${normalizedPath}`);
      return null
    }

    // Skip the first-level "identity" folders (Email/Phone folders)
    const parentDir = path.dirname(absPath);
    const isFirstLevel = (isInsideN8n && parentDir === n8nRoot) || 
                         (isInsideWA && parentDir === waRoot) || 
                         (isInsideWI && parentDir === wiRoot);

    if (isFirstLevel) {
      return null;
    }

    // Check if a valid QueueJob already exists for this folder
    // ROBUSTNESS: Check both direct path and relative path (Identity/Folder) 
    // to catch duplicates even if path style differs (UNC vs Mapped Drive)
    const folderName = path.basename(normalizedPath);
    const parentName = path.basename(path.dirname(normalizedPath));
    const relativePath = `${parentName}/${folderName}`.replace(/\\/g, '/');

    const existingJob = await queueJobRepo.findOne({
      $or: [
        { folderPath: normalizedPath },
        { relativeFolderPath: relativePath }
      ]
    })
    if (existingJob) {
      processedFolders.add(normalizedPath)
      return null
    }

    // Anti-Duplication check for in-flight tasks
    const existingTask = await ingestionTaskRepo.findOne({ 
      folderPath: normalizedPath,
      status: { $in: ['PENDING', 'PROCESSING'] }
    })
    if (existingTask) {
      return null
    }

    // Create or RESET IngestionTask to PENDING
    const task = await ingestionTaskRepo.findOneAndUpdate(
      { folderPath: normalizedPath },
      { $set: { folderPath: normalizedPath, status: 'PENDING', error: null, attempts: 0, createdAt: new Date() } },
      { upsert: true, new: true }
    )

    processedFolders.add(normalizedPath)
    console.log(`\nâœ… [FileWatcher] Ingested job: "${path.basename(normalizedPath)}"`)
    
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
 * Scan existing folders on startup to ingest any unprocessed jobs.
 */
async function scanExistingFolders(roots) {
  let ingested = 0
  console.log('[FileWatcher] Starting startup scan...')
  
  for (const watchPath of roots) {
    if (!fs.existsSync(watchPath)) continue

    const identityFolders = fs.readdirSync(watchPath)
    for (const identityFolder of identityFolders) {
      const identityPath = path.join(watchPath, identityFolder)
      if (!fs.statSync(identityPath).isDirectory()) continue

      // Support 2-level structure: Root / Identity / Job_Folder
      const jobFolders = fs.readdirSync(identityPath)
      for (const jobFolder of jobFolders) {
        const jobPath = path.join(identityPath, jobFolder)
        if (!fs.statSync(jobPath).isDirectory()) continue

        const result = await processEmailFolder(jobPath)
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
  if (process.env.N8N_WATCH_PATH) rootsToWatch.push(process.env.N8N_WATCH_PATH)
  if (process.env.WHATSAPP_WATCH_PATH) rootsToWatch.push(process.env.WHATSAPP_WATCH_PATH)
  if (process.env.WALKIN_UPLOAD_PATH) rootsToWatch.push(process.env.WALKIN_UPLOAD_PATH)

  if (rootsToWatch.length === 0) {
    console.warn('[FileWatcher] No watch paths set â€” file watcher disabled')
    return null
  }

  console.log(`[FileWatcher] Watching paths:`, rootsToWatch)

  // First scan existing folders
  scanExistingFolders(rootsToWatch)

  // Watch for new directories (depth 2: identity/job_folder)
  const watcher = chokidar.watch(rootsToWatch, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: {
      stabilityThreshold: 3000, 
      pollInterval: 500
    }
  })

  watcher.on('addDir', async (dirPath) => {
    // Small delay to allow files to finish writing
    setTimeout(async () => {
      await processEmailFolder(dirPath)
    }, 5000)
  })

  watcher.on('error', (err) => {
    console.error('[FileWatcher] Error:', err.message)
  })

  return watcher
}

module.exports = { startWatcher, processEmailFolder, parseSenderEmail, parseSubfolderName, processedFolders }

