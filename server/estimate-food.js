const SYSTEM_PROMPT = `You estimate nutrition for Thai food descriptions. Return only valid JSON with exactly these numeric fields: calories, protein, carbs, fat. All values are non-negative numbers. Estimate the complete stated portion. Never include markdown or explanations. Values are estimates, not medical advice.`

function parseEstimate(content) {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI did not return nutrition JSON')
  const result = JSON.parse(match[0])
  const fields = ['calories', 'protein', 'carbs', 'fat']
  if (!fields.every((field) => typeof result[field] === 'number' && Number.isFinite(result[field]) && result[field] >= 0)) throw new Error('AI returned invalid nutrition values')
  return Object.fromEntries(fields.map((field) => [field, Math.round(result[field] * 10) / 10]))
}

export async function estimateFood(description, apiKey) {
  if (!description || description.length > 500) throw new Error('Please provide a food description under 500 characters.')
  if (!apiKey) throw new Error('AI service is not configured. Add OPENTYPHOON_API_KEY to .env.local and restart Vite.')
  const apiResponse = await fetch('https://api.opentyphoon.ai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'typhoon-v2.5-30b-a3b-instruct', temperature: 0.2, max_tokens: 120, stream: false, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: description }] }),
  })
  const data = await apiResponse.json()
  if (!apiResponse.ok) throw new Error(data?.error?.message || 'OpenTyphoon request failed')
  return parseEstimate(data?.choices?.[0]?.message?.content ?? '')
}
