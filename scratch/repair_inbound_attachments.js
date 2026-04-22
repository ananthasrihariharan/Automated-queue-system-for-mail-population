const mongoose = require('mongoose');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
require('dotenv').config();

const QueueJob = require('../models/QueueJob');

async function repairAttachments() {
    console.log('--- Attachment Repair Utility (Inbound Only) ---');
    
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[DB] Connected to MongoDB.');

        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        
        // Target ONLY Inbound (EMAIL) jobs from the last 2 days with empty attachments
        const jobs = await QueueJob.find({
            type: 'EMAIL',
            attachments: { $size: 0 },
            createdAt: { $gte: twoDaysAgo }
        }).sort({ createdAt: -1 });

        console.log(`[Scan] Found ${jobs.length} potential "empty" inbound jobs.`);
        
        let fixedCount = 0;
        let skippedCount = 0;

        for (const job of jobs) {
            const folderPath = job.folderPath;
            
            if (!fs.existsSync(folderPath)) {
                console.log(`[Skip] Folder not found on disk: ${folderPath}`);
                skippedCount++;
                continue;
            }

            // Recursive file discovery (excluding infrastructure files)
            const discoveredFiles = await getAllFiles(folderPath);
            const validAttachments = discoveredFiles.filter(f => {
                const filename = path.basename(f);
                if (filename.startsWith('.') || filename === 'metadata.json') return false;
                if (/\.(txt|html|htm)$/i.test(filename)) return false;
                return true;
            }).map(f => path.relative(folderPath, f).replace(/\\/g, '/'));

            if (validAttachments.length > 0) {
                console.log(`[Fixing] Job ${job._id} (${job.customerName}): Found ${validAttachments.length} files.`);
                job.attachments = validAttachments;
                
                // Also ensure relativeFolderPath is normalized
                // (using the same logic as the worker to fix potential path errors)
                const watchRoot = process.env.N8N_WATCH_PATH ? path.resolve(process.env.N8N_WATCH_PATH) : null;
                const absFolder = path.resolve(folderPath);
                if (watchRoot && absFolder.toLowerCase().startsWith(watchRoot.toLowerCase())) {
                    job.relativeFolderPath = path.relative(watchRoot, absFolder).replace(/\\/g, '/');
                }

                await job.save();
                fixedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log(`\n--- Repair Complete ---`);
        console.log(`Successfully Repaired: ${fixedCount}`);
        console.log(`Verified/Skipped: ${skippedCount}`);
        
    } catch (err) {
        console.error('[Error]', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

async function getAllFiles(dirPath, arrayOfFiles = []) {
    try {
        const files = await fsp.readdir(dirPath, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                await getAllFiles(fullPath, arrayOfFiles);
            } else {
                arrayOfFiles.push(fullPath);
            }
        }
    } catch (e) {}
    return arrayOfFiles;
}

repairAttachments();
