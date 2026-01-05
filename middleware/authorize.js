module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    const userRoles = Array.from(req.user.roles || [])

    console.log('Authorize Check:', {
      user: req.user.name,
      userRoles,
      allowedRoles
    })

    // Admin override
    if (userRoles.includes('ADMIN')) {
      return next()
    }

    const hasRole = allowedRoles.some(role =>
      userRoles.includes(role)
    )

    if (!hasRole) {
      console.log('Access Denied for:', req.user.name)
      return res.status(403).json({ message: 'Access denied' })
    }

    next()
  }
}
