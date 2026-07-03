import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // During local dev, any request to /api/* is forwarded to the
      // Express backend on port 5000. This means both the React app
      // and the API are on the same origin (localhost:5173/5174) from
      // the browser's perspective — no CORS issues at all.
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
