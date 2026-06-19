import Anthropic from '@anthropic-ai/sdk'
import config from '../config/index.js'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

const systemPrompt = `You are a test writing agent for a Node.js/Express application.

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
}`

async function callWithRetry(userContent, extraInstruction = '') {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
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
        `TestWriter returned invalid JSON after retry. Raw: ${text.slice(0, 200)}`
      )
    }
    return callWithRetry(
      userContent,
      '\n\nIMPORTANT: Return ONLY valid JSON. No other text whatsoever.'
    )
  }
}

/**
 * Generate test files based on the orchestrator's plan.
 */
export async function generateTests(diff, plan, existingTests) {
  console.log('[TestWriter] Generating tests...')

  const testStyleExample =
    existingTests.length > 0
      ? existingTests
          .slice(0, 2)
          .map((t) => `// ${t.path}\n${t.content}`)
          .join('\n\n---\n\n')
      : 'No existing tests found. Use standard Jest conventions.'

  const userMessage = `Changed functions: ${JSON.stringify(plan.functionsChanged || [])}
Changed routes: ${JSON.stringify(plan.routesChanged || [])}
Testing strategy: ${JSON.stringify(plan.testingStrategy || {})}

Diff:
${diff}

Existing test style example:
${testStyleExample}`

  const result = await callWithRetry(userMessage)
  console.log(
    `[TestWriter] Generated ${result.testFiles?.length || 0} test files`
  )
  return result
}
