/**
 * server/lib/ai-client.js
 *
 * Thin wrapper for calling the Cortex AI API (OpenAI-compatible format).
 */

export async function callAi(prompt, options = {}) {
  const baseUrl     = process.env.AI_BASE_URL
  const apiKey      = process.env.AI_API_KEY
  const model       = options.model || process.env.AI_MODEL
  const temperature = options.temperature ?? 0.7
  const maxTokens   = options.maxTokens ?? 1024

  if (!baseUrl || !apiKey || !model) {
    throw new Error('Missing AI configuration. Set AI_BASE_URL, AI_API_KEY, and AI_MODEL environment variables.')
  }

  const t0 = Date.now()

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':                    'application/json',
      'Authorization':                   `Bearer ${apiKey}`,
      'X-Cortex-Flatten-Vertex':         'true',
      'X-Cortex-Disable-Adaptive-Thinking': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cortex API error [${res.status}]: ${text}`)
  }

  const json   = await res.json()
  const text   = json.choices[0].message.content
  const finishReason = json.choices[0].finish_reason
  const usage  = {
    inputTokens:  json.usage.prompt_tokens,
    outputTokens: json.usage.completion_tokens,
  }

  return { response: text, usage, latencyMs: Date.now() - t0, finishReason }
}
