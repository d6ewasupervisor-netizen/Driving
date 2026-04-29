import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const apiTarget =
    env.VITE_API_TARGET ||
    process.env.VITE_API_TARGET ||
    'http://localhost:3001'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      // WASM + GLB optimization
      rollupOptions: {
        output: {
          // Keep .wasm and .glb files as separate assets (not bundled)
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.')
            const ext = info[info.length - 1]
            if (/png|jpe?g|gif|svg|webp|ico|ttf|woff2?/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`
            } else if (/wasm/i.test(ext)) {
              return `assets/wasm/[name][extname]` // Keep WASM hashed but separate
            } else if (/glb?/i.test(ext)) {
              return `assets/models/[name]-[hash][extname]`
            }
            return `assets/[name]-[hash][extname]`
          },
        },
      },
      // Increase chunk size warnings for large GLBs
      chunkSizeWarningLimit: 10000,
    },
  }
})
