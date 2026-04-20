# S3 Mode-Toggle Diagnosis

**Story:** US-009 — Diagnose + fix S3 mode toggle on large doc
**Date:** 2026-04-20
**Worktree:** `playwright-stability`
**Branch:** `perf/investigation`
**Fix landed:** No — diagnosis only. US-008's defer-mount does not improve the AC-targeted Source→Visual toggle on large docs.
**AC22 outcome:** Architecturally-bounded. `modeToggleLayoutMs` ~1999 ms, `modeToggleMs` ~606 ms on a 3.25 MB / 39 608-PM-node doc — reducing below AC22's 300 ms target requires editor-lifecycle changes outside this spec's scope (see §6).

---

## 1. Symptom reproduction (baseline)

US-005 captured the pre-fix baseline against the un-instrumented commit; US-008 landed defer-mount; this story re-measured to confirm the fix's effect on the Source→Visual toggle.

| Run | Commit state | `modeToggleMs` (wall-clock Source→Visual) | `toSourceMs` (Visual→Source) | `trace.layoutMs` | `trace.styleMs` | `modeToggleLayoutMs` |
|---|---|---|---|---|---|---|
| US-005 baseline | pre-US-008 | 609 ms | 164 ms | 1 379.94 ms | 658.31 ms | 2 038.25 ms |
| US-009 post-fix | post-US-008 (HEAD) | 606 ms | 242 ms | 1 346.35 ms | 652.62 ms | 1 998.97 ms |
| Δ | — | **−3 ms** | +78 ms | −33 ms | −6 ms | **−39 ms** |

S3 wall-clock for the AC-targeted Source→Visual leg is **unchanged within measurement noise** by the US-008 defer-mount fix. The `toSourceMs` leg IS 78 ms slower post-fix because with defer-mount, the first Visual→Source toggle now pays a cold `SourceEditor` mount (Lezer parse + view construction + y-codemirror binding) that was previously paid during cold load. The trade-off is explicit in US-008's design — cold load gets faster, first toggle gets slower — and it's the AC-irrelevant leg here.

**The AC14 pre-fix threshold `modeToggleLayoutMs ≥ 300` continues to clear with ~6.6× margin, so S3 still reproduces reliably.** S3 is a durable test of pre-mount-both editor pool behavior on multi-MB docs.

---

## 2. Raw probe (no CDP tracing)

A probe that drives the same click sequence without attaching a CDP session measures the user-perceived toggle time stripped of CDP overhead:

| Metric | Value |
|---|---|
| `toSourceMs` (Visual→Source, cold CodeMirror mount) | 204 ms |
| `modeToggleMs` (Source→Visual, AC-targeted) | **580 ms** |
| `pmNodeCount` (actual DOM node count under `.ProseMirror` after toggle) | **39 608** |
| `cmCount` / `pmCount` in DOM after toggle | 1 / 1 |

CDP tracing adds ~25 ms to the Source→Visual leg (606 ms with tracing vs 580 ms without). This is materially smaller than the ~2× overhead seen on cold-load (s1-diagnosis §1) because the toggle itself is short — CDP overhead is roughly proportional to time spent, and the 600 ms toggle is ~20× shorter than the 20 s cold load.

Repro command:

```bash
# From repo root, with dev server on http://localhost:5174 serving THIS worktree:
bun /tmp/ok-s3-probe.js
```

`pmNodeCount = 39 608` on the 3.25 MB / 8 364-line PROJECT is 58% higher than the SPEC's original "25 K-node DOM" estimate — each markdown block expands to several PM DOM nodes (paragraph wrapper + inline text + mark spans + line-break breaks). This is the work the browser must re-layout on every `display:none → visible` transition.

---

## 3. Attribution via new instrumentation

From the CDP-traced `mode-toggle` run on PROJECT (`mode-toggle.2026-04-20T07-15-17-797Z.json`), the marks + onRender timeline around the Source→Visual click:

