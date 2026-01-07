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
 * UPDATE EMPLOYEE (GENERAL)
 * Role: ADMIN
 */
router.patch(
  '/users/:id',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { name, phone, roles, isActive } = req.body
      const updateData = {}

      if (name !== undefined) updateData.name = name
      if (phone !== undefined) updateData.phone = phone
      if (roles !== undefined) {
        if (!Array.isArray(roles) || roles.length === 0) {
          return res.status(400).json({ message: 'Roles array must not be empty' })
        }
        updateData.roles = roles
      }
      if (isActive !== undefined) updateData.isActive = isActive

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true }
      )

      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }

      res.json(user)
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: 'Phone number already in use' })
      }
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * DELETE EMPLOYEE
 * Role: ADMIN
 */
router.delete(
  '/users/:id',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const user = await User.findByIdAndDelete(req.params.id)
      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }
      res.json({ message: 'User deleted successfully' })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
