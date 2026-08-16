# PRbøt — Local Setup Guide

> **PRbøt** is an AI-powered GitHub PR testing agent. When a developer opens or updates a pull request, PRbøt automatically analyzes the code changes, generates tests, executes them in an isolated Docker sandbox, and reports results back to the PR.

---

## 1. What This Project Does

PRbøt connects to a GitHub repository via a **GitHub App**. When a pull request is opened or updated, GitHub sends a webhook to PRbøt's server. The server:

1. **Receives** the webhook and verifies its signature
2. **Queues** a job via BullMQ (backed by Redis)
3. **Fetches** the PR diff and repository context via GitHub API
4. **Analyzes** the diff with an orchestrator AI agent
5. **Runs three specialist agents in parallel**: test writer, security scanner, coverage analyst
6. **Executes** generated tests in a network-isolated Docker sandbox
7. **Iterates** — if tests fail due to test bugs, the agent fixes them and re-runs (up to 3 iterations)
8. **Reports** results as a PR comment and commit status check

A React dashboard provides a web UI for viewing run history, results, and chatting with the AI about specific runs.

---

## 2. Architecture

```
                    GitHub
                      │
                      │ PR Event (opened/synchronize)
                      ▼
              ┌─────────────────┐
              │ GitHub Webhook  │  POST /webhook
              │ (Express route) │
              └────────┬────────┘
                       │ Verifies X-Hub-Signature-256
                       │ Creates Run doc in MongoDB
                       │ Enqueues job via BullMQ
                       ▼
              ┌─────────────────┐
              │  Redis/BullMQ   │  prbot-jobs queue
              │  Job Queue      │  2 retries, exponential backoff
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────────────────────────────────┐
              │              BullMQ Worker                  │
              │                                             │
              │  1. getOctokit(installationId)              │
              │  2. getDiff(pr) → truncate 50k chars        │
              │  3. getExistingTests(sha) → up to 5 files   │
              │  4. orchestrate(diff) → structured plan     │
              │  5. Run in parallel:                         │
              │     ├── iterateTests (generate→run→fix loop)│
              │     ├── scanSecurity(diff, plan)             │
              │     └── analyzeCoverage(diff, plan, tests)   │
              │  6. commitGeneratedTests → PR branch         │
              │  7. Save results to MongoDB                  │
              │  8. Post PR comment + commit status           │
              └─────────────────────────────────────────────┘

              ┌──────────────────────────┐
              │   React Dashboard        │
              │   (Vite, port 5173)      │
              │                          │
              │  - Run history table     │
              │  - Trend chart           │
              │  - Security donut chart  │
              │  - Run detail view       │
              │  - "Ask about run" chat  │
              └──────────────────────────┘
```

---

## 3. How the GitHub Testing Agent Works

### Agent Pipeline

```
Orchestrator (fast model)
    │
    │  Structured JSON plan:
    │    - changed files
    │    - changed functions
    │    - changed routes
    │    - security-sensitive areas
    │    - testing strategy
    │
    ├───────────────────────────────────────────┐
    │                   │                       │
    ▼                   ▼                       ▼
Test Writer         Security Scanner      Coverage Analyst
(smart model)       (smart model)          (fast model)
    │                   │                       │
    │ testFiles[]       │ findings[]            │ gaps[]
    │                   │ overallRisk            │ coverageScore
    │                   │                       │
    └───────────────────┼───────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │ Iteration Loop  │
              │                 │
              │ Generate tests  │
              │ Run in sandbox  │
              │ Analyze failures│
              │ Fix test bugs   │
              │ Re-run (max 3x) │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Results        │
              │  PR Comment     │
              │  Commit Status  │
              └─────────────────┘
```

### AI Provider Support

PRbøt supports **dual AI providers**:

| Provider | Fast Model | Smart Model | Use Case |
|----------|-----------|-------------|----------|
| **OpenAI** | gpt-5.6-luna | gpt-5.6-luna | Orchestrator, coverage → fast; Test writer, security → smart |
| **Anthropic** | claude-haiku-4-5 | claude-sonnet-4-6 | Same routing as OpenAI |

Set **one or both** API keys in your `.env`. If both are set, OpenAI takes priority.

---

## 4. Prerequisites

