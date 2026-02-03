const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const JobCard = require('../models/JobCard');

// @route   POST api/job-cards
// @desc    Save or Update a Job Card
// @access  Private
router.post('/', auth, async (req, res) => {
    try {
        const { jobId } = req.body;

        let jobCard = await JobCard.findOne({ jobId });

        if (jobCard) {
            // Update
            jobCard = await JobCard.findOneAndUpdate(
                { jobId },
                { $set: req.body },
                { new: true }
            );
            return res.json(jobCard);
        }

        // Create
        jobCard = new JobCard(req.body);
        await jobCard.save();
        res.json(jobCard);
    } catch (err) {
        console.error(err.message);
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
