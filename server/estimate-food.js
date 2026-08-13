const SYSTEM_PROMPT = `You estimate nutrition for Thai food descriptions. Return only valid JSON with exactly these numeric fields: calories, protein, carbs, fat. All values are non-negative numbers. Estimate the complete stated portion. Never include markdown or explanations. Values are estimates, not medical advice.`
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const FIELDS = ['calories', 'protein', 'carbs', 'fat']

export class EstimateServiceError extends Error {
  constructor(message, { statusCode = 502, code = 'provider_error', retryable = false, retryAfter } = {}) {
    super(message)
    this.name = 'EstimateServiceError'
    this.statusCode = statusCode
    this.code = code
    this.retryable = retryable
    this.retryAfter = retryAfter
  }
}

export function parseEstimate(content) {
  if (typeof content !== 'string') throw new EstimateServiceError('AI returned an unreadable response.', { code: 'invalid_response', retryable: true })
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new EstimateServiceError('AI did not return nutrition JSON.', { code: 'invalid_response', retryable: true })
  let result
  try { result = JSON.parse(match[0]) }
  catch { throw new EstimateServiceError('AI returned malformed nutrition JSON.', { code: 'invalid_response', retryable: true }) }
  if (!FIELDS.every((field) => typeof result?.[field] === 'number' && Number.isFinite(result[field]) && result[field] >= 0)) {
    throw new EstimateServiceError('AI returned invalid nutrition values.', { code: 'invalid_response', retryable: true })
  }
  return Object.fromEntries(FIELDS.map((field) => [field, Math.round(result[field] * 10) / 10]))
}

function providerError(status, data, retryAfter) {
  if (status === 429) return new EstimateServiceError('AI rate limit reached. Please try again shortly.', { statusCode: 429, code: 'rate_limit', retryable: true, retryAfter })
  if (status === 401 || status === 403) return new EstimateServiceError('AI service credentials are not accepted.', { statusCode: 503, code: 'provider_auth' })
  if (RETRYABLE_STATUS.has(status)) return new EstimateServiceError('AI service is temporarily unavailable. Please try again.', { statusCode: 503, code: 'provider_unavailable', retryable: true, retryAfter })
  const providerMessage = typeof data?.error?.message === 'string' ? data.error.message : ''
  return new EstimateServiceError(providerMessage || 'AI provider rejected the request.', { statusCode: 502, code: 'provider_error' })
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

export async function estimateFood(description, apiKey, options = {}) {
  const value = typeof description === 'string' ? description.trim() : ''
  if (!value) throw new EstimateServiceError('Please provide a food description.', { statusCode: 400, code: 'validation' })
  if (value.length > 500) throw new EstimateServiceError('Please provide a food description under 500 characters.', { statusCode: 400, code: 'validation' })
  if (!apiKey) throw new EstimateServiceError('AI service is not configured.', { statusCode: 503, code: 'not_configured' })

  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? 12_000
  const retries = Math.max(0, options.retries ?? 1)
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const apiResponse = await fetcher('https://api.opentyphoon.ai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'typhoon-v2.5-30b-a3b-instruct',
          temperature: 0.2,
          max_tokens: 120,
          stream: false,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: value }],
        }),
      })

      const raw = await apiResponse.text()
      let data = {}
      if (raw) {
        try { data = JSON.parse(raw) }
        catch {
          const invalid = new EstimateServiceError('AI provider returned an unreadable response.', { code: 'invalid_response', retryable: true })
          if (attempt < retries) { lastError = invalid; continue }
          throw invalid
        }
      }

      if (!apiResponse.ok) {
        const error = providerError(apiResponse.status, data, apiResponse.headers.get('Retry-After') || undefined)
        if (error.retryable && attempt < retries) {
          lastError = error
          const retryAfter = Number(error.retryAfter)
          await wait(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 2_000) : 350 * (attempt + 1))
          continue
        }
        throw error
      }

      try { return parseEstimate(data?.choices?.[0]?.message?.content) }
      catch (error) {
        if (error instanceof EstimateServiceError && error.retryable && attempt < retries) { lastError = error; continue }
        throw error
      }
    } catch (error) {
      if (error instanceof EstimateServiceError) {
        lastError = error
        if (error.retryable && attempt < retries) continue
        throw error
      }
      const normalized = error?.name === 'AbortError'
        ? new EstimateServiceError('AI request timed out. Please try again.', { statusCode: 504, code: 'timeout', retryable: true })
        : new EstimateServiceError('Could not reach the AI service. Please try again.', { statusCode: 502, code: 'network', retryable: true })
      lastError = normalized
      if (attempt >= retries) throw normalized
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError ?? new EstimateServiceError('AI estimate failed.')
}
