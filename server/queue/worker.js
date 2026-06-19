import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import config from '../config/index.js'
import Run from '../models/Run.js'
import {
  getOctokit,
  getDiff,
  getExistingTests,
  commitGeneratedTests,
  postPRComment,
  setCommitStatus,
} from '../github/client.js'
import { orchestrate } from '../agents/orchestrator.js'
import { generateTests } from '../agents/testWriter.js'
import { scanSecurity } from '../agents/securityScanner.js'
import { analyzeCoverage } from '../agents/coverageAnalyst.js'
import { runSandbox } from '../sandbox/runner.js'
import { formatPRComment } from '../utils/formatComment.js'

// BullMQ requires separate Redis connections for Queue and Worker.
// Each connection must have maxRetriesPerRequest: null.
export function createRedisConnection() {
  return new Redis(config.redis.url, { maxRetriesPerRequest: null })
}

export function startWorker() {
  const connection = createRedisConnection()

  const worker = new Worker(
    'prbot-jobs',
    async (job) => {
      const { runId, sha, prNumber, repo, branch, installationId } = job.data
      const startTime = Date.now()

      try {
        // 1. Mark run as running
        await Run.findByIdAndUpdate(runId, { status: 'running' })

        // 2. Get authenticated GitHub client
        const { octokit, token } = await getOctokit(installationId)

        // 3. Fetch diff (truncate to 50k chars to stay within token limits)
        const rawDiff = await getDiff(octokit, repo, prNumber)
        const diff = rawDiff.slice(0, 50000)

        // 4. Fetch existing test files for style matching
        const existingTests = await getExistingTests(octokit, repo, sha)

        // 5. Orchestrator: analyze diff → structured plan
        console.log(`[Worker] Job ${job.id}: Running orchestrator...`)
        const plan = await orchestrate(diff)

        // 6. Run three specialist agents in parallel
        console.log(`[Worker] Job ${job.id}: Running agents in parallel...`)
        const [testResult, securityResult, coverageResult] = await Promise.all([
          generateTests(diff, plan, existingTests),
          scanSecurity(diff, plan),
          analyzeCoverage(diff, plan, existingTests),
        ])

        // 7. Commit generated tests to PR branch
        if (testResult.testFiles && testResult.testFiles.length > 0) {
          await commitGeneratedTests(
            octokit,
            repo,
            branch,
            sha,
            testResult.testFiles
          )
        }

        // 8. Run tests in Docker sandbox
        console.log(`[Worker] Job ${job.id}: Running sandbox...`)
        const sandboxResult = await runSandbox(
          repo,
          sha,
          branch,
          testResult.testFiles || [],
          token
        )

        // 9. Calculate duration and save results
        const duration = Date.now() - startTime
        const finalStatus =
          sandboxResult.failed > 0 ? 'failed' : 'passed'

        await Run.findByIdAndUpdate(runId, {
          status: finalStatus,
          orchestratorPlan: plan,
          generatedTests: testResult.testFiles || [],
          sandboxResult,
          securityFindings: securityResult.findings || [],
          securitySummary: securityResult.summary,
          overallRisk: securityResult.overallRisk,
          coverageGaps: coverageResult.gaps || [],
          coverageScore: coverageResult.coverageScore,
          duration,
        })

        // 10. Post PR comment
        const updatedRun = await Run.findById(runId)
        const comment = formatPRComment(
          updatedRun,
          sandboxResult,
          securityResult,
          coverageResult,
          runId
        )
        await postPRComment(octokit, repo, prNumber, comment)

        // 11. Set commit status
        await setCommitStatus(
          octokit,
          repo,
          sha,
          sandboxResult.failed > 0 ? 'failure' : 'success',
          `${sandboxResult.passed}/${sandboxResult.total} tests passed`
        )

        console.log(
          `[Worker] Job ${job.id}: Completed in ${Math.round(duration / 1000)}s — ${finalStatus}`
        )
      } catch (err) {
        // On failure: update run status and set GitHub commit status
        await Run.findByIdAndUpdate(runId, {
          status: 'failed',
          error: err.message,
        }).catch(() => {})

        try {
          const { octokit } = await getOctokit(installationId)
          await setCommitStatus(
            octokit,
            repo,
            sha,
            'failure',
            err.message.slice(0, 140)
          )
        } catch {
          // If we can't even set status, just log
        }

        console.error('[Worker] Job failed:', job.id, err)
        throw err
      }
    },
    {
      connection,
      concurrency: config.maxConcurrentJobs,
    }
  )

  worker.on('completed', (job) =>
    console.log(`[Worker] Job ${job.id} completed`)
  )
  worker.on('failed', (job, err) =>
    console.error(`[Worker] Job ${job?.id} failed:`, err.message)
  )

  console.log('[Worker] Started and listening for jobs...')
  return worker
}
