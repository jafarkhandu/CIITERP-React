import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Same dev proxy that Angular's proxy.conf.json had:
// /lead-api  ->  https://leadapis.ciitstudent.com/api
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 4200,
    proxy: {
      '/lead-api': {
        target: 'https://leadapis.ciitstudent.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/lead-api/, '/api'),
      },
    },
  },
});
