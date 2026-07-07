/**
 * Returns the base upload directory path.
 * Uses UPLOAD_PATH env variable if set, otherwise falls back to 'uploads'.
 */
function getUploadBase() {
    return process.env.UPLOAD_PATH || 'uploads'
}

module.exports = { getUploadBase }

