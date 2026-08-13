import type { Macro } from '../types'

export type AiErrorCode = 'validation' | 'rate_limit' | 'timeout' | 'network' | 'invalid_response' | 'server'

export class AiEstimateError extends Error {
  code: AiErrorCode
  retryable: boolean
  status?: number

  constructor(message: string, code: AiErrorCode, options: { retryable?: boolean; status?: number } = {}) {
    super(message)
    this.name = 'AiEstimateError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.status = options.status
  }
}

type EstimateOptions = {
  fetcher?: typeof fetch
  timeoutMs?: number
  retries?: number
}

const MACRO_FIELDS: Array<keyof Macro> = ['calories', 'protein', 'carbs', 'fat']
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function parseMacro(payload: unknown): Macro {
  const value = asRecord(payload)
  if (!value || !MACRO_FIELDS.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]) && Number(value[field]) >= 0)) {
    throw new AiEstimateError('AI ส่งข้อมูลโภชนาการกลับมาไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาลองใหม่', 'invalid_response', { retryable: true })
  }
  return {
    calories: Number(value.calories),
    protein: Number(value.protein),
    carbs: Number(value.carbs),
    fat: Number(value.fat),
  }
}

function errorMessage(payload: unknown) {
  const value = asRecord(payload)
  return typeof value?.error === 'string' ? value.error : ''
}

function errorCode(payload: unknown) {
  const value = asRecord(payload)
  return typeof value?.code === 'string' ? value.code : ''
}

function statusError(status: number, payload: unknown) {
  const serverMessage = errorMessage(payload)
  const code = errorCode(payload)
  if (status === 429 || code === 'rate_limit') {
    return new AiEstimateError('AI ถูกเรียกใช้งานถี่เกินไป กรุณาลองใหม่อีกครั้ง', 'rate_limit', { retryable: true, status })
  }
  if (status === 408 || status === 504 || code === 'timeout') {
    return new AiEstimateError('AI ใช้เวลาตอบนานเกินไป กรุณาลองใหม่', 'timeout', { retryable: true, status })
  }
  if (status === 400 || code === 'validation') {
    return new AiEstimateError(serverMessage || 'รายละเอียดอาหารไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่', 'validation', { status })
  }
  if (code === 'not_configured') {
    return new AiEstimateError('ระบบยังไม่ได้ตั้งค่าบริการ AI กรุณาตั้งค่า OPENTYPHOON_API_KEY บนเซิร์ฟเวอร์', 'server', { status })
  }
  if (code === 'provider_auth') {
    return new AiEstimateError('บริการ AI ปฏิเสธ credential ที่ตั้งไว้ กรุณาตรวจสอบ API key บนเซิร์ฟเวอร์', 'server', { status })
  }
  if (status >= 500) {
    return new AiEstimateError('บริการ AI ยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง', 'server', { retryable: RETRYABLE_STATUS.has(status), status })
  }
  return new AiEstimateError(serverMessage || 'ไม่สามารถประเมินอาหารด้วย AI ได้', 'server', { status })
}

function retryDelay(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get('Retry-After')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 3_000)
  }
  return 500 * (attempt + 1)
}

export async function estimateNutritionWithAI(description: string, options: EstimateOptions = {}): Promise<Macro> {
  const trimmed = description.trim()
  if (!trimmed) throw new AiEstimateError('กรุณาพิมพ์รายละเอียดอาหารก่อนประเมิน', 'validation')
  if (trimmed.length > 500) throw new AiEstimateError('รายละเอียดอาหารต้องไม่เกิน 500 ตัวอักษร', 'validation')

  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? 30_000
  const retries = Math.max(0, options.retries ?? 1)
  let lastError: AiEstimateError | null = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response | null = null
    try {
      response = await fetcher('/api/estimate-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: trimmed }),
        signal: controller.signal,
      })
      const raw = await response.text()
      let payload: unknown = {}
      if (raw) {
        try { payload = JSON.parse(raw) }
        catch {
          throw new AiEstimateError('เซิร์ฟเวอร์ AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่', 'invalid_response', { retryable: true, status: response.status })
        }
      }
      if (!response.ok) throw statusError(response.status, payload)
      return parseMacro(payload)
    } catch (reason) {
      if (reason instanceof AiEstimateError) lastError = reason
      else if (reason instanceof DOMException && reason.name === 'AbortError') lastError = new AiEstimateError('AI ใช้เวลาตอบนานเกินไป กรุณาลองใหม่', 'timeout', { retryable: true })
      else lastError = new AiEstimateError('เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 'network', { retryable: true })

      if (!lastError.retryable || attempt >= retries) throw lastError
      await sleep(retryDelay(response, attempt))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError ?? new AiEstimateError('ไม่สามารถประเมินอาหารด้วย AI ได้', 'server')
}
