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
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/stress',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 120_000,
  // D-Q5 LOCKED: retries absorb transient infra noise; failOnFlakyTests keeps
  // the verdict strict — retry-success still fails the PR.
  retries: isCI ? 2 : 0,
  failOnFlakyTests: isCI,
  forbidOnly: isCI,
  // D-Q7 DIRECTED (empirically-adjusted from 4 → 2): per-test docName isolation
  // (PR #185) enables fullyParallel. Local workers undefined = Playwright default
  // for single-test debug ergonomics. On GHA `ubuntu-latest` (2 vCPU for private-
  // repo free tier), `workers: 4` oversubscribes CPU and combined with retries=2
  // pushes the suite past the 15-min CI `timeout-minutes` backstop — empirically
  // confirmed on PR #193's first CI run (cancelled at 15:00 before completing).
  // Downgraded to 2 per D-Q7's calibration plan ("If `ubuntu-latest` saturates
  // at workers: 2, downgrade to 2"). US-017 workers-calibration documents
  // post-merge 1/2/4 measurements to confirm 2 is optimal.
  fullyParallel: true,
  workers: isCI ? 2 : undefined,
  // D-Q8 DELEGATED: HTML report as artifact; list locally + github reporter on
  // CI for inline PR annotations.
  reporter: [['html', { open: 'never' }], ['list'], ...(isCI ? [['github'] as const] : [])],
  globalTeardown: './tests/stress/global-teardown.ts',
  use: {
    baseURL,
    headless: true,
    // D-Q9 DELEGATED: 1280×720 matches the most common default viewport; the
    // default 800×450 crops the sidebar in narrow-viewport tests. Retained only
    // on failure to bound storage growth.
    video: { mode: 'retain-on-failure', size: { width: 1280, height: 720 } },
    // 'on-first-retry' captures trace on retry 1 only; subsequent retries skip
    // to stay under the CI runtime envelope (AC-12).
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
