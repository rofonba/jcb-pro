import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Identificador del build visible en la app (diagnóstico: ¿qué versión corre el móvil?)
  define: { __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Proxy /api/* to the local Vercel dev server (run: vercel dev --port 3000)
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
