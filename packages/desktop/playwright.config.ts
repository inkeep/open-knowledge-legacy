import { defineConfig } from '@playwright/test';


export default defineConfig({
  testDir: './tests/smoke',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
