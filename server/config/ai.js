import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import config from './index.js'

/**
 * AI Provider Abstraction Layer.
 *
 * Provides a unified interface for both Anthropic and OpenAI.
 * Detects the active provider from environment config.
 * OpenAI takes priority if both API keys are set.
 *
 * Usage:
 *   import { createCompletion, getProvider } from '../config/ai.js'
 *   const result = await createCompletion({ system, userMessage, model: 'fast' })
 */

let anthropicClient = null
let openaiClient = null

function getAnthropicClient() {
  if (!anthropicClient && config.anthropicApiKey) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey })
  }
  return anthropicClient
}

function getOpenAIClient() {
  if (!openaiClient && config.openaiApiKey) {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return openaiClient
}

/**
 * Get the active AI provider name.
 * @returns {'openai' | 'anthropic'}
 */
export function getProvider() {
  if (config.openaiApiKey) return 'openai'
  if (config.anthropicApiKey) return 'anthropic'
  throw new Error('No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.')
}

/**
 * Resolve model name based on tier and provider.
 * @param {'fast' | 'smart'} tier
 * @returns {string} Actual model name for the active provider
 */
function resolveModel(tier) {
  const provider = getProvider()
  if (provider === 'openai') {
    return tier === 'fast' ? config.models.fast : config.models.smart
  }
  return tier === 'fast' ? config.models.anthropicFast : config.models.anthropicSmart
}

/**
 * Create a chat completion using the active provider.
 *
 * @param {Object} options
 * @param {string} options.system - System / Developer prompt instructions
 * @param {string} options.userMessage - User message content
 * @param {'fast' | 'smart'} [options.model='smart'] - Model tier
 * @param {number} [options.max_completion_tokens=4096] - Max output tokens
 * @param {number} [options.temperature=1] - Temp (Defaults to 1; required by GPT-5.6/reasoning models)
 * @param {boolean} [options.jsonMode=false] - Request JSON output
 * @returns {Promise<string>} The assistant's text response
 */
export async function createCompletion({
  system,
  userMessage,
  model = 'smart',
  max_completion_tokens = 4096,
  temperature = 1, // Fixed: Defaulted to 1 to prevent crashes on OpenAI reasoning models (Sol/Luna)
  jsonMode = false,
}) {
  const provider = getProvider()
  const modelName = resolveModel(model)

  // OpenAI requires the word "JSON" in the prompt if JSON mode is enabled
  let finalSystemPrompt = system
  if (jsonMode && !system.toLowerCase().includes('json')) {
    finalSystemPrompt += '\n\nPlease output your response in JSON format.'
  }

  if (provider === 'openai') {
    const client = getOpenAIClient()

    const params = {
      model: modelName,
      max_completion_tokens: max_completion_tokens,
      temperature,
      messages: [
        // Fixed: Use 'developer' instead of 'system' for GPT-5.6 / newer models
        { role: 'developer', content: finalSystemPrompt },
        { role: 'user', content: userMessage },
      ],
    }

    if (jsonMode) {
      params.response_format = { type: 'json_object' }
    }

    const response = await client.chat.completions.create(params)
    return response.choices[0].message.content.trim()
  }

  // Anthropic fallback block
  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: modelName,
    // Fixed ReferenceError: properly mapping max_completion_tokens -> max_tokens for Anthropic
    max_tokens: max_completion_tokens,
    temperature,
    system: finalSystemPrompt, // Anthropic still uses top-level 'system' param
    messages: [{ role: 'user', content: userMessage }],
  })

  return response.content[0].text.trim()
}

/**
 * Call an AI model with automatic JSON parsing and retry on parse failure.
 *
 * @param {Object} options - Same as createCompletion, plus retry behavior
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function createJSONCompletion(options) {
  const text = await createCompletion({ ...options, jsonMode: true })

  try {
    return JSON.parse(text)
  } catch {
    // Retry once with explicit strict instruction appended
    const retryText = await createCompletion({
      ...options,
      jsonMode: true,
      userMessage:
        options.userMessage +
        '\n\nIMPORTANT: Return ONLY valid JSON. No other text whatsoever.',
    })

    try {
      return JSON.parse(retryText)
    } catch {
      throw new Error(
        `AI returned invalid JSON after retry. Raw: ${retryText.slice(0, 200)}`
      )
    }
  }
}