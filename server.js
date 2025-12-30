const express = require("express");
console.log("Modules required...");
const jwt = require('jsonwebtoken')
const User = require('./models/User')
const Job = require('./models/Job')
const auth = require('./middleware/auth')

const connectDB = require("./config/db");
require("dotenv").config();
console.log("Dotenv config loaded");

const app = express();
app.use(express.json());
const prepressRoutes = require('./routes/prepress')
const customerRoutes = require('./routes/customer')
const loginRoutes = require('./routes/login')
const cashierRoutes = require('./routes/cashier')
const adminRoutes = require('./routes/admin')   

app.use('/api/prepress', prepressRoutes)
app.use('/api/customer', customerRoutes)
app.use('/api/login', loginRoutes)
app.use('/api/cashier', cashierRoutes)
app.use('/api/admin', adminRoutes)
// Connect to MongoDB
console.log("Connecting to DB...");
connectDB();

const PORT = 5000
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
