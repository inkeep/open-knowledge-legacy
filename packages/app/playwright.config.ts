import { defineConfig } from '@playwright/test';

/**
 * Per-worker server isolation: the `webServer` block was removed in favor of
 * a worker-scoped fixture at `tests/stress/_helpers/fixtures.ts`. Each
 * Playwright worker spawns its own `bun run dev` process on a
 * kernel-allocated port + unique tmpdir, eliminating the cross-worker CPU
 * contention that created a structural flake class under shared webServer.
 *
 * See `reports/e2e-isolation-and-broadcaster-lifecycle/REPORT.md` Track A for
 * the architectural evidence (React Router v7 precedent: per-test fixtures
 * without `webServer`; Hocuspocus's own tests allocate port 0 per test).
 *
 * Per-test `baseURL` comes from the `baseURL` fixture in `fixtures.ts`, which
 * reads the worker's `workerServer.baseURL`. Consumers use
 * `test('...', async ({ page, api, baseURL }) => ...)` — no
 * `process.env.VITE_PORT` lookup required.
 */

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
  // D-Q5 revisited 2026-04-19 per specs/2026-04-19-ci-signal-quality/SPEC.md
  // (FR-4 / D-Q3). Prior D-Q5 LOCKED (2026-04-17) set failOnFlakyTests: true
  // so retry-success still failed the PR. Operational evidence over the
  // following two weeks showed retry-pass promoting infrastructure noise
  // (WebSocket EPIPE/ECONNRESET, transient CC1 broadcast jitter) to PR-red,
  // compounding the architectural CRDT fuzz/stress residual into an effective
  // ~22% PR-tier green rate on correct code. New decision locks
  // failOnFlakyTests: false globally — retries absorb infra flake, and
  // persistent flake detection moves to nightly-e2e-stability.yml's
  // --repeat-each=3 --workers=1 sweep (which auto-opens GitHub issues
  // labeled 'e2e-flake' on consistent failure). See
  // specs/2026-04-17-e2e-observability-determinism/evidence/d-q5-amendment-2026-04-19.md
  // for the full revisit rationale.
  retries: isCI ? 2 : 0,
  failOnFlakyTests: false,
  forbidOnly: isCI,
  // D-Q7 LOCKED at workers=4 on `ubuntu-64gb` (16+ vCPU / 64 GB RAM shared
  // runner). With per-worker server fixtures (Track A), each worker spawns
  // its own Vite+Hocuspocus process + content directory, so worker count is
  // bounded by runner CPU + Vite cold-start budget rather than CRDT state
  // contention. Calibration history preceding the per-worker migration:
  //   - ubuntu-latest (2 vCPU), workers=4 × retries=2: cancelled at 15:00
  //     (PR #193 run 24572488164) — oversubscribed 2×
  //   - ubuntu-latest (2 vCPU), workers=2 × retries=2: cancelled at 15:14
  //     (PR #193 run 24573513956) — still oversubscribed
  //   - ubuntu-latest (2 vCPU), workers=1 × retries=2: 12m24s clean
  //     (PR #193 run 24574575469) — serial with retries, no CPU contention
  //   - ubuntu-64gb (≥16 vCPU), workers=4 × retries=2: fits comfortably —
  //     the runner has headroom for 4 × (playwright worker + chromium
  //     process + dev server) with retries='2'.
  // Per-test docName isolation (PR #185) + per-worker server isolation
  // (this migration) together make fullyParallel fully safe.
  // See `specs/2026-04-17-e2e-observability-determinism/evidence/workers-calibration.md`
  // for the full calibration evidence. If the CI runner tier changes back to
  // 2 vCPU (e.g., ubuntu-64gb quota exhausted), re-downgrade to workers=1.
  fullyParallel: true,
  workers: isCI ? 4 : undefined,
  // D-Q8 DELEGATED: HTML report as artifact; list locally + github reporter on
  // CI for inline PR annotations.
  reporter: [['html', { open: 'never' }], ['list'], ...(isCI ? [['github'] as const] : [])],
  use: {
    // `baseURL` is populated by the worker-scoped fixture in
    // `tests/stress/_helpers/fixtures.ts`. Leaving it unset here so the
    // fixture's override takes effect cleanly per worker.
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
});
