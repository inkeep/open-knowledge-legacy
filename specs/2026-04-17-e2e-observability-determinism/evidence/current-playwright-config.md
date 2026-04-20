---
name: Current Playwright configuration snapshot
description: Verbatim capture of `packages/app/playwright.config.ts` at baseline commit `432a834b`. Serves as the "before" state for G2's observability additions.
sources: packages/app/playwright.config.ts
collected_at: 2026-04-17
---

# Playwright config — baseline state

Baseline: `432a834b` on `origin/main`. Verbatim:

```typescript
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Module-scope creation: runs at config-eval time, before any setup tasks.
const contentDir = mkdtempSync(join(tmpdir(), 'ok-playwright-'));
writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
mkdirSync(join(contentDir, 'sidebar-folder'), { recursive: true });
writeFileSync(join(contentDir, 'sidebar-folder', 'nested-doc.md'), '', 'utf-8');

const port = process.env.VITE_PORT || '5173';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/stress',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 120_000,
  retries: 0,                                          // ← G2 target
  globalTeardown: './tests/stress/global-teardown.ts',
  use: {
    baseURL,
    headless: true,
    // ← G2 additions will land here: video, trace, screenshot
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
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
```

## Observations

- **`retries: 0`** — explicit. G2 target: `retries: process.env.CI ? 1 : 0`.
- **No `use.video`** — Playwright default is off. G2 target: `use.video: 'retain-on-failure'`.
- **No `use.trace`** — Playwright default is off. G2 target: `use.trace: 'retain-on-failure'`.
- **No `use.screenshot`** — Playwright default is off. G2 target: `use.screenshot: 'only-on-failure'`.
- **Cross-browser projects present** (chromium + webkit + firefox) — correct; do not touch.
- **No `reporter`** — Playwright default is list reporter. For CI with artifact upload, we likely want `html` reporter + retain the report on failure.
- **No `fullyParallel`** — defaults to `false` (tests within a file run serially). Playwright-stability spec's AC1 calls for `--workers=4` — that implies `fullyParallel: true` is desired post-landing. We can set `fullyParallel` explicitly now OR leave it to playwright-stability. Decision deferred to Phase 4.
- **No `workers`** — defaults to CI detection (1 worker on GitHub's ubuntu-latest, N locally). Same deferral as `fullyParallel`.
- **`timeout: 120_000`** (per-test timeout) — appropriate for complex E2E paths. No change.
- **`webServer.reuseExistingServer: false`** — intentional; prevents stale server contamination across runs. No change.

## CI workflow — current state (`.github/workflows/ci.yml` playwright job)

The Playwright job currently:
1. Sets up Bun + Node 22.
2. Installs chromium, webkit, firefox (split `install-deps` per our earlier fix).
3. Runs `bunx turbo run test:e2e`.
4. **No artifact upload on failure** — this is the primary G2 gap on the CI side.

## Scope nuance

- G2 additions to `playwright.config.ts` are pure config — no API surface, no behavioral change for passing tests. Cost is ~10 LoC.
- CI workflow YAML changes are ~15 LoC for `actions/upload-artifact@v4` step on failure.
- Total G2 delta: ~25 LoC across 2 files. High leverage.
