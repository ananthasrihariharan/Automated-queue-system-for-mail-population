/**
 * Despatch Microservice â€” Standalone Entrypoint
 *
 * Run independently:
 *   PORT=3014 node modules/despatch/backend/microservice.js
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
  res.json({ status: 'Despatch Microservice UP', module: 'despatch', v: '1.0.0' })
)

app.use('/api/dispatch', require('./dispatch'))

const PORT = process.env.DESPATCH_SERVICE_PORT || 3014
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Despatch] Microservice running on port ${PORT}`)
  })
})

