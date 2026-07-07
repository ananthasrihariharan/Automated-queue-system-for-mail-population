/**
 * GET /api/queue/messages â€” Fetch recent message history for the logged-in user
 * Works for both ADMIN and PREPRESS roles
 */
const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const { QueueMessage } = require('../repositories')
const { User } = require('../repositories')

// â”€â”€ GET / â€” Fetch history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns last 200 messages involving the current user (DMs + broadcasts + admin channel)
router.get('/', auth, async (req, res) => {
  try {
    const myId = String(req.user._id)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const since = sevenDaysAgo

    const messages = await QueueMessage.find({
      timestamp: { $gte: since },
      $or: [
        { recipientId: 'all' },               // broadcast to everyone
        { recipientId: 'admin' },             // admin channel (all staff can see their own sends)
        { sender: myId },                     // sent by me
        { recipientId: myId },                // sent directly to me
      ]
    })
      .sort({ timestamp: 1 })
      .limit(200)
      .lean()

    // Coerce ObjectId sender to string for reliable frontend equality checks
    const normalized = messages.map(m => ({
      ...m,
      sender: String(m.sender).trim().toLowerCase(),
      recipientId: String(m.recipientId).trim().toLowerCase(),
      jobId: m.jobId ? String(m.jobId).trim().toLowerCase() : null,
      _id: String(m._id).trim().toLowerCase()
    }))

    res.json(normalized)
  } catch (err) {
    console.error('[Messages API] Error:', err.message)
    res.status(500).json({ message: err.message })
  }
})

// â”€â”€ GET /unread â€” Current unread counts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/unread', auth, async (req, res) => {
  try {
    const { QueueUnread } = require('../repositories')
    const unreads = await QueueUnread.find({ userId: req.user._id }).lean()
    
    // Convert array to map: { [threadId]: count }
    const unreadMap = {}
    unreads.forEach(u => {
      unreadMap[u.threadId] = u.count
    })
    
    res.json(unreadMap)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// â”€â”€ POST /read â€” Clear unread count for a thread â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/read', auth, async (req, res) => {
  try {
    const { threadId } = req.body
    if (!threadId) return res.status(400).json({ message: 'Missing threadId' })

    const { QueueUnread } = require('../repositories')
    await QueueUnread.findOneAndUpdate(
      { userId: req.user._id, threadId: String(threadId).trim().toLowerCase() },
      { count: 0 },
      { upsert: true }
    )
    
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// â”€â”€ GET /staff-list â€” All staff for the recipient selector (works for PREPRESS too) â”€
router.get('/staff-list', auth, async (req, res) => {
  try {
    const staff = await User.find(
      {
        $or: [
          { roles: { $in: ['PREPRESS', 'ADMIN'] } },   // new roles array field
          { role: { $in: ['PREPRESS', 'ADMIN'] } }     // legacy single role field
        ],
        _id: { $ne: req.user._id },                    // exclude self
        isActive: true,
        isDeleted: false
      },
      'name roles role'
    ).lean()

    res.json(staff.map(s => ({ ...s, _id: String(s._id) })))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router

