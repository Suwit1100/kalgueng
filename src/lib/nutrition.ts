import type { Macro } from '../types'

type FoodEstimate = Macro & { matched: boolean }

const FOOD_PRESETS: Array<{ keywords: string[]; values: Macro }> = [
  { keywords: ['กะเพรา', 'กระเพรา'], values: { calories: 550, protein: 27, carbs: 65, fat: 20 } },
  { keywords: ['ข้าวมันไก่'], values: { calories: 600, protein: 30, carbs: 72, fat: 21 } },
  { keywords: ['ข้าวผัด'], values: { calories: 650, protein: 20, carbs: 82, fat: 25 } },
  { keywords: ['ผัดไทย'], values: { calories: 550, protein: 20, carbs: 72, fat: 19 } },
  { keywords: ['ส้มตำ'], values: { calories: 120, protein: 4, carbs: 22, fat: 2 } },
  { keywords: ['อกไก่'], values: { calories: 330, protein: 62, carbs: 0, fat: 7 } },
  { keywords: ['ไข่ต้ม'], values: { calories: 75, protein: 6, carbs: 1, fat: 5 } },
  { keywords: ['ข้าวสวย'], values: { calories: 260, protein: 5, carbs: 57, fat: 1 } },
  { keywords: ['กาแฟ'], values: { calories: 80, protein: 2, carbs: 12, fat: 3 } },
]

export function estimateNutrition(name: string): FoodEstimate {
  const input = name.toLowerCase()
  const preset = FOOD_PRESETS.find((food) => food.keywords.some((keyword) => input.includes(keyword)))
  if (!preset) return { calories: 350, protein: 15, carbs: 45, fat: 12, matched: false }

  const multiplier = input.match(/(\d+)\s*(จาน|กล่อง|ถ้วย|ฟอง)/)?.[1]
  const amount = multiplier ? Math.max(1, Number(multiplier)) : 1
  return { ...Object.fromEntries(Object.entries(preset.values).map(([key, value]) => [key, value * amount])) as Macro, matched: true }
}
