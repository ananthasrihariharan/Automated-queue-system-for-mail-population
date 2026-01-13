const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const Customer = require('../models/Customer')

// Initial Auth Middleware
// We need a unified middleware or check which user type it is
// However, since we have separate auth middlewares (auth vs customerAuth),
// we might need to handle this by checking headers or using a flexible middleware.
// For now, let's assume the frontend sends the token and we can decode it, 
// OR simpler: Try 'auth' first, if fails, try 'customerAuth'. 
// Actually, standard 'auth' checks 'x-auth-token'. 'customerAuth' also checks 'x-auth-token'.
// The difference is essentially which Model they verify against.

const jwt = require('jsonwebtoken')

const unifiedAuth = async (req, res, next) => {
    const token = req.header('x-auth-token')
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' })

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        // Decoded payload has { userId: ... } OR { customerId: ... }
        if (decoded.userId) {
            req.user = await User.findById(decoded.userId).select('-password')
            req.userType = 'STAFF'
        } else if (decoded.customerId) {
            req.user = await Customer.findById(decoded.customerId).select('-password')
            req.userType = 'CUSTOMER'
        }

        if (!req.user) {
            return res.status(401).json({ message: 'Token is not valid' })
        }

        next()
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' })
    }
}

/**
 * @route   GET /api/profile
 * @desc    Get current user profile
 * @access  Private (Unified)
 */
router.get('/', unifiedAuth, async (req, res) => {
    try {
        const user = req.user

        let roles = []
        if (req.userType === 'CUSTOMER') {
            roles = ['CUSTOMER']
        } else {
            roles = user.roles || []
            // Fallback for legacy users
            if (roles.length === 0 && user.role) {
                roles = [user.role.trim().toUpperCase()]
            }
        }

        res.json({
            name: user.name,
            phone: user.phone,
            roles: roles,
            type: req.userType,
            joinedAt: user.createdAt
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Server Error' })
    }
})

/**
 * @route   PATCH /api/profile
 * @desc    Update profile details
 * @access  Private (Unified)
 */
router.patch('/', unifiedAuth, async (req, res) => {
    const { name, phone } = req.body

    try {
        const user = req.user

        // If phone is changing, check uniqueness
        if (phone && phone !== user.phone) {
            const Model = req.userType === 'STAFF' ? User : Customer
            const exists = await Model.findOne({ phone })
            if (exists) {
                return res.status(400).json({ message: 'Phone number already in use' })
            }
            user.phone = phone
        }

        if (name) user.name = name

        await user.save()

        // Normalize roles for response
        let roles = []
        if (req.userType === 'CUSTOMER') {
            roles = ['CUSTOMER']
        } else {
            roles = user.roles || []
            if (roles.length === 0 && user.role) {
                roles = [user.role.trim().toUpperCase()]
            }
        }

        res.json({
            message: 'Profile updated',
            user: {
                name: user.name,
                phone: user.phone,
                roles: roles,
                type: req.userType
            }
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Server Error' })
    }
})

/**
 * @route   PATCH /api/profile/password
 * @desc    Change Password
 * @access  Private (Unified)
 */
router.patch('/password', unifiedAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Please provide both current and new password' })
    }

    try {
        // Need to fetch password explicitly as it's usually excluded
        const Model = req.userType === 'STAFF' ? User : Customer
        const userWithPass = await Model.findById(req.user._id).select('+password')

        const isMatch = await bcrypt.compare(currentPassword, userWithPass.password)
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password' })
        }

        const salt = await bcrypt.genSalt(10)
        userWithPass.password = await bcrypt.hash(newPassword, salt)

        await userWithPass.save()

        res.json({ message: 'Password changed successfully' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Server Error' })
    }
})

module.exports = router
