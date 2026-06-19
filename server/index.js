import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import config from './config/index.js'
import webhookRouter from './routes/webhook.js'
import apiRouter from './routes/api.js'
import { queue } from './queue/index.js'
import { startWorker } from './queue/worker.js'

const app = express()

// CORS — allow the Vite dev server
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
)

// Capture raw body for webhook signature verification, then parse JSON.
// Using express.json()'s verify callback is reliable — no race condition.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf
    },
  })
)

// Routes
app.use('/webhook', webhookRouter)
app.use('/api', apiRouter)

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    const jobCounts = await queue.getJobCounts()
    res.json({
      status: 'ok',
      mongo: mongoose.connection.readyState,
      queue: jobCounts,
    })
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message })
  }
})

// Start
async function start() {
  try {
    await mongoose.connect(config.mongodb.uri)
    console.log('[Server] Connected to MongoDB')

    startWorker()

    app.listen(config.port, () => {
      console.log(`[Server] PRbøt running on http://localhost:${config.port}`)
    })
  } catch (err) {
    console.error('[Server] Failed to start:', err)
    process.exit(1)
  }
}

start()
