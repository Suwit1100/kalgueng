import type { FoodLog } from '../types'

export type ActiveMeal = Exclude<FoodLog['meal'], 'snack'>

export function mealForHour(hour: number): ActiveMeal {
  if (hour >= 5 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 17) return 'lunch'
  if (hour >= 17 && hour < 19) return 'dinner'
  return 'supper'
}

export function defaultMealForBangkok(date = new Date()): ActiveMeal {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Bangkok',
  }).format(date))
  return mealForHour(hour)
}

export function normalizeMeal(meal: FoodLog['meal']): ActiveMeal {
  return meal === 'snack' ? defaultMealForBangkok() : meal
}
