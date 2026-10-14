import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      }
    }
  }
});