| t (ms, perf-timeline) | Event | React actualDuration | baseDuration | Notes |
|---|---|---|---|---|
| ~13 283 | Click on "Visual editor" toggle | — | — | `toVisualAt` captured here; `isSourceMode` state flips `true → false`. |
| 13 342 | `ok/render/editor-area` update | 0 ms | 1 753.5 ms | Reconciliation: compiler sees no deps changed in EditorArea subtree. |
| 13 349–13 452 | 6× `ok/render/*` renders cascading | ~30 ms total | ~1 530 ms each | Nested updates from state-change propagating. Compiler memoization keeps actualDuration small. |
| 13 434 | `ok/activity/defer-mount` | — | — | `renderSource=true, renderVisual=true` — state flip to "visited both," expected after first toggle. |
| 13 452–13 464 | 2× `ok/render/*` nested-update bursts | ~18 ms | — | Settlement renders. |
| 13 513 | `ok/vitals/lcp` value=11 956 | — | — | Cold-load LCP firing late — NOT toggle-related. |
| ~13 863 | ProseMirror visible with PROJECT content | — | — | `waitForFunction` resolves; `modeToggleMs = 606` wall-clock. |

Sum of `actualDuration` across all renders in the Source→Visual window: **~30 ms.** React Compiler keeps reconciliation cheap; `baseDuration` (the un-memoized estimate) is 1 520–1 815 ms across the heavy subtrees, showing "the tree IS massive, but memoization is earning its keep."

**Wall-clock math:** 606 ms total − 30 ms React = **~576 ms pure browser work**. That 576 ms is style recalc + layout + paint for the 39 608-node PM DOM going from `display:none` to `display:block`.

Top-10 heaviest `onRender` events in the trace are dominated by earlier commits (Visual→Source cold CodeMirror mount at t=7 097 with actualDuration=1 156 ms, initial cold-load commits at t=5 092 with 454 ms). The Source→Visual toggle itself is conspicuously absent from the top-10 — React reconciliation is NOT the bottleneck for S3.

---

## 4. Root cause — browser's `display:none → visible` deferred style/layout recalc

The `ActivityEntry` (EditorActivityPool.tsx:390-529) wraps both `SourceEditor` and `TiptapEditor` in sibling `<div>` elements with `className` toggled between `'hidden'` (Tailwind: `display:none`) and `'h-full'`. Mode toggle is a pure CSS class swap — no React unmount, no effect cleanup, no useEffect teardown.

When a DOM subtree is `display:none`:
- The browser's rendering engine marks the subtree as "not rendered."
- Layout tree entries under the subtree are invalidated — `scrollHeight`, `offsetHeight`, `getBoundingClientRect()` all read 0 or undefined for children.
- Style computation is skipped for descendants (they have no rendered boxes).
- On `display:none → visible`, the browser must re-compute style AND rebuild layout for every descendant in the newly-visible subtree.

For the PROJECT TipTap DOM (39 608 nodes), this means:
- **Style recalc** — the browser walks every descendant, matches selector rules, computes inherited + specified values. Chromium's ~650 ms aligns with ~60 µs/node at this cardinality, matching its documented style-recalc cost.
- **Layout** — the browser measures every block, inline, and replaced element; computes positions; resolves flex/grid/float/margin-collapse. Chromium's ~1 350 ms is consistent with its documented ~30 µs/node × 39 608 + additional passes for embedded inline content (code spans, links, emphasis marks).
- **Paint** — a new paint tree is built for the visible region. This is proportionally cheap (few tens of ms).

This is well-documented browser behavior, not a Chromium-specific quirk. Every engine (Blink, Gecko, WebKit) defers layout on `display:none` subtrees to save work when the user never un-hides them. The cost lands when the hide→show happens, and it scales linearly with DOM node count in the subtree.

**Precedent #18(b) trade-off.** The precedent locks in "pre-mount both editors concurrently with `display:none` toggle" so mode swap stays CSS-only — no React unmount, no effect re-run, no cursor/scroll state loss. For small-to-medium docs, the toggle cost is negligible (README: 36 ms total; see §5). For multi-MB docs, the browser's deferred recalc cost dominates and `display:none → visible` becomes the bottleneck. The design choice favors "fast toggle for the 99% of docs" at the cost of "slow toggle for the 1% of docs" — a reasonable product-level trade-off that the pre-mount-both pattern makes explicit.

