const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const { QueueJob } = require('../repositories')

/**
 * GET /job-files/* â€” Secure Proxy for Legacy & Archive Job Files
 * Handles files in N8N_WATCH_PATH and COMPLETED_JOBS_PATH
 */
router.get('/*', auth, authorize(['ADMIN', 'PREPRESS', 'DISPATCH']), async (req, res) => {
  try {
    const requestedPath = req.params[0]
    const pathService = require('../services/pathService')
    const normalizedPath = pathService.resolveRawPath(requestedPath)

    if (!normalizedPath) {
      return res.status(404).json({ message: 'File not found on storage server' })
    }

    const stats = fs.statSync(normalizedPath)

    // ORIGINAL FILENAME PRESERVATION
    // Strip leading slashes to find the relative folder part
    const cleanReqPath = requestedPath.replace(/^[\\/]+/, '')
    const systemName = path.basename(normalizedPath)
    const relativeFolder = path.dirname(cleanReqPath).replace(/\\/g, '/')
    
    // We try to find the job that matches this relative path to retrieve original names
    const job = await QueueJob.findOne({ 
        $or: [
          { relativeFolderPath: relativeFolder },
          { relativeFolderPath: relativeFolder + '/' }
        ]
    }).lean();

    if (job && job.attachmentMeta && job.attachmentMeta[systemName]) {
        const originalName = job.attachmentMeta[systemName]
        // Clean originalName for header safety (remove illegal filename chars)
        const safeOriginalName = originalName.replace(/[/\\?%*:|"<>]/g, '-')
        
        // Use 'inline' so images still show in browser, but 'Save As' uses the original name
        res.setHeader('Content-Disposition', `inline; filename="${safeOriginalName}"`)
    }

    if (stats.isDirectory()) {
      // Support Directory Listing for folder navigation
      const files = fs.readdirSync(normalizedPath)
      let html = `<html><head><title>Assets: ${requestedPath}</title>
      <style>
        body{font-family:sans-serif;padding:2rem;background:#f8fafc;color:#1e293b} 
        h2{border-bottom:2px solid #e2e8f0;padding-bottom:1rem}
        a{display:block;padding:0.6rem;color:#2563eb;text-decoration:none;border-bottom:1px solid #f1f5f9;font-weight:600} 
        a:hover{background:#eff6ff;color:#1d4ed8}
        .meta{font-size:0.8rem;color:#64748b;margin-bottom:2rem}
      </style></head><body>`
      html += `<h2>ðŸ“ Folder: ${requestedPath}</h2>`
      html += `<div class="meta">Secure Asset Proxy â€¢ Authenticated as ${req.user.name}</div>`
      html += `<a href="../">.. (Up)</a>`
      files.forEach(f => {
        const itemPath = path.join(req.originalUrl, f)
        html += `<a href="${itemPath}">${f}</a>`
      })
      html += `</body></html>`
      return res.send(html)
    }

    // Serve the file
    res.sendFile(normalizedPath)
  } catch (err) {
    console.error('FILE PROXY ERROR:', err)
    res.status(500).json({ message: 'Server error accessing file' })
  }
})

module.exports = router

