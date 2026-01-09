const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const CustomerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        phone: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true,
            select: false
        },
        isCreditCustomer: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
)

CustomerSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next()
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
})

module.exports = mongoose.model('Customer', CustomerSchema)
