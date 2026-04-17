import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Module-scope creation: runs at config-eval time, before any setup tasks.
// The webServer captures this via webServer.env at spawn time.
// Using globalSetup is too late — Playwright 1.59.1 spawns webServer BEFORE
// config.globalSetups (verified against source: lib/runner/tasks.js:100-109).
const contentDir = mkdtempSync(join(tmpdir(), 'ok-playwright-'));
writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
mkdirSync(join(contentDir, 'sidebar-folder'), { recursive: true });
writeFileSync(join(contentDir, 'sidebar-folder', 'nested-doc.md'), '', 'utf-8');
console.log(`[playwright] OK_TEST_CONTENT_DIR = ${contentDir}`);

const port = process.env.VITE_PORT || '5173';
const baseURL = `http://localhost:${port}`;

/**
 * Single-browser (Chromium) — all E2E tests use programmatic clipboard
 * injection via `dispatchEvent(new ClipboardEvent(...))`, not real browser
 * clipboard APIs. Cross-browser clipboard differences (Safari user-activation
 * rules, Firefox async clipboard restrictions) are not exercised because the
 * tests bypass the native clipboard permission model entirely. Running 3×
 * browsers adds ~10 minutes of CI time with zero additional coverage.
 *
 * If future tests exercise REAL browser clipboard (e.g., `page.keyboard.press
 * ('Meta+V')` with system clipboard content), add per-file project scoping
 * for those tests only — not a global 3× multiplier.
 */
export default defineConfig({
  testDir: './tests/stress',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 120_000,
  retries: 0,
  globalTeardown: './tests/stress/global-teardown.ts',
  use: {
    baseURL,
    headless: true,
  },
  webServer: {
    command: `VITE_PORT=${port} bun run dev`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      OK_TEST_CONTENT_DIR: contentDir,
    },
  },
});
