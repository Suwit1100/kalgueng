import test from 'node:test'
import assert from 'node:assert/strict'
import { bestGoalStreak, meetsGoal, totalsForDate } from './stats'
import type { FoodLog, Targets } from '../types'

const targets: Targets = { calories: 2000, protein: 150, carbs: 220, fat: 60 }
const food = (date: string, values: Targets = targets): FoodLog => ({ id: `${date}-${values.calories}`, name: 'meal', meal: 'lunch', date, createdAt: date, ...values })

test('aggregates daily macro totals', () => {
  assert.deepEqual(totalsForDate([food('2026-08-13')], '2026-08-13'), targets)
})

test('requires calories and every macro within 90-110 percent', () => {
  assert.equal(meetsGoal(targets, targets), true)
  assert.equal(meetsGoal({ ...targets, protein: 80 }, targets), false)
  assert.equal(meetsGoal({ ...targets, calories: 2300 }, targets), false)
})

test('zero targets only pass when the matching total is zero', () => {
  const zeroFat = { ...targets, fat: 0 }
  assert.equal(meetsGoal({ ...targets, fat: 0 }, zeroFat), true)
  assert.equal(meetsGoal({ ...targets, fat: 1 }, zeroFat), false)
})

test('best streak restarts at one after a missing calendar day', () => {
  const dates = ['2026-08-10', '2026-08-12', '2026-08-13']
  assert.equal(bestGoalStreak(dates, dates.map((date) => food(date)), targets), 2)
})

test('supports date-specific calorie targets such as activity-adjusted goals', () => {
  const dates = ['2026-08-12', '2026-08-13']
  const foods = [food('2026-08-12'), food('2026-08-13', { ...targets, calories: 2300 })]
  const targetForDate = (date: string) => date === '2026-08-13' ? { ...targets, calories: 2300 } : targets
  assert.equal(bestGoalStreak(dates, foods, targets, targetForDate), 2)
})
