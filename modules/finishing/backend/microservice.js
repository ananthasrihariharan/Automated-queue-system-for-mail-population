/**
 * Finishing Microservice â€” Standalone Entrypoint
 *
 * Run independently:
 *   PORT=3013 node modules/finishing/backend/microservice.js
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
  res.json({ status: 'Finishing Microservice UP', module: 'finishing', v: '1.0.0' })
)

app.use('/api/finishing', require('./finishing'))

const PORT = process.env.FINISHING_SERVICE_PORT || 3013
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Finishing] Microservice running on port ${PORT}`)
  })
})

