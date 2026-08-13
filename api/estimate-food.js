const SYSTEM_PROMPT = `You estimate nutrition for Thai food descriptions. Return only valid JSON with exactly these numeric fields: calories, protein, carbs, fat. All values are non-negative numbers. Estimate the complete stated portion. Never include markdown or explanations. Values are estimates, not medical advice.`

function parseEstimate(content) {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI did not return nutrition JSON')
  const result = JSON.parse(match[0])
  const fields = ['calories', 'protein', 'carbs', 'fat']
  if (!fields.every((field) => typeof result[field] === 'number' && Number.isFinite(result[field]) && result[field] >= 0)) throw new Error('AI returned invalid nutrition values')
  return Object.fromEntries(fields.map((field) => [field, Math.round(result[field] * 10) / 10]))
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })
  const description = String(request.body?.description ?? '').trim()
  if (!description || description.length > 500) return response.status(400).json({ error: 'Please provide a food description under 500 characters.' })
  if (!process.env.OPENTYPHOON_API_KEY) return response.status(500).json({ error: 'AI service is not configured.' })
  try {
    const apiResponse = await fetch('https://api.opentyphoon.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENTYPHOON_API_KEY}` },
      body: JSON.stringify({ model: 'typhoon-v2.5-30b-a3b-instruct', temperature: 0.2, max_tokens: 120, stream: false, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: description }] }),
    })
    const data = await apiResponse.json()
    if (!apiResponse.ok) throw new Error(data?.error?.message || 'OpenTyphoon request failed')
    return response.status(200).json(parseEstimate(data?.choices?.[0]?.message?.content ?? ''))
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'AI estimate failed' })
  }
}
