import { Router } from 'express'
import Run from '../models/Run.js'
import { createCompletion } from '../config/ai.js'

const router = Router()

// GET /api/runs — list recent runs (summary projection)
router.get('/runs', async (_req, res) => {
  try {
    const runs = await Run.find(
      {},
      {
        repo: 1,
        prNumber: 1,
        sha: 1,
        branch: 1,
        status: 1,
        overallRisk: 1,
        coverageScore: 1,
        'sandboxResult.passed': 1,
        'sandboxResult.failed': 1,
        'sandboxResult.total': 1,
        duration: 1,
        createdAt: 1,
      }
    )
      .sort({ createdAt: -1 })
      .limit(50)

    res.json(runs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/runs/stats — aggregate stats for dashboard
router.get('/runs/stats', async (_req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const pipeline = await Run.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: null,
          totalRuns: { $sum: 1 },
          passedRuns: {
            $sum: { $cond: [{ $eq: ['$status', 'passed'] }, 1, 0] },
          },
          avgCoverageScore: { $avg: '$coverageScore' },
          allFindings: { $push: '$securityFindings' },
        },
      },
    ])

    if (pipeline.length === 0) {
      return res.json({
        totalRuns: 0,
        passRate: 0,
        avgCoverageScore: 0,
        findingsBySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
      })
    }

    const stats = pipeline[0]
    const passRate =
      stats.totalRuns > 0
        ? Math.round((stats.passedRuns / stats.totalRuns) * 100)
        : 0

    // Flatten all findings arrays and count by severity
    const allFindings = stats.allFindings.flat().filter(Boolean)
    const findingsBySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    }
    for (const finding of allFindings) {
      if (finding.severity && findingsBySeverity[finding.severity] !== undefined) {
        findingsBySeverity[finding.severity]++
      }
    }

    res.json({
      totalRuns: stats.totalRuns,
      passRate,
      avgCoverageScore: Math.round(stats.avgCoverageScore || 0),
      findingsBySeverity,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/runs/:id — full run detail
router.get('/runs/:id', async (req, res) => {
  try {
    const run = await Run.findById(req.params.id)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    res.json(run)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/runs/:id/ask — ask AI about a run
router.post('/runs/:id/ask', async (req, res) => {
  try {
    const run = await Run.findById(req.params.id)
    if (!run) return res.status(404).json({ error: 'Run not found' })

    const { question } = req.body
    if (!question) return res.status(400).json({ error: 'Question is required' })

    const answer = await createCompletion({
      system:
        'You are a QA expert assistant. Answer questions about this PRbøt test run concisely and technically. Focus on actionable insights.',
      userMessage: `Run data:\n${JSON.stringify(run, null, 2)}\n\nQuestion: ${question}`,
      model: 'smart',
      maxTokens: 1024,
    })

    res.json({ answer })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
