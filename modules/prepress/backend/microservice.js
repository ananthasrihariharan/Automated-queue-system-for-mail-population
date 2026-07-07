/**
 * Prepress Microservice â€” Standalone Entrypoint
 *
 * Run independently:
 *   PORT=3010 node modules/prepress/backend/microservice.js
 *
 * Or via ecosystem.config.js with pm2.
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
  res.json({ status: 'Prepress Microservice UP', module: 'prepress', v: '1.0.0' })
)

app.use('/api/prepress', require('./prepress'))

const PORT = process.env.PREPRESS_SERVICE_PORT || 3010
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Prepress] Microservice running on port ${PORT}`)
  })
})

