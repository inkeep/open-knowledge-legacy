import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: process.env.STRESS_BASE_URL ?? 'http://localhost:5173',
    headless: true,
  },
  projects: [
    {
      name: 'stress',
      testMatch: /stress\/.*\.spec\.ts$/,
    },
  ],
});