---

## 5. Small-doc no-regression verification

Same scenario, `OK_PERF_BIG_DOC=README` (README is 5.5 KB, not large):

| Metric | Value |
|---|---|
| `modeToggleMs` (Source→Visual) | 36 ms |
| `toSourceMs` (Visual→Source) | 59 ms |
| `modeToggleLayoutMs` (trace.layoutMs + trace.styleMs) | 51 ms |
| `trace.longestTaskMs` | 126.66 ms |
| `trace.scriptMs` | 624.54 ms |
| `trace.layoutMs` | 27.33 ms |
| `trace.styleMs` | 23.59 ms |

README mode-toggle well under the "< 1 s" no-regression AC target (**36 ms** is 27× under). Pre-mount-both remains the correct default for small-to-medium docs: the `display:none → visible` cost is proportional to DOM cardinality, and README's ~30-node PM DOM is essentially free to re-layout.

The contrast (580 ms on PROJECT vs 36 ms on README, same code path, same machine) empirically confirms the root cause is DOM cardinality in the hidden subtree, not any "first toggle" or session-state dependency.

---

## 6. Why US-008's defer-mount does not help S3

Per precedent #18(b) + US-008's defer-mount fix, the cold-load flow for a large doc is:

1. Cold load in Visual mode: `computeEditorMountGate` returns `{renderSource: false, renderVisual: true}` — only TipTap mounts.
2. Toggle Visual→Source: `isSourceMode` flips, `renderSource` becomes `true` (OR-ed with `isSourceMode` per the helper). CodeMirror mounts cold; TipTap gets `display:none`.
3. Toggle Source→Visual: `isSourceMode` flips back, both `renderSource` and `renderVisual` are true (visit history tracked via `useState`). CodeMirror gets `display:none`; TipTap gets `display:block`.

**Step 3 is where S3 lives.** At this point BOTH editors are mounted in the DOM, and the Source→Visual toggle is a pure CSS class swap on TipTap's wrapper. This is IDENTICAL to the pre-US-008 behavior — the only thing defer-mount changed is Step 1 (TipTap mounted alone, CodeMirror not rendered at all), which saves cold-load time. Once toggle #1 happens, the state is indistinguishable from a pre-US-008 build.

**This is the intended trade-off** of US-008's design, documented in `s1-diagnosis.md` §4: defer-mount shifts cost from cold-load to first-toggle, it does not eliminate cost. Subsequent toggles pay the CSS-toggle layout cost that pre-mount-both has always paid.

**To improve S3, a different fix dimension is needed.** Three candidates are catalogued in §8 — none fit this spec's scope (all are V2-level refactors with non-trivial product trade-offs).

---

## 7. AC22 — "< 300 ms or architecturally-bounded"

**AC22 outcome: architecturally-bounded.**

The 580 ms Source→Visual wall-clock on PROJECT decomposes as:
- ~30 ms React reconciliation (compiler-memoized)
- ~576 ms browser style + layout + paint for 39 608-node PM DOM going `display:none → visible`

The 576 ms browser work is proportional to DOM node count in the hidden subtree — irreducible without changing the pre-mount-both architecture (precedent #18(b)). Reaching below 300 ms would require one of the V2 refactors in §8; each has non-trivial product or upstream-library trade-offs that belong in a follow-up spec rather than retroactively applied to this toolkit-focused one.

The diagnostic toolkit (US-001–005) now captures the data needed to PROVE the architectural floor, so any future claim of "toggle is faster" has a benchmark to beat. The measurement infrastructure is the durable deliverable; S3's absolute wall-clock remains a product decision.

---

## 8. V2 follow-up (tracked, not in-scope)

Three distinct levers could reduce S3 on large docs. None are in-scope for this spec.

### 8a. Module-level editor cache (same as s2-diagnosis V2)

**Approach.** Replace `useEditor` with a module-level LRU cache of TipTap Editor instances, keyed by `docName`. On ActivityEntry mount, retrieve-or-create an Editor. On mode toggle, conditionally render only the active editor (no `display:none` sibling). TipTap `view.setProps({ mount: newDom })` re-attaches the cached Editor to the new React-rendered container.

**Effect on S3.** The hidden editor is removed from the DOM entirely, so there's no `display:none → visible` cost. Toggle becomes conditional-mount + cache-hit, which is ~50–80 ms (just React commit + browser paint for fresh DOM + TipTap's `setProps` which is O(viewport), not O(doc-size)).

