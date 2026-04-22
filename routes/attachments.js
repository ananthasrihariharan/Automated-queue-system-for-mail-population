const express = require('express')
const router = express.Router()
const archiver = require('archiver')
const fs = require('fs')
const path = require('path')
const QueueJob = require('../models/QueueJob')
const Job = require('../models/Job')
const auth = require('../middleware/auth')

const mongoose = require('mongoose')

/**
 * GET /jobs/:id/download-all
 * Zips all files in the job folder and streams them to the user.
 * Skips zipping if only one file exists.
 */
router.get('/:id/download-all', auth, async (req, res) => {
  try {
    const id = req.params.id
    let job = null
    let folderPath
    let customerPrefix

    if (mongoose.Types.ObjectId.isValid(id)) {
      job = await QueueJob.findById(id)
    }

    if (job) {
      folderPath = job.folderPath
      customerPrefix = (job.customerEmail || 'unknown').split('@')[0]
    } else {
      // Try finding by _id in Job model (Prepress Jobs)
      if (mongoose.Types.ObjectId.isValid(id)) {
        job = await Job.findById(id)
      }
      
      if (!job) {
        // Try finding by jobId in Job model
        job = await Job.findOne({ jobId: id })
      }

      if (job) {
        // Calculate folderPath for Prepress Job
        const uploadBase = process.env.UPLOAD_PATH || path.join(__dirname, '..', 'uploads')
        const date = new Date(job.createdAt)
        const dateString = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
        
        const newStyleDir = path.join(uploadBase, 'jobs', dateString, job.jobId)
        const legacyDir = path.join(uploadBase, 'jobs', job.jobId)

        folderPath = fs.existsSync(newStyleDir) ? newStyleDir : legacyDir
        customerPrefix = (job.customerName || 'customer').replace(/\s+/g, '_')
      }
    }

    if (!job || !folderPath || !fs.existsSync(folderPath)) {
      return res.status(404).json({ message: 'Job folder not found' })
    }

    // --- Resource Level Authorization ---
    const user = req.user
    const isAdmin = user.roles?.includes('ADMIN') || user.role?.toUpperCase() === 'ADMIN'
    
    // If not admin, check if assigned to this job or if job is in QUEUED state (general pool)
    if (!isAdmin) {
      const isAssignedToMe = job.assignedTo?.toString() === user._id.toString()
      const isQueued = job.status === 'QUEUED'
      
      if (!isAssignedToMe && !isQueued) {
        console.warn(`[Security] Unauthorized download attempt by ${user.email} for job ${id}`)
        return res.status(403).json({ message: 'Access Denied: You are not assigned to this job' })
      }
    }

    // List files in the job folder
    const files = fs.readdirSync(folderPath).filter(f => fs.lstatSync(path.join(folderPath, f)).isFile());
    
    if (files.length === 0) {
      return res.status(404).json({ message: 'No files to download' })
    }

    const archive = archiver('zip', { zlib: { level: 9 } })

    // Set headers
    // Sanitize subject for filename
    const subject = job.emailSubject || job.walkinDescription || 'job'
    const cleanSubject = subject.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_').substring(0, 120)
    const zipName = `${cleanSubject}.zip`

    console.log(`[Archiver] Starting ZIP process for ${zipName} (Folder: ${folderPath})`)
    res.attachment(zipName)

    archive.on('error', (err) => { 
      console.error(`[Archiver] Archive Error: ${err.message}`)
      throw err 
    })
    archive.pipe(res)

    // Add only visible attachments to the ZIP (skipping metadata/body files)
    const attachmentField = job.attachments || job.itemScreenshots || []
    
    // Fallback to reading the folder if the database field is empty for some reason
    if (attachmentField.length === 0) {
      archive.directory(folderPath, false)
    } else {
      // Add each file listed in the database
      attachmentField.forEach(fileName => {
        // Handle prepress attachment paths which might be relative to uploads or full paths
        const filePath = fileName.includes(path.sep) ? fileName : path.join(folderPath, fileName)
        if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
          // Use only the basename inside the ZIP for a flat structure
          const baseName = path.basename(fileName)
          archive.file(filePath, { name: baseName })
        }
      })
    }

    await archive.finalize()
    console.log(`[Archiver] ${zipName} finalized and sent.`)

  } catch (err) {
    console.error('[Archiver] Error:', err.message)
    res.status(500).json({ message: 'Failed to create download' })
  }
})

module.exports = router
