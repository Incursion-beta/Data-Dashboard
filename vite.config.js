import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy FRED API to avoid browser CORS issues in dev
      '/fred': {
        target: 'https://api.stlouisfed.org',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
