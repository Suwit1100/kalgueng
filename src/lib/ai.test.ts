import test from 'node:test'
import assert from 'node:assert/strict'
import { AiEstimateError, estimateNutritionWithAI } from './ai'

const macro = { calories: 500, protein: 30, carbs: 60, fat: 15 }

test('AI client returns a validated macro response', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify(macro), { status: 200, headers: { 'Content-Type': 'application/json' } })
  assert.deepEqual(await estimateNutritionWithAI('ข้าวกะเพรา', { fetcher, retries: 0 }), macro)
})

test('AI client retries a rate limit and succeeds', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls += 1
    if (calls === 1) return new Response(JSON.stringify({ error: 'busy', code: 'rate_limit' }), { status: 429, headers: { 'Retry-After': '0' } })
    return new Response(JSON.stringify(macro), { status: 200 })
  }
  assert.deepEqual(await estimateNutritionWithAI('ข้าวกะเพรา', { fetcher, retries: 1 }), macro)
  assert.equal(calls, 2)
})

test('AI client reports malformed success responses as invalid_response', async () => {
  const fetcher: typeof fetch = async () => new Response('{"calories":500}', { status: 200 })
  await assert.rejects(
    estimateNutritionWithAI('ข้าวกะเพรา', { fetcher, retries: 0 }),
    (error: unknown) => error instanceof AiEstimateError && error.code === 'invalid_response',
  )
})
