import config from './index.js'

/**
 * Validate all required configuration at startup.
 * Prints a status table and throws on missing critical config.
 * NEVER prints actual secret values.
 */
export function validateConfig() {
  const checks = [
    // AI Provider — at least one required
    {
      name: 'OPENAI_API_KEY',
      value: config.openaiApiKey,
      required: false,
      group: 'AI Provider',
      note: 'Required if using OpenAI',
    },
    {
      name: 'ANTHROPIC_API_KEY',
      value: config.anthropicApiKey,
      required: false,
      group: 'AI Provider',
      note: 'Required if using Anthropic',
    },
    // GitHub
    {
      name: 'GITHUB_APP_ID',
      value: config.github.appId,
      required: true,
      group: 'GitHub',
    },
    {
      name: 'GITHUB_APP_PRIVATE_KEY',
      value: config.github.privateKey,
      required: true,
      group: 'GitHub',
      note: 'Decoded from GITHUB_APP_PRIVATE_KEY_BASE64',
    },
    {
      name: 'GITHUB_WEBHOOK_SECRET',
      value: config.github.webhookSecret,
      required: true,
      group: 'GitHub',
    },
    // Infrastructure
    {
      name: 'MONGODB_URI',
      value: config.mongodb.uri,
      required: true,
      group: 'Infrastructure',
    },
    {
      name: 'REDIS_URL',
      value: config.redis.url,
      required: true,
      group: 'Infrastructure',
    },
  ]

  console.log('\n┌─────────────────────────────────────────────────┐')
  console.log('│           PRbøt Configuration Check             │')
  console.log('└─────────────────────────────────────────────────┘\n')

  const missing = []
  let currentGroup = ''

  for (const check of checks) {
    if (check.group !== currentGroup) {
      currentGroup = check.group
      console.log(`  ${currentGroup}:`)
    }

    const isSet = Boolean(check.value && check.value.trim && check.value.trim() !== '')
    const status = isSet ? '✓ configured' : '✗ missing'
    const icon = isSet ? '\x1b[32m' : '\x1b[31m' // green / red
    const reset = '\x1b[0m'
    const label = check.name.padEnd(30, '.')
    console.log(`    ${icon}${label} ${status}${reset}`)

    if (!isSet && check.required) {
      missing.push(check.name)
    }
  }

  // Special check: at least one AI provider must be configured
  const hasAI = Boolean(
    (config.openaiApiKey && config.openaiApiKey.trim()) ||
    (config.anthropicApiKey && config.anthropicApiKey.trim())
  )

  if (!hasAI) {
    missing.push('AI_PROVIDER (OPENAI_API_KEY or ANTHROPIC_API_KEY)')
  }

  // Report active AI provider
  const provider = config.openaiApiKey ? 'OpenAI' : config.anthropicApiKey ? 'Anthropic' : 'None'
  console.log(`\n  Active AI Provider: ${provider}`)

  // Agent limits
  console.log(`\n  Agent Limits:`)
  console.log(`    Max iterations ......... ${config.agent.maxIterations}`)
  console.log(`    Max test files ......... ${config.agent.maxTestFiles}`)
  console.log(`    Sandbox timeout ........ ${config.sandboxTimeoutMs}ms`)
  console.log(`    Max concurrent jobs .... ${config.maxConcurrentJobs}`)

  console.log('')

  if (missing.length > 0) {
    console.error(
      '\x1b[31m✗ Missing required configuration:\x1b[0m'
    )
    for (const name of missing) {
      console.error(`  - ${name}`)
    }
    console.error(
      '\nCopy .env.example to .env and fill in the required values:'
    )
    console.error('  cp .env.example .env\n')
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
  }

  console.log('\x1b[32m✓ All required configuration present.\x1b[0m\n')
  return true
}
