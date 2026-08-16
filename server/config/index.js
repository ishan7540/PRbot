import dotenv from 'dotenv'
dotenv.config()

export default {
  // AI providers (at least one required — OpenAI takes priority if both set)
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,

  // Model overrides
  models: {
    fast: process.env.OPENAI_MODEL_FAST || 'gpt-5.6-luna',
    smart: process.env.OPENAI_MODEL_SMART || 'gpt-5.6-luna',
    anthropicFast: 'claude-haiku-4-5',
    anthropicSmart: 'claude-sonnet-4-6',
  },

  github: {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    appId: process.env.GITHUB_APP_ID,
    privateKey: Buffer.from(
      process.env.GITHUB_APP_PRIVATE_KEY_BASE64 || '',
      'base64'
    ).toString('utf-8'),
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/prbot',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  port: parseInt(process.env.PORT, 10) || 3001,
  sandboxTimeoutMs: parseInt(process.env.SANDBOX_TIMEOUT_MS, 10) || 90000,
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS, 10) || 2,

  // Agent iteration limits
  agent: {
    maxIterations: parseInt(process.env.MAX_AGENT_ITERATIONS, 10) || 3,
    maxTestFiles: parseInt(process.env.MAX_TEST_FILES, 10) || 10,
  },
}
