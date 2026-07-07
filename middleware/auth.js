const jwt = require('jsonwebtoken')
const { User } = require('../repositories')
const { normalizeUserRoles } = require('../utils/normalizeUserRoles')

// In-memory user cache: avoids a DB round-trip on every authenticated request.
// TTL of 30s means a deactivated user is evicted within half a minute.
const USER_CACHE_TTL = 30_000;
const userCache = new Map(); // userId -> { user, expiresAt }

function getCached(userId) {
  const hit = userCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.user;
  userCache.delete(userId);
  return null;
}

function setCache(userId, user) {
  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL });
  // Prevent unbounded growth: evict oldest entries if cache exceeds 200 users
  if (userCache.size > 200) {
    const oldest = userCache.keys().next().value;
    userCache.delete(oldest);
  }
}

// Call this on logout or role change so the stale record is not served for up to 30s
function invalidateUserCache(userId) {
  userCache.delete(String(userId));
}

module.exports = async function (req, res, next) {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token

    if (!token) {
      return res.status(401).json({ message: 'No token, access denied' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const cacheKey = String(decoded.userId);

    let user = getCached(cacheKey);
    if (!user) {
      user = await User.findById(decoded.userId);
      if (user) setCache(cacheKey, user);
    }

    if (!user || !user.isActive || user.isDeleted) {
      invalidateUserCache(cacheKey);
      return res.status(401).json({ message: 'User not active or not found' })
    }

    user._id = user._id || user.id

    // Legacy fallback for middleware: Ensure roles array exists for authorization checks
    if ((!user.roles || user.roles.length === 0) && user.role) {
      user.roles = [user.role.trim().toUpperCase()]
    }
    user.roles = normalizeUserRoles(user.roles || [])

    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid' })
  }
}

module.exports.invalidateUserCache = invalidateUserCache;

