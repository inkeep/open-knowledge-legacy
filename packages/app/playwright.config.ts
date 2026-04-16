import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

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
 * Cross-browser projects (QA-046 / SPEC §13).
 *
 * Clipboard behavior differs per browser — Safari has stricter
 * user-activation rules for `ClipboardItem.write`, Firefox has different
 * restrictions on async clipboard APIs, and Chromium is the baseline
 * assumption in most existing Playwright e2e code. Running the full E2E
 * suite against all three closes the cross-browser parity gate the spec
 * called out as Must.
 *
 * Opt-in single-browser run for local iteration:
 *   bunx playwright test --project=chromium
 *
 * Browser installation (one-time, or after Playwright upgrade):
 *   bunx playwright install chromium webkit firefox
 *
 * The `use` block at top-level sets shared config (baseURL, headless).
 * Each project merges `devices[...]` for its browser-specific defaults
 * (user-agent, viewport, etc.) on top of the shared config.
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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
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
