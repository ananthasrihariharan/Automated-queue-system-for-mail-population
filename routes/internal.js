const express = require('express');
const router = express.Router();
const { User } = require('../repositories');
const { QueueJob } = require('../repositories');
const eventBus = require('../services/eventBus');
const path = require('path');
const fileWatcher = require('../services/fileWatcher');

// Middleware to check API key
const checkInternalAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
        return res.status(401).json({ message: 'Unauthorized internal access.' });
    }
    next();
};

// 1. Verify Staff Info
router.get('/verify-staff/:staffId', checkInternalAuth, async (req, res) => {
    console.log(`[Internal API] Received verification request for Staff ID: ${req.params.staffId}`);
    try {
        const staff = await User.findById(req.params.staffId);
        if (!staff || !staff.isActive) {
            return res.status(404).json({ message: 'Staff member not found or inactive.' });
        }
        res.json({ staffName: staff.name });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// 2. Sync Job from Microservice
router.post('/sync-walkin-job', checkInternalAuth, async (req, res) => {
    try {
        const { staffId, customerName, description, folderPath, attachments, attachmentMeta } = req.body;
        // Accept both field names from microservice
        let customerPhone = req.body.customerPhone || req.body.phone;
        
        console.log(`[Internal API] Syncing Walk-in Job for ${customerName}. Folder: ${folderPath}`);
        
        const walkinBase = process.env.WALKIN_UPLOAD_PATH || path.join(__dirname, '..', 'walkins');

        // Extract phone from folderPath if missing from body
        if (!customerPhone && folderPath) {
            const parts = folderPath.split(/[\\/]/).filter(Boolean);
            // Expected: .../[Root]/[Phone]/[JobFolder]
            // If the last part is JobFolder, the one before it is likely Phone
            if (parts.length >= 2) {
                const possiblePhone = parts[parts.length - 2];
                if (/^\d+$/.test(possiblePhone)) {
                    customerPhone = possiblePhone;
                }
            }
        }

        // Robust path handling: Calculate path relative to the walk-in root
        let relativePath = '';
        try {
            const absoluteFolder = path.resolve(folderPath);
            const walkinRoot = path.resolve(walkinBase);
            
            // If the folder is inside the root (standard check)
            if (absoluteFolder.toLowerCase().startsWith(walkinRoot.toLowerCase())) {
                relativePath = path.relative(walkinRoot, absoluteFolder).replace(/\\/g, '/');
            } else {
                // FALLBACK: If roots differ in prefix (UNC vs Mapped), use the last two components (Identity/Job)
                const parts = absoluteFolder.split(/[\\/]/).filter(Boolean);
                if (parts.length >= 2) {
                    relativePath = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
                } else {
                    relativePath = path.basename(folderPath);
                }
            }
        } catch (e) {
            console.error('[Internal API] Path resolution error:', e.message);
            relativePath = path.basename(folderPath);
        }

        // ANTI-DUPLICATION: Tell the file watcher to skip this folder immediately
        if (fileWatcher.processedFolders) {
            fileWatcher.processedFolders.add(path.normalize(folderPath));
        }

        // Sanitize attachmentMeta keys (Mongoose Maps don't allow dots in keys)
        const sanitizedMeta = {};
        if (attachmentMeta) {
            Object.keys(attachmentMeta).forEach(key => {
                const safeKey = key.replace(/\./g, '_dot_');
                sanitizedMeta[safeKey] = attachmentMeta[key];
            });
        }

        const job = await QueueJob.create({
            emailSubject: `Walk-in: ${customerName}`,
            customerName,
            customerPhone,
            mailBody: description || 'Walk-in customer uploaded files via QR portal.',
            folderPath: folderPath, // Local to PC 2, but we mostly use relativeFolderPath on PC 1
            relativeFolderPath: relativePath,
            attachments,
            attachmentMeta: sanitizedMeta,
            type: 'WALKIN',
            status: 'QUEUED',
            pinnedToStaff: staffId,
            priorityScore: 5
        });

        // Emit both for legacy support and for the new dashboard engine
        eventBus.emit('job:created', { job });
        eventBus.emit('walkin:requested', { request: job });
        eventBus.emit('job:walkin_received', { job, staffId });

        res.status(200).json({ success: true, jobId: job._id });
    } catch (err) {
        console.error('Internal Job Sync Error:', err);
        res.status(500).json({ message: 'Error syncing job.' });
    }
});

// 3. Get System Settings (for Microservice sync)
router.get('/settings', checkInternalAuth, async (req, res) => {
    try {
        const { SystemConfig } = require('../repositories');
        const config = await SystemConfig.findOne({ key: 'walkinGeoRequired' });
        res.json({ walkinGeoRequired: config ? config.value : true });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

