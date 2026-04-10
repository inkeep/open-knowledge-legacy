import { defineConfig, devices } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'stress',
      testDir: './tests/stress',
      testMatch: /.*\.spec\.ts$/,
      timeout: 120_000,
      retries: 0,
      use: { headless: true },
    },
  ],
  webServer: {
    command: `VITE_PORT=${port} bun run dev`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
