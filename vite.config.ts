import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { estimateFood } from './server/estimate-food.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue(), {
      name: 'local-estimate-food-api',
      configureServer(server) {
        server.middlewares.use('/api/estimate-food', async (request, response) => {
          if (request.method !== 'POST') { response.statusCode = 405; response.end(JSON.stringify({ error: 'Method not allowed' })); return }
          let body = ''
          for await (const chunk of request) body += chunk
          try {
            const description = JSON.parse(body).description?.trim() ?? ''
            const result = await estimateFood(description, env.OPENTYPHOON_API_KEY)
            response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(result))
          } catch (error) {
            response.statusCode = 502; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'AI estimate failed' }))
          }
        })
      },
    }],
  }
})
