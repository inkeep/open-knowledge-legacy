# Consolidation claim inventory — 2026-04-17 follow-ups

**Consolidation date:** 2026-04-17
**Target report:** `playwright-e2e-observability-determinism-best-practices/REPORT.md`
**Sources consolidated:** 5 fanout sub-reports + 28 sub-report evidence files + existing parent REPORT
**Output additions:** 1 new major section ("Deep-dive follow-ups (2026-04-17 fanout)"), 5 new evidence files, 1 updated executive summary paragraph, 1 updated frontmatter (subjects + topics + description).

---

## Source inventory

| ID | Source | Type | Location |
|---|---|---|---|
| P | Parent REPORT.md | Existing factual survey (10 dimensions) | `reports/playwright-e2e-observability-determinism-best-practices/REPORT.md` |
| A | CRDT readiness signals sub-report + 5 evidence files | Follow-up research | `fanout/2026-04-17-follow-ups/crdt-readiness-signals-playwright/` |
| B | React 19 Suspense + Playwright sub-report + 6 evidence files | Follow-up research | `fanout/2026-04-17-follow-ups/react19-suspense-playwright/` |
| C | Debounce/animation/composed-event sub-report + 5 evidence files | Follow-up research | `fanout/2026-04-17-follow-ups/debounce-animation-wait-patterns/` |
| D | Editor E2E test design sub-report + 6 evidence files | Follow-up research | `fanout/2026-04-17-follow-ups/editor-e2e-test-design/` |
| E | Trace artifact size + GHA storage sub-report + 6 evidence files | Follow-up research | `fanout/2026-04-17-follow-ups/trace-artifact-size-mgmt/` |

---

## Claim inventory (high-signal findings by source)

### From A — CRDT readiness signals

| Claim | Confidence | Source | Consolidated into |
|---|---|---|---|
| A1: Logseq ships `<div.hidden data-testid="rtc-tx">{:local-tx N :remote-tx M}</div>` as production DOM element | CONFIRMED (code: `src/main/frontend/components/rtc/indicator.cljs:176`) | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A2: Hocuspocus exposes `provider.synced` (property), `provider.on('synced')` (event), `onSynced` (constructor callback), and `hasUnsyncedChanges` (event + property) | CONFIRMED (code: `HocuspocusProvider.ts:104,145,194`) | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A3: Outline's app-layer pattern tracks two sync axes (`isLocalSynced && isRemoteSynced`) — IndexedDB + WebSocket | CONFIRMED (code: `MultiplayerEditor.tsx:64-65, 159-167, 256-260`) | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A4: Tiptap Collaboration extension exposes `onFirstRender` — tighter bound than `provider.synced` | CONFIRMED (code: `extension-collaboration/src/collaboration.ts:71, 216`) | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A5: y-prosemirror requires 1-macrotask wait post-dispatch (documented in `safeDispatch` test helper) | CONFIRMED (code: `tests/suggestions.test.js:57-66`) | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A6: BlockNote still uses `waitUntil: 'networkidle'` on page navigation in `colors.test.ts:16` | CONFIRMED | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A7: tldraw exposes `window.editor` for tests to call public API directly | CONFIRMED (code: `apps/examples/e2e/shared-e2e.ts:44-52`) | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A8: tldraw has `sleep(2000)` with "historically flaky without the sleep" comment at 2 locations | CONFIRMED | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A9: `window.__provider` / `window.__hocuspocus` / `data-synced` boolean attribute conventions are NOT FOUND in any surveyed test file | CONFIRMED (negative) | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A10: AFFiNE uses named fixture `waitForEditorLoad(page)`; implementation not captured | CONFIRMED (but uncertain internals) | A | REPORT §A, evidence/crdt-readiness-signals.md |
| A11: Logseq's `with-wait-tx-updated` macro polls counter convergence with 15-iteration / ~22.5s budget | CONFIRMED (code: `clj-e2e/src/logseq/e2e/rtc.clj:14-37`) | A | REPORT §A |

