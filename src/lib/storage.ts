import type { FoodLog, Targets, User } from '../types'

const KEYS = { user: 'kalgueng:user', targets: 'kalgueng:targets', foods: 'kalgueng:foods' }
const defaults: Targets = { calories: 2000, protein: 150, carbs: 220, fat: 60 }

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)) }

export const store = {
  getUser: () => read<User | null>(KEYS.user, null),
  setUser: (user: User) => write(KEYS.user, user),
  clearUser: () => localStorage.removeItem(KEYS.user),
  getTargets: () => read<Targets>(KEYS.targets, defaults),
  hasTargets: () => localStorage.getItem(KEYS.targets) !== null,
  setTargets: (targets: Targets) => write(KEYS.targets, targets),
  getFoods: () => read<FoodLog[]>(KEYS.foods, []),
  saveFood: (food: FoodLog) => write(KEYS.foods, [food, ...store.getFoods()]),
  deleteFood: (id: string) => write(KEYS.foods, store.getFoods().filter((food) => food.id !== id)),
}
