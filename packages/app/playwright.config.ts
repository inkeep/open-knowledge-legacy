import { defineConfig } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/stress',
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL,
    headless: true,
  },
  webServer: {
    command: `VITE_PORT=${port} bun run dev`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
