import Anthropic from '@anthropic-ai/sdk'
import config from '../config/index.js'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

const systemPrompt = `You are a security analysis agent specializing in Node.js/Express applications.

Scan the diff for:
- NoSQL injection (unparameterized MongoDB queries, $where usage)
- Missing express-validator or manual validation on new routes
- Hardcoded secrets, tokens, passwords in code
- Missing auth middleware on new routes that should be protected
- Insecure direct object references (user-supplied IDs without ownership check)
- Dangerous functions: eval(), new Function(), child_process with user input
- Newly added npm packages (flag for manual CVE review)
- Missing rate limiting on sensitive endpoints

Return ONLY valid JSON, no markdown, no backticks:
{
  "findings": [
    {
      "type": string,
      "file": string,
      "line": number,
      "severity": "critical|high|medium|low|info",
      "description": string,
      "recommendation": string,
      "codeSnippet": string
    }
  ],
  "summary": string,
  "overallRisk": "critical|high|medium|low|clean"
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
        `SecurityScanner returned invalid JSON after retry. Raw: ${text.slice(0, 200)}`
      )
    }
    return callWithRetry(
      userContent,
      '\n\nIMPORTANT: Return ONLY valid JSON. No other text whatsoever.'
    )
  }
}

/**
 * Scan a diff for security vulnerabilities.
 */
export async function scanSecurity(diff, plan) {
  console.log('[SecurityScanner] Scanning for vulnerabilities...')

  const userMessage = `Security sensitive areas identified by orchestrator:
${JSON.stringify(plan.securitySensitiveAreas || [])}

Full diff:
${diff}`

  const result = await callWithRetry(userMessage)
  console.log(
    `[SecurityScanner] Found ${result.findings?.length || 0} findings — risk: ${result.overallRisk}`
  )
  return result
}