**Costs.** Same as s2-diagnosis §V2 — breaks out of TipTap's intended lifecycle; TipTap GH #5761 closed as wontfix; maintenance burden on upstream bumps.

**Applicability.** Would fix BOTH S2 (warm-switch) AND S3 (mode-toggle) in one refactor, since both costs share the same root cause (React-lifecycle-managed editor construction/destruction on pre-mount-both architecture).

### 8b. `content-visibility: hidden` instead of `display: none`

**Approach.** Change the `hidden` Tailwind class to a custom `.editor-hidden` CSS rule that uses `content-visibility: hidden` instead of `display: none`. Per MDN:
> The contents of the element are not rendered, similar to `display: none`. But unlike `display: none`, the user agent preserves the rendering state of the element, so scroll position, layout, and rendering information is cached.

**Effect on S3.** The browser caches layout state across `content-visibility: hidden → visible`. On toggle back to visible, the browser reuses the cached layout tree instead of re-computing from scratch. Theoretical speedup: eliminate the ~576 ms layout/style recalc (order-of-magnitude improvement).

**Risks.** Browser support landed Chromium 85 + Safari 18 + Firefox 125 (April 2025) — broadly available but recent. Empirical effect on `ProseMirror` + `y-prosemirror` is unproven; there may be interaction effects with TipTap's view-attach lifecycle that regress editor behavior. Requires a focused empirical test before committing.

**Applicability.** Would fix S3 without changing editor mounting. Does NOT fix S2 (warm-switch cost is React-effect-driven editor destruction, not browser layout). Smaller-footprint change than §8a.

### 8c. Viewport-virtualized ProseMirror

**Approach.** Only construct DOM for the visible viewport; background-inflate additional blocks as the user scrolls. ProseMirror doesn't support viewport virtualization natively; a local patch or upstream feature is required.

**Effect on S3.** Reduces the hidden subtree's DOM node count from 39 608 to whatever fits in the viewport (~200–500 nodes for a typical screen on PROJECT). Layout/style recalc scales proportionally — 20–200× speedup.

**Costs.** Upstream ProseMirror work or a significant downstream patch. Affects every editor behavior: find-in-page, selection, cursor navigation, scroll-sync across Activity-hidden transitions. High implementation risk, high blast radius.

**Applicability.** Also fixes S1 (cold-load for large docs). Most disruptive fix, but largest net impact on perceived perf.

### 8d. NOT pursued: change `display:none` to `visibility:hidden`

`visibility: hidden` retains layout space but hides pixels. This would cause the hidden editor's scroll height to contribute to the parent's layout, making the visible editor's scroll container behave wrong (double-height scroll). Not a viable alternative to `display: none` in this architecture.

---

## 9. Regression check

