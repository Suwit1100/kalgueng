export type NutritionEstimate = { calories: number; protein: number; carbs: number; fat: number }
export type EstimateFoodOptions = { fetcher?: typeof fetch; timeoutMs?: number; retries?: number }

export class EstimateServiceError extends Error {
  statusCode: number
  code: string
  retryable: boolean
  retryAfter?: string | number
}

export function parseEstimate(content: unknown): NutritionEstimate
export function estimateFood(description: string, apiKey: string | undefined, options?: EstimateFoodOptions): Promise<NutritionEstimate>
