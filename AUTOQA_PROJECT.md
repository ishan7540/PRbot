# AutoQA — AI-Powered CI Test Agent
## Complete Project Specification & Architecture Guide

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Cost Strategy](#2-cost-strategy)
3. [Architecture Overview](#3-architecture-overview)
4. [Repository Structure](#4-repository-structure)
5. [Environment Variables](#5-environment-variables)
6. [Server — File by File](#6-server--file-by-file)
   - [config/index.js](#61-configindexjs)
   - [index.js](#62-indexjs)
   - [queue/index.js](#63-queueindexjs)
   - [queue/worker.js](#64-queueworkerjs)
   - [routes/webhook.js](#65-routeswebhookjs)
   - [routes/api.js](#66-routesapijs)
   - [github/client.js](#67-githubclientjs)
   - [agents/orchestrator.js](#68-agentsorchestratorjs)
   - [agents/testWriter.js](#69-agentsTestWriterjs)
   - [agents/securityScanner.js](#610-agentssecurityscannerjs)
   - [agents/coverageAnalyst.js](#611-agentscoverageanalystjs)
   - [sandbox/runner.js](#612-sandboxrunnerjs)
   - [models/Run.js](#613-modelsrunjs)
   - [utils/formatComment.js](#614-utilsformatcommentjs)
7. [Client — File by File](#7-client--file-by-file)
   - [vite.config.js](#71-viteconfigjs)
   - [App.jsx](#72-appjsx)
   - [pages/Dashboard.jsx](#73-pagesdashboardjsx)
   - [pages/RunDetail.jsx](#74-pagesrundetailjsx)
   - [components/TrendChart.jsx](#75-componentstrendchartjsx)
   - [components/SeverityDonut.jsx](#76-componentsseveritydonutjsx)
   - [components/RunTable.jsx](#77-componentsruntablejsx)
   - [components/AskAboutRun.jsx](#78-componentsaskaboutrunjsx)
8. [Infrastructure Files](#8-infrastructure-files)
   - [docker-compose.yml](#81-docker-composeyml)
   - [sandbox.Dockerfile](#82-sandboxdockerfile)
   - [Root package.json](#83-root-packagejson)
   - [.gitignore](#84-gitignore)
9. [PR Comment Format](#9-pr-comment-format)
10. [How to Run](#10-how-to-run)
11. [How to Give This to Claude Code](#11-how-to-give-this-to-claude-code)
12. [Architectural Decisions & Tradeoffs](#12-architectural-decisions--tradeoffs)
13. [Resume Interview Prep](#13-resume-interview-prep)

---

## 1. Project Overview

AutoQA is a full-stack MERN application and agentic AI system. When a developer opens or updates a pull request, a GitHub webhook triggers a multi-agent pipeline that:

1. Analyzes the code diff using an orchestrator agent
2. Generates Jest/Playwright tests via a test writer agent
3. Scans for security vulnerabilities via a security scanner agent
4. Identifies untested code paths via a coverage analyst agent
5. Runs the generated tests inside an isolated Docker sandbox
6. Posts a detailed report as a PR comment and sets a commit status

The developer sees results directly on their PR without any manual steps.

**What makes it genuinely agentic:** The orchestrator's output determines what each specialist agent does and what context it receives. Agents coordinate through structured JSON. It's a planning agent feeding task-specific agents feeding a result aggregator — not just a single Claude API call.

---

## 2. Cost Strategy

Use this model routing to keep API costs minimal:

| Agent | Model | Reason |
|---|---|---|
| Orchestrator | `claude-haiku-4-5` | JSON analysis only, no code generation |
| Coverage analyst | `claude-haiku-4-5` | Classification task, not code |
| Test writer | `claude-sonnet-4-6` | Generates runnable code — quality matters |
| Security scanner | `claude-sonnet-4-6` | Needs nuanced vulnerability reasoning |
| Dashboard chat | `claude-sonnet-4-6` | Conversational, context-heavy |

All Claude calls use `temperature: 0` and `max_tokens: 4096`.

**Estimated cost per PR run:** $0.03–0.08 depending on diff size. A month of active development and demos costs under $5.

**Free alternatives:** Replace Claude with Groq (free tier, OpenAI-compatible API, supports Llama 3.1 70B). Change 3 lines of code — the base URL, API key, and model name.

---

## 3. Architecture Overview

```
GitHub PR opened/updated
        │
        ▼
GitHub webhook (POST /webhook)
        │
        ▼
Express webhook receiver
  - Validates X-Hub-Signature-256
  - Extracts sha, prNumber, repo, branch, installationId
  - Creates Run document in MongoDB (status: pending)
  - Drops job into BullMQ queue
  - Returns 202 immediately
        │
        ▼
Redis + BullMQ queue
  - Retries on failure (attempts: 2, exponential backoff)
  - Max concurrency: 2 simultaneous runs
        │
        ▼
BullMQ Worker
        │
        ├──► GitHub API: fetch diff + existing tests
        │
        ├──► Orchestrator agent (Haiku)
        │      Reads diff → returns structured JSON plan
        │
        ├──► Promise.all (three agents in parallel)
        │      ├── Test writer agent (Sonnet) → testFiles[]
        │      ├── Security scanner agent (Sonnet) → findings[]
        │      └── Coverage analyst agent (Haiku) → gaps[]
        │
        ├──► Commit generated tests to PR branch via GitHub API
        │
        ├──► Docker sandbox runner
        │      - Clones repo at PR head
        │      - Writes __autoqa__/ test files
        │      - Runs jest --json in network-isolated container
        │      - Returns passed/failed/total + test results
        │
        ├──► Save full result to MongoDB
        │
        └──► Post PR comment + set commit status via GitHub API

React Dashboard (separate frontend)
  - Run history table
  - Pass rate trend chart (Recharts)
  - Security findings donut chart (Recharts)
  - Run detail: tests / security / coverage tabs
  - "Ask about this run" chat widget (Claude API)
```

---

## 4. Repository Structure

```
autoqa/
├── server/
│   ├── index.js
│   ├── routes/
│   │   ├── webhook.js
│   │   └── api.js
│   ├── queue/
│   │   ├── index.js
│   │   └── worker.js
│   ├── agents/
│   │   ├── orchestrator.js
│   │   ├── testWriter.js
│   │   ├── securityScanner.js
│   │   └── coverageAnalyst.js
│   ├── sandbox/
│   │   └── runner.js
│   ├── github/
│   │   └── client.js
│   ├── models/
│   │   └── Run.js
│   ├── utils/
│   │   └── formatComment.js
│   └── config/
│       └── index.js
├── client/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   └── RunDetail.jsx
│       └── components/
│           ├── TrendChart.jsx
│           ├── SeverityDonut.jsx
│           ├── RunTable.jsx
│           └── AskAboutRun.jsx
├── docker/
│   └── sandbox.Dockerfile
├── CLAUDE.md                ← paste the Claude Code prompt here
├── .env.example
├── .gitignore
├── docker-compose.yml
└── package.json
```

---

## 5. Environment Variables

Create `.env.example` with exactly these keys:

```env
# Anthropic
ANTHROPIC_API_KEY=

# GitHub App credentials
GITHUB_WEBHOOK_SECRET=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_BASE64=

# Database
MONGODB_URI=mongodb://localhost:27017/autoqa
REDIS_URL=redis://localhost:6379

# Server
PORT=3001
NODE_ENV=development

# Sandbox
SANDBOX_TIMEOUT_MS=90000
MAX_CONCURRENT_JOBS=2
```

> **Note on GITHUB_APP_PRIVATE_KEY_BASE64:** Download the `.pem` file from your GitHub App settings and run `base64 -i private-key.pem` to encode it. Decode in config with `Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY_BASE64, 'base64').toString('utf-8')`.

---

## 6. Server — File by File

### 6.1 config/index.js

```javascript
import dotenv from 'dotenv'
dotenv.config()

export default {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  github: {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    appId: process.env.GITHUB_APP_ID,
    privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY_BASE64 || '', 'base64').toString('utf-8'),
  },
  mongodb: { uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/autoqa' },
  redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
  port: parseInt(process.env.PORT) || 3001,
  sandboxTimeoutMs: parseInt(process.env.SANDBOX_TIMEOUT_MS) || 90000,
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 2,
}
```

---

### 6.2 index.js

Use ES modules throughout (`import/export`, `"type": "module"` in package.json).

Key implementation notes:

- Save raw body buffer to `req.rawBody` **before** `express.json()` parses it. Required for webhook signature validation:

```javascript
app.use((req, res, next) => {
  let data = []
  req.on('data', chunk => data.push(chunk))
  req.on('end', () => {
    req.rawBody = Buffer.concat(data)
    next()
  })
})
app.use(express.json())
```

- Add CORS middleware allowing `http://localhost:5173`
- Mount `/webhook` → `routes/webhook.js`
- Mount `/api` → `routes/api.js`
- Add `GET /api/health` returning `{ status: 'ok', mongo: mongoose.connection.readyState, queue: await queue.getJobCounts() }`
- Connect to MongoDB on startup, start BullMQ worker after DB connects
- Listen on `config.port`

---

### 6.3 queue/index.js

```javascript
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import config from '../config/index.js'

const connection = new Redis(config.redis.url, { maxRetriesPerRequest: null })

export const queue = new Queue('autoqa-jobs', { connection })

export async function addJob(data) {
  return queue.add('process-pr', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 }
  })
}
```

> **Critical:** BullMQ requires ioredis with `maxRetriesPerRequest: null`. Without this option, BullMQ throws on startup.

---

### 6.4 queue/worker.js

Create a BullMQ `Worker` for `autoqa-jobs` with `concurrency: config.maxConcurrentJobs`.

Worker processor sequence:

```
1.  startTime = Date.now()
2.  Run.findByIdAndUpdate(runId, { status: 'running' })
3.  { octokit, token } = getOctokit(installationId)
4.  diff = getDiff(octokit, repo, prNumber)           ← truncate to 50,000 chars
5.  existingTests = getExistingTests(octokit, repo, sha)
6.  plan = orchestrate(diff)
7.  [testResult, securityResult, coverageResult] = Promise.all([
      testWriter(diff, plan, existingTests),
      securityScanner(diff, plan),
      coverageAnalyst(diff, plan, existingTests)
    ])
8.  commitGeneratedTests(octokit, repo, branch, sha, testResult.testFiles)
9.  sandboxResult = runSandbox(repo, sha, branch, testResult.testFiles, token)
10. duration = Date.now() - startTime
11. Run.findByIdAndUpdate(runId, {
      status: sandboxResult.failed > 0 ? 'failed' : 'passed',
      orchestratorPlan: plan,
      generatedTests: testResult.testFiles,
      sandboxResult,
      securityFindings: securityResult.findings,
      securitySummary: securityResult.summary,
      overallRisk: securityResult.overallRisk,
      coverageGaps: coverageResult.gaps,
      coverageScore: coverageResult.coverageScore,
      duration
    })
12. comment = formatPRComment(run, sandboxResult, securityResult, coverageResult, runId)
13. postPRComment(octokit, repo, prNumber, comment)
14. setCommitStatus(octokit, repo, sha,
      sandboxResult.failed > 0 ? 'failure' : 'success',
      `${sandboxResult.passed}/${sandboxResult.total} tests passed`
    )
```

On any error:
- `Run.findByIdAndUpdate(runId, { status: 'failed', error: err.message })`
- `setCommitStatus(octokit, repo, sha, 'failure', err.message.slice(0, 140))`
- `console.error('[Worker] Job failed:', job.id, err)`

Add event listeners:
```javascript
worker.on('completed', job => console.log(`[Worker] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[Worker] Job ${job?.id} failed:`, err.message))
```

---

### 6.5 routes/webhook.js

`POST /webhook`:

```
1. Check X-Hub-Signature-256 header exists → 401 if missing
2. Compute expected = 'sha256=' + hmac(webhookSecret, req.rawBody).hex()
3. crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header)) → 401 if false
4. If event !== 'pull_request' OR action not in ['opened','synchronize'] → 200 OK, return
5. Extract { sha, prNumber, repo, branch, installationId } from req.body
6. new Run({ repo, prNumber, sha, branch, installationId, status: 'pending' }).save()
7. addJob({ runId: run._id.toString(), sha, prNumber, repo, branch, installationId })
8. res.status(202).json({ runId: run._id })
```

---

### 6.6 routes/api.js

**`GET /api/runs`**
```javascript
Run.find({}, {
  repo:1, prNumber:1, sha:1, branch:1, status:1, overallRisk:1,
  coverageScore:1, 'sandboxResult.passed':1, 'sandboxResult.failed':1,
  'sandboxResult.total':1, duration:1, createdAt:1
}).sort({ createdAt: -1 }).limit(50)
```

**`GET /api/runs/stats`**
```javascript
// Aggregate runs from last 30 days
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
Run.aggregate([
  { $match: { createdAt: { $gte: thirtyDaysAgo } } },
  { $group: {
    _id: null,
    totalRuns: { $sum: 1 },
    passedRuns: { $sum: { $cond: [{ $eq: ['$status','passed'] }, 1, 0] } },
    avgCoverageScore: { $avg: '$coverageScore' },
    allFindings: { $push: '$securityFindings' }
  }}
])
// Compute passRate = (passedRuns / totalRuns) * 100
// Flatten allFindings and group by severity for findingsBySeverity
```

**`GET /api/runs/:id`** — `Run.findById(req.params.id)`

**`POST /api/runs/:id/ask`**
```javascript
const run = await Run.findById(req.params.id)
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  temperature: 0,
  system: 'You are a QA expert assistant. Answer questions about this AutoQA test run concisely and technically. Focus on actionable insights.',
  messages: [{
    role: 'user',
    content: `Run data:\n${JSON.stringify(run, null, 2)}\n\nQuestion: ${req.body.question}`
  }]
})
res.json({ answer: response.content[0].text })
```

---

### 6.7 github/client.js

Use `@octokit/auth-app` and `@octokit/rest`.

**`getOctokit(installationId)`**
```javascript
import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'

export async function getOctokit(installationId) {
  const auth = createAppAuth({
    appId: config.github.appId,
    privateKey: config.github.privateKey,
    installationId,
  })
  const { token } = await auth({ type: 'installation' })
  const octokit = new Octokit({ auth: token })
  return { octokit, token }
}
```

**`getDiff(octokit, repo, prNumber)`**
```javascript
const [owner, repoName] = repo.split('/')
const response = await octokit.rest.pulls.get({
  owner, repo: repoName, pull_number: prNumber,
  mediaType: { format: 'diff' }
})
return response.data  // raw diff string
```

**`getExistingTests(octokit, repo, sha)`**
```javascript
const [owner, repoName] = repo.split('/')
const { data: tree } = await octokit.rest.git.getTree({
  owner, repo: repoName, tree_sha: sha, recursive: true
})
const testFiles = tree.tree
  .filter(f => f.path.match(/\.(test|spec)\.(js|ts|jsx|tsx)$/))
  .slice(0, 5)
// Fetch content for each, decode base64
// Return [{ path, content }]
```

**`commitGeneratedTests(octokit, repo, branch, sha, testFiles)`**
```javascript
// 1. Get current commit and base tree SHA
// 2. Create blob for each file: octokit.rest.git.createBlob({ content, encoding: 'utf-8' })
// 3. Create tree: all blobs under __autoqa__/ prefix
// 4. Create commit: parent = sha, tree = new tree
// 5. Update ref: refs/heads/{branch} → new commit SHA
```

**`postPRComment(octokit, repo, prNumber, body)`**
```javascript
const [owner, repoName] = repo.split('/')
await octokit.rest.issues.createComment({
  owner, repo: repoName, issue_number: prNumber, body
})
```

**`setCommitStatus(octokit, repo, sha, state, description)`**
```javascript
const [owner, repoName] = repo.split('/')
await octokit.rest.repos.createCommitStatus({
  owner, repo: repoName, sha,
  state,                               // 'success' | 'failure' | 'error' | 'pending'
  description: description.slice(0, 140),
  context: 'autoqa/tests'
})
```

---

### 6.8 agents/orchestrator.js

**Model:** `claude-haiku-4-5`

**System prompt:**
```
You are a QA orchestration agent. Analyze Git diffs and plan testing work.
Return ONLY valid JSON matching this exact schema. No markdown, no explanation, no backticks:
{
  "changedFiles": [{ "path": string, "changeType": "added|modified|deleted", "summary": string }],
  "functionsChanged": [{ "name": string, "file": string, "isAsync": boolean, "hasDBCall": boolean, "hasExternalCall": boolean }],
  "routesChanged": [{ "method": string, "path": string, "file": string, "isAuthProtected": boolean }],
  "securitySensitiveAreas": [{ "file": string, "reason": string, "severity": "high|medium|low" }],
  "untestedRisk": [{ "file": string, "reason": string }],
  "testingStrategy": {
    "needsUnitTests": boolean,
    "needsE2ETests": boolean,
    "needsAPITests": boolean,
    "suggestedTestFiles": [string]
  }
}
```

**User message:** `"Analyze this diff:\n\n{diff}"`

**Retry logic (implement in all agents):**
```javascript
async function callWithRetry(userContent, extraInstruction = '') {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent + extraInstruction }]
  })
  const text = response.content[0].text.trim()
  try {
    return JSON.parse(text)
  } catch {
    if (extraInstruction) throw new Error(`Agent returned invalid JSON after retry. Raw: ${text.slice(0, 200)}`)
    return callWithRetry(userContent, '\n\nIMPORTANT: Return ONLY valid JSON. No other text whatsoever.')
  }
}
```

---

### 6.9 agents/testWriter.js

**Model:** `claude-sonnet-4-6`

**System prompt:**
```
You are a test writing agent for a Node.js/Express application.

Rules:
- Write Jest unit tests for changed functions
- Write supertest API tests for changed routes
- Write Playwright tests only if testingStrategy.needsE2ETests is true
- Match the coding style of the existing test sample provided
- Mock all external dependencies with jest.mock()
- Use describe/it/expect blocks
- Each test file must be complete and runnable
- Import paths must use relative paths from __autoqa__/ directory

Return ONLY valid JSON, no markdown, no backticks:
{
  "testFiles": [
    {
      "path": string,
      "type": "unit|api|e2e",
      "content": string,
      "targetFile": string
    }
  ]
}
```

**User message:**
```
Changed functions: {JSON.stringify(plan.functionsChanged)}
Changed routes: {JSON.stringify(plan.routesChanged)}
Testing strategy: {JSON.stringify(plan.testingStrategy)}

Diff:
{diff}

Existing test style example:
{existingTests.slice(0,2).map(t => `// ${t.path}\n${t.content}`).join('\n\n---\n\n')}
```

Return `parsed.testFiles`.

---

### 6.10 agents/securityScanner.js

**Model:** `claude-sonnet-4-6`

**System prompt:**
```
You are a security analysis agent specializing in Node.js/Express applications.

Scan the diff for:
- NoSQL injection (unparameterized MongoDB queries, $where usage)
- Missing express-validator or manual validation on new routes
- Hardcoded secrets, tokens, passwords in code
- Missing auth middleware on new routes that should be protected
- Insecure direct object references (user-supplied IDs without ownership check)
- Dangerous functions: eval(), new Function(), child_process with user input
- Newly added npm packages (flag for manual CVE review)
- Missing rate limiting on sensitive endpoints

Return ONLY valid JSON, no markdown, no backticks:
{
  "findings": [
    {
      "type": string,
      "file": string,
      "line": number,
      "severity": "critical|high|medium|low|info",
      "description": string,
      "recommendation": string,
      "codeSnippet": string
    }
  ],
  "summary": string,
  "overallRisk": "critical|high|medium|low|clean"
}
```

**User message:**
```
Security sensitive areas identified by orchestrator:
{JSON.stringify(plan.securitySensitiveAreas)}

Full diff:
{diff}
```

Return full parsed object.

---

### 6.11 agents/coverageAnalyst.js

**Model:** `claude-haiku-4-5`

**System prompt:**
```
You are a test coverage analyst for Node.js applications.

Analyze changed code and existing tests to identify coverage gaps.
Be specific about which code paths, edge cases, and error conditions are untested.

Return ONLY valid JSON, no markdown, no backticks:
{
  "gaps": [
    {
      "file": string,
      "functionOrBlock": string,
      "reason": string,
      "suggestedTestDescription": string,
      "priority": "high|medium|low"
    }
  ],
  "coverageScore": number,
  "summary": string
}

coverageScore: 0-100, your estimate of how much new code is covered.
```

**User message:**
```
Changed functions:
{JSON.stringify(plan.functionsChanged)}

Untested risk areas:
{JSON.stringify(plan.untestedRisk)}

Existing test files:
{existingTests.map(t => t.path).join('\n')}

Diff:
{diff}
```

---

### 6.12 sandbox/runner.js

```javascript
import { execSync, spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import config from '../config/index.js'

export async function runSandbox(repo, sha, branch, testFiles, token) {
  const dir = `/tmp/autoqa-${sha}-${Date.now()}`

  try {
    mkdirSync(dir, { recursive: true })

    // Clone at PR head
    execSync(
      `git clone --depth 1 --branch ${branch} https://x-access-token:${token}@github.com/${repo}.git ${dir}`,
      { stdio: 'pipe', timeout: 60000 }
    )

    // Write generated test files
    mkdirSync(join(dir, '__autoqa__'), { recursive: true })
    for (const file of testFiles) {
      writeFileSync(join(dir, '__autoqa__', file.path), file.content, 'utf-8')
    }

    // Run Jest in isolated Docker container
    const dockerCmd = [
      'docker', 'run', '--rm',
      '--network', 'none',
      '--memory', '512m',
      '--cpus', '0.5',
      '--ulimit', 'nofile=1024:1024',
      '-v', `${dir}:/app`,
      '-w', '/app',
      'node:20-alpine',
      'sh', '-c',
      'npm install --prefer-offline 2>/dev/null && npx jest __autoqa__/ --json --forceExit --testTimeout=30000 2>/dev/null || true'
    ]

    const result = await new Promise((resolve) => {
      const proc = spawn(dockerCmd[0], dockerCmd.slice(1))
      let stdout = '', stderr = '', timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGKILL')
      }, config.sandboxTimeoutMs)

      proc.stdout.on('data', d => stdout += d.toString())
      proc.stderr.on('data', d => stderr += d.toString())

      proc.on('close', () => {
        clearTimeout(timer)

        if (timedOut) {
          return resolve({ passed: 0, failed: 0, total: 0, timedOut: true, testResults: [], rawOutput: 'Sandbox timed out' })
        }

        try {
          // Find Jest JSON output on last parseable line
          const lines = stdout.trim().split('\n')
          let jestOutput = null
          for (let i = lines.length - 1; i >= 0; i--) {
            try { jestOutput = JSON.parse(lines[i]); break } catch {}
          }

          if (!jestOutput) {
            return resolve({ passed: 0, failed: 0, total: 0, timedOut: false, testResults: [], rawOutput: stdout + stderr })
          }

          resolve({
            passed: jestOutput.numPassedTests,
            failed: jestOutput.numFailedTests,
            total: jestOutput.numTotalTests,
            timedOut: false,
            testResults: jestOutput.testResults.map(r => ({
              name: r.testFilePath.split('__autoqa__/')[1] || r.testFilePath,
              status: r.status,
              assertionResults: r.assertionResults.map(a => ({
                title: a.title,
                status: a.status,
                failureMessages: a.failureMessages
              }))
            })),
            rawOutput: stdout
          })
        } catch {
          resolve({ passed: 0, failed: 0, total: 0, timedOut: false, testResults: [], rawOutput: stdout + stderr })
        }
      })
    })

    return result
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}
```

---

### 6.13 models/Run.js

```javascript
import mongoose from 'mongoose'

const findingSchema = new mongoose.Schema({
  type: String,
  file: String,
  line: Number,
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'] },
  description: String,
  recommendation: String,
  codeSnippet: String,
}, { _id: false })

const runSchema = new mongoose.Schema({
  repo: { type: String, required: true },
  prNumber: { type: Number, required: true },
  sha: { type: String, required: true },
  branch: { type: String, required: true },
  installationId: Number,
  status: {
    type: String,
    enum: ['pending', 'running', 'passed', 'failed', 'timeout'],
    default: 'pending'
  },
  orchestratorPlan: mongoose.Schema.Types.Mixed,
  generatedTests: [{ path: String, type: String, content: String, targetFile: String }],
  sandboxResult: {
    passed: Number,
    failed: Number,
    total: Number,
    timedOut: Boolean,
    testResults: mongoose.Schema.Types.Mixed,
    rawOutput: String,
  },
  securityFindings: [findingSchema],
  securitySummary: String,
  overallRisk: { type: String, enum: ['critical', 'high', 'medium', 'low', 'clean'] },
  coverageGaps: mongoose.Schema.Types.Mixed,
  coverageScore: Number,
  duration: Number,
  error: String,
}, { timestamps: true })

runSchema.index({ repo: 1, createdAt: -1 })
runSchema.index({ prNumber: 1, repo: 1 })

export default mongoose.model('Run', runSchema)
```

---

### 6.14 utils/formatComment.js

```javascript
export function formatPRComment(run, sandboxResult, securityResult, coverageResult, runId) {
  const statusIcon = sandboxResult.failed === 0 ? '✅' : '❌'
  const riskIcon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', clean: '🟢' }[securityResult.overallRisk] || '⚪'
  const severityIcon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪' }

  const findingsTable = securityResult.findings.length > 0
    ? `### Security findings (${securityResult.findings.length})\n| Severity | File | Issue |\n|----------|------|-------|\n` +
      securityResult.findings
        .sort((a, b) => ['critical','high','medium','low','info'].indexOf(a.severity) - ['critical','high','medium','low','info'].indexOf(b.severity))
        .slice(0, 10)
        .map(f => `| ${severityIcon[f.severity]} ${f.severity} | \`${f.file}:${f.line}\` | ${f.description.slice(0, 80)} |`)
        .join('\n')
    : '### Security\n✅ No findings'

  const highGaps = (coverageResult.gaps || []).filter(g => g.priority === 'high')
  const coverageSection = highGaps.length > 0
    ? `### Coverage gaps (${highGaps.length} high priority)\n` +
      highGaps.slice(0, 5).map(g => `- \`${g.functionOrBlock}\` in \`${g.file}\` — ${g.suggestedTestDescription}`).join('\n')
    : '### Coverage\n✅ No critical gaps identified'

  return `## AutoQA Results

**Status**: ${statusIcon} ${sandboxResult.passed} passed / ${sandboxResult.failed} failed
**Coverage score**: ${coverageResult.coverageScore ?? 'N/A'}%
**Security risk**: ${riskIcon} ${securityResult.overallRisk}

${findingsTable}

${coverageSection}

---
*Generated by AutoQA in ${run.duration ? Math.round(run.duration / 1000) + 's' : 'N/A'} · [View full report](http://localhost:5173/runs/${runId})*`
}
```

---

## 7. Client — File by File

### 7.1 vite.config.js

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3001' }
  }
})
```

---

### 7.2 App.jsx

```javascript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import RunDetail from './pages/RunDetail'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/runs/:id" element={<RunDetail />} />
      </Routes>
    </BrowserRouter>
  )
}
```

---

### 7.3 pages/Dashboard.jsx

On mount: fetch `/api/runs` and `/api/runs/stats`.

Layout:
```
┌─────────────────────────────────────────┐
│  Stats row: 4 cards                     │
│  [Total Runs] [Pass Rate] [Avg Coverage] [Critical Findings] │
├────────────────────┬────────────────────┤
│  TrendChart (60%)  │  SeverityDonut(40%)│
├────────────────────┴────────────────────┤
│  RunTable (last 50 runs)                │
└─────────────────────────────────────────┘
```

Show loading spinner while fetching. Show error message if fetch fails.

---

### 7.4 pages/RunDetail.jsx

On mount: fetch `/api/runs/:id`.

**Header:** repo, PR number badge, branch, SHA (7 chars), status badge (color-coded), duration in seconds.

**Three tabs** (simple `useState`, no library):
- **Tests tab:** passed/failed/total badges. List test files with assertion results — green ✓ for passed, red ✗ for failed with failure message in a `<pre>` block.
- **Security tab:** `overallRisk` badge at top. Each finding as a card: severity icon, type, `file:line`, description, recommendation.
- **Coverage tab:** `coverageScore` as large %. Gaps grouped by priority. `summary` text.

**Below tabs:** `<AskAboutRun runId={id} />`

---

### 7.5 components/TrendChart.jsx

```javascript
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// Props: runs[]
// Group runs by date (last 14 days), compute pass rate per day
// passRate = (passedCount / totalCount) * 100

export default function TrendChart({ runs }) {
  // Build data: [{ date: 'Jun 01', passRate: 85 }, ...]
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
        <Tooltip formatter={v => [`${v.toFixed(1)}%`, 'Pass rate']} />
        <Line type="monotone" dataKey="passRate" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

---

### 7.6 components/SeverityDonut.jsx

```javascript
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts'

// Props: stats (findingsBySeverity object)

const COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#3b82f6',
}

export default function SeverityDonut({ stats }) {
  const data = [
    { name: 'Critical', value: stats.findingsBySeverity.critical },
    { name: 'High',     value: stats.findingsBySeverity.high },
    { name: 'Medium',   value: stats.findingsBySeverity.medium },
    { name: 'Low',      value: stats.findingsBySeverity.low },
  ].filter(d => d.value > 0)

  if (data.length === 0) return <p style={{ textAlign: 'center' }}>No findings</p>

  return (
    <PieChart width={280} height={220}>
      <Pie data={data} innerRadius={60} outerRadius={90} dataKey="value">
        {data.map((entry) => <Cell key={entry.name} fill={COLORS[entry.name]} />)}
      </Pie>
      <Legend />
      <Tooltip />
    </PieChart>
  )
}
```

---

### 7.7 components/RunTable.jsx

Columns: Status | Repo | PR | Branch | Tests | Risk | Coverage | Time

```javascript
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
```

Status badge colors: `passed=green`, `failed=red`, `running=blue`, `pending=gray`, `timeout=orange`.

Risk badge colors: `critical=red`, `high=orange`, `medium=yellow`, `low=blue`, `clean=green`.

Each row clickable → `navigate('/runs/' + run._id)`.

---

### 7.8 components/AskAboutRun.jsx

```javascript
// State: messages[], input string, loading boolean
// POST /api/runs/:runId/ask with { question }
// Show user messages right-aligned, assistant left-aligned
// Pulsing "..." indicator while loading
// Scrollable container maxHeight: 300px, overflowY: 'auto'
```

---

## 8. Infrastructure Files

### 8.1 docker-compose.yml

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mongo-data:
```

---

### 8.2 sandbox.Dockerfile

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
CMD ["sh"]
```

---

### 8.3 Root package.json

```json
{
  "name": "autoqa",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "nodemon server/index.js",
    "dev:client": "cd client && npm run dev",
    "install:all": "npm install && cd client && npm install"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "@octokit/auth-app": "^7.0.0",
    "@octokit/rest": "^21.0.0",
    "bullmq": "^5.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "ioredis": "^5.3.0",
    "mongoose": "^8.0.0"
  },
  "devDependencies": {
    "concurrently": "^8.0.0",
    "nodemon": "^3.0.0"
  }
}
```

Client `package.json` dependencies: `react`, `react-dom`, `react-router-dom`, `recharts`
Client devDependencies: `vite`, `@vitejs/plugin-react`

---

### 8.4 .gitignore

```
node_modules/
client/node_modules/
.env
*.pem
/tmp/autoqa-*
dist/
client/dist/
```

---

## 9. PR Comment Format

```markdown
## AutoQA Results

**Status**: ✅ 12 passed / ❌ 2 failed
**Coverage score**: 74%
**Security risk**: 🟡 medium

### Security findings (3)
| Severity | File | Issue |
|----------|------|-------|
| 🔴 critical | routes/auth.js:42 | Missing input validation on email field |
| 🟡 medium | models/User.js:18 | Potential NoSQL injection |
| 🔵 low | utils/helpers.js:7 | Hardcoded timeout value |

### Coverage gaps (2 high priority)
- `validateToken()` in `middleware/auth.js` — no tests for expired token case
- `POST /api/orders` in `routes/orders.js` — no test for payment failure path

---
*Generated by AutoQA in 47s · [View full report](http://localhost:5173/runs/abc123)*
```

---

## 10. How to Run

```bash
# 1. Copy and fill environment variables
cp .env.example .env

# 2. Start Redis and MongoDB
docker-compose up -d

# 3. Install all dependencies
npm run install:all

# 4. Start server + client together
npm run dev

# Server:    http://localhost:3001
# Dashboard: http://localhost:5173
# Health:    http://localhost:3001/api/health
```

### GitHub App Setup

1. Go to **GitHub Settings → Developer Settings → GitHub Apps → New GitHub App**
2. Set webhook URL to `https://your-ngrok-url.ngrok.io/webhook` (use ngrok for local dev: `ngrok http 3001`)
3. **Permissions needed:**
   - Repository: Pull requests → Read & Write
   - Repository: Contents → Read & Write
   - Repository: Commit statuses → Read & Write
4. **Subscribe to events:** Pull request
5. After creating, download the private key `.pem` file
6. Base64 encode it: `base64 -i private-key.pem` and paste into `.env`
7. Install the App on a test repo — the `installationId` arrives automatically in the webhook payload

### Local Testing Without GitHub

To test the pipeline locally without setting up a GitHub App, create a test script:

```javascript
// test-pipeline.js
import { addJob } from './server/queue/index.js'

await addJob({
  runId: 'test-run-id',
  sha: 'abc1234',
  prNumber: 1,
  repo: 'your-username/your-repo',
  branch: 'feature/test-branch',
  installationId: 12345
})
console.log('Job added to queue')
```

---

