import dotenv from 'dotenv'
dotenv.config()

export default {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
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
}
