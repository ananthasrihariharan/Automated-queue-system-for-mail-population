const multer = require('multer')
const fs = require('fs')
const path = require('path')

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadBase = process.env.UPLOAD_PATH || 'uploads'
        const dir = path.join(uploadBase, 'jobs', 'temp')

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        cb(null, dir)
    },
    filename: function (req, file, cb) {
        // Sanitize: Date + Random + Extension (Safe from originalname injection)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname).toLowerCase()
        cb(null, uniqueSuffix + ext)
    }
})

const upload = multer({
    storage // No fileFilter, accepts all files
})

module.exports = upload