- **Node.js** ≥ 20 (tested with v25.3.0)
- **npm** ≥ 9
- **Docker** (for Redis, MongoDB, and the test sandbox)
- **Git**
- A **GitHub account** with permission to create GitHub Apps
- An **OpenAI API key** (from [platform.openai.com](https://platform.openai.com/api-keys))
  - OR an **Anthropic API key** (from [console.anthropic.com](https://console.anthropic.com/settings/keys))
- **ngrok** or another tunnel for exposing localhost to GitHub webhooks

---

## 5. Clone the Repository

```bash
git clone https://github.com/ishan7540/PRbot-.git
cd PRbot-
```

---

## 6. Install Dependencies

```bash
# Install server + client dependencies
npm run install:all
```

This runs `npm install` in the root (server) and `cd client && npm install` (React dashboard).

---

## 7. Environment Variables

Copy the template:

```bash
cp .env.example .env
```

### Complete Variable Reference

| Variable | Required | Component | Purpose | Where to Obtain |
|----------|----------|-----------|---------|-----------------|
| `OPENAI_API_KEY` | One AI key required | AI agents | OpenAI authentication | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | One AI key required | AI agents | Anthropic authentication | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `OPENAI_MODEL_FAST` | No | AI agents | Override fast model (default: gpt-5.6-luna) | N/A |
| `OPENAI_MODEL_SMART` | No | AI agents | Override smart model (default: gpt-5.6-luna) | N/A |
| `GITHUB_APP_ID` | **Yes** | GitHub integration | GitHub App identity | GitHub App settings page |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | **Yes** | GitHub integration | Authenticate as GitHub App | Base64-encode the .pem file |
| `GITHUB_WEBHOOK_SECRET` | **Yes** | Webhook | Verify webhook signatures | Generate yourself |
| `MONGODB_URI` | No | Database | MongoDB connection (default: `mongodb://localhost:27017/prbot`) | Local Docker or cloud |
| `REDIS_URL` | No | Queue | Redis connection (default: `redis://localhost:6379`) | Local Docker or cloud |
| `PORT` | No | Server | HTTP port (default: `3001`) | N/A |
| `NODE_ENV` | No | Server | Environment (default: `development`) | N/A |
| `SANDBOX_TIMEOUT_MS` | No | Sandbox | Docker test timeout (default: `90000` = 90s) | N/A |
| `MAX_CONCURRENT_JOBS` | No | Queue | BullMQ concurrency (default: `2`) | N/A |
| `MAX_AGENT_ITERATIONS` | No | Agent | Max generate→run→fix loops (default: `3`) | N/A |
| `MAX_TEST_FILES` | No | Agent | Max test files per run (default: `10`) | N/A |

### Security Notes

- **Never commit `.env`** — it is already in `.gitignore`
- **Never log secret values** — the config validator shows `✓ configured` / `✗ missing` only
- Secrets are: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`

---

## 8. Create and Configure the GitHub App

### Step 1: Create the App

1. Go to [github.com/settings/apps/new](https://github.com/settings/apps/new)
2. Fill in:
   - **GitHub App name**: `PRbot-YourName` (must be globally unique)
   - **Homepage URL**: `http://localhost:3001`
   - **Webhook URL**: Leave blank for now (you'll set this after configuring ngrok)
   - **Webhook secret**: Generate one:
     ```bash
     openssl rand -hex 32
     ```
     Save this value — you'll use it for both GitHub and your `.env`
3. Set **Webhook Active** = ✓ (checked)

### Step 2: Configure Permissions

Set these **Repository permissions** (minimum required):

| Permission | Access | Why Needed |
|-----------|--------|-----------|
| **Contents** | Read & Write | Read source files, commit generated tests |
| **Pull requests** | Read & Write | Read PR data, post comments |
| **Commit statuses** | Read & Write | Set pass/fail status checks |
| **Metadata** | Read-only | Required for all GitHub Apps (auto-granted) |

### Step 3: Subscribe to Events

Under **Subscribe to events**, check:
- ✅ **Pull request**

### Step 4: Create the App

- Select **Only on this account** (for development)
- Click **Create GitHub App**

### Step 5: Note the App ID

After creation, you'll be on the app settings page. Note the **App ID** (a number like `123456`).

### Step 6: Generate a Private Key

1. Scroll down to **Private keys**
2. Click **Generate a private key**
3. A `.pem` file will download
4. Base64-encode it:
   ```bash
   base64 -i ~/Downloads/your-app-name.YYYY-MM-DD.private-key.pem | tr -d '\n'
   ```
5. Paste the output into your `.env` as `GITHUB_APP_PRIVATE_KEY_BASE64`

### Step 7: Update `.env`

```bash
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY_BASE64=LS0tLS1CRUdJTi...base64...
GITHUB_WEBHOOK_SECRET=your-generated-hex-secret
```

---

## 9. Install the GitHub App on a Test Repository

1. Go to your GitHub App settings page
2. Click **Install App** in the left sidebar
3. Select your account
4. Choose **Only select repositories**
5. Select your test repository
6. Click **Install**

The `installationId` is automatically extracted from webhook payloads — you don't need to configure it manually.

---

## 10. Configure the GitHub Webhook

The webhook URL tells GitHub where to send PR events. Since you're running locally, you need a tunnel.

### Webhook Endpoint

PRbøt's webhook endpoint is:

```
POST /webhook
```

So the full webhook URL will be:

```
https://<your-tunnel-domain>/webhook
```

---

## 11. Expose localhost to GitHub

### Option A: ngrok (Recommended)

```bash
# Install ngrok
brew install ngrok

# Authenticate (one-time, free account at ngrok.com)
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start tunnel to PRbøt server
ngrok http 3001
```

ngrok will show a URL like:
```
Forwarding: https://a1b2c3d4.ngrok-free.app → http://localhost:3001
```

### Option B: GitHub CLI Webhook Forwarding

```bash
# Install GitHub CLI extension
gh extension install cli/gh-webhook

# Forward webhooks
gh webhook forward --repo=OWNER/REPO --events=pull_request --url=http://localhost:3001/webhook --secret=YOUR_WEBHOOK_SECRET
```

### Option C: Cloudflare Tunnel

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Quick tunnel (no account needed)
cloudflared tunnel --url http://localhost:3001
```

### After Getting the Tunnel URL

1. Go to your GitHub App settings
2. Under **General** → **Webhook URL**, enter:
   ```
   https://your-tunnel-domain.ngrok-free.app/webhook
   ```
3. Ensure **Webhook secret** matches your `.env` `GITHUB_WEBHOOK_SECRET`
4. Click **Save changes**

### Webhook Flow

```
GitHub PR Event
       │
       ▼
https://a1b2c3.ngrok-free.app/webhook
       │
       ▼ (tunnel)
http://localhost:3001/webhook
       │
       ▼
Express webhook handler
       │ Verify signature
       │ Create Run document
       │ Enqueue BullMQ job
       ▼
Worker processes the PR
```

---

## 12. Start the Agent

### Step 1: Start Infrastructure

```bash
# Start Redis and MongoDB
docker compose up -d

# Verify they're running
docker compose ps
```

### Step 2: Validate Configuration

```bash
# Check all env vars are set
node server/index.js
# Should print the config table with all ✓ marks
```

### Step 3: Start Development Servers

```bash
# Start both server (port 3001) and client (port 5173)
npm run dev
```

Or individually:

```bash
# Server only
npm run dev:server

# Client only (separate terminal)
npm run dev:client
```

---

## 13. Verify the Agent

### Health Check

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "ok",
  "mongo": 1,
  "queue": { "waiting": 0, "active": 0, "completed": 0, "failed": 0 }
}
```

### Dashboard

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 14. Create a Test PR

### Step 1: Create a Test Repository

Create a new repository (or use an existing one) with a simple Node.js project:

```bash
mkdir test-prbot-repo && cd test-prbot-repo
git init
npm init -y
```

Create a simple source file:

```javascript
// src/calculator.js
export function add(a, b) {
  return a + b
}

export function subtract(a, b) {
  return a - b
}
```

```bash
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USER/test-prbot-repo.git
git push -u origin main
```

### Step 2: Install the GitHub App

Install your PRbøt GitHub App on this repository (see Section 9).

### Step 3: Create a Branch and Make Changes

```bash
git checkout -b test-agent-demo
```

Edit `src/calculator.js`:

```javascript
// src/calculator.js
export function add(a, b) {
  return a + b
}

export function subtract(a, b) {
  return a - b
}

// NEW: Add multiply function
export function multiply(a, b) {
  return a * b
}

// NEW: Add divide function with error handling
export function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero')
  }
  return a / b
}
```

```bash
git add -A
git commit -m "Add multiply and divide functions"
git push -u origin test-agent-demo
```

### Step 4: Open a PR

Go to GitHub and create a Pull Request from `test-agent-demo` → `main`.

---

## 15. Watch the Agent Process the PR

### What Happens

1. GitHub sends a `pull_request` webhook to your tunnel URL
2. Your local server receives it at `POST /webhook`
3. The server verifies the signature and creates a Run document
4. A BullMQ job is queued
5. The worker picks up the job and:
   - Fetches the diff
   - Runs the orchestrator agent
   - Runs test writer, security scanner, and coverage analyst in parallel
   - Executes tests in Docker
   - Posts results as a PR comment

### Monitor the Process

Watch the server terminal output:

```
[Webhook] PR #1 on your-user/test-prbot-repo — Run 6789... queued
[Worker] Job 1: Running orchestrator...
[Orchestrator] Analyzing diff (provider: openai)...
[Orchestrator] Found 1 changed files, 2 functions
[Worker] Job 1: Running agents...
[TestWriter] Generating tests (provider: openai)...
[SecurityScanner] Scanning for vulnerabilities (provider: openai)...
[CoverageAnalyst] Analyzing coverage gaps (provider: openai)...
[IterationRunner] Iteration 1/3
[IterationRunner] Running 2 test files in sandbox...
[IterationRunner] All 8 tests passed on iteration 1
[GitHub] Committed 2 test files to test-agent-demo
[Worker] Job 1: Completed in 45s — passed (1 iteration(s))
```

### Check the PR

Go back to your Pull Request on GitHub. You should see:
- A **commit status check** (`prbot/tests`) showing pass/fail
- A **PR comment** with:
  - Test results (passed/failed counts)
  - Coverage score
  - Security risk assessment
  - Security findings (if any)
  - Coverage gaps (if any)

---

## 16. Run Tests Manually

### Unit Tests

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

---

## 17. Run the Automated Test Suite

The test suite covers:

| Test File | What It Tests |
|-----------|--------------|
| `configValidation.test.js` | Missing env vars, validation logic, no secret leakage |
| `webhook.test.js` | Signature verification, event filtering, PR data extraction |
| `formatComment.test.js` | PR comment markdown generation, edge cases |

```bash
npm test
```

All tests use mocks for external services (no real GitHub/AI/DB calls needed).

---

## 18. OpenAI Configuration

### Setup

1. Get an API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Add to `.env`:
   ```
   OPENAI_API_KEY=sk-proj-...
   ```
3. Optionally override models:
   ```
   OPENAI_MODEL_FAST=gpt-5.6-luna
   OPENAI_MODEL_SMART=gpt-5.6-luna
   ```

### Model Routing

| Agent | Model Tier | Default OpenAI Model | Purpose |
|-------|-----------|---------------------|---------|
| Orchestrator | fast | gpt-5.6-luna | Diff analysis → JSON plan |
| Coverage Analyst | fast | gpt-5.6-luna | Gap identification |
| Test Writer | smart | gpt-5.6-luna | Code generation |
| Security Scanner | smart | gpt-5.6-luna | Vulnerability analysis |
| Dashboard Chat | smart | gpt-5.6-luna | Conversational Q&A |
| Iteration Fixer | smart | gpt-5.6-luna | Test failure analysis & fix |

### Cost Estimate

~$0.03–0.08 per PR run with OpenAI. Under $5/month for active development.

---

## 19. OpenAI Agent Architecture

### Provider Abstraction

The AI provider layer (`server/config/ai.js`) provides:

```javascript
import { createCompletion, createJSONCompletion, getProvider } from './config/ai.js'

// Simple text completion
const text = await createCompletion({
  system: 'You are a helpful assistant.',
  userMessage: 'Explain this code...',
  model: 'smart',  // resolves to gpt-5.6-luna or claude-sonnet-4-6
})

// JSON completion with auto-retry on parse failure
const data = await createJSONCompletion({
  system: 'Return JSON only...',
  userMessage: '...',
  model: 'fast',  // resolves to gpt-5.6-luna or claude-haiku-4-5
})
```

### Provider Selection

- If `OPENAI_API_KEY` is set → OpenAI is used (with `response_format: { type: 'json_object' }`)
- If `ANTHROPIC_API_KEY` is set → Anthropic is used
- If both are set → OpenAI takes priority

---

## 20. Agent Tools

The agents currently operate through **structured JSON prompts** rather than OpenAI function calling. Each agent:

1. Receives context (diff, plan, existing tests) as a structured user message
2. Returns structured JSON matching a defined schema
3. Has automatic retry on JSON parse failure

### Agent Capabilities

| Agent | Input | Output | Model |
|-------|-------|--------|-------|
| **Orchestrator** | Raw diff | Changed files, functions, routes, testing strategy | fast |
| **Test Writer** | Diff + plan + existing tests | `testFiles[]` with path, content, type | smart |
| **Security Scanner** | Diff + plan | `findings[]` with severity, recommendation | smart |
| **Coverage Analyst** | Diff + plan + existing tests | `gaps[]` with priority, coverage score | fast |
| **Iteration Fixer** | Diff + failed tests + failure output | `fixedTestFiles[]` + `codeIssues[]` | smart |

### Infrastructure Functions (Not AI-Controlled)

| Function | Module | Purpose |
|----------|--------|---------|
| `getOctokit(installationId)` | `github/client.js` | Authenticated GitHub API client |
| `getDiff(octokit, repo, prNumber)` | `github/client.js` | Fetch PR diff |
| `getExistingTests(octokit, repo, sha)` | `github/client.js` | Fetch up to 5 test files |
| `commitGeneratedTests(...)` | `github/client.js` | Commit tests to PR branch |
| `postPRComment(...)` | `github/client.js` | Post result comment |
| `setCommitStatus(...)` | `github/client.js` | Set commit status check |
| `runSandbox(...)` | `sandbox/runner.js` | Execute tests in Docker |
| `formatPRComment(...)` | `utils/formatComment.js` | Format markdown comment |

---

## 21. Test Execution Architecture

### Sandbox Design

```
Host Machine
    │
    │ docker run --rm --network none --memory 512m --cpus 0.5
    │
    ▼
┌──────────────────────────────────┐
│ Docker Container (node:20-alpine)│
│                                  │
│  /app (mounted from host /tmp/)  │
│    ├── [cloned repo at PR head]  │
│    └── __autoqa__/               │
│         └── [generated tests]    │
│                                  │
│  npm install                     │
│  npx jest __autoqa__/ --json     │
└──────────────────────────────────┘
```

### Security Properties

| Property | Status |
|----------|--------|
| Network isolation | ✅ `--network none` — no internet access |
| Memory limit | ✅ `--memory 512m` |
| CPU limit | ✅ `--cpus 0.5` |
| File descriptor limit | ✅ `--ulimit nofile=1024:1024` |
| Timeout | ✅ Configurable (default 90s), SIGKILL on timeout |
| Auto-cleanup | ✅ `--rm` flag + `/tmp` directory cleanup |
| No secrets access | ⚠️ See note below |

> **Important**: The sandbox does NOT receive `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GITHUB_WEBHOOK_SECRET`. However, it does receive a GitHub installation token (for `git clone`). This token is short-lived and scoped to the installation's permissions.

---

## 22. Security

### Threat Model

| Risk | Mitigation |
|------|-----------|
| AI generates malicious test code | Docker sandbox with network isolation |
| Sandbox escapes to host | Docker resource limits, `--rm`, no privileged mode |
| Webhook spoofing | HMAC SHA-256 signature verification |
| Secret leakage in logs | Config validator never prints secret values |
| Secret leakage in repo | `.gitignore` excludes `.env` and `.pem` files |
| GitHub token in sandbox | Short-lived installation token, scoped permissions |
| Infinite agent loops | `MAX_AGENT_ITERATIONS` limit (default: 3) |
| Excessive resource use | `MAX_CONCURRENT_JOBS` (default: 2), Docker limits |

### Recommendations

1. **Never auto-merge PRs** — PRbøt reports results only, humans decide
2. **Review generated tests** before merging the `__autoqa__/` commit
3. **Rotate GitHub private key** if you suspect it's been compromised
4. **Use read-only permissions** where possible (Contents only needs R/W for committing tests)

---

## 23. Troubleshooting

### Config Validation Fails

```
✗ Missing required configuration: GITHUB_APP_ID
```

**Fix**: Ensure all required variables are set in `.env`. Run:
```bash
node server/index.js
```
to see exactly what's missing.

### Server Can't Connect to MongoDB/Redis

```
[Server] Failed to start: MongooseServerSelectionError
```

**Fix**: Start Docker infrastructure:
```bash
docker compose up -d
docker compose ps  # verify both are "healthy"
```

### Webhook Not Received

1. Check ngrok is running: `ngrok http 3001`
2. Check GitHub App webhook URL matches the ngrok URL
3. Check webhook secret matches in both GitHub App settings and `.env`
4. Check the **Recent Deliveries** tab in GitHub App settings
5. Check server logs for `[Webhook]` entries

### Webhook Signature Fails

```
{"error": "Invalid signature"}
```

**Fix**: Ensure `GITHUB_WEBHOOK_SECRET` in `.env` matches exactly what's in your GitHub App webhook settings.

### Docker Sandbox Fails

```
[Worker] Job failed: Cannot connect to Docker
```

**Fix**: Ensure Docker Desktop is running:
```bash
docker info
```

### AI API Errors

```
Error: 401 Unauthorized
```

**Fix**: Check your API key is valid and has credits:
- OpenAI: [platform.openai.com/usage](https://platform.openai.com/usage)
- Anthropic: [console.anthropic.com/billing](https://console.anthropic.com/billing)

### Test Runner Returns Empty Results

The sandbox runs `npx jest __autoqa__/ --json`. If Jest can't find tests, verify:
1. Generated test files have `.test.js` or `.spec.js` extensions
2. Test files are under the `__autoqa__/` directory
3. The cloned repo has a compatible `package.json`

---

## 24. GitHub Development Workflow

### Making Changes to PRbøt Itself

1. Make changes to server code
2. `nodemon` auto-restarts the server
3. Run tests: `npm test`
4. Test with a real PR on your test repo

### Key Files to Know

| File | Purpose |
|------|---------|
| `server/config/index.js` | All environment config |
| `server/config/validate.js` | Startup validation |
| `server/config/ai.js` | AI provider abstraction |
| `server/routes/webhook.js` | GitHub webhook handler |
| `server/queue/worker.js` | Main processing pipeline |
| `server/agents/orchestrator.js` | Diff analysis agent |
| `server/agents/testWriter.js` | Test generation agent |
| `server/agents/securityScanner.js` | Security scanning agent |
| `server/agents/coverageAnalyst.js` | Coverage analysis agent |
| `server/agents/iterationRunner.js` | Generate→run→fix loop |
| `server/github/client.js` | GitHub API functions |
| `server/sandbox/runner.js` | Docker test executor |
| `server/utils/formatComment.js` | PR comment formatter |
| `server/models/Run.js` | MongoDB schema |

---

## 25. Verification Checklist

### Local Environment

- [ ] Repository cloned
- [ ] `npm run install:all` completed
- [ ] `.env` created from `.env.example`
- [ ] All required env vars set (`node server/index.js` shows all ✓)
- [ ] Docker Desktop running
- [ ] `docker compose up -d` — Redis + MongoDB healthy
- [ ] `npm run dev` starts server on `:3001` and client on `:5173`
- [ ] `curl http://localhost:3001/api/health` returns `{"status":"ok"}`

### GitHub

- [ ] GitHub App created at [github.com/settings/apps](https://github.com/settings/apps)
- [ ] Permissions: Contents (R/W), Pull requests (R/W), Commit statuses (R/W)
- [ ] Subscribed to: Pull request events
- [ ] Private key generated and base64-encoded in `.env`
- [ ] App installed on test repository
- [ ] Webhook URL set to `https://<tunnel>/webhook`
- [ ] Webhook secret matches `.env`
- [ ] Test delivery in GitHub App settings shows 200 response

### OpenAI / Anthropic

- [ ] API key configured in `.env`
- [ ] API key has credits/billing enabled
- [ ] Config validation shows `Active AI Provider: OpenAI` (or `Anthropic`)

### Testing Agent

- [ ] Created a test PR on the test repository
- [ ] Webhook received (check server logs)
- [ ] Orchestrator analyzed the diff
- [ ] Test writer generated tests
- [ ] Security scanner completed
- [ ] Coverage analyst completed
- [ ] Tests executed in Docker sandbox
- [ ] PR comment posted
- [ ] Commit status set

### Tests

- [ ] `npm test` — all tests pass

### Security

- [ ] No secrets in git history: `git log -p | grep -i "sk-" | head`
- [ ] `.env` is in `.gitignore`
- [ ] `.pem` files are in `.gitignore`
- [ ] Config validator doesn't print secret values
- [ ] Docker sandbox has `--network none`
