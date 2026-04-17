import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // In development, proxy /api/* to the real gateway with the key from .env.local
  // In production (CF Pages) the Pages Function at functions/api/[[path]].js handles it.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'https://gateway.scanlake.rocks',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            const key = env.VITE_DEV_GATEWAY_KEY
            if (key) proxyReq.setHeader('X-API-Key', key)
          })
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('plotly.js-dist-min')) return 'plotly'
          if (id.includes('@duckdb/duckdb-wasm')) return 'duckdb'
          if (id.includes('codemirror') || id.includes('@codemirror')) return 'codemirror'
        },
      },
    },
  },
  }
})
