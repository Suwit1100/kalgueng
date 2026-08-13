import type { FoodLog, Macro, Targets } from '../types'

export const emptyMacro: Macro = { calories: 0, protein: 0, carbs: 0, fat: 0 }

export function totalsForDate(foods: FoodLog[], date: string): Macro {
  return foods
    .filter((food) => food.date === date)
    .reduce((sum, food) => ({
      calories: sum.calories + food.calories,
      protein: sum.protein + food.protein,
      carbs: sum.carbs + food.carbs,
      fat: sum.fat + food.fat,
    }), { ...emptyMacro })
}

export function meetsGoal(totals: Macro, targets: Targets) {
  return (Object.keys(targets) as Array<keyof Macro>).every((key) => {
    const target = targets[key]
    if (target === 0) return totals[key] === 0
    return totals[key] >= target * 0.9 && totals[key] <= target * 1.1
  })
}

export function bestGoalStreak(
  dates: string[],
  foods: FoodLog[],
  targets: Targets,
  targetsForDate: (date: string) => Targets = () => targets,
) {
  let current = 0
  let best = 0
  let prior = ''

  for (const date of [...new Set(dates)].sort()) {
    const consecutive = !prior || new Date(`${date}T12:00:00`).getTime() - new Date(`${prior}T12:00:00`).getTime() === 86_400_000
    const completed = meetsGoal(totalsForDate(foods, date), targetsForDate(date))
    current = completed ? (consecutive ? current + 1 : 1) : 0
    best = Math.max(best, current)
    prior = date
  }
  return best
}
