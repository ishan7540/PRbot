import { createJSONCompletion, getProvider } from '../config/ai.js'
import { generateTests } from './testWriter.js'
import { runSandbox } from '../sandbox/runner.js'
import config from '../config/index.js'

const fixerSystemPrompt = `You are a test-fixing agent for a Node.js/Express application.

You are given:
1. The original diff being tested
2. The generated test files that failed
3. The test failure output

Your job: determine whether each failure is caused by:
- A bug in the GENERATED TEST (fix the test)
- A bug in the PR CODE (report as a finding — do NOT fix the test)
- A missing dependency or environment issue (report as infra issue)

Return ONLY valid JSON, no markdown:
{
  "fixedTestFiles": [
    {
      "path": string,
      "type": "unit|api|e2e",
      "content": string,
      "targetFile": string
    }
  ],
  "codeIssues": [
    {
      "file": string,
      "description": string,
      "failureMessage": string
    }
  ],
  "infraIssues": [
    {
      "description": string,
      "failureMessage": string
    }
  ]
}`

/**
 * Iterative test generation and execution loop.
 *
 * Flow:
 *   1. Generate tests
 *   2. Run tests in sandbox
 *   3. If all pass → done
 *   4. If failures → analyze failures
 *   5. Determine: test bug? code bug? infra issue?
 *   6. Fix test bugs → re-run (up to maxIterations)
 *   7. Report code bugs as findings
 *
 * @param {Object} options
 * @param {string} options.diff - The PR diff
 * @param {Object} options.plan - Orchestrator plan
 * @param {Array} options.existingTests - Existing test files from repo
 * @param {string} options.repo - Repository full name (owner/repo)
 * @param {string} options.sha - PR head SHA
 * @param {string} options.branch - PR head branch
 * @param {string} options.token - GitHub access token
 * @returns {Object} { testFiles, sandboxResult, iterations, codeIssues }
 */
export async function iterateTests({
  diff,
  plan,
  existingTests,
  repo,
  sha,
  branch,
  token,
}) {
  const maxIterations = config.agent.maxIterations
  const iterations = []
  let currentTestFiles = null
  let lastSandboxResult = null
  let codeIssues = []

  for (let i = 0; i < maxIterations; i++) {
    const iterationNum = i + 1
    console.log(`[IterationRunner] Iteration ${iterationNum}/${maxIterations}`)

    // Step 1: Generate or fix tests
    if (i === 0) {
      // First iteration — generate fresh tests
      const testResult = await generateTests(diff, plan, existingTests)
      currentTestFiles = (testResult.testFiles || []).slice(
        0,
        config.agent.maxTestFiles
      )
    }
    // Subsequent iterations use fixedTestFiles from the fixer agent (set below)

    if (!currentTestFiles || currentTestFiles.length === 0) {
      console.log('[IterationRunner] No test files to run, skipping sandbox')
      lastSandboxResult = {
        passed: 0,
        failed: 0,
        total: 0,
        timedOut: false,
        testResults: [],
        rawOutput: 'No test files generated',
      }
      break
    }

    // Step 2: Run tests in sandbox
    console.log(
      `[IterationRunner] Running ${currentTestFiles.length} test files in sandbox...`
    )
    lastSandboxResult = await runSandbox(
      repo,
      sha,
      branch,
      currentTestFiles,
      token
    )

    iterations.push({
      iteration: iterationNum,
      testFileCount: currentTestFiles.length,
      passed: lastSandboxResult.passed,
      failed: lastSandboxResult.failed,
      total: lastSandboxResult.total,
      timedOut: lastSandboxResult.timedOut,
    })

    // Step 3: Check results
    if (lastSandboxResult.failed === 0 && !lastSandboxResult.timedOut) {
      console.log(
        `[IterationRunner] All ${lastSandboxResult.passed} tests passed on iteration ${iterationNum}`
      )
      break
    }

    if (lastSandboxResult.timedOut) {
      console.log('[IterationRunner] Sandbox timed out, stopping iteration')
      break
    }

    // Step 4: We have failures — can we fix them?
    if (i >= maxIterations - 1) {
      console.log(
        `[IterationRunner] Max iterations (${maxIterations}) reached, reporting failures`
      )
      break
    }

    // Step 5: Analyze failures and attempt fix
    console.log(
      `[IterationRunner] ${lastSandboxResult.failed} tests failed, analyzing...`
    )

    const failureDetails = (lastSandboxResult.testResults || [])
      .filter((r) => r.status === 'failed')
      .map((r) => ({
        file: r.name,
        failures: (r.assertionResults || [])
          .filter((a) => a.status === 'failed')
          .map((a) => ({
            title: a.title,
            messages: (a.failureMessages || []).slice(0, 2),
          })),
      }))

    const fixerMessage = `Original diff being tested:
${diff.slice(0, 20000)}

Generated test files that failed:
${currentTestFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n')}

Test failure output:
${JSON.stringify(failureDetails, null, 2)}

Analyze each failure. Fix tests that have bugs in them. Report failures that indicate actual code bugs.`

    try {
      const fixResult = await createJSONCompletion({
        system: fixerSystemPrompt,
        userMessage: fixerMessage,
        model: 'smart',
      })

      // Collect code issues
      if (fixResult.codeIssues && fixResult.codeIssues.length > 0) {
        codeIssues = codeIssues.concat(fixResult.codeIssues)
        console.log(
          `[IterationRunner] Found ${fixResult.codeIssues.length} likely code bugs`
        )
      }

      // Use fixed test files for next iteration
      if (fixResult.fixedTestFiles && fixResult.fixedTestFiles.length > 0) {
        currentTestFiles = fixResult.fixedTestFiles.slice(
          0,
          config.agent.maxTestFiles
        )
        console.log(
          `[IterationRunner] Fixer produced ${currentTestFiles.length} fixed test files`
        )
      } else {
        console.log(
          '[IterationRunner] Fixer produced no fixed files, stopping'
        )
        break
      }
    } catch (err) {
      console.error('[IterationRunner] Fixer agent error:', err.message)
      break
    }
  }

  return {
    testFiles: currentTestFiles || [],
    sandboxResult: lastSandboxResult || {
      passed: 0,
      failed: 0,
      total: 0,
      timedOut: false,
      testResults: [],
      rawOutput: '',
    },
    iterations,
    codeIssues,
  }
}
