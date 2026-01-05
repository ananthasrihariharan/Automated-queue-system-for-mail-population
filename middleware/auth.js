const jwt = require('jsonwebtoken')
const User = require('../models/User')

module.exports = async function (req, res, next) {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ message: 'No token, access denied' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findById(decoded.userId)

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not active or not found' })
    }

    // Legacy fallback for middleware: Ensure roles array exists for authorization checks
    if ((!user.roles || user.roles.length === 0) && user.role) {
      user.roles = [user.role.trim().toUpperCase()]
    }

    console.log('Auth Middleware - User:', { name: user.name, roles: user.roles })

    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid' })
  }
}
