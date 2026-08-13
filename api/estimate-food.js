import { estimateFood } from '../server/estimate-food.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })
  const description = String(request.body?.description ?? '').trim()
  try {
    return response.status(200).json(await estimateFood(description, process.env.OPENTYPHOON_API_KEY))
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'AI estimate failed' })
  }
}
