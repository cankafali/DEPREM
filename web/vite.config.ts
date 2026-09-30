import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the API is proxied, so the app talks to its own origin (no CORS, any port).
const api = process.env.SISMO_API ?? 'http://localhost:5080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': api,
      '/health': api,
      '/hubs': { target: api, ws: true },
    },
  },
  // MapLibre 6 ships ES modules plus a module worker; pre-bundling would split them into two copies.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('maplibre-gl') ? 'maplibre' : undefined),
      },
    },
  },
})
