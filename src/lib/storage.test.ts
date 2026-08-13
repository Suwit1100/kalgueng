import test from 'node:test'
import assert from 'node:assert/strict'
import { store } from './storage'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const memory = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true })

test('activity updates preserve the item id and allow changing its date', () => {
  memory.clear()
  store.saveActivity({ id: 'a1', name: 'Run', calories: 200, date: '2026-08-12', createdAt: '2026-08-12T10:00:00Z' })
  store.updateActivity({ id: 'a1', name: 'Long run', calories: 300, date: '2026-08-13', createdAt: '2026-08-12T10:00:00Z' })
  assert.deepEqual(store.getActivities(), [{ id: 'a1', name: 'Long run', calories: 300, date: '2026-08-13', createdAt: '2026-08-12T10:00:00Z' }])
})

test('body update replaces a conflicting measurement on the same date', () => {
  memory.clear()
  store.saveBodyMeasurement({ id: 'b1', date: '2026-08-12', weight: 70, createdAt: '1' })
  store.saveBodyMeasurement({ id: 'b2', date: '2026-08-13', weight: 69.5, createdAt: '2' })
  store.updateBodyMeasurement({ id: 'b1', date: '2026-08-13', weight: 69, createdAt: '1' })
  assert.deepEqual(store.getBodyMeasurements(), [{ id: 'b1', date: '2026-08-13', weight: 69, createdAt: '1' }])
})

test('clearAll removes every kalgueng-prefixed key but leaves unrelated storage intact', () => {
  memory.clear()
  localStorage.setItem('kalgueng:future-setting', '1')
  localStorage.setItem('other-app:key', 'keep')
  store.setTargets({ calories: 1800, protein: 120, carbs: 180, fat: 55 })
  store.clearAll()
  assert.equal(localStorage.getItem('kalgueng:future-setting'), null)
  assert.equal(localStorage.getItem('kalgueng:targets'), null)
  assert.equal(localStorage.getItem('other-app:key'), 'keep')
})
