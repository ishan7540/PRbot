import { Router } from 'express'
import crypto from 'crypto'
import config from '../config/index.js'
import Run from '../models/Run.js'
import { addJob } from '../queue/index.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    // 1. Verify webhook signature
    const signature = req.headers['x-hub-signature-256']
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature header' })
    }

    const expected =
      'sha256=' +
      crypto
        .createHmac('sha256', config.github.webhookSecret)
        .update(req.rawBody)
        .digest('hex')

    if (
      !crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
      )
    ) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // 2. Only process pull_request events for opened/synchronize
    const event = req.headers['x-github-event']
    const action = req.body.action

    if (event !== 'pull_request' || !['opened', 'synchronize'].includes(action)) {
      return res.status(200).json({ message: 'Event ignored' })
    }

    // 3. Extract PR data
    const pr = req.body.pull_request
    const sha = pr.head.sha
    const prNumber = pr.number
    const repo = req.body.repository.full_name
    const branch = pr.head.ref
    const installationId = req.body.installation?.id

    // 4. Create a Run document
    const run = new Run({
      repo,
      prNumber,
      sha,
      branch,
      installationId,
      status: 'pending',
    })
    await run.save()

    // 5. Add job to queue
    await addJob({
      runId: run._id.toString(),
      sha,
      prNumber,
      repo,
      branch,
      installationId,
    })

    console.log(
      `[Webhook] PR #${prNumber} on ${repo} — Run ${run._id} queued`
    )

    // 6. Return immediately
    res.status(202).json({ runId: run._id })
  } catch (err) {
    console.error('[Webhook] Error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