### From B — React 19 Suspense + Playwright

| Claim | Confidence | Source | Consolidated into |
|---|---|---|---|
| B1: No named pattern exists for React 19 concurrency + Playwright as of April 2026 | CONFIRMED (negative — absence is the finding) | B | REPORT §B (headline), evidence/react19-suspense-patterns.md |
| B2: `startTransition` returns `undefined`; no external completion signal | CONFIRMED (official React docs) | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B3: Suspense fallback `role="status"` + `aria-busy` is MDN-aligned convention; React docs do NOT prescribe ARIA roles | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B4: `isPending` is component-internal; testable only when mirrored to DOM (`aria-busy={isPending}`) | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B5: `<Activity mode="hidden">` uses `display: none`; Playwright's `toBeVisible()` / `getByRole` already discriminate | CONFIRMED (React 19.2 blog + Playwright actionability docs) | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B6: Multiple Activity mounts with duplicate accessible names may need `data-active` wrapper | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B7: Error boundary `onReset` fires BEFORE internal error state clears — cache invalidation ordering is load-bearing | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B8: React 19 changed parallel Suspense siblings to serial waterfalls per TkDodo | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B9: `waitForLoadState('networkidle')` hangs on subscription-backed apps (#19835) | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B10: WebKit + Next.js App Router navigation bug (#26091) | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B11: RTL Suspense bug (#1375) is JSDOM-specific; Playwright real-browser not affected | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B12: Playwright `waitForTransition` (#15660) and `getByRole({busy: false})` (#36233) feature requests open but unlanded | CONFIRMED | B | REPORT §B, evidence/react19-suspense-patterns.md |
| B13: "Wait for transition to both start AND complete" is NOT FOUND as a documented pattern | CONFIRMED (negative) | B | REPORT §B, evidence/react19-suspense-patterns.md |

### From C — Debounce / animation / composed-event

