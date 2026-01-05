const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const User = require('../models/User')

/**
 * CREATE EMPLOYEE
 * Role: ADMIN
 */
router.post(
  '/users',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { name, phone, roles, password } = req.body

      if (!name || !phone || !roles || !password || !Array.isArray(roles) || roles.length === 0) {
        return res.status(400).json({ message: 'Missing fields' })
      }

      const exists = await User.findOne({ phone })
      if (exists) {
        return res.status(400).json({ message: 'User already exists' })
      }

      const user = await User.create({
        name,
        phone,
        roles,
        password,
        isActive: true
      })

      res.status(201).json(user)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * LIST EMPLOYEES
 * Role: ADMIN
 */
router.get(
  '/users',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    const users = await User.find({}, { __v: 0 }).sort({ createdAt: -1 })
    res.json(users)
  }
)

/**
 * ACTIVATE / DEACTIVATE EMPLOYEE
 */
router.patch(
  '/users/:id/status',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    const { isActive } = req.body

    await User.findByIdAndUpdate(req.params.id, { isActive })
    res.json({ message: 'Status updated' })
  }
)

/**
 * UPDATE EMPLOYEE ROLES
 */
router.patch(
  '/users/:id/roles',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    const { roles } = req.body

    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ message: 'Roles array is required' })
    }

    await User.findByIdAndUpdate(req.params.id, { roles })
    res.json({ message: 'Roles updated' })
  }
)

module.exports = router
