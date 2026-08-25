import test from 'node:test'
import assert from 'node:assert/strict'
import { mealForHour } from './meal'

test('selects meals from Bangkok hour boundaries', () => {
  assert.equal(mealForHour(8), 'breakfast')
  assert.equal(mealForHour(11), 'lunch')
  assert.equal(mealForHour(16), 'lunch')
  assert.equal(mealForHour(17), 'dinner')
  assert.equal(mealForHour(18), 'dinner')
  assert.equal(mealForHour(19), 'supper')
  assert.equal(mealForHour(2), 'supper')
})
