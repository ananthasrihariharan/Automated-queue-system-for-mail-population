const express = require("express");
const cors = require("cors");
console.log("Modules required...");
const jwt = require('jsonwebtoken')
const User = require('./models/User')
const Job = require('./models/Job')
const auth = require('./middleware/auth')
const upload = require('./middleware/upload')
const connectDB = require("./config/db");
require("dotenv").config();
console.log("Dotenv config loaded");

const app = express();
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));
const prepressRoutes = require('./routes/prepress')
const customerRoutes = require('./routes/customer')
const loginRoutes = require('./routes/login')
const cashierRoutes = require('./routes/cashier')
const adminRoutes = require('./routes/admin')
const dispatchRoutes = require('./routes/dispatch')
app.use('/api/prepress', prepressRoutes)
app.use('/api/customer', customerRoutes)
app.use('/api/login', loginRoutes)
app.use('/api/cashier', cashierRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/dispatch', dispatchRoutes)
// Connect to MongoDB
console.log("Connecting to DB...");
connectDB();

const PORT = 5000
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
