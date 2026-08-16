import { createJSONCompletion, getProvider } from '../config/ai.js'

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

/**
 * Analyze a diff and produce a structured testing plan.
 */
export async function orchestrate(diff) {
  console.log(`[Orchestrator] Analyzing diff (provider: ${getProvider()})...`)

  const plan = await createJSONCompletion({
    system: systemPrompt,
    userMessage: `Analyze this diff:\n\n${diff}`,
    model: 'fast',
  })

  console.log(
    `[Orchestrator] Found ${plan.changedFiles?.length || 0} changed files, ${plan.functionsChanged?.length || 0} functions`
  )
  return plan
}
