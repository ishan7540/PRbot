import { createJSONCompletion, getProvider } from '../config/ai.js'

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

/**
 * Scan a diff for security vulnerabilities.
 */
export async function scanSecurity(diff, plan) {
  console.log(`[SecurityScanner] Scanning for vulnerabilities (provider: ${getProvider()})...`)

  const userMessage = `Security sensitive areas identified by orchestrator:
${JSON.stringify(plan.securitySensitiveAreas || [])}

Full diff:
${diff}`

  const result = await createJSONCompletion({
    system: systemPrompt,
    userMessage,
    model: 'smart',
  })

  console.log(
    `[SecurityScanner] Found ${result.findings?.length || 0} findings — risk: ${result.overallRisk}`
  )
  return result
}
