const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')

const { User } = require('../repositories')

const bcrypt = require('bcryptjs')

const resolveQuery = async (query) => (
  query && typeof query.select === 'function' ? query.select('+password') : query
)

router.post('/', async (req, res) => {
  try {
    const { phone, password } = req.body

    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password required' })
    }

    let user = await resolveQuery(User.findOne({ phone, isActive: true }))
    let isCustomer = false

    if (!user) {
      const { Customer } = require('../repositories')
      user = await resolveQuery(Customer.findOne({ phone }))
      if (user) isCustomer = true
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (!user.password) {
      return res.status(401).json({ message: 'Password not set for this account. Please contact support.' })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (!isCustomer) {
      if (typeof user.save === 'function') {
        user.lastLoginAt = new Date()
        await user.save()
      } else if (typeof User.updateLastLogin === 'function') {
        await User.updateLastLogin(user._id || user.id)
      }
    }

    // Recover roles from legacy 'role' field if 'roles' array is empty
    let roles = []
    if (isCustomer) {
      roles = ['CUSTOMER']
    } else {
      roles = user.roles || []
      if (roles.length === 0 && user.role) {
        roles = [user.role.trim().toUpperCase()]
      }
    }

    if (roles.length === 0) {
      return res.status(401).json({ message: 'No roles assigned to this user' })
    }

    const LEGACY_ROLE_ALIASES = {
      'FINISHING CUTTING': 'FINISHING_CUTTING',
      'FINISHING DIE CUTTING': 'FINISHING_DIE_CUTTING',
      'FINISHING CREASING': 'FINISHING_CREASING',
      'FINISHING CORNER CUT': 'FINISHING_CORNER_CUT',
      'FINISHING CORNER CUTTING': 'FINISHING_CORNER_CUT',
    }
    const normalizedRoles = roles.map((r) => {
      const upper = String(r || '').trim().toUpperCase()
      return LEGACY_ROLE_ALIASES[upper] || upper.replace(/\s+/g, '_')
    })

    const payload = { roles: normalizedRoles }
    if (isCustomer) {
      payload.customerId = user._id || user.id
    } else {
      payload.userId = user._id || user.id
    }

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    )

    res.json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        roles: normalizedRoles
      }
    })
  } catch (err) {
    console.error('LOGIN ERROR:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router

