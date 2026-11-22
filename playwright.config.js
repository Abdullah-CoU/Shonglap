import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  // Servers are expected to be running already
  // Start server: cd server && node src/server.dev-memory.js
  // Start client: cd client && node node_modules/vite/bin/vite.js
});
