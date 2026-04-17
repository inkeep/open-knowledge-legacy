---
"@inkeep/open-knowledge": patch
---

ci: Playwright E2E suite is now deterministic and debuggable on failure

- **Event-coupled waits.** Removed all 73 `page.waitForTimeout(N)` magic
  sleeps and the 1 `waitUntil: 'networkidle'` from the E2E suite. Every
  wait now couples to a real signal (CRDT propagation, menu render,
  selection flush, debounce). CI contention no longer causes spurious
  failures from "200ms should be enough" gone wrong.
- **Failure observability.** On CI, every test failure now uploads the
  Playwright HTML report + `test-results/` (trace, video, screenshot)
  with 14-day retention. Configure: `retries: 2`, `failOnFlakyTests:
  true` (retry-success still fails the PR), `trace: 'on-first-retry'`,
  `video: 'retain-on-failure'` at 1280×720, `screenshot: 'only-on-
  failure'`. Developers can `bunx playwright show-trace` on the
  downloaded artifact instead of re-running locally to reproduce.
- **Named flake fixes.** Resolved 4 named flakes from main CI:
  sidebar-folder (under user investigation), QA-022 chunked-paste perf
  (now baseline-relative — `max(2 × p50Baseline, 32ms)` reading from
  `perf-baseline.json`), crdt-stress S6 (root cause: `/api/config`
  404 was logged as critical-error by an over-strict filter),
  docs-open F11 (root cause: `Promise.all` of clicks didn't preserve
  array order — sequential awaits restore determinism).
- **PR #188 absorbed fixes.** Cherry-picked from Andrew's PR #188:
  Branch C wikiLink parseHTML priority-100, `wrapAsInlineCode` mark
  handler with 9 unit tests, FR-19 `<pre>` regex tightening
  (`/<pre[\s>]/`), FR-15 Source empty-selection preventDefault.
- **DEV-gating.** `window.__agentFlashState` writes wrapped in
  `if (import.meta.env.DEV)` so production bundles tree-shake the test
  hook. STOP rule prevents future ungated `window.__*` assignments
  outside the documented allowlist.
- **STOP rule enforcement.** New mechanical test
  (`tests/integration/e2e-stop-rules.test.ts`) fails CI on any
  reappearance of `page.waitForTimeout`, `waitUntil: 'networkidle'`,
  busy-wait `Promise+setTimeout`, `page.pause`, webkit-skip ratchet,
  inner-helper-import (must use barrel), or ungated `window.__` write.
  Zero allowlist; per-pattern failure messages list `file:line`.
- **Architectural precedent #20** added to `AGENTS.md` documenting the
  E2E test-infra conventions for future contributors.

User-facing impact: faster CI feedback on real regressions, no more
"flake or real?" guessing, debuggable failures from CI artifacts alone.
