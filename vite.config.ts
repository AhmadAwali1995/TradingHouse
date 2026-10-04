import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://localhost:7124',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'https://localhost:7124',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
})