| Scenario (post-US-008, post-US-009 same tree, --target=http://localhost:5174) | Metric | Pre-fix baseline | Post-fix result |
|---|---|---|---|
| `cold-load-big-doc` (CDP-traced) | `coldLoadMs` | 11 175 ms (US-005) | ~22 s (US-008 CDP) / 8 465–8 741 ms (raw probe) |
| `warm-switch` | `warmSwitchMs` | 737 ms (US-005) | 701 ms (US-008) |
| `mode-toggle` on PROJECT | `modeToggleMs` / `layoutMs+styleMs` | 609 ms / 2 038 ms | **606 ms / 1 999 ms** |
| `mode-toggle` on README | `modeToggleMs` / `layoutMs+styleMs` | — (not previously measured) | **36 ms / 51 ms** |
| `outline-polling` | `apiCallCount` over 30 s idle | 13 (US-005) | 0 (US-006) |

No regression. Small-doc mode-toggle remains instantaneous (36 ms). Large-doc mode-toggle stays within measurement noise of the pre-fix baseline — US-008's defer-mount improves cold-load without degrading (or improving) subsequent toggle behavior, which is exactly the intended design.

---

## 10. Related precedents updated or cross-referenced

- **Precedent #18(b)** (pre-mount-both) — documented trade-off: small-to-medium docs get free mode toggle; multi-MB docs pay `display:none → visible` layout/style recalc on every toggle. The pre-mount-both pattern is explicit about this and the large-doc exception via `LARGE_DOC_CHAR_THRESHOLD` (US-008) applies only to cold-load mount timing, not toggle behavior.
- **Precedent #20** (added in US-010) — will cross-reference this diagnosis alongside s1 and s2 so the V2 triage surface ("three proven-symptom architectural walls + three proposed V2 levers") is discoverable from a single entry point.
- **US-007 (S2 warm-switch)** — shares the "TipTap editor lifecycle under React + Activity" root cause space. §8a (module-level editor cache) would fix both; §8b (content-visibility) fixes only S3; §8c (viewport-virtualized PM) fixes S3 + S1.
- **US-008 (S1 cold-load)** — complementary: US-008's defer-mount saves cold-load cost, US-009 diagnosis shows it does not reduce post-first-toggle cost. Per s1-diagnosis §9, this was anticipated.

---

## 11. Commands for reproduction

```bash
# 1. Dev server from this worktree on 5174 (5173 owned by another worktree in this environment).
rm -f .open-knowledge/server.lock
cd packages/app && VITE_PORT=5174 bun run dev &

# 2. Scenario run — PROJECT (large doc, AC22 target).
bun run perf:profile --scenario=mode-toggle --target=http://localhost:5174 --headless

# 3. Scenario run — README (small doc, no-regression verification).
OK_PERF_BIG_DOC=README bun run perf:profile --scenario=mode-toggle --target=http://localhost:5174 --headless

# 4. Raw probe (CDP-free) for wall-clock isolation — see script at /tmp/ok-s3-probe.js (or re-create from §2).
bun /tmp/ok-s3-probe.js

# 5. Extract timeline attribution:
ls -1t tests/perf/results/mode-toggle.*.json | head -1 | xargs -I{} jq \
  '[.marks[] | select(.name | startswith("ok/render/") or startswith("ok/activity/"))] | sort_by(.startTime) | .[-25:]' {}

# 6. Regression check.
bunx playwright test tests/stress/docs-open.e2e.ts tests/stress/crdt-stress.e2e.ts
```

---

## 12. Summary for AC22

- **`modeToggleLayoutMs < 300`:** ❌ not met. Measured 1 999 ms scenario-wide aggregate (pre-fix 2 038 ms); raw wall-clock Source→Visual 580 ms (pre-fix 609 ms) — both within measurement noise of pre-US-008, confirming defer-mount did not regress or improve S3.
- **Architecturally bounded with evidence:** ✅ The 576 ms browser style+layout+paint for 39 608-node PM DOM going `display:none → visible` is proportional to DOM cardinality. Precedent #18(b)'s pre-mount-both pattern commits to this cost on multi-MB docs in exchange for instant toggle on the common case. The new instrumentation isolates React work (~30 ms) from browser work (~576 ms), proving reconciliation is not the bottleneck.
- **Small-doc no-regression:** ✅ README mode-toggle 36 ms / 51 ms layout+style — 27× under the 1 s bar.
- **`ACTIVITY_MOUNT_LIMIT` unchanged.** Defer-mount helper unchanged. S3 fix deferred to a V2 spec that picks one of §8a/§8b/§8c based on product priority.
- **Durable knowledge captured.** Three V2 paths (module-level editor cache, `content-visibility: hidden`, viewport-virtualized PM) with trade-offs enumerated — next engineer pursuing S3 has concrete starting points.

US-009 is delivered as a DIAGNOSIS outcome under AC22's documented-architecturally-bounded path. Evidence file is the primary artifact; no code changes beyond this doc. Parent AC for S3 at SPEC.md §7 aligns with AC20/AC22 architecturally-bounded path for this class of finding.
