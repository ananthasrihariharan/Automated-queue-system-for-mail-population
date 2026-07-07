/**
 * Postpress Microservice â€” Standalone Entrypoint
 *
 * Run independently:
 *   PORT=3012 node modules/postpress/backend/microservice.js
 */
'use strict'

process.env.IS_MICROSERVICE = 'true'

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
  res.json({ status: 'Postpress Microservice UP', module: 'postpress', v: '1.0.0' })
)

app.use('/api/post-press', require('./post-press'))

const PORT = process.env.POSTPRESS_SERVICE_PORT || 3012
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Postpress] Microservice running on port ${PORT}`)
  })
})

