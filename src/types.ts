export type Macro = { calories: number; protein: number; carbs: number; fat: number }
export type Targets = Macro
export type User = { id: string; name: string; email: string; picture?: string }
export type FoodLog = Macro & { id: string; name: string; meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'; date: string; createdAt: string }
