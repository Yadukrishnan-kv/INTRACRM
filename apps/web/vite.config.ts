/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // In dev the API is reached through this proxy, so the browser only ever
  // talks to the Vite origin and the API's CORS list does not need to change.
  const apiTarget = env.API_PROXY_TARGET ?? 'http://localhost:3000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    preview: { port: 4173 },
    test: { environment: 'jsdom' },
  };
});
