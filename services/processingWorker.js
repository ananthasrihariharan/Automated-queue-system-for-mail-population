const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const crypto = require('crypto')
const IngestionTask = require('../models/IngestionTask')
const QueueJob = require('../models/QueueJob')
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

      // 1. Calculate File Hashes (Async)
      const fileData = await this.getFolderFingerprint(task.folderPath)
      const fingerprint = this.computeHash(fileData)

      // 2. Parse Metadata
      const parentFolder = path.basename(path.dirname(task.folderPath))
      const subfolderName = path.basename(task.folderPath)
      const customerEmail = parentFolder.replace(/\s*\(\d+\)$/, '').trim()
      
      const spamType = this.getSpamCategory(customerEmail, subfolderName)
      const isSpam = !!spamType;

      // 3. Duplicate & Smart Threading Logic
      const activeJobsMatch = await QueueJob.find({
        customerEmail,
        status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }
      }).sort({ createdAt: -1 }).populate('assignedTo');

      let activeJobForCustomer = null;
      for (const aj of activeJobsMatch) {
         if (aj.fingerprint === fingerprint || aj.emailSubject.toLowerCase() === subfolderName.toLowerCase()) {
             activeJobForCustomer = aj;
             break;
         }
      }

      let isTrueDuplicate = false;
      let existingThreadId = null;
      let preferredStaff = null;
      let parentJobId = null;
      let nextVersion = 1;

      if (activeJobForCustomer) {
        existingThreadId = activeJobForCustomer.threadId || activeJobForCustomer._id.toString();
        preferredStaff = activeJobForCustomer.assignedTo?._id || activeJobForCustomer.assignedTo;
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
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).sort({ createdAt: -1 });

        if (recentJob) {
          existingThreadId = recentJob.threadId || recentJob._id.toString();
          const vCount = await QueueJob.countDocuments({ threadId: existingThreadId });
          nextVersion = vCount + 1;
        }
      }

      let staffIsOnline = false;
      if (preferredStaff) {
        const QueueSession = require('../models/QueueSession');
        const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000);
        const activeSession = await QueueSession.findOne({
          staffId: preferredStaff,
          isActive: true,
          lastSeenAt: { $gte: ninetyMinsAgo }
        });
        if (activeSession) staffIsOnline = true;
      }

      const dueBy = new Date()
      dueBy.setHours(dueBy.getHours() + 4)

      const watchPath = process.env.N8N_WATCH_PATH
      const nextPosition = Date.now()

      // 5. Read files (Async)
      const allFilesList = await fsp.readdir(task.folderPath);
      const attachments = [];
      const txtFiles = [];

      for (const f of allFilesList) {
        if (f.startsWith('.')) continue;
        const full = path.join(task.folderPath, f);
        const stat = await fsp.stat(full);
        if (stat.isDirectory()) continue;

        if (/\.(txt|html|htm)$/i.test(f)) {
          txtFiles.push(f);
        } else {
          attachments.push(f);
        }
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
      const shouldAutoAssign = isFollowUp && preferredStaff && staffIsOnline;
      
      let jobStatus = isTrueDuplicate ? 'ADMIN_REVIEW' : (shouldAutoAssign ? 'ASSIGNED' : 'QUEUED');
      
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
        continuityContext: shouldAutoAssign ? `Continuity: Auto-assigned to ${activeJobForCustomer.assignedTo?.name || 'original handler'}` : (isTrueDuplicate ? 'Identical content detected. System suggests duplicate arrival.' : ''),
        assignedTo: shouldAutoAssign ? preferredStaff : null,
        assignedAt: shouldAutoAssign ? new Date() : null,
        returnReason: spamType === 'MARKETING' ? 'Auto-detected Marketing/Spam' : (spamType === 'NOREPLY' ? 'System No-Reply (Admin Review Required)' : (isTrueDuplicate ? 'Content Duplicate (Review Required)' : (isFollowUp ? `Revision v${nextVersion} detected` : ''))),
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

      const job = await QueueJob.create(jobData)
      task.status = 'COMPLETED'
      task.completedAt = new Date()
      await task.save()

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

