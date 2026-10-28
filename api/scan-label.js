import { scanLabel } from '../server/scan-label.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  response.setHeader('Cache-Control', 'no-store')
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    const result = await scanLabel(body?.image, process.env.OPENTYPHOON_API_KEY)
    return response.status(200).json(result)
  } catch (error) {
    return response.status(Number(error?.statusCode) || (error instanceof SyntaxError ? 400 : 502)).json({ error: error?.message || 'OCR failed', code: error?.code || (error instanceof SyntaxError ? 'validation' : 'provider_error') })
  }
}
