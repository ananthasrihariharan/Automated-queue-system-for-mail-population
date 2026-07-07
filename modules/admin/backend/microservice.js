/**
 * Admin Microservice â€” Standalone Entrypoint
 *
 * Serves admin management, user management, reports, and queue control.
 *
 * Run independently:
 *   PORT=3017 node modules/admin/backend/microservice.js
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
  res.json({ status: 'Admin Microservice UP', module: 'admin', v: '1.0.0' })
)

app.use('/api/admin', require('./admin'))
app.use('/api/admin', require('./admin-users'))
app.use('/api/admin/reports', require('./reports'))
app.use('/api/admin/queue', require('./admin-queue'))

const PORT = process.env.ADMIN_SERVICE_PORT || 3017
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Admin] Microservice running on port ${PORT}`)
  })
})

