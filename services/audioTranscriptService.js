const eventBus = require('./eventBus')
const QueueJob = require('../models/QueueJob')

/**
 * Shell for Audio Transcription Service.
 * Listens for new jobs, checks for audio files, and triggers transcription.
 */
class AudioTranscriptService {
  constructor() {
    this.setupListeners()
  }

  setupListeners() {
    eventBus.on('job:created', async ({ job }) => {
      // Logic to detect audio files in job.folderPath
      // e.g. .wav, .mp3, .m4a
      this.processPossibleAudio(job)
    })
  }

  async processPossibleAudio(job) {
    if (!job.folderPath) return

    // This is where you would call an external API (Whister STT, Google Cloud STT)
    console.log(`[Audio] Checking for audio files in job ${job._id}...`)
    
    // Placeholder logic
    // const transcript = await MySttApi.transcribeFolder(job.folderPath)
    // if (transcript) {
    //   await QueueJob.findByIdAndUpdate(job._id, { 
    //     $set: { audioTranscript: transcript },
    //     $push: { internalNotes: 'Transcript auto-generated' }
    //   })
    //   eventBus.emit('job:updated', { jobId: job._id })
    // }
  }
}

module.exports = new AudioTranscriptService()
