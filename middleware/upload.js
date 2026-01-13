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
    storage,
    fileFilter: (req, file, cb) => {
        // console.log('Processing file:', file.originalname, 'Type:', file.mimetype);
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed.'), false);
        }
    }
})

module.exports = upload
