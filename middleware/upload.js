const multer = require('multer')
const fs = require('fs')
const path = require('path')

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // jobId is NOT reliable here yet
        const dir = 'uploads/jobs/temp'

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        cb(null, dir)
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
})

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        console.log('Processing file:', file.originalname, 'Type:', file.mimetype);
        if (!file.mimetype.startsWith('image/')) {
            console.warn('Warning: Non-image file uploaded:', file.mimetype);
        }
        cb(null, true)
    }
})

module.exports = upload
