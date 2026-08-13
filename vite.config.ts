import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { estimateFood } from './server/estimate-food.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      vue(),
      {
        name: 'local-estimate-food-api',
        configureServer(server) {
          server.middlewares.use('/api/estimate-food', async (request, response) => {
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
            response.setHeader('Cache-Control', 'no-store')
            if (request.method !== 'POST') {
              response.statusCode = 405
              response.end(JSON.stringify({ error: 'Method not allowed', code: 'method_not_allowed' }))
              return
            }

            let body = ''
            for await (const chunk of request) body += chunk
            try {
              const parsed = JSON.parse(body || '{}')
              const result = await estimateFood(String(parsed.description ?? ''), env.OPENTYPHOON_API_KEY)
              response.statusCode = 200
              response.end(JSON.stringify(result))
            } catch (error) {
              const serviceError = error as Error & { statusCode?: number; retryAfter?: string | number; code?: string }
              response.statusCode = Number(serviceError.statusCode) || (error instanceof SyntaxError ? 400 : 502)
              if (serviceError.retryAfter) response.setHeader('Retry-After', String(serviceError.retryAfter))
              response.end(JSON.stringify({
                error: error instanceof Error ? error.message : 'AI estimate failed',
                code: typeof serviceError.code === 'string' ? serviceError.code : error instanceof SyntaxError ? 'validation' : 'provider_error',
              }))
            }
          })
        },
      },
    ],
  }
})
