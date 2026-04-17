const mongoose = require('mongoose')

const QueueJobSchema = new mongoose.Schema(
  {
    // ── Email metadata ──────────────────────────────────
    emailSubject: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '', index: true },
    mailBody: { type: String, default: '' },

    // ── File references ─────────────────────────────────
    folderPath: { type: String, required: true },           // absolute path to the n8n subfolder
    relativeFolderPath: { type: String, default: '' },      // relative path for frontend URLs
    attachments: [String],                                   // filenames inside the folder
    externalLinks: [{
        title: { type: String },
        url: { type: String }
    }],

    // ── Queue state ─────────────────────────────────────
    status: {
      type: String,
      enum: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'DUPLICATE', 'JUNK', 'ADMIN_REVIEW'],
      default: 'QUEUED',
      index: true
    },

    // ── Priority / ordering ─────────────────────────────
    priorityScore: { type: Number, default: 0, index: true },   // 0 = normal, 10 = urgent
    queuePosition: { type: Number, default: 0 },                // FIFO within same priority

    // ── Pinning ─────────────────────────────────────────
    pinnedToStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },

    // ── Assignment ──────────────────────────────────────
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    assignedAt: Date,
    completedAt: Date,

    // ── SLA ─────────────────────────────────────────────
    dueBy: { type: Date, default: null },

    // ── Post-completion admin tagging ───────────────────
    complexityTag: {
      type: String,
      enum: ['easy', 'medium', 'complex', null],
      default: null
    },
    lastPausedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // ── Job type ────────────────────────────────────────
    type: {
      type: String,
      enum: ['EMAIL', 'WALKIN'],
      default: 'EMAIL'
    },

    // ── Reassignment tracking ───────────────────────────
    handoffNotes: { type: String, default: '' },
    reassignedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // ── Return reason ───────────────────────────────────
    returnReason: { type: String, default: '' },

    // ── Master Architecture Fields ──────────────────────
    fingerprint: { type: String, index: true },             // For deduplication (hash of content/msgId)
    threadId: { type: String, index: true },                // For customer thread linking
    version: { type: Number, default: 1 },                  // Version number (v1, v2...)
    isAutoAssigned: { type: Boolean, default: false },      // Flag for sticky routing
    continuityContext: { type: String, default: '' },       // Explanation for why it was assigned
    parentJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'QueueJob' }, // Direct predecessor
    isSuperseded: { type: Boolean, default: false },        // If a newer revision arrived while QUEUED
    auditLog: [
      {
        action: String,
        actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
        details: mongoose.Schema.Types.Mixed
      }
    ]
  },
  { timestamps: true }
)

// Compound index for queue ordering: highest priority first, then FIFO position
QueueJobSchema.index({ status: 1, priorityScore: -1, queuePosition: 1, createdAt: 1 })
QueueJobSchema.index({ assignedTo: 1, status: 1 })
QueueJobSchema.index({ pinnedToStaff: 1, status: 1 })

module.exports = mongoose.model('QueueJob', QueueJobSchema)
