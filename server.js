const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");

const app = express();
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// DEBUG LOGGING MIDDLEWARE
app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
        const duration = Date.now() - start
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`)
    })
    next()
})

app.use('/uploads', express.static('uploads'));
const prepressRoutes = require('./routes/prepress')
const customerRoutes = require('./routes/customer')
const loginRoutes = require('./routes/login')
const cashierRoutes = require('./routes/cashier')
const adminRoutes = require('./routes/admin')
const dispatchRoutes = require('./routes/dispatch')
const adminUserRoutes = require('./routes/admin-users')
const customerAuthRoutes = require('./routes/customer-auth')
app.use('/api/prepress', prepressRoutes)
app.use('/api/customer', customerRoutes)
app.use('/api/customer-auth', customerAuthRoutes)
app.use('/api/login', loginRoutes)
app.use('/api/cashier', cashierRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/admin', adminUserRoutes)
app.use('/api/dispatch', dispatchRoutes)

// Connect to MongoDB
connectDB();

const PORT = 5000
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
