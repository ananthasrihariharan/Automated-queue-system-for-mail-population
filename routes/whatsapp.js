const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const uploadAny = require('../middleware/uploadAny')
const fs = require('fs')
const path = require('path')
const { Customer } = require('../repositories')
const { CustomerPreference } = require('../repositories')
const { IngestionTask } = require('../repositories')
const eventBus = require('../services/eventBus')

/**
 * UPLOAD WHATSAPP JOB
 * Role: ADMIN, PREPRESS (User requested Admin-only, but usually admin routes check 'ADMIN')
 */
router.post(
  '/jobs/upload',
  auth,
  authorize('ADMIN', 'PREPRESS'), // Allowing PREPRESS as fallback, but UI is Admin only
  uploadAny.array('files'),
  async (req, res) => {
    try {
      const { 
        customerName, 
        customerPhone, 
        alternatePhones, 
        preferredStaffId, 
        description,
        jobTitle,
        priority,
        department
      } = req.body
      const files = req.files || []

      if (!customerPhone || files.length === 0) {
        return res.status(400).json({ message: 'Missing phone number or files' })
      }

      // 0. BURST PROTECTION: Check for very recent tasks for this phone
      // This stops rapid double-clicks from creating two separate folders
      const recentTask = await IngestionTask.findOne({
        folderPath: { $regex: customerPhone },
        createdAt: { $gte: new Date(Date.now() - 15 * 1000) }
      })
      if (recentTask) {
        console.warn(`[WhatsApp] Burst detected for ${customerPhone}. Rejecting duplicate request.`);
        return res.status(429).json({ message: 'Already injecting a job for this customer. Please wait 15s.' })
      }

      // 1. Manage Customer
      const altPhonesArr = alternatePhones ? JSON.parse(alternatePhones) : []
      let customer = await Customer.findOne({ 
        $or: [
          { phone: customerPhone },
          { alternatePhones: customerPhone }
        ]
      })

      if (!customer) {
        // Create new customer
        const { generateInitialPassword } = require('../utils/password')
        customer = await Customer.create({
          name: customerName || 'Unknown Customer',
          phone: customerPhone,
          alternatePhones: altPhonesArr,
          password: generateInitialPassword(customerName || 'Unknown', customerPhone)
        })
      } else {
        // Update alternate phones if new ones are provided
        if (altPhonesArr.length > 0) {
            const combined = new Set([...(customer.alternatePhones || []), ...altPhonesArr])
            customer.alternatePhones = Array.from(combined)
            await customer.save()
        }
      }

      const senderEmail = `${customer.phone}@whatsapp.local`

      // 2. Manage Preferred Staff (Continuity)
      if (preferredStaffId) {
        await CustomerPreference.findOneAndUpdate(
          { customerEmail: senderEmail },
          { 
             preferredStaff: preferredStaffId,
             updatedAt: new Date()
          },
          { upsert: true }
        )
      }

      // 3. Create structure so FileWatcher picks it up
      const watchPath = process.env.WHATSAPP_WATCH_PATH
      if (!watchPath) {
         return res.status(500).json({ message: 'WHATSAPP_WATCH_PATH not configured in server' })
      }

      // ENHANCED FOLDER NAMING: Include customer name in subfolder
      const sanitizedName = (customerName || 'Job').replace(/[^a-z0-9]/gi, '_').substring(0, 40);
      const timestampSubject = `${new Date().toISOString().replace(/[:.]/g, '-')}_WhatsApp_${sanitizedName}`
      const destinationFolder = path.join(watchPath, senderEmail, timestampSubject)

      if (!fs.existsSync(destinationFolder)) {
        fs.mkdirSync(destinationFolder, { recursive: true })
      }

      // 4. Move files and preserve original filenames on disk
      // Helper to ensure the filename is safe for the Windows file system
      const sanitizeFilename = (name) => name.replace(/[/\\?%*:|"<>]/g, '-').trim();

      const usedNames = new Set()
      files.forEach(file => {
         let baseName = sanitizeFilename(file.originalname || 'file')
         let ext = path.extname(baseName)
         let nameWithoutExt = path.basename(baseName, ext)
         
         // Collision Handling: Ensure filenames are unique within this specific job folder
         let finalName = baseName
         let counter = 1
         while (usedNames.has(finalName)) {
           finalName = `${nameWithoutExt}(${counter})${ext}`
           counter++
         }
         usedNames.add(finalName)

         const newPath = path.join(destinationFolder, finalName)
         
         // Use copy+unlink for cross-device safety on Windows (prevents EXDEV crash)
         fs.copyFileSync(file.path, newPath)
         fs.unlinkSync(file.path)
      })

      if (description) {
         const emailBodyPath = path.join(destinationFolder, 'email_body.txt')
         fs.writeFileSync(emailBodyPath, description, 'utf8')
      } else {
         const emailBodyPath = path.join(destinationFolder, 'email_body.txt')
         fs.writeFileSync(emailBodyPath, `WhatsApp job uploaded by ${req.user.name || 'Admin'}`, 'utf8')
      }

      // Write metadata for ProcessingWorker
      const metadataPath = path.join(destinationFolder, 'metadata.json')
      fs.writeFileSync(metadataPath, JSON.stringify({
         customerName,
         description,
         preferredStaffId,
         jobTitle,
         priority,
         department,
         uploadedBy: req.user.name,
         uploadedAt: new Date()
      }, null, 2))

       // Create IngestionTask to alert the worker
       await IngestionTask.create({
         type: 'WHATSAPP',
         folderPath: destinationFolder,
         subject: jobTitle || `${customerPhone}@whatsapp.local`,
         status: 'PENDING',
         attempts: 0
       })

       // Signal worker (if online)
       eventBus.emit('task:new')

       res.status(201).json({ message: 'WhatsApp Job successfully injected into processing queue' })
    } catch (err) {
      console.error('[WhatsApp Route] Error:', err)
      res.status(500).json({ message: err.message })
    }
  }
)

/**
 * GET RECENT WHATSAPP JOBS
 * Role: ADMIN, PREPRESS
 */
router.get('/jobs/recent', auth, authorize('ADMIN', 'PREPRESS'), async (req, res) => {
  try {
    const { QueueJob } = require('../repositories')
    const jobs = await QueueJob.find({ type: 'WHATSAPP' })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('assignedTo', 'name')
      .populate('pinnedToStaff', 'name')
    res.json(jobs)
  } catch (err) {
    console.error('[WhatsApp Route] Fetch Error:', err)
    res.status(500).json({ message: err.message })
  }
})

module.exports = router

