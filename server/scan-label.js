const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export class ScanLabelError extends Error {
  constructor(message, statusCode = 502, code = 'provider_error') {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

function numberFrom(text) {
  const match = text?.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

export function parseNutritionLabel(text) {
  const lines = text.replace(/\r/g, '').split(/\n/).map((line) => line.replace(/[＊*#_]/g, '').trim()).filter(Boolean)
  const patterns = {
    calories: /(?:พลังงานทั้งหมด|พลังงาน|energy|calories|calorie|kcal)/i,
    protein: /(?:โปรตีน|protein)/i,
    carbs: /(?:คาร์โบไฮเดรต|คาร์โบไฮเดรท|carbohydrate|carbs?)/i,
    fat: /(?:ไขมันทั้งหมด|ไขมัน|total fat|fat)/i,
  }
  const values = {}
  for (const [key, pattern] of Object.entries(patterns)) {
    for (const line of lines) {
      const match = pattern.exec(line)
      if (!match) continue
      const tail = line.slice(match.index + match[0].length)
      const value = numberFrom(tail)
      if (value !== null && Number.isFinite(value) && value >= 0) { values[key] = value; break }
    }
  }
  const servingLine = lines.find((line) => /(?:หนึ่งหน่วยบริโภค|ขนาดหน่วยบริโภค|serving size)/i.test(line))
  return { values, serving: servingLine?.slice(0, 120) || '' }
}

export async function scanLabel(image, apiKey, options = {}) {
  if (!apiKey) throw new ScanLabelError('AI service is not configured.', 503, 'not_configured')
  if (typeof image !== 'string') throw new ScanLabelError('Please choose a JPEG or PNG image.', 400, 'validation')
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image)
  if (!match) throw new ScanLabelError('Please choose a JPEG or PNG image.', 400, 'validation')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ScanLabelError('Image must be under 5 MB.', 400, 'validation')
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: match[1] }), match[1] === 'image/png' ? 'label.png' : 'label.jpg')
  form.append('model', 'typhoon-ocr')
  form.append('max_tokens', '2048')
  form.append('temperature', '0.1')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
  let response
  try {
    response = await (options.fetcher ?? fetch)('https://api.opentyphoon.ai/v1/ocr', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: controller.signal,
    })
  } catch (error) {
    throw new ScanLabelError(error?.name === 'AbortError' ? 'OCR request timed out.' : 'Could not reach OCR service.', error?.name === 'AbortError' ? 504 : 502, error?.name === 'AbortError' ? 'timeout' : 'network')
  } finally { clearTimeout(timeout) }
  let payload
  try { payload = await response.json() }
  catch { throw new ScanLabelError('OCR service returned an unreadable response.', 502, 'invalid_response') }
  if (!response.ok) {
    if (response.status === 429) throw new ScanLabelError('OCR rate limit reached. Please try again shortly.', 429, 'rate_limit')
    if (response.status === 401 || response.status === 403) throw new ScanLabelError('OCR credentials were rejected.', 503, 'provider_auth')
    throw new ScanLabelError(payload?.error?.message || 'OCR service could not process the image.', 502)
  }
  const contents = (Array.isArray(payload?.results) ? payload.results : []).filter((item) => item?.success).map((item) => item?.message?.choices?.[0]?.message?.content).filter((value) => typeof value === 'string')
  const text = contents.map((content) => {
    try { const parsed = JSON.parse(content); return typeof parsed?.natural_text === 'string' ? parsed.natural_text : content }
    catch { return content }
  }).join('\n').trim()
  if (!text) throw new ScanLabelError('No readable text was found. Try a clearer photo.', 422, 'no_text')
  return { text, ...parseNutritionLabel(text) }
}
