import { estimateFood } from '../server/estimate-food.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })

  let body = request.body ?? {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) }
    catch { return response.status(400).json({ error: 'Invalid JSON body', code: 'validation' }) }
  }

  try {
    const result = await estimateFood(String(body?.description ?? ''), process.env.OPENTYPHOON_API_KEY)
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json(result)
  } catch (error) {
    const status = Number(error?.statusCode) || 502
    if (error?.retryAfter) response.setHeader('Retry-After', String(error.retryAfter))
    response.setHeader('Cache-Control', 'no-store')
    return response.status(status).json({
      error: error instanceof Error ? error.message : 'AI estimate failed',
      code: typeof error?.code === 'string' ? error.code : 'provider_error',
    })
  }
}
