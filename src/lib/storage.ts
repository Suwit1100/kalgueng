import type { ActivityLog, BodyMeasurement, FoodLog, Targets, User } from '../types'

const PREFIX = 'kalgueng:'
const KEYS = {
  user: `${PREFIX}user`,
  targets: `${PREFIX}targets`,
  foods: `${PREFIX}foods`,
  activities: `${PREFIX}activities`,
  body: `${PREFIX}body`,
}
const defaults: Targets = { calories: 2000, protein: 150, carbs: 220, fat: 60 }

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T }
  catch { return fallback }
}
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)) }
function newestFirst<T extends { date: string; createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

export const store = {
  getUser: () => read<User | null>(KEYS.user, null),
  setUser: (user: User) => write(KEYS.user, user),
  clearUser: () => localStorage.removeItem(KEYS.user),
  getTargets: () => read<Targets>(KEYS.targets, defaults),
  hasTargets: () => localStorage.getItem(KEYS.targets) !== null,
  setTargets: (targets: Targets) => write(KEYS.targets, targets),

  getFoods: () => newestFirst(read<FoodLog[]>(KEYS.foods, [])),
  saveFood: (food: FoodLog) => write(KEYS.foods, newestFirst([food, ...store.getFoods()])),
  updateFood: (updatedFood: FoodLog) => write(KEYS.foods, newestFirst(store.getFoods().map((food) => food.id === updatedFood.id ? updatedFood : food))),
  deleteFood: (id: string) => write(KEYS.foods, store.getFoods().filter((food) => food.id !== id)),

  getActivities: () => newestFirst(read<ActivityLog[]>(KEYS.activities, [])),
  saveActivity: (activity: ActivityLog) => write(KEYS.activities, newestFirst([activity, ...store.getActivities()])),
  updateActivity: (updated: ActivityLog) => write(KEYS.activities, newestFirst(store.getActivities().map((item) => item.id === updated.id ? updated : item))),
  deleteActivity: (id: string) => write(KEYS.activities, store.getActivities().filter((activity) => activity.id !== id)),

  getBodyMeasurements: () => newestFirst(read<BodyMeasurement[]>(KEYS.body, [])),
  saveBodyMeasurement: (measurement: BodyMeasurement) => write(KEYS.body, newestFirst([measurement, ...store.getBodyMeasurements().filter((item) => item.date !== measurement.date)])),
  updateBodyMeasurement: (updated: BodyMeasurement) => write(KEYS.body, newestFirst([
    updated,
    ...store.getBodyMeasurements().filter((item) => item.id !== updated.id && item.date !== updated.date),
  ])),
  deleteBodyMeasurement: (id: string) => write(KEYS.body, store.getBodyMeasurements().filter((measurement) => measurement.id !== id)),

  clearAll: () => {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith(PREFIX)))
    keys.forEach((key) => localStorage.removeItem(key))
  },
}
