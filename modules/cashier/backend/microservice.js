/**
 * Cashier Microservice â€” Standalone Entrypoint
 *
 * Run independently:
 *   PORT=3015 node modules/cashier/backend/microservice.js
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
  res.json({ status: 'Cashier Microservice UP', module: 'cashier', v: '1.0.0' })
)

app.use('/api/cashier', require('./cashier'))

const PORT = process.env.CASHIER_SERVICE_PORT || 3015
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Cashier] Microservice running on port ${PORT}`)
  })
})

