import test from 'node:test'
import assert from 'node:assert/strict'
import { EstimateServiceError, estimateFood, parseEstimate } from './estimate-food.js'

test('parseEstimate accepts JSON surrounded by provider text and rounds values', () => {
  assert.deepEqual(parseEstimate('```json\n{"calories":500.04,"protein":30,"carbs":60,"fat":15}\n```'), { calories: 500, protein: 30, carbs: 60, fat: 15 })
})

test('parseEstimate rejects missing macro fields', () => {
  assert.throws(() => parseEstimate('{"calories":500}'), (error) => error instanceof EstimateServiceError && error.code === 'invalid_response')
})

test('estimateFood retries transient provider errors', async () => {
  let calls = 0
  const fetcher = async () => {
    calls += 1
    if (calls === 1) return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 })
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ calories: 450, protein: 25, carbs: 50, fat: 14 }) } }] }), { status: 200 })
  }
  const result = await estimateFood('ข้าวผัด', 'test-key', { fetcher, retries: 1, timeoutMs: 1000 })
  assert.deepEqual(result, { calories: 450, protein: 25, carbs: 50, fat: 14 })
  assert.equal(calls, 2)
})

test('estimateFood exposes rate limit metadata after retries are exhausted', async () => {
  const fetcher = async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429, headers: { 'Retry-After': '0' } })
  await assert.rejects(
    estimateFood('ข้าวผัด', 'test-key', { fetcher, retries: 0, timeoutMs: 1000 }),
    (error) => error instanceof EstimateServiceError && error.statusCode === 429 && error.code === 'rate_limit',
  )
})
