const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { JobCard } = require('../repositories');
const { Job } = require('../repositories');
const { mergeJobCardIntoItem, getBaseJobId } = require('../utils/jobCardToPostPress');
const { refreshItemStages } = require('../services/jobWorkflow');

// @route   POST api/job-cards
// @desc    Save or Update a Job Card, then sync qty fields back to Job.items
// @access  Private
router.post('/', auth, async (req, res) => {
    try {
        const { jobId } = req.body;

        // 1. Save / update the JobCard document (atomic upsert â€” prevents E11000 on race conditions)
        const jobCard = await JobCard.findOneAndUpdate(
            { jobId },
            { $set: req.body },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // 2. Sync qty + workflow fields back to Job.items
        // jobId format: <baseJobId>-<DDMMYY>_<itemIndex>  e.g. 36259-120626_0
        // We need to extract the base job ID and item index.
        const m = String(jobId).match(/^(.+)_(\d+)$/)
        if (m) {
            const baseJobIdWithDate = m[1]   // e.g. 36259-120626
            const itemIndex = parseInt(m[2], 10)  // e.g. 0

            const job = await Job.findOne({ jobId: baseJobIdWithDate })
            if (job && job.items && job.items[itemIndex]) {
                const updatedItemData = mergeJobCardIntoItem(job.items[itemIndex], req.body)
                // Apply all fields from merge back to the Mongoose subdoc
                Object.assign(job.items[itemIndex], updatedItemData)
                job.markModified('items')
                refreshItemStages(job)
                await job.save()
            }
        }

        return res.json(jobCard);
    } catch (err) {
        console.error('JOBCARD SAVE ERROR:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/job-cards/:jobId
// @desc    Get a Job Card by Job ID
// @access  Private
router.get('/:jobId', auth, async (req, res) => {
    try {
        const jobCard = await JobCard.findOne({ jobId: req.params.jobId });

        if (!jobCard) {
            return res.status(404).json({ message: 'Job Card not found' });
        }

        res.json(jobCard);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;

