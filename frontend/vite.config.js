import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, calls to /api/... are forwarded to the API Gateway on :8080
// (so the browser never needs CORS). In Docker, nginx does the same job (see nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.GATEWAY_URL ?? 'http://localhost:9080', // GATEWAY_URL to point elsewhere
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
