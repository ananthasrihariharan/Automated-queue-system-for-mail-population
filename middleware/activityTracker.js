/**
 * Middleware to automatically update user activity timestamp
 * on mutations (POST, PATCH, DELETE)
 */
module.exports = async (req, res, next) => {
    // Only track activity for authenticated users on state-changing requests
    if (req.user && ['POST', 'PATCH', 'DELETE'].includes(req.method)) {
        try {
            // Throttling: Only update if lastLoginAt is null OR older than 5 minutes
            const now = new Date();
            const lastActive = req.user.lastLoginAt;
            const needsUpdate = !lastActive || (now.getTime() - new Date(lastActive).getTime()) > 5 * 60 * 1000;

            if (needsUpdate) {
                req.user.lastLoginAt = now;
                await req.user.save();
            }
        } catch (err) {
            console.error('Activity Tracking Error:', err);
            // We don't block the request if activity tracking fails
        }
    }
    next();
}
