import { formatPRComment } from '../utils/formatComment.js'

describe('formatPRComment', () => {
  const baseRun = {
    duration: 15000,
  }

  const baseSandbox = {
    passed: 5,
    failed: 0,
    total: 5,
  }

  const baseSecurity = {
    findings: [],
    summary: 'No issues found',
    overallRisk: 'clean',
  }

  const baseCoverage = {
    gaps: [],
    coverageScore: 85,
    summary: 'Good coverage',
  }

  test('generates markdown comment with all sections', () => {
    const comment = formatPRComment(
      baseRun,
      baseSandbox,
      baseSecurity,
      baseCoverage,
      'run-123'
    )

    expect(comment).toContain('PRbøt Results')
    expect(comment).toContain('5 passed')
    expect(comment).toContain('0 failed')
    expect(comment).toContain('85%')
    expect(comment).toContain('clean')
    expect(comment).toContain('15s')
  })

  test('shows failure icon when tests fail', () => {
    const sandbox = { ...baseSandbox, failed: 2 }
    const comment = formatPRComment(
      baseRun,
      sandbox,
      baseSecurity,
      baseCoverage,
      'run-123'
    )

    expect(comment).toContain('❌')
  })

  test('shows success icon when all tests pass', () => {
    const comment = formatPRComment(
      baseRun,
      baseSandbox,
      baseSecurity,
      baseCoverage,
      'run-123'
    )

    expect(comment).toContain('✅')
  })

  test('includes security findings table when findings exist', () => {
    const security = {
      ...baseSecurity,
      findings: [
        {
          type: 'injection',
          file: 'api.js',
          line: 10,
          severity: 'high',
          description: 'Unvalidated input used in query',
          recommendation: 'Use parameterized queries',
          codeSnippet: 'db.find({id: req.params.id})',
        },
      ],
      overallRisk: 'high',
    }

    const comment = formatPRComment(
      baseRun,
      baseSandbox,
      security,
      baseCoverage,
      'run-123'
    )

    expect(comment).toContain('Security findings')
    expect(comment).toContain('api.js')
    expect(comment).toContain('Unvalidated input')
  })

  test('includes high-priority coverage gaps', () => {
    const coverage = {
      ...baseCoverage,
      gaps: [
        {
          file: 'utils.js',
          functionOrBlock: 'calculateTotal',
          reason: 'No tests for edge cases',
          suggestedTestDescription: 'Test with empty array input',
          priority: 'high',
        },
      ],
    }

    const comment = formatPRComment(
      baseRun,
      baseSandbox,
      baseSecurity,
      coverage,
      'run-123'
    )

    expect(comment).toContain('Coverage gaps')
    expect(comment).toContain('calculateTotal')
  })

  test('handles null/undefined duration gracefully', () => {
    const run = { ...baseRun, duration: null }
    const comment = formatPRComment(
      run,
      baseSandbox,
      baseSecurity,
      baseCoverage,
      'run-123'
    )

    expect(comment).toContain('N/A')
  })
})
