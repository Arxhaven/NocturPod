import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://nocturpod-njsi.onrender.com',
        changeOrigin: true,
        secure: true,
      },
      '/health': {
        target: 'https://nocturpod-njsi.onrender.com',
        changeOrigin: true,
        secure: true,
      },
      '/storage': {
        target: 'https://nocturpod-njsi.onrender.com',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})
