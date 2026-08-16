import { jest } from '@jest/globals'

// Mock the config module before importing validate
const mockConfig = {
  openaiApiKey: '',
  anthropicApiKey: '',
  github: {
    appId: '',
    privateKey: '',
    webhookSecret: '',
  },
  mongodb: { uri: 'mongodb://localhost:27017/prbot' },
  redis: { url: 'redis://localhost:6379' },
  port: 3001,
  sandboxTimeoutMs: 90000,
  maxConcurrentJobs: 2,
  agent: { maxIterations: 3, maxTestFiles: 10 },
}

jest.unstable_mockModule('../config/index.js', () => ({
  default: mockConfig,
}))

const { validateConfig } = await import('../config/validate.js')

describe('Config Validation', () => {
  // Suppress console output during tests
  const originalLog = console.log
  const originalError = console.error

  beforeEach(() => {
    console.log = jest.fn()
    console.error = jest.fn()
  })

  afterEach(() => {
    console.log = originalLog
    console.error = originalError
  })

  test('throws when no AI provider is configured', () => {
    mockConfig.openaiApiKey = ''
    mockConfig.anthropicApiKey = ''
    mockConfig.github.appId = '12345'
    mockConfig.github.privateKey = 'test-key'
    mockConfig.github.webhookSecret = 'test-secret'

    expect(() => validateConfig()).toThrow('Missing required environment variables')
  })

  test('passes when Anthropic key is configured', () => {
    mockConfig.anthropicApiKey = 'sk-ant-test-key'
    mockConfig.openaiApiKey = ''
    mockConfig.github.appId = '12345'
    mockConfig.github.privateKey = 'test-key'
    mockConfig.github.webhookSecret = 'test-secret'

    expect(() => validateConfig()).not.toThrow()
  })

  test('passes when OpenAI key is configured', () => {
    mockConfig.openaiApiKey = 'sk-test-key'
    mockConfig.anthropicApiKey = ''
    mockConfig.github.appId = '12345'
    mockConfig.github.privateKey = 'test-key'
    mockConfig.github.webhookSecret = 'test-secret'

    expect(() => validateConfig()).not.toThrow()
  })

  test('throws when GitHub App ID is missing', () => {
    mockConfig.openaiApiKey = 'sk-test-key'
    mockConfig.github.appId = ''
    mockConfig.github.privateKey = 'test-key'
    mockConfig.github.webhookSecret = 'test-secret'

    expect(() => validateConfig()).toThrow('GITHUB_APP_ID')
  })

  test('throws when GitHub private key is missing', () => {
    mockConfig.openaiApiKey = 'sk-test-key'
    mockConfig.github.appId = '12345'
    mockConfig.github.privateKey = ''
    mockConfig.github.webhookSecret = 'test-secret'

    expect(() => validateConfig()).toThrow('GITHUB_APP_PRIVATE_KEY')
  })

  test('throws when webhook secret is missing', () => {
    mockConfig.openaiApiKey = 'sk-test-key'
    mockConfig.github.appId = '12345'
    mockConfig.github.privateKey = 'test-key'
    mockConfig.github.webhookSecret = ''

    expect(() => validateConfig()).toThrow('GITHUB_WEBHOOK_SECRET')
  })

  test('does not log actual secret values', () => {
    mockConfig.openaiApiKey = 'sk-super-secret-key-12345'
    mockConfig.anthropicApiKey = ''
    mockConfig.github.appId = '12345'
    mockConfig.github.privateKey = 'private-key-content'
    mockConfig.github.webhookSecret = 'webhook-secret-value'

    validateConfig()

    const allOutput = console.log.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(allOutput).not.toContain('sk-super-secret-key-12345')
    expect(allOutput).not.toContain('private-key-content')
    expect(allOutput).not.toContain('webhook-secret-value')
  })
})
