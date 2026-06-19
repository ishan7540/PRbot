import Anthropic from '@anthropic-ai/sdk'
import config from '../config/index.js'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

const systemPrompt = `You are a QA orchestration agent. Analyze Git diffs and plan testing work.
Return ONLY valid JSON matching this exact schema. No markdown, no explanation, no backticks:
{
  "changedFiles": [{ "path": string, "changeType": "added|modified|deleted", "summary": string }],
  "functionsChanged": [{ "name": string, "file": string, "isAsync": boolean, "hasDBCall": boolean, "hasExternalCall": boolean }],
  "routesChanged": [{ "method": string, "path": string, "file": string, "isAuthProtected": boolean }],
  "securitySensitiveAreas": [{ "file": string, "reason": string, "severity": "high|medium|low" }],
  "untestedRisk": [{ "file": string, "reason": string }],
  "testingStrategy": {
    "needsUnitTests": boolean,
    "needsE2ETests": boolean,
    "needsAPITests": boolean,
    "suggestedTestFiles": [string]
  }
}`

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
        `Orchestrator returned invalid JSON after retry. Raw: ${text.slice(0, 200)}`
      )
    }
    return callWithRetry(
      userContent,
      '\n\nIMPORTANT: Return ONLY valid JSON. No other text whatsoever.'
    )
  }
}

/**
 * Analyze a diff and produce a structured testing plan.
 */
export async function orchestrate(diff) {
  console.log('[Orchestrator] Analyzing diff...')
  const plan = await callWithRetry(`Analyze this diff:\n\n${diff}`)
  console.log(
    `[Orchestrator] Found ${plan.changedFiles?.length || 0} changed files, ${plan.functionsChanged?.length || 0} functions`
  )
  return plan
}
