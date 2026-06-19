# PRbøt

**AI-powered GitHub PR testing agent** — Automatically analyzes, tests, and secures your pull requests.

When a developer opens or updates a PR, PRbøt's multi-agent pipeline kicks in:

1.  **Analyzes** the code diff (Orchestrator — Claude Haiku)
2.  **Generates** Jest/Playwright tests (Test Writer — Claude Sonnet)
3.  **Scans** for security vulnerabilities (Security Scanner — Claude Sonnet)
4.  **Identifies** untested code paths (Coverage Analyst — Claude Haiku)
5.  **Executes** tests in an isolated Docker sandbox
6.  **Posts** a detailed report as a PR comment + sets commit status

---

## Architecture

```
GitHub PR → Webhook → Express → BullMQ Queue → Worker Pipeline
                                                    │
                                    ┌───────────────┼───────────────┐
                                    │               │               │
                              Test Writer    Security Scanner  Coverage Analyst
                             (Sonnet 4.6)    (Sonnet 4.6)      (Haiku 4.5)
                                    │               │               │
                                    └───────────────┼───────────────┘
                                                    │
                                              Docker Sandbox
                                              (Jest runner)
                                                    │
                                            ┌───────┴───────┐
                                            │               │
                                       PR Comment     Commit Status
                                                    
React Dashboard ←── REST API ←── MongoDB
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js (ES Modules) |
| Database | MongoDB + Mongoose |
| Queue | Redis + BullMQ |
| AI | Anthropic Claude (Haiku + Sonnet) |
| GitHub | Octokit + GitHub App Auth |
| Sandbox | Docker (network-isolated) |
| Frontend | React 18, Vite, Recharts |
| Styling | Vanilla CSS (dark glassmorphism) |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/ishan7540/PRbot-.git
cd PRbot-
npm run install:all

# 2. Configure environment
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_BASE64, GITHUB_WEBHOOK_SECRET

# 3. Start infrastructure
docker-compose up -d

# 4. Run dev servers
npm run dev
# Server:    http://localhost:3001
# Dashboard: http://localhost:5173

# 5. Expose for webhooks (local dev)
ngrok http 3001
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude agents |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | Base64-encoded `.pem` private key |
| `GITHUB_WEBHOOK_SECRET` | Webhook signature secret |
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `PORT` | Server port (default: 3001) |
| `SANDBOX_TIMEOUT_MS` | Docker sandbox timeout (default: 90000) |

## Project Structure

```
├── server/
│   ├── index.js              # Express entry point
│   ├── config/index.js       # Environment config
│   ├── models/Run.js         # Mongoose schema
│   ├── routes/
│   │   ├── webhook.js        # GitHub webhook receiver
│   │   └── api.js            # REST API + Claude chat
│   ├── queue/
│   │   ├── index.js          # BullMQ queue
│   │   └── worker.js         # Pipeline worker
│   ├── agents/
│   │   ├── orchestrator.js   # Diff analyzer (Haiku)
│   │   ├── testWriter.js     # Test generator (Sonnet)
│   │   ├── securityScanner.js # Vuln scanner (Sonnet)
│   │   └── coverageAnalyst.js # Coverage gaps (Haiku)
│   ├── github/client.js      # GitHub App client
│   ├── sandbox/runner.js     # Docker test runner
│   └── utils/formatComment.js # PR comment formatter
├── client/
│   ├── src/
│   │   ├── pages/            # Dashboard, RunDetail
│   │   └── components/       # Charts, Table, Chat
│   └── vite.config.js
├── docker-compose.yml        # Redis + MongoDB
└── docker/sandbox.Dockerfile
```

## GitHub App Setup

1. Create a GitHub App at [github.com/settings/apps/new](https://github.com/settings/apps/new)
2. Permissions: Pull requests (R/W), Contents (R/W), Commit statuses (R/W)
3. Subscribe to: Pull request events
4. Generate a private key and base64 encode it:
   ```bash
   base64 -i private-key.pem | tr -d '\n'
   ```
5. Install the app on your target repos
