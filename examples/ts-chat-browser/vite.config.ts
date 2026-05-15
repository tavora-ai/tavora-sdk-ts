import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      // Proxy /api to the local Tavora backend so the browser SDK
      // can call relative URLs during development without CORS setup.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
