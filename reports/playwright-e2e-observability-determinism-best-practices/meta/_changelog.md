# Changelog — Playwright E2E Observability + Determinism Best Practices

## 2026-04-17 — Initial report + audit + corrections

**Creation:** Report scaffolded with 10-dimension rubric (condition waits, test hooks, video/trace/screenshot, CI artifacts, retries, webkit CORS, `waitUntil` semantics, enforcement, helpers, skip vs filter vs fix). Evidence gathered from Playwright official docs, 7-project OSS config survey (BlockNote, Milkdown, GitButler [×2 configs], Cline, Plasmic, Penpot), GitHub issue tracker, and community guides.

**Audit:** Spawned /audit subprocess. 14 findings (6 High, 5 Medium, 3 Low). All 14 verified via adversarial investigation (web fetches of actual issue threads, direct reads of OSS configs, raw-content fetch of the `no-wait-for-timeout` rule doc). Every finding confirmed with HIGH confidence.

**Corrections applied (per /assess-findings):**

- **[H1]** `flakyTestsFail` → `failOnFlakyTests` (Playwright v1.52+). REPORT.md Dimension 5 + evidence/playwright-official-docs.md. Verified via [TestConfig docs](https://playwright.dev/docs/api/class-testconfig).
- **[H2]** Biome PR #8960 merged 2026-02-16; `noPlaywrightWaitForTimeout` ships today (nursery, v2.4.2+). REPORT.md Executive Summary + Dimension 8 + evidence/enforcement-mechanisms.md. Verified via direct PR page fetch.
- **[H3]** Issue #19904 — corrected: Chromium is the failing browser (per issue body "Tests are running quite fine with both Firefox and Webkit, but with Chromium, I can't fix this issue"); NOT WebKit/Firefox. REPORT.md Dimension 6 + evidence/webkit-headless-cors.md.
- **[H4]** Issue #2661 — corrected: `--disable-web-security` is a Chromium-only flag; WebKit launcher doesn't accept arbitrary Chromium args. REPORT.md Dimension 6 fix table + evidence/webkit-headless-cors.md.
- **[H5]** Removed fabricated blockquote attributed to `no-wait-for-timeout` rule doc. Verified raw doc contents via curl — actual doc is ~12 lines with code examples only, no prose "anti-pattern" framing. Replaced with faithful summary across REPORT.md Dimension 8 + evidence/enforcement-mechanisms.md + evidence/condition-wait-primitives.md.
- **[H6]** Corrected retries statistic from "5 of 7" to "6 of 7" OSS projects. Penpot's actual config is `retries: process.env.CI ? 2 : 0` (= 2 on CI), NOT `retries: 0`. BlockNote uses unconditional `retries: 2`. REPORT.md Dimension 5 + evidence/oss-config-survey.md.
- **[M1]** Plasmic trace config corrected: `retain-on-failure`, NOT `on-first-retry`. Updated "dominant convergence" framing to "plurality" in REPORT.md Exec Summary + Dimension 3 + evidence/oss-config-survey.md.
- **[M2]** Penpot artifact description clarified: captures trace + video locally via `retain-on-failure`; CI upload step not verified in this audit pass. evidence/oss-config-survey.md.
- **[M3]** `actions/upload-artifact@v4` updated to `@v7` (current stable, 2026-02-26). BlockNote + Milkdown both use v7 in their workflows. REPORT.md Dimension 4 + evidence/ci-artifact-patterns.md.
- **[M4]** Playwright annotation "Reporting" column qualified with reporter-specific caveat — `fixme` is surfaced as a distinct label in the HTML reporter but Playwright's underlying status bucket is "skipped" with annotation metadata. REPORT.md Dimension 10.
- **[M5]** Issue #4031 removed from WebKit-specific citation list (it's a Chromium thread); moved to "Cross-browser CORS context" section. REPORT.md Dimension 6 + evidence/webkit-headless-cors.md.
- **[L1]** Helper-suite-size thresholds normalized to 5-20 / 15-40 / 40+ across Exec Summary, Key Findings, and Dimension 9. REPORT.md.
- **[L2]** BlockNote retries clarified as unconditional `retries: 2` (not CI-conditional). evidence/oss-config-survey.md.
- **[L3]** Milkdown hook count — left as-is with the core claim ("exposes hooks unconditionally"); the exact count isn't load-bearing for any conclusion. Not reworded.

**Post-correction state:** REPORT.md + 10 evidence files all carry current and verified claims. Factual stance preserved — no prescriptive recommendations to Open Knowledge introduced during corrections.

**No decision reopens.** All findings are factual/coherence corrections; none change the spec's downstream scope or recommendations.

---

## 2026-04-17 — Nested fanout consolidation

### Fanout run: 2026-04-17-follow-ups

- **Directions pursued:**
  - A — CRDT / Yjs / Hocuspocus readiness signals in Playwright
  - B — React 19 Suspense + `useTransition` + Playwright patterns
  - C — Debounce / animation / composed-event wait patterns
  - D — Editor-specific E2E test design (BlockNote / Milkdown / TipTap / Lexical / etc.)
  - E — CI trace-artifact size management for editor E2E
- **Sub-reports:** 5 successful, 0 failed. Each produced REPORT.md + 5-6 evidence files with primary-source citations.
- **Consolidation:** `/consolidate` skill produced enriched REPORT.md (472 → 1108 lines) + 5 new evidence files + CLAIMS.md (223 lines).
- **Claims inventory:** `fanout/2026-04-17-follow-ups/CLAIMS.md` — 54 claims tracked; 3 cross-source conflicts and 1 conclusion disagreement identified and reconciled.
- **Sub-reports preserved at:** `fanout/2026-04-17-follow-ups/` (auditability retained per fanout protocol).

### REPORT.md changes

- Frontmatter: added 10 subjects + 5 topics, expanded description.
- Executive Summary: added "Deep-dive follow-ups (2026-04-17 fanout) — at-a-glance" block (5 paragraphs, one per sub-report).
- New major section: **"Deep-dive follow-ups (2026-04-17 fanout)"** with 5 subsections (A-E), each structured Finding / Evidence / Implications / Decision triggers / Remaining uncertainty.
- New "Cross-cutting observations" subsection threading 6 connections across sub-reports (data-attribute conventions spanning C + D; Logseq `rtc-tx` in A connecting to C's state-machine pattern; etc.).
- Limitations & Open Questions extended with 4 follow-up-specific gaps.
- References: ~70 new external primary sources organized under follow-up A/B/C/D/E headings.

### Evidence changes

Five new evidence files added to `evidence/`:
- `crdt-readiness-signals.md` (372 lines) — 9-project CRDT survey
- `react19-suspense-patterns.md` (209 lines) — React 19 × Playwright
- `debounce-animation-patterns.md` (267 lines) — Clock API, WAAPI `.finished`, data-state machines
- `editor-e2e-patterns.md` (341 lines) — BlockNote/Milkdown/Lexical/TipTap code-first catalog
- `artifact-size-management.md` (216 lines) — trace/video sizes, GHA storage economics

### Conflicts resolved

- **BlockNote `waitForTimeout` count** — original report said 84; D's survey said 76. Reconciled: different scopes (84 includes all test helpers; 76 is test-body only). Documented in CLAIMS.md with both counts + scope qualifiers.
- **"150 MB per failing CI run"** — parent's community-guide figure vs E's data-backed range. E's range supersedes; parent quote flagged as approximate.
- **Parent "plurality" vs E's narrower editor-OSS convergence** — E's finding narrowed to editor-specific subset, not all OSS projects. REPORT.md now distinguishes "community-wide" from "editor-OSS-specific" convergence where applicable.
- **A's "no `window.__provider` convention" vs D's "universal test-hook template"** — different question framings (A asked about a specific naming, D surveyed the broader pattern). Reconciled in prose: no single naming convention, but DEV-gated `window.__*` hooks are a recognized pattern across editor projects.

### Fanout validation

- Zero `fanout/` path leakage in consolidated REPORT.md + evidence files (external primary sources only).
- All 5 sub-reports preserved at `fanout/2026-04-17-follow-ups/` for audit trail.
- RUN.md closed (Status: Closed; all 5 directions marked succeeded).

---

## 2026-04-17 — Targeted follow-up: `page.clock` × Y.js / Hocuspocus compatibility

### Why

Fanout C surfaced Playwright's `page.clock` (v1.45+) as a potential primitive for debounce-advancement testing. The unresolved question — does `page.clock` interfere with Y.js internal timers and Hocuspocus heartbeat/reconnect logic — directly gates the parent spec's G1 architectural choice (which debounce-wait primitive to adopt). Commissioned as a focused follow-up (~20 min of work) vs. a full research pass.

### Method

Direct source inspection of `node_modules/yjs/dist/yjs.cjs` (yjs@13.6.30) and `node_modules/@hocuspocus/provider/dist/hocuspocus-provider.esm.js`. Cross-referenced with Playwright Clock API docs and related issue threads (#31772, #32486).

### Findings

- `page.clock.install()` overrides exactly: `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`, `performance`, `Event.timeStamp`. Does NOT override: `queueMicrotask`, `MessageChannel.postMessage`, WebSocket timers, `fetch`.
- Y.js uses `performance.now` ×13 and `setTimeout` ×2 — all overridden under `page.clock`.
- Hocuspocus provider uses `setInterval` ×3 (awareness heartbeat, connection checker, forceSync) and `setTimeout` ×1 (reconnect delay) — all overridden.
- WebSocket messages flow in real time regardless of `page.clock` — initial sync protocol and Yjs update messages unaffected.
- **Verdict:** Compatible with UI-debounce tests if installed AFTER `provider.synced`; incompatible with connection-lifecycle tests.

### Artifacts added

- New evidence file: `evidence/page-clock-crdt-compatibility.md` (with compatibility matrix, recommended `installClockAfterSync` helper shape, negative searches for community usage).
- REPORT.md: Executive Summary "Targeted follow-up" sub-block added; new "Targeted follow-up — `page.clock` × Y.js / Hocuspocus compatibility" section appended after Cross-cutting observations; References updated.

### Decision impact on downstream spec

This resolves an open G1 question. The spec can now document:
- **Default G1 pattern:** `waitForFunction` against state (works everywhere).
- **Opt-in secondary pattern:** `page.clock.install()` via `installClockAfterSync(page)` helper, for tests where debounce-timing is the subject and connection-lifecycle is not.
- **STOP rule:** do not install `page.clock` in tests that exercise Hocuspocus disconnect/reconnect/forceSync.

Not a 1-way door. Both patterns can coexist.

