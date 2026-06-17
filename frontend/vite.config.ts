import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:3001'
  
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/stream': {
          target: apiUrl,
          changeOrigin: true,
          headers: { 'Connection': 'keep-alive' }
        },
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          // SSE needs special handling:
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Accept', 'text/event-stream')
            })
          }
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    }
  }
})