| Claim | Confidence | Source | Consolidated into |
|---|---|---|---|
| C1: Playwright Clock API (v1.45+) — `install()` + `runFor(ms)` for deterministic debounce advance | CONFIRMED (official docs) | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C2: Fake timers → "10-100× improvement" in test speed for debounced inputs per Testdouble | CONFIRMED (single-vendor claim) | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C3: Playwright's built-in `stable` actionability check covers bounding-box stability but NOT visual-only animations (opacity/color/filter) — #4055 since 2020 | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C4: `element.getAnimations().finished` (WAAPI) is the most general animation-completion primitive — covers CSS transitions, CSS animations, WAAPI calls | CONFIRMED (MDN) | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C5: `transitionend` listener with fallback is the pre-WAAPI alternative | CONFIRMED (Playwright issue #4055 comments) | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C6: `toHaveScreenshot({ animations: 'disabled' })` fast-forwards finite animations; screenshot-scoped only | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C7: `aria-activedescendant` (W3C APG-standardized) is the terminal observable for combobox/menu cascades | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C8: `aria-busy="false"` (W3C) is the portable "subtree settled" signal across libraries | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C9: Radix UI `data-state="open"\|"closed"` is dominant React headless convention | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C10: Each React headless library (Radix, Headless UI, React-Aria, Ariakit) has its own vocabulary — no cross-library portable state-machine convention beyond `aria-busy` | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C11: Radix's `data-state` is lead indicator (flips before animation); pair with `getAnimations().finished` for "opened AND done" | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C12: Three animation-disable mechanisms (per-screenshot, per-context `reducedMotion`, library-level skip) + nuclear build-flag stubs | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C13: `prefers-reduced-motion: reduce` requires app CSS to honor it; silent no-op otherwise | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C14: Community-accepted split: disable animations for visual regression; keep on for correctness tests | CONFIRMED | C | REPORT §C, evidence/debounce-animation-patterns.md |
| C15: lodash `_.debounce` + fake timers hazard — recursive setTimeout can infinite-loop with `runAllTimers()` | CONFIRMED (lodash #2893) | C | REPORT §C, evidence/debounce-animation-patterns.md |

### From D — Editor E2E test design

| Claim | Confidence | Source | Consolidated into |
|---|---|---|---|
| D1: Universal template: `focusEditor → page.keyboard.type(str) → assert` | CONFIRMED (all 4 projects) | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D2: `page.keyboard.type()` for multi-char input in 100% of observed cases; `press` for race-sensitive single keys | CONFIRMED | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D3: Editor state exposed on `window` universally: `window.ProseMirror.getJSON()` (BlockNote), `window.__getMarkdown__()` (Milkdown), `window.lexicalEditor` (Lexical) | CONFIRMED | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D4: Three helper organization shapes: flat `utils/` (BlockNote), single `misc/index.ts` (Milkdown), split `utils/`+`keyboardShortcuts/` (Lexical) | CONFIRMED | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D5: No surveyed project uses Page Object Model classes or `test.extend` fixtures wrapping editor operations | CONFIRMED | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D6: Three cross-platform shortcut strategies coexist: `ControlOrMeta` (BlockNote), `process.platform` (Milkdown), `navigator.platform` (Lexical) | CONFIRMED | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D7: Slash-menu pattern = `waitForSelector(menuClass)` + ~100ms focus-handoff buffer + filter + Enter/click | CONFIRMED | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D8: Five assertion styles coexist: locator auto-retry, markdown round-trip, JSON snapshot, HTML tagged-template, PNG | CONFIRMED | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D9: BlockNote: 76 `waitForTimeout` in end-to-end specs (84 incl. utils); Milkdown: 26; Tiptap Playwright: 0 | CONFIRMED | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D10: Milkdown's `waitNextFrame` uses double `requestAnimationFrame` as deterministic one-paint wait | CONFIRMED (code: `e2e/tests/misc/index.ts:62-72`) | D | REPORT §D, evidence/editor-e2e-patterns.md |
| D11: No surveyed project deploys a STOP rule against `waitForTimeout` | CONFIRMED (negative) | D | REPORT §D, evidence/editor-e2e-patterns.md |

### From E — Trace artifact size + GHA storage

| Claim | Confidence | Source | Consolidated into |
|---|---|---|---|
| E1: Trace size typical 1-50 MB; complex editor apps ~47 MB | CONFIRMED (Momentic guide) | E | REPORT §E, evidence/artifact-size-management.md |
| E2: File-upload / large-payload tests push to multi-GB (#20157: 135 MB trace, 367 MB uncompressed) | CONFIRMED (Playwright issue) | E | REPORT §E, evidence/artifact-size-management.md |
| E3: Video ~7.5 MB/min on Chromium (VP8 at 1 Mbit/s hardcoded, #31424) | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |
| E4: GHA free artifact storage tiers: Free 500 MB / Pro 1 GB / Team 2 GB / Enterprise Cloud 50 GB; $0.25/GB-month overage | CONFIRMED (GitHub billing docs) | E | REPORT §E, evidence/artifact-size-management.md |
| E5: 500 artifacts per job cap | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |
| E6: Per-artifact byte ceiling NOT currently published in GHA docs (v3-era 2 GB/5 GB figures obsolete) | CONFIRMED (negative) | E | REPORT §E, evidence/artifact-size-management.md |
| E7: upload-artifact v7.0.0 released 2026-02-26 with `archive: false` for unzipped uploads; v3 deprecated 2024-04-16 | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |
| E8: `if: failure()` gate = ~20× byte reduction at 95%-green pipelines (higher leverage than retention-days 30d→7d) | CONFIRMED (arithmetic) | E | REPORT §E, evidence/artifact-size-management.md |
| E9: Editor-heavy OSS convergence: `trace: 'on-first-retry'` + `video: off` + `retention-days: 7` + `if: failure()` (Milkdown, Lexical) | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |
| E10: BlockNote outlier: 30-day retention + `!cancelled()` for blob-merge-report workflow | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |
| E11: Testrig case study: 60%+ storage reduction from 640×480 video + screenshot only-on-failure + ffmpeg post-encode (Patterns 4 + 5 + 12 stacked) | CONFIRMED (single vendor) | E | REPORT §E, evidence/artifact-size-management.md |
| E12: GHA Community discussion #166576: team collapsed 900 MB upload to 175 MB tar.gz (per-file overhead, not compression, dominant saving) | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |
| E13: Trace format stable 1.40-1.59 — zero compression-format changes per release-note scan | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |
| E14: Playwright compute prices reduced up to 39% in 2026-01-01 changelog; storage prices unchanged | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |
| E15: Storage usage recalculated every 6-12 hours; GitHub Support cannot raise storage quotas | CONFIRMED | E | REPORT §E, evidence/artifact-size-management.md |

---

## Conflicts & reconciliation

### Conflict 1: BlockNote `waitForTimeout` count differs between A (84) and D (76)

| Source | Count | Scope |
|---|---|---|
| A | 84 | Includes `tests/src/utils/` helper files (inferred from subagent phrasing "across ~20 specs" in early survey) |
| D | 76 | Explicitly scoped to `tests/src/end-to-end/` spec files only |

**Classification:** Complementary, not conflicting — different scopes measured. D's count (76) is the specs-only figure; A's count (84) includes utils. Both are correct within their stated scope.

**Resolution:** The consolidated REPORT cites both figures explicitly — "76 in end-to-end specs; 84 including utils." Neither is a misstatement.

### Conflict 2: Parent's "~150 MB per failing CI run" estimate vs. E's data-backed range

| Source | Estimate | Basis |
|---|---|---|
| Parent P (Dimension 3) | "~150 MB per failing CI run" | Informal mid-range ballpark (no cited measurement) |
| E | 5-250 MB range, single-failing-test typical 1-50 MB, complex editor apps ~47 MB, file-upload multi-GB | Primary sources: Momentic guide, #20157, arithmetic from published trace composition |

**Classification:** Freshness / refinement, not conflict — parent's estimate is a reasonable mid-range figure but E provides data-backed granularity.

**Resolution:** The consolidated REPORT preserves parent's "150 MB" phrasing as ballpark and adds E's data-backed range ("5-250 MB per failing run depending on test complexity and DOM size") in the new §E subsection. Parent Dimension 3 is not edited (it states the cost model, not the specific number); the refinement lives in the new follow-up subsection.

### Conflict 3: Parent's trace-config plurality finding vs. E's convergence finding

| Source | Finding |
|---|---|
| Parent P (Dimension 3) | "plurality community config is `trace: 'on-first-retry'` with `retain-on-failure` as valid alternative (OSS split in 7-project survey: 3 `on-first-retry`, 2 `retain-on-failure`, 1 `on`)" |
| E | "Editor-heavy OSS converges on `trace: 'on-first-retry'`" (3/3 projects with explicit trace settings) |

**Classification:** Complementary — E narrows parent's broader survey to editor-heavy OSS specifically.

**Resolution:** Both statements are preserved in the consolidated REPORT. Parent's Dimension 3 covers the 7-project mix; §E adds the editor-heavy narrowing. No reconciliation needed — different populations.

### Conclusion disagreement: A "no common convention for CRDT tests" vs. D "universal template exists"

Both assert conventions across editor projects, but for different question scopes:
- A surveys CRDT-aware readiness (provider sync, cross-peer convergence) — finds no convention.
- D surveys test *structure* (keyboard-type + assert shape, helper organization, assertion styles) — finds strong convergence.

**Classification:** Conclusion disagreement driven by different question framings, not factual conflict. Both positions are valid under their stated framings.

**Resolution:** Consolidated REPORT presents both — §A documents the CRDT-readiness gap, §D documents the test-structure convergence. Cross-cutting Thread 1 reconciles by observing that the shared principle is "DOM-exposed state" at different abstraction levels.

---

## Scope filter

**Preserved in consolidation:**
- All primary-source code citations (file:line + snippet)
- All external URL references (primary sources only)
- Quantitative claims (counts, percentages, sizes) with source attribution
- Negative findings (NOT FOUND searches)
- Cross-cutting patterns across sub-reports

**Scoped out (in CLAIMS.md only, not in consolidated REPORT.md):**
- None — this consolidation preserves all P0 findings from all 5 sub-reports.

**Demoted from prescriptive to factual language (per consolidation brief stance):**
- Sub-report A's "Logseq is the strongest pattern surveyed" → consolidated as "the standout pattern" / "strictly richer signal than `synced=true`" (descriptive, not prescriptive).
- Sub-report D's "The parent spec can pick from these patterns" → removed; consolidated section documents the patterns without steering.
- Sub-report E's implicit recommendation in "Bottom-line framing for retention/capture selection" → consolidated as cost-model description with community convergence noted, no recommendation.

---

## Coverage audit

**Every rubric dimension from all 5 sub-reports has a corresponding finding section in the consolidated REPORT.** No sub-report dimensions were dropped.

Sub-report → REPORT subsection mapping:

| Sub-report dimensions | Consolidated into REPORT subsection |
|---|---|
| A D1 (Readiness signal inventory) | §A catalog table |
| A D2 (Provider sync signal exposure) | §A catalog + Logseq finding |
| A D3 (Post-typing quiescence) | §A y-prosemirror finding + tldraw finding |
| A D4 (Cross-peer propagation) | §A Logseq `with-wait-tx-updated` + BlockNote/tldraw/HedgeDoc/AFFiNE negatives |
| A D5 (Anti-patterns) | §A tldraw `sleep(2000)` + BlockNote networkidle |
| B D1-D6 (all React 19 dims) | §B table + per-finding paragraphs |
| C D1-D5 (all debounce/anim dims) | §C three subsections + data-attribute table |
| D D1-D6 (all editor dims) | §D template + editor state table + slash-menu + helper shapes + shortcut strategies + assertion styles + timing-primitive table |
| E D1-D6 (all artifact dims) | §E size taxonomy + GHA storage + cost-reduction table + editor-OSS config table + trace format evolution |

**Structural completeness audit:**

- ✅ Code blocks: preserved verbatim from sources (Clojure macros, TS helpers, JS patterns)
- ✅ Tables: preserved comparison matrices (signal catalogs, cross-library vocabulary, OSS config matrix, cost-reduction ranking)
- ✅ Quoted references: preserved file:line citations + URL anchors
- ✅ Hedging: preserved epistemic markers (NOT FOUND, UNCERTAIN, INFERRED labels carried forward)

---

## Generation provenance (this consolidation)

- **Analyzer:** Single-pass read of all 5 sub-report REPORTs + parent REPORT. Evidence files from sub-reports were spot-checked for key findings; not all 28 were deeply re-read because claims were well-summarized in the sub-reports.
- **Conflict detection:** Performed across all 5 sub-reports + parent. 3 conflicts + 1 conclusion disagreement identified and reconciled per above.
- **Cross-cutting synthesis:** 6 threads identified across sub-reports (DOM-exposed state principle; missing Playwright primitives; counter-based > boolean; waitForTimeout endemic; `if:` gate lever; editor state on `window`).
- **Drafting approach:** Section-by-section editing of parent REPORT.md using `Edit` tool (preserves existing 10-dimension content unchanged). New evidence files authored from source code and primary URLs already cited in sub-reports — no new research performed.

---

## Limitations of this consolidation

- **No evidence files were recreated byte-for-byte.** The 5 new evidence files in the parent's `evidence/` directory distill the 28 sub-report evidence files into consolidated primary-source catalogs. The original 28 files remain intact in `fanout/2026-04-17-follow-ups/*/evidence/` for auditability.
- **Cross-cutting threads are synthesis, not primary findings.** Thread 1-6 in the Cross-cutting observations subsection connect evidence from multiple sub-reports; the underlying evidence is all cited, but the threads themselves are the consolidator's analytical layer.
- **Vendor-incentive bias flagged in §E (GitHub storage pricing)** — carried forward from sub-report E without modification.
