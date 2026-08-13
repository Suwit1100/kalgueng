export type NutritionEstimate = { calories: number; protein: number; carbs: number; fat: number }
export function estimateFood(description: string, apiKey: string | undefined): Promise<NutritionEstimate>
