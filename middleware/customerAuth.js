const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ message: 'No token' })

  try {
    const token = header.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    req.customer = { customerId: decoded.customerId }
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}
