const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const crypto = require('crypto')
const IngestionTask = require('../models/IngestionTask')
const QueueJob = require('../models/QueueJob')
const CustomerPreference = require('../models/CustomerPreference')
const eventBus = require('./eventBus')

/**
 * Heavy-duty worker for parsing folders, hashing files, 
 * and identifying duplicates.
 * Refactored to use non-blocking Asynchronous I/O.
 */
class ProcessingWorker {
  constructor() {
    this.isProcessing = false
  }

  // Generic recursive file walker (Async)
  async _getAllFiles(dirPath, arrayOfFiles = []) {
    try {
      if (!fs.existsSync(dirPath)) return []
      const files = await fsp.readdir(dirPath, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
          await this._getAllFiles(fullPath, arrayOfFiles);
        } else {
          arrayOfFiles.push(fullPath);
        }
      }
    } catch (err) {
      console.error(`[Worker] Walker error at ${dirPath}:`, err.message);
    }
    return arrayOfFiles;
  }

  /**
   * ROBUSTNESS: Stability Guard
   * Checks if a folder has stopped growing in size/file count.
   * Prevents ingestion race conditions where worker reads a partial folder.
   */
  async ensureFolderStability(folderPath, maxAttempts = 3, interval = 1500) {
    let lastStats = { size: -1, count: -1 };
    
    for (let i = 0; i < maxAttempts; i++) {
      const currentStats = await this._getFolderStats(folderPath);
      
      // If folder is empty, we must wait at least once to be sure
      // If size and count match the previous check, we consider it "Stable"
      if (currentStats.size > 0 && currentStats.size === lastStats.size && currentStats.count === lastStats.count) {
        return true; 
      }
      
      lastStats = currentStats;
      await new Promise(r => setTimeout(r, interval));
    }
    return true; // Proceed anyway after max attempts
  }

  async _getFolderStats(folderPath) {
    try {
      const files = await this._getAllFiles(folderPath, []);
      let totalSize = 0;
      for (const f of files) {
        try {
          const s = await fsp.stat(f);
          totalSize += s.size;
        } catch (e) {}
      }
      return { size: totalSize, count: files.length };
    } catch (e) {
      return { size: 0, count: 0 };
    }
  }

  async start() {
    console.log('[Worker] Starting Ingestion Worker...')
    // Continuous polling
    setInterval(() => this.processNextTask(), 5000)
    
    eventBus.on('task:new', () => {
      if (!this.isProcessing) this.processNextTask()
    })
  }

  async processNextTask() {
    if (this.isProcessing) return
    this.isProcessing = true

    let task = null;
    try {
      task = await IngestionTask.findOneAndUpdate(
        { 
          status: { $in: ['PENDING', 'FAILED'] },
          attempts: { $lt: 3 }
        },
        { status: 'PROCESSING', startedAt: new Date(), $inc: { attempts: 1 } },
        { sort: { createdAt: 1 }, new: true }
      )
      
      if (!task) return; 

      console.log(`[Worker] Processing folder: ${task.folderPath}`)
      await this.handleTask(task)
    } catch (err) {
      console.error('[Worker] Loop Error:', err.message)
    } finally {
      this.isProcessing = false
    }
  }

  async handleTask(task) {
    try {
      if (!fs.existsSync(task.folderPath)) {
        throw new Error('Folder does not exist')
      }

      // 0. STABILITY GUARD: Wait for files to finish landing
      await this.ensureFolderStability(task.folderPath)

      // 1. Calculate File Hashes (Async)
      const fileData = await this.getFolderFingerprint(task.folderPath)
      const fingerprint = this.computeHash(fileData)

      // 2. Parse Metadata
      const parentFolder = path.basename(path.dirname(task.folderPath))
      const subfolderName = path.basename(task.folderPath)
      let customerEmail = parentFolder.replace(/\s*\(\d+\)$/, '').trim()
      
      // PHONE NORMALIZATION: Strip 91 prefix for consistent matching
      if (/^\d{10,15}$/.test(customerEmail) && customerEmail.startsWith('91')) {
        customerEmail = customerEmail.substring(2);
      }
      
      let isTrueDuplicate = false;
      const spamType = this.getSpamCategory(customerEmail, subfolderName)
      const isSpam = !!spamType;


      // 3. Duplicate & Smart Threading Logic
      const activeJobsMatch = await QueueJob.find({
        customerEmail,
        status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'ADMIN_REVIEW'] }
      }).sort({ createdAt: -1 }).populate('assignedTo');

      let activeJobForCustomer = null;
      let subjectMatch = null;
      for (const aj of activeJobsMatch) {
        if (aj.fingerprint === fingerprint) {
          activeJobForCustomer = aj;
          break; // Fingerprint match is authoritative
        }
        if (!subjectMatch && aj.emailSubject.toLowerCase() === subfolderName.toLowerCase()) {
          subjectMatch = aj; // Remember first subject match as fallback
        }
      }
      if (!activeJobForCustomer) {
        activeJobForCustomer = subjectMatch;
      }

      // FIX 1: If the matched parent job is actively PAUSED, we must return it to the queue
      // Otherwise, it gets skipped by supersede AND block the staff member's next job auto-assignment
      if (activeJobForCustomer && activeJobForCustomer.status === 'PAUSED') {
        activeJobForCustomer.status = 'QUEUED';
        activeJobForCustomer.returnReason = 'Superseded by incoming revision — returned to pool';
        await activeJobForCustomer.save();

        // Also clear the session so the staff member isn't blocked resuming stale work
        const QueueSession = require('../models/QueueSession');
        await QueueSession.updateMany(
          { currentQueueJob: activeJobForCustomer._id },
          { $set: { currentQueueJob: null } }
        );
      }

      // 4. Metadata Overrides (for manual uploads / WhatsApp)
      // PATIENCE LOOP: On Windows systems, metadata.json might still be locked by the writer.
      // We retry to ensure we don't fall back to "Phone Number" prematurely.
      let metadata = null;
      const metadataPath = path.join(task.folderPath, 'metadata.json');
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (fs.existsSync(metadataPath)) {
          try {
            const raw = fs.readFileSync(metadataPath, 'utf8');
            if (raw && raw.trim()) {
                metadata = JSON.parse(raw);
                break; 
            }
          } catch (e) {
            console.warn(`[Worker] Metadata read attempt ${attempt} for ${subfolderName} failed: ${e.message}`);
          }
        }
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
      }

      // SMART FALLBACK: If metadata reading STILL failed (or it was a non-manual upload), 
      // extract the customer name from the descriptive folder name if possible.
      const folderParts = subfolderName.split('_WhatsApp_');
      const folderNameFallback = folderParts.length > 1 ? folderParts[1].replace(/_/g, ' ') : null;

      const finalCustomerName = metadata?.customerName || folderNameFallback || customerEmail.split('@')[0];

      const manualJobTitle = metadata?.jobTitle; // Override subject if provided manually

      let jobStatus = 'QUEUED';
      let preferredStaff = null;
      if (metadata?.preferredStaffId) {
          preferredStaff = metadata.preferredStaffId;
          console.log(`[Worker] Manual override: Using preferred staff from metadata: ${preferredStaff}`);
      }
      let existingThreadId = null;
      let parentJobId = null;
      let nextVersion = 1;

      if (activeJobForCustomer) {
        existingThreadId = activeJobForCustomer.threadId || activeJobForCustomer._id.toString();
        
        // If not manually overridden by metadata, follow existing thread handler
        if (!preferredStaff) {
            preferredStaff = activeJobForCustomer.assignedTo?._id || activeJobForCustomer.assignedTo || activeJobForCustomer.pinnedToStaff;
        }

        parentJobId = activeJobForCustomer._id;
        
        const versionCount = await QueueJob.countDocuments({ threadId: existingThreadId });
        nextVersion = versionCount + 1;

        if (activeJobForCustomer.fingerprint === fingerprint) {
          isTrueDuplicate = true;
        }

      } else {
        const recentJob = await QueueJob.findOne({
          customerEmail,
          emailSubject: { $regex: new RegExp(`^${subfolderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          createdAt: { $gte: new Date(Date.now() - 5 * 60 * 60 * 1000) }
        }).sort({ createdAt: -1 });

        if (recentJob) {
          existingThreadId = recentJob.threadId || recentJob._id.toString();
          const vCount = await QueueJob.countDocuments({ threadId: existingThreadId });
          nextVersion = vCount + 1;
        } else {
          // 4. Check CustomerPreference if no recent job exists (Restricted to 5 hours)
          const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
          const preference = await CustomerPreference.findOne({ 
            customerEmail,
            updatedAt: { $gte: fiveHoursAgo }
          });
          if (preference) {
             preferredStaff = preference.preferredStaff;
             console.log(`[Worker] Found within-day preference for ${customerEmail}: ${preferredStaff}`);
          }
        }
      }

      let isRelativelyOnline = false;
      let staffIsOnline = false;
      let staffIsFree = false;
      let activeSession = null;

      if (preferredStaff) {
        const QueueSession = require('../models/QueueSession');
        // 1. Check for Active Session (Strictly Online)
        const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000);
        activeSession = await QueueSession.findOne({
          staffId: preferredStaff,
          isActive: true,
          lastSeenAt: { $gte: ninetyMinsAgo }
        });
        
        if (activeSession) {
          staffIsOnline = true;
          isRelativelyOnline = true;
          // IMPORTANT: Check if staff is currently free (no active job)
          if (!activeSession.currentQueueJob) {
            staffIsFree = true;
          }
        } else {
          // 2. Check for recent activity (Relatively Online/In-Shift - 5 Hours)
          const fiveHoursAgoSession = new Date(Date.now() - 5 * 60 * 60 * 1000);
          const recentSession = await QueueSession.findOne({
            staffId: preferredStaff,
            lastSeenAt: { $gte: fiveHoursAgoSession }
          }).sort({ lastSeenAt: -1 });
          if (recentSession) isRelativelyOnline = true;
        }
      }

      const dueBy = new Date()
      dueBy.setHours(dueBy.getHours() + 4)

      const nextPosition = Date.now()

      // 5. Read files (Recursive discovery for attachments)
      const allFilesList = await this._getAllFiles(task.folderPath);
      const attachments = [];
      const txtFiles = [];

      for (const fullPath of allFilesList) {
        const filename = path.basename(fullPath);
        if (filename.startsWith('.') || filename === 'metadata.json') continue;

        const relativePath = path.relative(task.folderPath, fullPath).replace(/\\/g, '/');
        
        if (/\.(txt|html|htm)$/i.test(filename)) {
          // Only include top-level text files in txtFiles for mail body to avoid pollution
          if (!relativePath.includes('/')) {
            txtFiles.push(relativePath);
          }
        } else {
          attachments.push(relativePath);
        }
      }

      // 🚨 CRITICAL SAFETY: If the worker found ZERO attachments after its stability checks, 
      // it means the files are having significant trouble landing. We abort and let it retry 
      // rather than creating an empty, broken job.
      if (attachments.length === 0 && !isTrueDuplicate && task.attempts < 3) {
         console.warn(`[Worker] Stability Guard passed but ZERO attachments found for ${subfolderName}. Aborting to retry.`);
         throw new Error('Assets not yet detected in folder structure');
      }

      txtFiles.sort();

      const stripHtml = (html) => html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
        .replace(/&nbsp;/g,' ').replace(/\s{3,}/g, '\n\n').trim()

      let mailBody = '';
      for (const txtFile of txtFiles) {
        try {
          let content = await fsp.readFile(path.join(task.folderPath, txtFile), 'utf-8');
          if (/\.html?$/i.test(txtFile)) content = stripHtml(content)
          if (content.trim()) mailBody += content.trim() + '\n\n---\n\n';
        } catch (readErr) {
          console.error(`[Worker] Failed to read ${txtFile}:`, readErr.message);
        }
      }
      mailBody = mailBody.replace(/---\n\n$/, '').trim()

      const isFollowUp = !!activeJobForCustomer;
      
      const isWhatsApp = customerEmail.endsWith('@whatsapp.local');
      const walkinRoot = process.env.WALKIN_UPLOAD_PATH ? path.resolve(process.env.WALKIN_UPLOAD_PATH).toLowerCase() : null;
      const isWalkin = walkinRoot && path.resolve(task.folderPath).toLowerCase().startsWith(walkinRoot);
      
      const jobType = isWhatsApp ? 'WHATSAPP' : (isWalkin ? 'WALKIN' : 'EMAIL');

      // WHATSAPP/WALKIN OVERRIDE: No spam review, direct to queue or assignment
      if (isWhatsApp || isWalkin) {
        jobStatus = 'QUEUED';
      }

      // Priority Calculation from Metadata
      let priorityScore = isFollowUp ? 5 : 0;
      if (metadata?.priority === 'IMMEDIATE') {
        priorityScore = 20;
      } else if (metadata?.priority === 'CRITICAL') {
        priorityScore = 10;
      } else if (metadata?.priority === 'URGENT') {
        priorityScore = 5;
      } else if (metadata?.priority === 'NORMAL') {
        priorityScore = 0;
      }
      
      // 6. Assignment Logic
      // If manually pinned by admin in metadata, we respect it regardless of online status
      const isManualPin = !!metadata?.preferredStaffId;
      
      const shouldAssignImmediately = !!(isWhatsApp && preferredStaff && staffIsOnline && staffIsFree);
      // Pinned if: Manual admin choice OR (Automatic choice AND staff is relatively online)
      const shouldPin = !!(preferredStaff && (isManualPin || isRelativelyOnline) && !shouldAssignImmediately);

      if (shouldAssignImmediately) {
        jobStatus = 'ASSIGNED';
      }
      
      // ROBUST PATH HANDLING: Normalize roots for Windows (ensures case-insensitive start detection)
      const n8nRoot = process.env.N8N_WATCH_PATH ? path.resolve(process.env.N8N_WATCH_PATH) : null;
      const waRoot = process.env.WHATSAPP_WATCH_PATH ? path.resolve(process.env.WHATSAPP_WATCH_PATH) : null;
      // walkinRoot is already declared above at line 353
      const absoluteFolder = path.resolve(task.folderPath);
      
      let finalBase = path.dirname(absoluteFolder);
      if (n8nRoot && absoluteFolder.toLowerCase().startsWith(n8nRoot.toLowerCase())) {
        finalBase = n8nRoot;
      } else if (waRoot && absoluteFolder.toLowerCase().startsWith(waRoot.toLowerCase())) {
        finalBase = waRoot;
      } else if (walkinRoot && absoluteFolder.toLowerCase().startsWith(walkinRoot.toLowerCase())) {
        finalBase = walkinRoot;
      }

      const jobData = {
        customerEmail,
        customerName: finalCustomerName,
        emailSubject: manualJobTitle || subfolderName,
        mailBody: mailBody,
        folderPath: absoluteFolder,
        relativeFolderPath: path.relative(finalBase, absoluteFolder).replace(/\\/g, '/'),
        attachments,
        attachmentMeta: metadata?.originalNamesMap || {},
        status: jobStatus,
        fingerprint,
        priorityScore,
        queuePosition: nextPosition,
        type: jobType,
        dueBy,
        threadId: existingThreadId,
        version: nextVersion,
        parentJobId: parentJobId,
        isAutoAssigned: shouldAssignImmediately,
        continuityContext: shouldAssignImmediately ? `WhatsApp Auto-Assign: Handling ${finalCustomerName}` : (shouldPin ? (isFollowUp ? `Continuity: Another job arrived from ${finalCustomerName}` : `Sticky Routing: Reserved for ${finalCustomerName}'s preferred handler`) : (isTrueDuplicate ? 'Identical content detected. System suggests duplicate arrival.' : (preferredStaff ? 'Previous handler identified but currently offline/out of shift.' : ''))),
        assignedTo: shouldAssignImmediately ? preferredStaff : null,
        assignedAt: shouldAssignImmediately ? new Date() : null,
        pinnedToStaff: shouldPin ? preferredStaff : null,
        department: metadata?.department || null,
        returnReason: isWhatsApp ? (metadata?.description || 'WhatsApp Job Upload') : (spamType === 'MARKETING' ? 'Auto-detected Marketing/Spam' : (spamType === 'NOREPLY' ? 'System No-Reply (Admin Review Required)' : (isTrueDuplicate ? 'Content Duplicate (Review Required)' : (isFollowUp ? `Revision v${nextVersion} detected` : '')))),
        externalLinks: this.extractExternalLinks(mailBody),
        auditLog: [{
          action: 'JOB_INGESTED',
          timestamp: new Date(),
          details: { 
            textFilesIngested: txtFiles.length, 
            attachmentsIngested: attachments.length,
            fingerprint: fingerprint.substring(0, 8)
          }
        }]
      }

      // Final Deduplication check (protects against last-millisecond races between watcher and manual routes)
      const exactDuplicate = await QueueJob.findOne({ 
        folderPath: task.folderPath,
        createdAt: { $gte: new Date(Date.now() - 60 * 1000) } // Match any job for this folder in the last minute
      });
      if (exactDuplicate) {
        console.log(`[Worker] Aborting: Exact folderPath already exists in DB within 60s: ${task.folderPath}`);
        task.status = 'COMPLETED';
        task.completedAt = new Date();
        await task.save();
        return null;
      }

      let job;
      // WALKIN MERGE LOGIC:
      // Link physical files to a virtual placeholder if the staff member is already "assigned" to this walk-in.
      if (jobType === 'WALKIN') {
        const mergeQuery = {
          type: 'WALKIN',
          folderPath: { $in: ['', null] },
          status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'QUEUED'] }
        };

        if (preferredStaff) {
          mergeQuery.$or = [
            { pinnedToStaff: preferredStaff },
            { assignedTo: preferredStaff }
          ];
        }

        // We only attempt merging if we have a specific staff match OR if there's only one placeholder globally
        // (to avoid mis-linking when multiple designers have active walk-ins).
        const placeholders = await QueueJob.find(mergeQuery).limit(2);
        
        if (placeholders.length === 1) {
          job = await QueueJob.findOneAndUpdate(
            { _id: placeholders[0]._id },
            {
              $set: {
                ...jobData,
                // Preserve the existing assignment if it was already ASSIGNED
                status: placeholders[0].status === 'QUEUED' ? jobData.status : placeholders[0].status,
                assignedTo: placeholders[0].assignedTo || jobData.assignedTo,
                pinnedToStaff: placeholders[0].pinnedToStaff || jobData.pinnedToStaff
              },
              $push: {
                auditLog: {
                  action: 'JOB_INGESTED',
                  timestamp: new Date(),
                  details: { 
                    note: 'Physical folder linked to existing walk-in placeholder.',
                    folderName: subfolderName
                  }
                }
              }
            },
            { new: true }
          );
          if (job) console.log(`[Worker] Merged folder ${subfolderName} into existing placeholder ${job._id}`);
        }
      }

      if (!job) {
        job = await QueueJob.create(jobData);
      }
      
      task.status = 'COMPLETED'
      task.completedAt = new Date()
      await task.save()

      // Trigger Batch Affinity Check: If this customer is already being handled, auto-link it
      const queueEngine = require('./queueEngine')
      await queueEngine.handleNewJobArrival(job._id).catch(err => console.error('[Worker] Batch Affinity error:', err.message))

      // SUPERSEDE FIRST: Mark older queued jobs for this thread as JUNK *before* emitting
      // job:created, so the admin dashboard never briefly shows two live jobs for the same thread.
      if (isFollowUp && existingThreadId) {
        const supersedeType = isTrueDuplicate ? 'Identical Resend' : `Revision v${nextVersion}`;

        // KEY FIX: The parent job was created before threadId was assigned to itself.
        // Patch its own threadId to itself so future supersede queries can find it by threadId.
        if (parentJobId) {
          await QueueJob.findOneAndUpdate(
            { _id: parentJobId, threadId: null },
            { $set: { threadId: existingThreadId } }
          )
        }

        const superseded = await QueueJob.updateMany(
          { 
            $or: [
              { threadId: existingThreadId },  // Matches all siblings who know their threadId
              { _id: parentJobId }             // Directly matches the parent (threadId was null)
            ],
            status: { $in: ['QUEUED', 'ADMIN_REVIEW'] }, 
            _id: { $ne: job._id } 
          },
          { 
            $set: { 
              status: 'JUNK', 
              isSuperseded: true,
              returnReason: `Superseded by newer arrival: ${supersedeType} (#${job._id.toString().substring(18).toUpperCase()})`
            },
            $push: {
              auditLog: {
                action: 'JOB_SUPERSEDED',
                timestamp: new Date(),
                details: { supersededBy: job._id, newerVersion: nextVersion, type: supersedeType }
              }
            }
          }
        )
        if (superseded.modifiedCount > 0) {
          console.log(`[Worker] Superseded ${superseded.modifiedCount} older jobs for thread ${existingThreadId}`)
        }
      }

      // SESSION UPDATE: If this job was assigned immediately, update their
      // session immediately so the assignment engine knows they are busy and won't double-assign.
      if (shouldAssignImmediately && preferredStaff && activeSession) {
        try {
          activeSession.currentQueueJob = job._id;
          await activeSession.save();
          console.log(`[Worker] Session updated for immediately assigned staff ${preferredStaff}`);
        } catch (sessErr) {
          console.error('[Worker] Session update after instant-assign failed:', sessErr.message);
        }
      }

      console.log(`[Worker] Job created: ${job._id} (Status: ${jobStatus})`)
      eventBus.emit('job:created', { job, isDuplicate: isTrueDuplicate, isSpam, spamType })

    } catch (err) {
      console.error(`[Worker] Worker error:`, err.message)
      if (task) {
        task.status = 'FAILED'
        task.error = err.message
        await task.save().catch(() => {})
      }
    } finally {
      this.isProcessing = false
      // If we finished a task, check for the next one immediately
      setImmediate(() => this.processNextTask())
    }
  }

  async getFolderFingerprint(folderPath) {
    const files = await this._getAllFiles(folderPath);
    files.sort();

    let summary = [`SUBJECT:${path.basename(folderPath)}`, `COUNT:${files.length}`];
    
    for (const fullPath of files) {
      try {
        const stat = await fsp.stat(fullPath);
        const isVolatile = /\.(txt|html|htm)$/i.test(fullPath);
        if (isVolatile) continue;

        // Robust Identification: Hash the first 8KB (Sample) + Size
        const sampleHash = await this._getFileSampleHash(fullPath, stat.size);
        summary.push(`${path.relative(folderPath, fullPath)}:${stat.size}:${sampleHash}`);
      } catch (err) {
        console.error(`[Worker] Fingerprint error for ${fullPath}:`, err.message);
      }
    }
    return summary.join('|');
  }

  /**
   * Reads a slice of the file to generate a content-based sample hash.
   * Prevents collisions while being performant for large assets.
   */
  async _getFileSampleHash(filePath, totalSize) {
    if (totalSize === 0) return 'empty';
    
    try {
      const handle = await fsp.open(filePath, 'r');
      const sampleSize = Math.min(totalSize, 8192); // 8KB sample
      const buffer = Buffer.alloc(sampleSize);
      
      await handle.read(buffer, 0, sampleSize, 0);
      await handle.close();
      
      return crypto.createHash('md5').update(buffer).digest('hex');
    } catch (err) {
      return `read-error-${totalSize}`;
    }
  }

  computeHash(data) {
    return crypto.createHash('md5').update(data).digest('hex')
  }

  getSpamCategory(email, subject) {
    const marketingKeywords = ['subscribe', 'newsletter', 'unsubscribe', 'marketing', 'promo', 'ads', 'alerts@', 'notifications@', 'updates@']
    const noreplyKeywords = ['noreply', 'no-reply', 'no_reply', 'do-not-reply']
    const whitelistKeywords = ['wetransfer.com', 'we.tl', 'transferxl.com', 'sendgb.com']
    
    const combined = (email + ' ' + subject).toLowerCase()
    if (whitelistKeywords.some(kw => combined.includes(kw))) return null
    if (noreplyKeywords.some(kw => combined.includes(kw))) return 'NOREPLY'
    if (marketingKeywords.some(kw => combined.includes(kw))) return 'MARKETING'
    return null
  }

  extractExternalLinks(text) {
    if (!text) return []
    const links = []
    const rawMatches = text.match(/https?:\/\/[^\s<>"]+/g) || []
    const uniqueMatches = Array.from(new Set(rawMatches))
    
    const junkKeywords = ['/legal', '/terms', '/explore', '/account', 'about.wetransfer.com', 'notification', 'utm_', 'sign-up', 'login', 'cookie', 'privacy', 'help']

    for (const url of uniqueMatches) {
      const lowerUrl = url.toLowerCase()
      if (junkKeywords.some(kw => lowerUrl.includes(kw))) continue

      if (url.includes('drive.google.com')) links.push({ title: 'Google Drive File', url })
      else if (url.includes('dropbox.com')) links.push({ title: 'Dropbox File', url })
      else if (url.includes('we.tl') || url.includes('wetransfer.com')) {
        if (url.includes('/downloads/') || url.includes('/t/') || url.includes('we.tl/') || url.includes('wetransfer.com/s/')) {
          links.push({ title: 'WeTransfer File', url })
        }
      }
    }
    return links
  }
}

module.exports = new ProcessingWorker()

