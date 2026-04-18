const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

/**
 * GET /job-files/* — Secure Proxy for Legacy & Archive Job Files
 * Handles files in N8N_WATCH_PATH and COMPLETED_JOBS_PATH
 */
router.get('/*', auth, authorize(['ADMIN', 'PREPRESS', 'DISPATCH']), (req, res) => {
  try {
    const requestedPath = req.params[0]
    const watchRoot = process.env.N8N_WATCH_PATH
    const archiveRoot = process.env.COMPLETED_JOBS_PATH

    if (!watchRoot || !archiveRoot) {
      return res.status(500).json({ message: 'Storage paths not configured' })
    }

    // Attempt to resolve against Watch Path first, then Archive Path
    let absolutePath = path.join(watchRoot, requestedPath)
    
    // If not found in watch root, try archive root
    if (!fs.existsSync(absolutePath)) {
      absolutePath = path.join(archiveRoot, requestedPath)
    }

    // 🧹 Prevention of path traversal
    const normalizedPath = path.normalize(absolutePath)
    const isUnderWatch = normalizedPath.startsWith(path.normalize(watchRoot))
    const isUnderArchive = normalizedPath.startsWith(path.normalize(archiveRoot))

    if (!isUnderWatch && !isUnderArchive) {
      console.warn(`[Security] Blocked traversal attempt: ${requestedPath}`)
      return res.status(400).json({ message: 'Invalid path' })
    }

    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ message: 'File not found' })
    }

    const stats = fs.statSync(normalizedPath)
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
      html += `<h2>📁 Folder: ${requestedPath}</h2>`
      html += `<div class="meta">Secure Asset Proxy • Authenticated as ${req.user.name}</div>`
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
