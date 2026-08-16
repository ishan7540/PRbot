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
import { iterateTests } from '../agents/iterationRunner.js'
import { scanSecurity } from '../agents/securityScanner.js'
import { analyzeCoverage } from '../agents/coverageAnalyst.js'
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

        // 3. Set pending commit status
        await setCommitStatus(
          octokit,
          repo,
          sha,
          'pending',
          'PRbøt is analyzing this PR...'
        ).catch(() => {})

        // 4. Fetch diff (truncate to 50k chars to stay within token limits)
        const rawDiff = await getDiff(octokit, repo, prNumber)
        const diff = rawDiff.slice(0, 50000)

        // 5. Fetch existing test files for style matching
        const existingTests = await getExistingTests(octokit, repo, sha)

        // 6. Orchestrator: analyze diff → structured plan
        console.log(`[Worker] Job ${job.id}: Running orchestrator...`)
        const plan = await orchestrate(diff)

        // 7. Run specialist agents in parallel:
        //    - Security scanner + Coverage analyst run alongside the iteration loop
        //    - Iteration loop: generate → run → analyze → fix → re-run
        console.log(`[Worker] Job ${job.id}: Running agents...`)
        const [iterationResult, securityResult, coverageResult] =
          await Promise.all([
            iterateTests({
              diff,
              plan,
              existingTests,
              repo,
              sha,
              branch,
              token,
            }),
            scanSecurity(diff, plan),
            analyzeCoverage(diff, plan, existingTests),
          ])

        const { testFiles, sandboxResult, iterations, codeIssues } =
          iterationResult

        // 8. Commit generated tests to PR branch
        if (testFiles && testFiles.length > 0) {
          await commitGeneratedTests(octokit, repo, branch, sha, testFiles)
        }

        // 9. Calculate duration and save results
        const duration = Date.now() - startTime
        const finalStatus = sandboxResult.failed > 0 ? 'failed' : 'passed'

        await Run.findByIdAndUpdate(runId, {
          status: finalStatus,
          orchestratorPlan: plan,
          generatedTests: testFiles || [],
          sandboxResult,
          securityFindings: securityResult.findings || [],
          securitySummary: securityResult.summary,
          overallRisk: securityResult.overallRisk,
          coverageGaps: coverageResult.gaps || [],
          coverageScore: coverageResult.coverageScore,
          iterations,
          codeIssues,
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
          `[Worker] Job ${job.id}: Completed in ${Math.round(duration / 1000)}s — ${finalStatus} (${iterations.length} iteration(s))`
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
