import { defineConfig } from '@playwright/test';

/**
 * Desktop-package Playwright config (M4 US-009).
 *
 * Scopes to `tests/smoke/*.e2e.ts` — Electron-launch + URL-scheme + packaged-
 * build smoke tests. Runs independently from `packages/app`'s Playwright config
 * (which exercises the React editor in a Chromium renderer) because the app
 * config relies on a Vite dev server fixture while desktop tests drive a real
 * Electron binary.
 *
 * Expected invocation: `bunx playwright test packages/desktop/tests/smoke/`
 * after the electron-vite build has produced `out/main/index.js` (via
 * `bun run build:desktop`). Individual tests guard against "built output
 * missing" with a `test.skip` + structured reason so CI runs without a
 * pre-build are informative rather than silently red.
 */

export default defineConfig({
  testDir: './tests/smoke',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 60_000,
  // One worker — Electron launches are expensive, and these smokes don't
  // parallelize meaningfully (they poke at OS-level URL scheme dispatch).
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    // No baseURL — these tests don't hit HTTP.
    trace: 'retain-on-failure',
  },
});
