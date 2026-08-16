import crypto from 'crypto'

/**
 * Tests for the webhook route.
 *
 * These tests verify:
 * - Signature validation (HMAC SHA-256)
 * - Event filtering (only pull_request opened/synchronize)
 * - PR data extraction
 * - Error handling
 *
 * Uses mocks for MongoDB model and BullMQ queue.
 */

import { jest } from '@jest/globals'

// --- Mocks ---

const mockRunSave = jest.fn().mockResolvedValue(undefined)
let mockRunInstance = null
const MockRun = function (data) {
  mockRunInstance = {
    ...data,
    _id: 'mock-run-id',
    save: mockRunSave,
  }
  return mockRunInstance
}

jest.unstable_mockModule('../models/Run.js', () => ({
  default: MockRun,
}))

const mockAddJob = jest.fn().mockResolvedValue(undefined)
jest.unstable_mockModule('../queue/index.js', () => ({
  addJob: mockAddJob,
}))

jest.unstable_mockModule('../config/index.js', () => ({
  default: {
    github: { webhookSecret: 'test-secret' },
  },
}))

const { default: express } = await import('express')

// Build a minimal test app with the webhook route
const { default: webhookRouter } = await import('../routes/webhook.js')

function createTestApp() {
  const app = express()
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf
      },
    })
  )
  app.use('/webhook', webhookRouter)
  return app
}

function sign(body, secret) {
  return (
    'sha256=' +
    crypto.createHmac('sha256', secret).update(body).digest('hex')
  )
}

// Compute a valid-length but wrong signature for testing
function wrongSign(body, _secret) {
  return (
    'sha256=' +
    crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex')
  )
}

// Minimal HTTP test helper (avoids needing supertest)
async function request(app, method, path, { body, headers } = {}) {
  return new Promise((resolve) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const bodyStr = body ? JSON.stringify(body) : undefined
      const res = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: bodyStr,
      })
      const data = await res.json().catch(() => ({}))
      server.close()
      resolve({ status: res.status, body: data })
    })
  })
}

describe('Webhook Route', () => {
  let app

  beforeEach(() => {
    app = createTestApp()
    mockRunSave.mockClear()
    mockAddJob.mockClear()
    mockRunInstance = null
  })

  test('rejects requests without signature header', async () => {
    const { status, body } = await request(app, 'POST', '/webhook', {
      body: {},
      headers: {},
    })
    expect(status).toBe(401)
    expect(body.error).toContain('Missing signature')
  })

  test('rejects requests with invalid signature', async () => {
    const payload = { action: 'opened' }
    const bodyStr = JSON.stringify(payload)
    // Use a wrong-secret signature so the buffers are same length
    const sig = wrongSign(bodyStr, 'test-secret')

    const { status, body } = await request(app, 'POST', '/webhook', {
      body: payload,
      headers: {
        'x-hub-signature-256': sig,
        'x-github-event': 'pull_request',
      },
    })
    expect(status).toBe(401)
    expect(body.error).toContain('Invalid signature')
  })

  test('ignores non-pull_request events', async () => {
    const payload = { action: 'created' }
    const bodyStr = JSON.stringify(payload)
    const sig = sign(bodyStr, 'test-secret')

    const { status, body } = await request(app, 'POST', '/webhook', {
      body: payload,
      headers: {
        'x-hub-signature-256': sig,
        'x-github-event': 'issues',
      },
    })
    expect(status).toBe(200)
    expect(body.message).toContain('ignored')
  })

  test('ignores non-opened/synchronize PR actions', async () => {
    const payload = { action: 'closed' }
    const bodyStr = JSON.stringify(payload)
    const sig = sign(bodyStr, 'test-secret')

    const { status, body } = await request(app, 'POST', '/webhook', {
      body: payload,
      headers: {
        'x-hub-signature-256': sig,
        'x-github-event': 'pull_request',
      },
    })
    expect(status).toBe(200)
    expect(body.message).toContain('ignored')
  })

  test('processes valid PR opened event', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        number: 42,
        head: { sha: 'abc123', ref: 'feature-branch' },
      },
      repository: { full_name: 'owner/repo' },
      installation: { id: 999 },
    }
    const bodyStr = JSON.stringify(payload)
    const sig = sign(bodyStr, 'test-secret')

    const { status, body } = await request(app, 'POST', '/webhook', {
      body: payload,
      headers: {
        'x-hub-signature-256': sig,
        'x-github-event': 'pull_request',
      },
    })

    expect(status).toBe(202)
    expect(body.runId).toBe('mock-run-id')
    expect(mockRunSave).toHaveBeenCalled()
    expect(mockAddJob).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'mock-run-id',
        sha: 'abc123',
        prNumber: 42,
        repo: 'owner/repo',
        branch: 'feature-branch',
        installationId: 999,
      })
    )
  })
})
