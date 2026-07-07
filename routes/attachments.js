const express = require('express')
const router = express.Router()
const archiver = require('archiver')
const fs = require('fs')
const path = require('path')
const { QueueJob } = require('../repositories')
const { Job } = require('../repositories')
const auth = require('../middleware/auth')

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

    const pathService = require('../services/pathService')

    if (!isNaN(Number(id))) {
      job = await QueueJob.findById(id)
    }

    if (job) {
      customerPrefix = (job.customerEmail || 'unknown').split('@')[0]
      folderPath = pathService.resolveJobFolder(job)
    } else {
      if (!isNaN(Number(id))) {
        job = await Job.findById(id)
      }

      if (!job) {
        // Try finding by jobId in Job model
        job = await Job.findOne({ jobId: id })
      }

      if (job) {
        folderPath = pathService.resolveJobFolder(job)
        customerPrefix = (job.customerName || 'customer').replace(/\s+/g, '_')
      }
    }

    if (!job || !folderPath || !fs.existsSync(folderPath)) {
      return res.status(404).json({ message: 'Job folder not found' })
    }

    // --- Resource Level Authorization ---
    const user = req.user
    const roles = user.roles || []
    const isAdmin = roles.includes('ADMIN') || user.role === 'ADMIN'
    const isStaff = roles.some(r => ['PREPRESS', 'DISPATCH'].includes(r)) || ['PREPRESS', 'DISPATCH'].includes(user.role)
    
    const isAssigned = String(job.assignedTo) === String(user._id)
    const isPinned = String(job.pinnedToStaff) === String(user._id)
    
    // ðŸ›¡ï¸ SECURITY CHECK: Broad access for staff/admins; restricted for others
    if (!isAdmin && !isStaff && !isAssigned && !isPinned) {
       console.warn(`[Security] Unauthorized ZIP download attempt by ${user.email} for job ${id}`)
       return res.status(403).json({ message: 'Access Denied: You are not authorized for this job' })
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

