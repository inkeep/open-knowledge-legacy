---
title: evidence
description: ""
generated: true
schema_version: 1
---

## Articles

- **[crdt-stress-s6-triage](specs/2026-04-17-e2e-observability-determinism/evidence/crdt-stress-s6-triage.md)** — Empirical narrowing of crdt-stress S6 flake — reproduces locally, generic 404 that filter misses
- **[current-playwright-config](specs/2026-04-17-e2e-observability-determinism/evidence/current-playwright-config.md)** — Verbatim capture of `packages/app/playwright.config.ts` at baseline commit `432a834b`. Serves as the "before" state for G2's observability additions.
- **[current-state-inventory](specs/2026-04-17-e2e-observability-determinism/evidence/current-state-inventory.md)** — Inventory of the E2E test suite, config, CI workflow, and app hooks. Re-verified 2026-04-17 post-PR-#185-merge + chromium-only revert (commit 940d5a0a) + cherry-pick 6a4c92ea.
- **[docs-open-f11-triage](specs/2026-04-17-e2e-observability-determinism/evidence/docs-open-f11-triage.md)**
- **[fr-7a-audit](specs/2026-04-17-e2e-observability-determinism/evidence/fr-7a-audit.md)**
- **[main-ci-failure-inventory](specs/2026-04-17-e2e-observability-determinism/evidence/main-ci-failure-inventory.md)** — Enumerated E2E test failures from CI run 24548842566 on origin/main @ 2026-04-17T05:19Z
- **[sidebar-folder-flake-triage](specs/2026-04-17-e2e-observability-determinism/evidence/sidebar-folder-flake-triage.md)** — Root-cause narrowing for ux-interactions.e2e.ts:209 sidebar-folder flake — deterministic local repro, React state sync or render-time side-effect suspected
- **[slash-command-waitfortimeout-sitemap](specs/2026-04-17-e2e-observability-determinism/evidence/slash-command-waitfortimeout-sitemap.md)**
- **[waitfortimeout-inventory](specs/2026-04-17-e2e-observability-determinism/evidence/waitfortimeout-inventory.md)** — Exhaustive count and classification of `page.waitForTimeout(N)` calls across the E2E suite, keyed to replacement strategy.
- **[webkit-cors-trace](specs/2026-04-17-e2e-observability-determinism/evidence/webkit-cors-trace.md)** — Verified failure mechanism for the 5 webkit-skipped tests in slash-command.e2e.ts. Distinguishes CORS race (3 CORS skips + 1 describe covering accessibility tests) from the unrelated webkit overflow-scroll skip.
- **[workers-calibration](specs/2026-04-17-e2e-observability-determinism/evidence/workers-calibration.md)**
