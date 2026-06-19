import { execSync, spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import config from '../config/index.js'

/**
 * Run generated tests inside an isolated Docker container.
 * - Clones the repo at the PR head
 * - Writes test files under __autoqa__/
 * - Runs Jest with --json in a network-isolated container
 * - Returns structured test results
 */
export async function runSandbox(repo, sha, branch, testFiles, token) {
  const dir = `/tmp/prbot-${sha}-${Date.now()}`

  try {
    mkdirSync(dir, { recursive: true })

    // Clone at PR head (shallow, single branch)
    execSync(
      `git clone --depth 1 --branch ${branch} https://x-access-token:${token}@github.com/${repo}.git ${dir}`,
      { stdio: 'pipe', timeout: 60000 }
    )

    // Write generated test files
    mkdirSync(join(dir, '__autoqa__'), { recursive: true })
    for (const file of testFiles) {
      const filePath = join(dir, '__autoqa__', file.path)
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
      mkdirSync(fileDir, { recursive: true })
      writeFileSync(filePath, file.content, 'utf-8')
    }

    // Run Jest in an isolated Docker container
    const dockerCmd = [
      'docker',
      'run',
      '--rm',
      '--network',
      'none',
      '--memory',
      '512m',
      '--cpus',
      '0.5',
      '--ulimit',
      'nofile=1024:1024',
      '-v',
      `${dir}:/app`,
      '-w',
      '/app',
      'node:20-alpine',
      'sh',
      '-c',
      'npm install --prefer-offline 2>/dev/null && npx jest __autoqa__/ --json --forceExit --testTimeout=30000 2>/dev/null || true',
    ]

    const result = await new Promise((resolve) => {
      const proc = spawn(dockerCmd[0], dockerCmd.slice(1))
      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGKILL')
      }, config.sandboxTimeoutMs)

      proc.stdout.on('data', (d) => (stdout += d.toString()))
      proc.stderr.on('data', (d) => (stderr += d.toString()))

      proc.on('close', () => {
        clearTimeout(timer)

        if (timedOut) {
          return resolve({
            passed: 0,
            failed: 0,
            total: 0,
            timedOut: true,
            testResults: [],
            rawOutput: 'Sandbox timed out',
          })
        }

        try {
          // Find Jest JSON output — scan from the end for a parseable JSON line
          const lines = stdout.trim().split('\n')
          let jestOutput = null
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              jestOutput = JSON.parse(lines[i])
              break
            } catch {
              // not JSON, keep scanning
            }
          }

          if (!jestOutput) {
            return resolve({
              passed: 0,
              failed: 0,
              total: 0,
              timedOut: false,
              testResults: [],
              rawOutput: stdout + stderr,
            })
          }

          resolve({
            passed: jestOutput.numPassedTests || 0,
            failed: jestOutput.numFailedTests || 0,
            total: jestOutput.numTotalTests || 0,
            timedOut: false,
            testResults: (jestOutput.testResults || []).map((r) => ({
              name:
                r.testFilePath?.split('__autoqa__/')[1] ||
                r.testFilePath ||
                'unknown',
              status: r.status,
              assertionResults: (r.assertionResults || []).map((a) => ({
                title: a.title,
                status: a.status,
                failureMessages: a.failureMessages || [],
              })),
            })),
            rawOutput: stdout,
          })
        } catch {
          resolve({
            passed: 0,
            failed: 0,
            total: 0,
            timedOut: false,
            testResults: [],
            rawOutput: stdout + stderr,
          })
        }
      })
    })

    return result
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // cleanup best-effort
    }
  }
}
