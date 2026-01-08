const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const Job = require('../models/Job')

const UPLOAD_PATH = process.env.UPLOAD_PATH || 'uploads'
const OLD_DAYS = process.env.ARCHIVE_DAYS || 30

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log('MongoDB Connected')
    } catch (err) {
        console.error('Database connection error:', err.message)
        process.exit(1)
    }
}

const archiveImages = async () => {
    await connectDB()

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - OLD_DAYS)

    console.log(`Searching for DISPATCHED jobs older than ${OLD_DAYS} days (before ${cutoffDate.toISOString()})...`)

    try {
        const jobs = await Job.find({
            jobStatus: 'DISPATCHED',
            updatedAt: { $lt: cutoffDate },
            filesArchived: { $ne: true }
        })

        console.log(`Found ${jobs.length} jobs to archive.`)

        for (const job of jobs) {
            const jobDir = path.join(process.cwd(), UPLOAD_PATH, 'jobs', job.jobId)

            if (fs.existsSync(jobDir)) {
                console.log(`Deleting images for Job: ${job.jobId} at ${jobDir}`)
                fs.rmSync(jobDir, { recursive: true, force: true })
            } else {
                console.log(`Directory not found for Job: ${job.jobId}, skipping deletion.`)
            }

            // Mark as archived
            job.filesArchived = true
            // Optional: Clear the array to save DB space, or keep for reference (urls will be broken)
            // job.itemScreenshots = [] 

            await job.save()
            process.stdout.write('.')
        }

        console.log('\nArchive process complete.')
    } catch (err) {
        console.error('Error during archiving:', err)
    } finally {
        mongoose.connection.close()
    }
}

archiveImages()
