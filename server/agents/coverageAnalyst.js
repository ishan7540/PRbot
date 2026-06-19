import Anthropic from '@anthropic-ai/sdk'
import config from '../config/index.js'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

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

async function callWithRetry(userContent, extraInstruction = '') {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userContent + extraInstruction },
    ],
  })

  const text = response.content[0].text.trim()

  try {
    return JSON.parse(text)
  } catch {
    if (extraInstruction) {
      throw new Error(
        `CoverageAnalyst returned invalid JSON after retry. Raw: ${text.slice(0, 200)}`
      )
    }
    return callWithRetry(
      userContent,
      '\n\nIMPORTANT: Return ONLY valid JSON. No other text whatsoever.'
    )
  }
}

/**
 * Analyze coverage gaps in changed code.
 */
export async function analyzeCoverage(diff, plan, existingTests) {
  console.log('[CoverageAnalyst] Analyzing coverage gaps...')

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

  const result = await callWithRetry(userMessage)
  console.log(
    `[CoverageAnalyst] Found ${result.gaps?.length || 0} gaps — score: ${result.coverageScore}`
  )
  return result
}
