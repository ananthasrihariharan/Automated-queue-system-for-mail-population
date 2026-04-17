const jwt = require('jsonwebtoken')
const Customer = require('../models/Customer')

module.exports = async (req, res, next) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ message: 'No token' })

  try {
    const token = header.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const customerId = decoded.customerId || decoded._id
    const customer = await Customer.findById(customerId)
    
    if (!customer) {
      return res.status(401).json({ message: 'Customer not found' })
    }

    req.customer = customer
    next()
  } catch (err) {
    console.error('Customer Auth Error:', err.message)
    res.status(401).json({ message: 'Invalid token' })
  }
}
