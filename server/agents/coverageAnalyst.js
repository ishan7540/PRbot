import { createJSONCompletion, getProvider } from '../config/ai.js'

const systemPrompt = `You are a test coverage analyst for Node.js applications.

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

coverageScore: 0-100, your estimate of how much new code is covered.`

/**
 * Analyze coverage gaps in changed code.
 */
export async function analyzeCoverage(diff, plan, existingTests) {
  console.log(`[CoverageAnalyst] Analyzing coverage gaps (provider: ${getProvider()})...`)

  const testPaths =
    existingTests.length > 0
      ? existingTests.map((t) => t.path).join('\n')
      : 'No existing tests found.'

  const userMessage = `Changed functions:
${JSON.stringify(plan.functionsChanged || [])}

Untested risk areas:
${JSON.stringify(plan.untestedRisk || [])}

Existing test files:
${testPaths}

Diff:
${diff}`

  const result = await createJSONCompletion({
    system: systemPrompt,
    userMessage,
    model: 'fast',
  })

  console.log(
    `[CoverageAnalyst] Found ${result.gaps?.length || 0} gaps — score: ${result.coverageScore}`
  )
  return result
}
