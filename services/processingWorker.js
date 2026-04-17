const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const IngestionTask = require('../models/IngestionTask')
const QueueJob = require('../models/QueueJob')
const eventBus = require('./eventBus')

/**
 * Heavy-duty worker for parsing folders, hashing files, 
 * and identifying duplicates.
 */
class ProcessingWorker {
  constructor() {
    this.isProcessing = false
  }

  // Generic recursive file walker
  _getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        this._getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    });
    return arrayOfFiles;
  }

  async start() {
    console.log('[Worker] Starting Ingestion Worker...')
    // Continuous polling or triggered by events
    setInterval(() => this.processNextTask(), 5000)
    
    eventBus.on('task:new', () => {
      if (!this.isProcessing) this.processNextTask()
    })
  }

  async processNextTask() {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      const task = await IngestionTask.findOneAndUpdate(
        { 
          status: { $in: ['PENDING', 'FAILED'] },
          attempts: { $lt: 3 }
        },
        { status: 'PROCESSING', startedAt: new Date(), $inc: { attempts: 1 } },
        { sort: { createdAt: 1 }, new: true }
      )

      if (!task) {
        this.isProcessing = false
        return
      }

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

      // 1. Calculate File Hashes
      const fileData = this.getFolderFingerprint(task.folderPath)
      const fingerprint = this.computeHash(fileData)

      // 2. Parse Metadata
      const parentFolder = path.basename(path.dirname(task.folderPath))
      const subfolderName = path.basename(task.folderPath)
      const customerEmail = parentFolder.replace(/\s*\(\d+\)$/, '').trim()
      
      // Detect spam type (Marketing vs No-Reply)
      const spamType = this.getSpamCategory(customerEmail, subfolderName)
      const isSpam = !!spamType;


      // 3. Duplicate & Smart Threading Logic
      // Tier 1: Find any RECENT active job from this sender to keep them in the same thread
      // We look for jobs currently being worked on or assigned
      // FIX: Ensure it only groups if the subject is similar or it's an exact duplicate
      const activeJobsMatch = await QueueJob.find({
        customerEmail,
        status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }
      }).sort({ createdAt: -1 }).populate('assignedTo');

      let activeJobForCustomer = null;
      for (const aj of activeJobsMatch) {
         if (aj.fingerprint === fingerprint || aj.emailSubject === subfolderName) {
             activeJobForCustomer = aj;
             break;
         }
      }

      let isTrueDuplicate = false;
      let existingThreadId = null;
      let preferredStaff = null;
      let parentJobId = null;
      let nextVersion = 1;

      // Handle Continuity & Versioning Context
      if (activeJobForCustomer) {
        existingThreadId = activeJobForCustomer.threadId || activeJobForCustomer._id.toString();
        preferredStaff = activeJobForCustomer.assignedTo?._id || activeJobForCustomer.assignedTo;
        parentJobId = activeJobForCustomer._id;
        
        // Calculate version number
        const versionCount = await QueueJob.countDocuments({ threadId: existingThreadId });
        nextVersion = versionCount + 1;

        // If the fingerprint matches exactly, it's a suspicious identical resend
        if (activeJobForCustomer.fingerprint === fingerprint) {
          isTrueDuplicate = true;
        }
      } else {
        // If no active job, check for ANY recent job from this sender for subject-matching thread link
        const recentJob = await QueueJob.findOne({
          customerEmail,
          emailSubject: subfolderName,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).sort({ createdAt: -1 });

        if (recentJob) {
          existingThreadId = recentJob.threadId || recentJob._id.toString();
          const vCount = await QueueJob.countDocuments({ threadId: existingThreadId });
          nextVersion = vCount + 1;
        }
      }

      // Check if the preferred staff is actually ONLINE right now (Availability Guard)
      let staffIsOnline = false;
      if (preferredStaff) {
        const QueueSession = require('../models/QueueSession');
        const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000);
        const activeSession = await QueueSession.findOne({
          staffId: preferredStaff,
          isActive: true,
          lastSeenAt: { $gte: threeMinsAgo }
        });
        if (activeSession) staffIsOnline = true;
      }

      // 4. Calculate SLA (Default 4 hours from now)
      const dueBy = new Date()
      dueBy.setHours(dueBy.getHours() + 4)

      // 5. Build Job Data
      const watchPath = process.env.N8N_WATCH_PATH
      const nextPosition = Date.now()

      // 5. Read files from folder
      const allFiles = fs.readdirSync(task.folderPath);
      // Filter hidden files and only include real files (not subdirs)
      // ALSO: Filter out text/html files because their content is ingested into mailBody (Redundancy Removal)
      const attachments = allFiles.filter(f => {
        if (f.startsWith('.')) return false;
        if (/\.(txt|html|htm)$/i.test(f)) return false; // Redundancy Removal
        try { return fs.statSync(path.join(task.folderPath, f)).isFile(); } catch { return false; }
      });

      // Separate text files for mail body ingestion — sorted for predictable order
      const txtFiles = allFiles
        .filter(f => /\.(txt|html|htm)$/i.test(f))
        .sort()

      // Simple HTML tag stripper for .html email files
      const stripHtml = (html) => html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
        .replace(/&nbsp;/g,' ').replace(/\s{3,}/g, '\n\n').trim()

      // Read and concatenate all text file content to form the mailBody
      let mailBody = '';
      for (const txtFile of txtFiles) {
        try {
          let content = fs.readFileSync(path.join(task.folderPath, txtFile), 'utf-8');
          // Strip HTML tags if it's an HTML file
          if (/\.html?$/i.test(txtFile)) content = stripHtml(content)
          if (content.trim()) mailBody += content.trim() + '\n\n---\n\n';
        } catch (readErr) {
          console.error(`[Worker] Failed to read ${txtFile}:`, readErr.message);
        }
      }
      mailBody = mailBody.replace(/---\n\n$/, '').trim()

      const isFollowUp = !!activeJobForCustomer;
      // Rule: Different Files + Known Active Staff + Online -> AUTO-ASSIGN
      const shouldAutoAssign = isFollowUp && preferredStaff && staffIsOnline;
      
      // Rule: Same Files + Active Session -> ADMIN_REVIEW
      // Normal path -> QUEUED
      let jobStatus = isTrueDuplicate ? 'ADMIN_REVIEW' : (shouldAutoAssign ? 'ASSIGNED' : 'QUEUED');
      
      // Categorize spam: Marketing -> JUNK, No-Reply -> ADMIN_REVIEW
      if (spamType === 'MARKETING') {
        jobStatus = 'JUNK';
      } else if (spamType === 'NOREPLY') {
        jobStatus = 'ADMIN_REVIEW';
      }
      
      const jobData = {
        customerEmail,
        customerName: customerEmail.split('@')[0],
        emailSubject: subfolderName,
        mailBody: mailBody,
        folderPath: task.folderPath,
        relativeFolderPath: path.relative(watchPath || path.dirname(task.folderPath), task.folderPath).replace(/\\/g, '/'),
        attachments,
        status: jobStatus,
        fingerprint,
        priorityScore: isFollowUp ? 5 : 0,
        queuePosition: nextPosition,
        type: 'EMAIL',
        dueBy,
        threadId: existingThreadId,
        version: nextVersion,
        parentJobId: parentJobId,
        isAutoAssigned: shouldAutoAssign,
        continuityContext: shouldAutoAssign ? `Continuity: Auto-assigned to ${activeJobForCustomer.assignedTo?.name || 'original handler'}` : (isTrueDuplicate ? 'Identical files detected. Verify if accident or deliberate resend.' : ''),
        assignedTo: shouldAutoAssign ? preferredStaff : null,
        assignedAt: shouldAutoAssign ? new Date() : null,
        returnReason: spamType === 'MARKETING' ? 'Auto-detected Marketing/Spam' : (spamType === 'NOREPLY' ? 'System No-Reply (Admin Review Required)' : (isTrueDuplicate ? 'Suspicious Duplicate (Review Required)' : (isFollowUp ? `Revision v${nextVersion} detected` : ''))),
        externalLinks: this.extractExternalLinks(mailBody),
        auditLog: [{
          action: 'JOB_INGESTED',
          timestamp: new Date(),
          details: { 
            textFilesIngested: txtFiles.length, 
            attachmentsIngested: attachments.length,
            linksExtracted: (this.extractExternalLinks(mailBody)).length,
            fingerprint: fingerprint.substring(0, 8)
          }
        }]
      }

      if (isFollowUp) {
        jobData.auditLog.push({
          action: 'FOLLOW_UP_DETECTED',
          timestamp: new Date(),
          details: { parentThread: existingThreadId, originalStaff: preferredStaff }
        })
      }

      const job = await QueueJob.create(jobData)

      // 6. Update Task
      task.status = 'COMPLETED'
      task.completedAt = new Date()
      await task.save()

      // 6. AUTO-CLEANUP: If this is a new arrival for an active thread, supersede any older QUEUED jobs
      if (isFollowUp && existingThreadId) {
        const supersedeType = isTrueDuplicate ? 'Identical Resend' : `Revision v${nextVersion}`;
        const superseded = await QueueJob.updateMany(
          { 
            threadId: existingThreadId, 
            status: 'QUEUED', 
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
          console.log(`[Worker] Superseded ${superseded.modifiedCount} older queued jobs for thread ${existingThreadId}`)
        }
      }

      console.log(`[Worker] Job created: ${job._id} (Status: ${jobStatus})`)
      eventBus.emit('job:created', { job, isDuplicate: isTrueDuplicate, isSpam, spamType })

    } catch (err) {
      console.error(`[Worker] Failed task ${task._id}:`, err.message)
      task.status = 'FAILED'
      task.error = err.message
      await task.save()
    }
  }

  getFolderFingerprint(folderPath) {
    const files = this._getAllFiles(folderPath);
    // Sort files to ensure stable fingerprinting
    files.sort();

    let summary = [`SUBJECT:${path.basename(folderPath)}`, `COUNT:${files.length}`];
    
    for (const fullPath of files) {
      try {
        const stats = fs.statSync(fullPath);
        let contentSample = '';
        
        // Filter: Ignore volatile email body files (.txt, .html) for stable fingerprinting
        const isVolatile = /\.(txt|html|htm)$/i.test(fullPath);
        if (isVolatile) continue;

        summary.push(`${path.relative(folderPath, fullPath)}:${stats.size}:${contentSample}`);
      } catch (err) {
        console.error(`[Worker] Fingerprint error for ${fullPath}:`, err.message);
      }
    }
    return summary.join('|');
  }

  computeHash(data) {
    return crypto.createHash('md5').update(data).digest('hex')
  }

  getSpamCategory(email, subject) {
    const marketingKeywords = ['subscribe', 'newsletter', 'unsubscribe', 'marketing', 'promo', 'ads']
    const noreplyKeywords = ['noreply', 'no-reply', 'no_reply', 'do-not-reply']
    const whitelistKeywords = ['wetransfer.com', 'we.tl', 'transferxl.com', 'sendgb.com']
    
    const combined = (email + ' ' + subject).toLowerCase()

    // Priority 1: Whitelist specific trusted transfer services even if they use no-reply
    if (whitelistKeywords.some(kw => combined.includes(kw))) return null
    
    if (noreplyKeywords.some(kw => combined.includes(kw))) return 'NOREPLY'
    if (marketingKeywords.some(kw => combined.includes(kw))) return 'MARKETING'
    
    return null
  }

  extractExternalLinks(text) {
    if (!text) return []
    const links = []
    
    // Generic URL detection
    const genericRegex = /https?:\/\/[^\s<>"]+/g
    const rawMatches = text.match(genericRegex) || []
    const uniqueMatches = Array.from(new Set(rawMatches)) // De-duplicate raw URLs
    
    const junkKeywords = [
      '/legal', '/terms', '/explore', '/account', 'about.wetransfer.com', 
      'notification', 'utm_', 'princip', 'sign-up', 'login', 
      'cookie', 'privacy', 'help', 'twitter.com', 'facebook.com', 'instagram.com',
      'youtube.com', 'linkedin.com', 'sendgrid.net', '/en-us/'
    ]

    for (const url of uniqueMatches) {
      const lowerUrl = url.toLowerCase()
      
      // Filter out junk platform/social links
      const isJunk = junkKeywords.some(kw => lowerUrl.includes(kw))
      if (isJunk) continue

      if (url.includes('drive.google.com')) {
        links.push({ title: 'Google Drive File', url })
      } else if (url.includes('dropbox.com')) {
        links.push({ title: 'Dropbox File', url })
      } else if (url.includes('we.tl') || url.includes('wetransfer.com')) {
        // More robust detection for WeTransfer links
        // Matches: we.tl/t-..., wetransfer.com/downloads/..., wetransfer.com/t/...
        const isTransfer = url.includes('/downloads/') || url.includes('/t/') || url.includes('we.tl/') || url.includes('wetransfer.com/s/')
        
        if (isTransfer) {
           links.push({ title: 'WeTransfer File', url })
        }
      }
    }
    
    return links
  }
}

module.exports = new ProcessingWorker()
