const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const Customer = require('../models/Customer')

router.post('/login', async (req, res) => {
    const { phone, password } = req.body

    if (!phone || !password) {
        return res.status(400).json({ message: 'Phone and password are required' })
    }

    const customer = await Customer.findOne({ phone }).select('+password')
    if (!customer) {
        return res.status(401).json({ message: 'Invalid credentials' })
    }

    const isMatch = await bcrypt.compare(password, customer.password)
    if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' })
    }

    const token = jwt.sign(
        { customerId: customer._id },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    )

    res.json({
        token,
        customer: {
            name: customer.name,
            phone: customer.phone
        }
    })
})

module.exports = router
