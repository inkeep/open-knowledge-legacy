import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/stress',
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
