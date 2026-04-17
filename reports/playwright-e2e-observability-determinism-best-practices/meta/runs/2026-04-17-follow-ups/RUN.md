# Run: 2026-04-17-follow-ups

**Status:** Closed
**Intent:** Fanout — 5 parallel deep-dive sub-reports
**Created:** 2026-04-17
**Closed:** 2026-04-17
**Consolidation:** /consolidate produced REPORT.md (1108 lines) + 5 new evidence files + CLAIMS.md. 54 claims tracked; 3 conflicts reconciled. Zero fanout/ path leakage verified.

## Parent Context

**Purpose:** Provide an evidence-backed factual baseline for the Playwright community's conventions on (a) replacing hardcoded timing waits with condition-based waits, (b) making CI failures debuggable via retries + trace + video + screenshot + artifact upload, (c) handling WebKit headless localhost CORS quirks, and (d) organizing shared helpers — for consumption by the `2026-04-17-e2e-observability-determinism` spec.

**Primary question:** What are the community conventions for E2E test observability + determinism that should inform the downstream spec's G1/G2/G3 decisions?

**Non-goals (inherited):**
- Per-test docName isolation (playwright-stability spec owns this)
- Bridge-convergence fuzz (user-excluded)
- Playwright vs Cypress/WebdriverIO tool comparison (covered by agent-browser-vs-playwright-crdt-testing report)
- 1P Open Knowledge codebase analysis (spec scope, not research scope)
- Mobile / iOS / real-device testing (separate scope)

## Selected Follow-up Directions

| # | Direction | Facet Count | Source Diversity | Assessment |
|---|---|---|---|---|
| A | CRDT/Y.js/Hocuspocus readiness signals in Playwright | 4 | Multi-source (Outline, BlockNote, HedgeDoc, Logseq, AFFiNE) | Heavy |
| B | React 19 Suspense + useTransition + Playwright waits | 3 | Multi-source (React docs, Playwright issues, OSS adopters) | Heavy |
| C | Condition-wait patterns for debounced/animated/composed-event UI state | 3 | Multi-source (community patterns, OSS examples) | Heavy |
| D | Editor-specific E2E test design patterns (BlockNote/Milkdown/TipTap) | 3 | OSS code-first | Heavy |
| E | CI trace-artifact size management for editor E2E | 2 | Moderate (GHA docs, community threads) | Moderate-leaning-heavy |

All 5 assessed as heavy enough to warrant nested fanout over in-context subagents.

## Sub-instance Tracking

| Direction | Status | Report Path | Notes |
|---|---|---|---|
| A — CRDT readiness signals | succeeded | fanout/2026-04-17-follow-ups/crdt-readiness-signals-playwright/ | |
| B — React 19 Suspense + Playwright | succeeded | fanout/2026-04-17-follow-ups/react19-suspense-playwright/ | |
| C — Debounce/animation wait patterns | succeeded | fanout/2026-04-17-follow-ups/debounce-animation-wait-patterns/ | |
| D — Editor E2E test design | succeeded | fanout/2026-04-17-follow-ups/editor-e2e-test-design/ | |
| E — Trace artifact size management | succeeded | fanout/2026-04-17-follow-ups/trace-artifact-size-mgmt/ | |

## Fanout Directory

`reports/playwright-e2e-observability-determinism-best-practices/fanout/2026-04-17-follow-ups/`
