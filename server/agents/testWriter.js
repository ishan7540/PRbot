import { createJSONCompletion, getProvider } from '../config/ai.js'

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

/**
 * Generate test files based on the orchestrator's plan.
 */
export async function generateTests(diff, plan, existingTests) {
  console.log(`[TestWriter] Generating tests (provider: ${getProvider()})...`)

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

  const result = await createJSONCompletion({
    system: systemPrompt,
    userMessage,
    model: 'smart',
  })

  console.log(
    `[TestWriter] Generated ${result.testFiles?.length || 0} test files`
  )
  return result
}
