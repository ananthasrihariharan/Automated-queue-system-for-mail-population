const express = require('express')
const router = express.Router()

const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')
const { invalidateUserCache } = require('../../../middleware/auth')

const { userRepo } = require('../../../repositories')

function validateEmployeeFields(name, phone) {
  const cleanPhone = String(phone || '').trim()
  const cleanName = String(name || '').trim()
  if (!/^\d{10}$/.test(cleanPhone)) {
    return 'Phone must be a 10-digit number'
  }
  if (/^\d+$/.test(cleanName)) {
    return 'Name cannot be only numbers Ã¢â‚¬â€ check that name and phone are not swapped'
  }
  return null
}

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

      const fieldError = validateEmployeeFields(name, phone)
      if (fieldError) return res.status(400).json({ message: fieldError })

      const exists = await userRepo.findOne({ phone })
      if (exists) {
        return res.status(400).json({ message: 'User already exists' })
      }

      const user = await userRepo.create({
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
    const users = await userRepo.find({ isDeleted: false }, { __v: 0 }).sort({ createdAt: -1 })
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

      const existing = await userRepo.findById(req.params.id)
      if (!existing) {
        return res.status(404).json({ message: 'User not found' })
      }

      const nextName = name !== undefined ? name : existing.name
      const nextPhone = phone !== undefined ? phone : existing.phone
      const fieldError = validateEmployeeFields(nextName, nextPhone)
      if (fieldError) return res.status(400).json({ message: fieldError })

      if (name !== undefined) updateData.name = name
      if (phone !== undefined) updateData.phone = phone
      if (roles !== undefined) {
        if (!Array.isArray(roles) || roles.length === 0) {
          return res.status(400).json({ message: 'Roles array must not be empty' })
        }
        updateData.roles = roles
      }
      if (isActive !== undefined) updateData.isActive = isActive

      const user = await userRepo.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true }
      )

      // If user is deactivated, cleanly end their active queue session and release their jobs
      if (isActive === false) {
        const queueEngine = require('../../../services/queueEngine')
        await queueEngine.onStaffLogout(req.params.id, 'Employee Deactivated').catch(err => {
          console.error(`[AdminUsers] Queue session cleanup error during user deactivation: ${err.message}`)
        })
      }

      // Evict the cache so the next request picks up the fresh user record
      invalidateUserCache(req.params.id)

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
      // First, log the user out of the queue to clean up active sessions & release jobs
      const queueEngine = require('../../../services/queueEngine')
      await queueEngine.onStaffLogout(req.params.id, 'Employee Deleted').catch(err => {
        console.error(`[AdminUsers] Queue session cleanup error during user delete: ${err.message}`)
      })

      const user = await userRepo.findByIdAndDelete(req.params.id)
      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }
      invalidateUserCache(req.params.id)
      res.json({ message: 'User deleted successfully' })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router


