const jwt = require('jsonwebtoken')
const { Customer } = require('../repositories')

const CUSTOMER_CACHE_TTL = 30_000;
const customerCache = new Map();

function getCachedCustomer(id) {
  const hit = customerCache.get(id);
  if (hit && hit.expiresAt > Date.now()) return hit.customer;
  customerCache.delete(id);
  return null;
}

function setCachedCustomer(id, customer) {
  customerCache.set(id, { customer, expiresAt: Date.now() + CUSTOMER_CACHE_TTL });
  if (customerCache.size > 500) {
    customerCache.delete(customerCache.keys().next().value);
  }
}

function invalidateCustomerCache(id) {
  customerCache.delete(String(id));
}

module.exports = async (req, res, next) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ message: 'No token' })

  try {
    const token = header.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const customerId = String(decoded.customerId || decoded._id)
    let customer = getCachedCustomer(customerId);
    if (!customer) {
      customer = await Customer.findById(customerId)
      if (customer) setCachedCustomer(customerId, customer);
    }

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

module.exports.invalidateCustomerCache = invalidateCustomerCache

