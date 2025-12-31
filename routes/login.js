const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const User = require('../models/User')

/**
 * LOGIN
 * Description: Authenticate user using phone number and return JWT token
 * Access: Public
 */

router.post('/', async (req, res) => {
  try {
    const { phone } = req.body

    if (!phone) {
      return res.status(400).json({
        message: 'Phone number is required'
      })
    }

    const user = await User.findOne({
      phone,
      isActive: true
    })

    if (!user) {
      return res.status(401).json({
        message: 'User not found or inactive'
      })
    }

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    )

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role
      }
    })
    res.cookie('token', token)
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({
      message: 'Internal server error'
    })
  }
})


module.exports = router
