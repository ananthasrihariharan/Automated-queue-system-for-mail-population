/**
 * Customer Microservice â€” Standalone Entrypoint
 *
 * Serves both customer data routes and customer authentication.
 *
 * Run independently:
 *   PORT=3016 node modules/customer/backend/microservice.js
 */
'use strict'

const express = require('express')
const cors = require('cors')
const http = require('http')
const { Server } = require('socket.io')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') })

const connectDB = require('../../../config/db')

const app = express()
const server = http.createServer(app)

const io = new Server(server, { cors: { origin: true, credentials: true } })
app.set('io', io)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.get('/health', (_req, res) =>
  res.json({ status: 'Customer Microservice UP', module: 'customer', v: '1.0.0' })
)

app.use('/api/customer', require('./customer'))
app.use('/api/customer-auth', require('./customer-auth'))

const PORT = process.env.CUSTOMER_SERVICE_PORT || 3016
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Customer] Microservice running on port ${PORT}`)
  })
})

