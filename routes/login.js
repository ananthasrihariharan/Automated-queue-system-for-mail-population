const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')

const User = require('../models/User')

const bcrypt = require('bcryptjs')

router.post('/', async (req, res) => {
  try {
    const { phone, password } = req.body

    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password required' })
    }

    let user = await User.findOne({ phone, isActive: true }).select('+password')
    let isCustomer = false

    if (!user) {
      const Customer = require('../models/Customer')
      user = await Customer.findOne({ phone }).select('+password')
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

    const payload = { roles: roles }
    if (isCustomer) {
      payload.customerId = user._id
    } else {
      payload.userId = user._id
    }

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    )

    res.json({
      token,
      user: {
        name: user.name,
        roles: roles
      }
    })
  } catch (err) {
    console.error('LOGIN ERROR:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
