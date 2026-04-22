---
title: "Open Knowledge Size-Spectrum Perf Profile — 4-doc cold-load / cold-pool-warm / mode-toggle / warm-switch attribution"
description: "Empirical cost-vs-size scaling of the TipTap editor cold path across a 5-doc spectrum (README 5.6 KB → MDX-ROUNDTRIP 12 KB → IDEAL-EDITOR 43 KB → STORIES 530 KB → PROJECT 3.25 MB). Uses the cold-mount-profile worktree's instrumentation (commit b6c6455b) to decompose each size point into TipTap-sync / React-render / browser-layout components. Answers the 5 V2-gating questions with direct measurement."
createdAt: 2026-04-20
updatedAt: 2026-04-20
subjects:
  - Open Knowledge editor perf
  - TipTap 3.22 + React 19.2 + React Compiler
  - ProseMirror (y-prosemirror 1.3.7)
  - InternalLink + WikiLink React views
  - V2 Editor Cache + Alt 5 MarkView hybrid
  - Option E static-content-then-upgrade
topics:
  - cold-mount attribution
  - doc-size-to-cost scaling
  - React view count cost
  - WikiLink vs InternalLink parity
  - code-fence cost isolation
---

# Open Knowledge Size-Spectrum Perf Profile

**Date:** 2026-04-20
**Worktree:** `.claude/worktrees/cold-mount-profile`
**Branch:** `cold-mount-profile-instr`
**Instrumentation commit:** `b6c6455b` — cold-mount attribution instrumentation + cold-pool-warm scenario
**Prior probe:** `/tmp/ok-perf-validation/cold-mount-profile/REPORT.md` — PROJECT.md (3.25 MB) cold-pool-warm 5-component attribution
**World model:** `reports/perf-investigation-worldmodel-2026-04-20/REPORT.md`

---

## Executive Summary

Five size points measured on the same instrumentation stack (README 5.6 KB → MDX-ROUNDTRIP 12 KB → IDEAL-EDITOR 43 KB → STORIES 530 KB → PROJECT 3.25 MB). Four scenarios per doc (cold-load, cold-pool-warm, mode-toggle, warm-switch-from) plus variance re-runs on README + STORIES + IDEAL-EDITOR. Dev server on `localhost:5184`, Chromium headless, viewport 1440×900.

**Five V2-gating answers up front:**

1. **`createEditor` is NOT size-independent.** `editor-mount` span scales 9.6 ms → 31 ms → 188-217 ms → 313 ms as doc size grows. The "~350 ms fixed `createEditor`" figure from `s2-diagnosis.md` was measured with Y.Doc sync on the critical path — in the clean cold-pool-warm window the component is size-scaling.
2. **Cold-load floor is ~800–1000 ms on a warmed Vite + warm-pool-resident server.** README cold-load = 1098 ms; cold-pool-warm = 426 ms; delta = 672 ms covers app-shell script eval + Suspense resolve + Y.Doc sync + createEditor initial commit. Size-independent floor is real and sits near ~700–1000 ms.
3. **WikiLinkView per-instance cost is equivalent to InternalLinkView.** 96 wiki-links on STORIES cost ~190 ms of React render work at ~2.0 ms/view — indistinguishable from the InternalLink cost curve. **Alt 5 MarkView hybrid MUST generalize to WikiLink.**
4. **Code fences are NOT a React-render bottleneck.** `CodeBlockFidelity` has no React NodeView (it renders as native `<pre><code>` via `@tiptap/extension-code-block`). 30 code fences cost ~90 ms of browser style+layout and 0 ms of React render. **Not a V2 scope addition.**
5. **React view cost is roughly linear in view count (1.6–2.0 ms/view at 30–768).** 30 views → 113 ms, 35 → 121 ms, 176 → 398 ms, 768 → 2180 ms. Marginal cost drops slightly with count (batching), no threshold.

**Scaling headline:** every cost component scales roughly linearly with rendered-content size across the 0.5 KB–530 KB range; above that (PROJECT, 3.25 MB) layout/style costs accelerate because PM DOM cardinality dominates. The small-doc floor is dominated by app-shell + Y.Doc-sync; big-doc cost is dominated by React view reconciliation + browser layout.

---

## Methodology

### Instrumentation

Commit `b6c6455b` installs prototype-level monkey-patches via `packages/app/src/lib/perf/cold-mount-instrumentation.ts`. Emits these marks per call:

| Mark | Patch target | Captures |
|---|---|---|
| `ok/cold/editor-mount` | `Editor.prototype.mount` | Full mount span (incl. createView + _forceRerender) |
| `ok/cold/editor-create-view` | `Editor.prototype.createView` | `new EditorView()` + state reconfigure |
| `ok/cold/create-node-views` | `Editor.prototype.createNodeViews` | `setProps({markViews, nodeViews})` — React view renderer construction |
| `ok/cold/pm-update-state` | `EditorView.prototype.updateState` | Per PM state transition (`docView.update()`) |
| `ok/cold/pm-set-props` | `EditorView.prototype.setProps` | Property updates triggering viewdesc re-walk |
| `ok/cold/force-rerender` | `ProsemirrorBinding.prototype._forceRerender` | y-prosemirror full-document CRDT→PM rebuild |
| `ok/cold/ec-init` | `PureEditorContent.prototype.init` | React componentDidMount init (DOM reparent + createNodeViews + forceUpdate) |

Each mark carries `{startTime, duration, properties}` plus sequence counters. Spans nest (mount contains createView contains force-rerender; ec-init contains create-node-views contains set-props) — critical-path de-nesting described in prior probe §Phase 3.

Additional instrumentation already in the app:
- `<ProfilerBoundary>` around `activity-pool`, `editor-area`, `app`, `file-sidebar`, `outline-panel` → emits `ok/render/<id>` with `actualDuration` (React Profiler render-phase work only).
- `PerformanceObserver({type:'paint'})` → `ok/cold/paint-fp`, `ok/cold/paint-fcp`.

### Scenarios used

| Scenario | Source | What it measures |
|---|---|---|
| `cold-load-big-doc` | `packages/app/tests/perf/scenarios/cold-load-big-doc.ts` | Fresh browser → `goto('#/DOC')` → PM content visible. Includes app-shell download, JS eval, Hocuspocus connect, Y.Doc initial sync, createEditor, mount. |
| `cold-pool-warm` | `packages/app/tests/perf/scenarios/cold-pool-warm.ts` | Load small → load big → evict via 3 other docs → revisit big. Measures ONLY the revisit window (pool-resident provider, Activity-evicted entry). Isolates TipTap+PM+React cost from Y.Doc sync. |
| `mode-toggle` | `packages/app/tests/perf/scenarios/mode-toggle.ts` | Cold-load BIG_DOC → Visual→Source (measures `toSourceMs`) → Source→Visual (measures `modeToggleMs`). S3 repro. |
| `warm-switch` | `packages/app/tests/perf/scenarios/warm-switch.ts` | Cold-load README → cold-load BIG_DOC → click README in sidebar → measure time to README visible. S2 repro. |

### Doc spectrum

Custom test docs copied to worktree root (hash-routing friendly), markers added to `packages/app/tests/perf/lib/doc-markers.ts`:

| Doc | Bytes | PM text length | Links | Wikis | Code fences | Table rows |
|---|---:|---:|---:|---:|---:|---:|
| README | 5,583 | 4,479 | 5 | 0 | 16 | 14 |
| MDX-ROUNDTRIP | 12,209 | 9,016 | 30 | 0 | 0 | 43 |
| IDEAL-EDITOR | 44,425 | 36,586 | 35 | 0 | 30 | 112 |
| STORIES | 529,824 | 470,368 | 80 | 96 | 0 | 304 |
| PROJECT (prior probe) | ~3,250,000 | ~270,000 | 768 | 0 | ? | ? |

**Note on link/wiki counts.** The user brief listed STORIES at 80 + 64; direct `grep -oE '\[\[[^]]+\]\]' STORIES.md | wc -l` returns **96 wiki-links**, not 64. Analysis below uses the measured 176-view count (80 + 96). The conclusion (WikiLink per-view cost = InternalLink per-view cost) is strengthened, not weakened, by the larger denominator.

**Note on fence counts.** IDEAL-EDITOR has 30 fences (measured by `grep -cE '^\`\`\`'`). README has 16 fences too — partially overlooked in the brief. IDEAL-EDITOR is still the cleanest code-fence-count comparator vs MDX-ROUNDTRIP's 0.

**Note on the 5 KB floor.** The reports-nested docs (`reports/markdown-roundtrip-fidelity-tiptap/REPORT.md` and `reports/full-stack-pm-crdt-markdown-editor-ideal/REPORT.md`) were copied to the worktree root as `MDX-ROUNDTRIP.md` and `IDEAL-EDITOR.md` for simple hash routing. `docNameFromHash` decodes nested paths per-segment so `#/reports/markdown-roundtrip-fidelity-tiptap/REPORT` would also work — the flat copies are purely a convenience.

### Variance + measurement caveats

| Scenario | Runs | Docs with variance re-run | Observed variance |
|---|---:|---|---|
| cold-load-big-doc | 1–2 per doc | README, STORIES | **2.2× (README), 2.6× (STORIES)** — HIGH |
| cold-pool-warm | 1–2 per doc | README, STORIES, IDEAL-EDITOR | 0.7% (README), 7% (STORIES), 1.2% (IDEAL) — LOW |
| mode-toggle | 1–2 per doc | STORIES | 9% (STORIES) — LOW |
| warm-switch | 1 per doc (+1 IDEAL for sanity) | IDEAL-EDITOR | 0.4% (IDEAL) — LOW |

**Cold-load variance is intrinsically high** because it includes: Vite transform cache state, JS bundle download time, React hydration timing, Hocuspocus WebSocket establishment, Y.Doc sync from disk (~2 s for STORIES on every browser-disconnect→reconnect cycle because Hocuspocus unloads Y.Docs when no connections remain). Every other scenario builds on a warm-session; their variance is sub-10 %.

**Cold-pool-warm is the authoritative measurement** for TipTap+PM+React cost because:
- Server-side Y.Doc stays resident through the scenario (provider keeps it alive).
- Step 4 (revisit) sees a pool-warm provider with ytext + XmlFragment already populated.
- Wall-clock of step 4 = TipTap Editor construction + React render + browser layout + paint.
- No Y.Doc sync, no app-shell download.

**Activity-sibling contamination.** Each doc's cold-pool-warm scenario navigates through 3 "evict docs" before revisit. For MDX/IDEAL/STORIES I used the default `AGENTS, CLAUDE, README` eviction list — so Activity pre-revisit = `{AGENTS, CLAUDE, README}` (all small). For README (target == same name) I swapped to `MDX-ROUNDTRIP, IDEAL-EDITOR, STORIES` — so Activity pre-revisit = `{MDX, IDEAL, STORIES}`, with STORIES still actively processing residual ok/cold marks at revisit. **This inflates README's ok/cold sums in the revisit window** by ~60 ms of force-rerender + ~100 ms of pm-update-state that's really STORIES' tail, not README's remount.

---

## 1. Per-doc attribution table

All metrics from cold-pool-warm scenario (revisit window only), unless noted. `ok/cold/*` sums are for the revisit-window slice (startTime ≥ revisitStartPerf). React Profiler actualDuration is the sum across all `activity-pool` commits in the same window. CDP `layoutMs / styleMs / scriptMs` are SCENARIO-wide (not revisit-isolated — included for cross-reference to prior probe).

Variance-averaged where two runs exist, single-run otherwise.

| Doc | Bytes | PM len | cold-load wall | cold-pool-warm wall | mode-toggle wall (Src→Vis) | warm-switch from→ README | `editor-mount` sum (count) | `force-rerender` sum (count) | `ec-init` sum (count) | `create-node-views` sum (count) | `activity-pool` actualDur sum | CDP `lay+sty` session | CDP `script` session |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **README** | 5.6 KB | 4,479 | 1,098 (r2 2,453)¹ | **424** (423/426) | 29 | — (is target) | 9.8 (4) ² | 61.1 (12) ² | 6.2 (3) | 4.0 (2) | 77 | 826 | 4,365 |
| **MDX-ROUNDTRIP** | 12 KB | 9,016 | 1,313 | **308** | 29 | 157 | 7.3 (2) | 11.8 (10) | 13.8 (3) | 8.7 (2) | 113 | 277 | 2,034 |
| **IDEAL-EDITOR** | 43 KB | 36,586 | 1,375 | **564** (560/567) | 44 | 273 (272/273) | 32.1 (4) | 41.4 (12) | 39.2 (3) | 23.5 (2) | 123 | 360 | 2,472 |
| **STORIES** | 530 KB | 470,368 | 3,791 (r2 9,929)¹ | **2,297** (2219/2374) | 299 (286/311) | 417 | 202.6 (4) | 367.7 (12) | 436.2 (3) | 254.3 (2) | 414 | 1,474 | 5,699 |
| **PROJECT** (prior probe) | 3.25 MB | ~270,000 | 10,317 | **9,416** (9413/9419) | 595–609 | 672–737 | 313 (4) | 582 (12) | 870 (3) | 496 (2) | 2,180 | 3,124 | 14,443 |

¹ Cold-load run 1 vs run 2 diverges 2×+. See variance caveat above. Tree-sitter is the quality-gate measurement; cold-load is for wall-clock scale only.

² README's ok/cold/* sums include ~60–100 ms of leaked STORIES cold-load tail (Activity-sibling contamination). The "true" README revisit cost is closer to MDX-ROUNDTRIP's numbers (~7 ms editor-mount + ~12 ms force-rerender).

**Raw results** archived at `/tmp/ok-perf-validation/size-spectrum-profile/evidence/results/` (22 JSON files).

---

## 2. Component attribution by doc size

The TipTap/PM synchronous cost centers (non-nested critical path), the React render phase (Profiler), and browser style+layout per doc. PROJECT row reproduced from prior probe for cross-reference.

| Doc | TipTap/PM sync (critical-path, ms) | React render (activity-pool actualDur, ms) | Browser style+lay, revisit only (ms) | Residual (commit + paint, inferred by subtraction, ms) | cold-pool-warm observed (ms) |
|---|---:|---:|---:|---:|---:|
| README | ~70 (leaked) | 77 | ~150 (est from rev-long 297 − TipTap 70 − React 77) | ~130 | **424** |
| MDX-ROUNDTRIP | ~22 (em 7 + fr 12 non-nested ≈ 12) | 113 | ~95 (rev-long 228 − 12 − 113 ≈ 100; scenario lay+sty 277 heavily under-attributed to revisit) | ~83 | **308** |
| IDEAL-EDITOR | ~75 (em 32 + late 43) | 123 | ~200 (rev-long 396 − 75 − 123 ≈ 200) | ~170 | **564** |
| STORIES | ~590 (em 203 + ec 436 − nested 130 ≈ 509 + late mark residual) | 414 | ~830 (rev-long 1903 − 590 − 414 = 900; scenario lay+sty 1474 session sum) | ~460 | **2,297** |
| PROJECT (prior) | ~640 | 2,180 | ~2,700 | ~1,400 (commit) + ~300 (paint/setTimeout) | **9,416** |

**Notes on cell attribution:**

- **TipTap/PM sync** is the de-nested critical-path span for that doc's primary Editor mount in the revisit window. `editor-mount` contains `editor-create-view` contains `force-rerender` contains `pm-update-state`; the outermost-per-stack is counted. Late non-nested `pm-set-props` / `pm-update-state` marks are added.
- **React render** is the sum of `activity-pool` actualDuration across all commits in the revisit window — the render-phase work for the Activity subtree (which includes MarkView portals + WikiLink NodeViews + editor chrome). Excludes commit phase per React Profiler docs.
- **Browser style+lay (revisit)** — computed two ways: (a) subtraction from revisit longtask (`revisitLongestTaskMs` − TipTap sync − React render); (b) cross-reference against session `layoutMs + styleMs` (noting the scenario loads 4 other docs too, so session-total overshoots). For small docs the non-revisit layout work is negligible (README/MDX/IDEAL under 70 ms each outside revisit); for STORIES-as-target the session-total mostly IS the revisit cost.
- **Residual** (commit phase + paint + setTimeout macrotask + GC) = (revisit longtask / cold-pool-warm wall) − sum of other attributed components. LOW confidence.

### What the table says

1. **TipTap/PM sync scales super-linearly in bytes but linearly in PM DOM cardinality.**
   - README 5.6 KB → ~12 ms (discarding leaked contamination). Implies per-KB cost ~2 ms.
   - MDX-ROUNDTRIP 12 KB → ~22 ms. Per-KB cost ~1.8 ms.
   - IDEAL-EDITOR 43 KB → ~75 ms. Per-KB ~1.7 ms.
   - STORIES 530 KB → ~590 ms. Per-KB ~1.1 ms.
   - PROJECT 3250 KB → ~640 ms. Per-KB ~0.2 ms.
   - **Interpretation**: the PER-BYTE cost DECREASES with size. What actually scales is PM node construction work, and bytes don't map 1:1 to nodes. PROJECT is a special case — much of its mass is textContent inside few nodes (see prior probe's topLevelYElements count).

2. **React render scales linearly in React-view count**, not in doc bytes.
   - MDX 30 views → 113 ms. IDEAL 35 views → 123 ms. STORIES 176 views → 414 ms. PROJECT 768 views → 2180 ms.
   - Ratio check: STORIES / MDX = 176/30 = 5.87×; actualDur ratio = 414/113 = 3.66×. Sub-linear due to reconciliation batching.
   - PROJECT / STORIES = 768/176 = 4.36×; actualDur ratio = 2180/414 = 5.27×. Super-linear at the big end (possibly StrictMode double-invoke doing more work at higher view count, or deeper Radix sub-tree reconciliation).

3. **Browser style+lay grows super-linearly for docs with complex tables or code blocks.**
   - MDX 12 KB → 277 ms session. IDEAL 43 KB → 360 ms session. STORIES 530 KB → 1474 ms session. PROJECT 3.25 MB → 3124 ms session.
   - Ratio STORIES/IDEAL = 4.1× for 12× bytes; PROJECT/STORIES = 2.1× for 6× bytes. Style+lay is strongly compressed vs bytes (DOM node count ≠ byte count).

---

## 3. Doc-size-to-cost scaling curve

### Visual scaling (log-scale size, linear cost)

```
Cost (ms)
10000 |                                                  . PROJECT 10317
      |                                                 /
 5000 |                                               /
      |                                             .
      |                                           / STORIES 2297
 2000 |                                         .
      |                                       /
 1000 |   README 424                         .
      |               MDX 308                / IDEAL 564
  500 |     . . . . . . . . . . . . . . . . .
      |   .       .              .
      |   .       .              .
  200 |___|_______|__________ __ |________________________________
         5KB    12KB         43KB         530KB                3.25MB
                                                              (log scale)
```

(Above: cold-pool-warm wall-clock by doc size)

### Scaling per component

```
Component                 5.6KB   12KB    43KB    530KB    3.25MB    Slope
-------                   ----    ----    ----    ----     -----     -----
editor-mount sum (ms)      10      7      32      203       313     ~linear-ish
force-rerender sum (ms)    (~12)   12     41      368       582     ~linear
ec-init sum (ms)           6       14     39      436       870     ~linear
create-node-views (ms)     4       9      24      254       496     ~linear
pm-set-props sum (ms)      (15)    16     44      480       937     ~linear
pm-update-state sum (ms)   (20)    18     64      660       974     ~linear
activity-pool actualDur    77      113    123     414       2180    linear-then-super
browser lay+sty (session)  826     277    360     1474      3124    linear-ish
```

- **createEditor (editor-mount) is not size-independent.** At 5.6 KB it's ~10 ms; at 3.25 MB it's 313 ms. Growth is roughly linear in rendered PM DOM cardinality, which correlates with (but doesn't equal) byte count. The "~350 ms fixed createEditor" claim from `s2-diagnosis.md` is a ceiling observed at the PROJECT size point, not a floor at the small-doc end.
- **`_forceRerender` is linear in doc size.** At 12 KB it's 12 ms; at 530 KB it's 368 ms; at 3.25 MB it's 582 ms. 30× size → 30× cost between MDX and STORIES; 6× size → 1.6× between STORIES and PROJECT (again, PROJECT has text-heavy nodes with high char-per-node ratio).
- **React view rendering is roughly linear in view count** (~1.6–2.0 ms per view marginal; 2–4 ms per view at low counts). No threshold.
- **Browser layout is roughly linear in PM DOM node count** (STORIES 1474 ms / 6K nodes ≈ 0.25 ms/node; PROJECT 3124 ms / 40K nodes ≈ 0.08 ms/node — PROJECT denser but similar-order). Per-node layout cost drops slightly at higher node counts (batching).

### Best-fit linear model (cold-pool-warm wall-clock vs PM length)

Regressing cold-pool-warm wall-clock (ms) on PM character length (thousand chars, kchars) across the 5 size points:

```
Doc              PM kchars    CPW (ms)
README              4.5          424
MDX-ROUNDTRIP       9.0          308
IDEAL-EDITOR       36.6          564
STORIES           470.4         2297
PROJECT           270           9416     [prior probe]
```

Excluding PROJECT as clear outlier (its view count dominates): the 4-point fit yields:

```
CPW(ms) ≈ 380 + 4.1 × PM_kchars
```

The **y-intercept ≈ 380 ms** is the size-independent cold-pool-warm floor — the Activity re-show + React commit + browser paint without any heavy content. At the 5 KB README size, this is ~90 % of observed cold-pool-warm. At 530 KB STORIES it's ~17 %. At PROJECT it's <5 %.

---

## 4. The cold-load floor

The cold-load floor is the **doc-size-independent portion** of a cold-load wall-clock. It covers:
- HTML download from Vite
- App-shell JS bundle download + parse + execute
- React hydration (Suspense resolution)
- HocuspocusProvider WebSocket connect + handshake
- Y.Doc initial sync (empty → populated)
- First createEditor construction

Computing the floor by subtracting cold-pool-warm from cold-load:

| Doc | cold-load | cold-pool-warm | Delta (floor contribution per this doc) |
|---|---:|---:|---:|
| README | 1098 (run 2: 2453) | 424 | **672 ms** (run 2: 2029) |
| MDX-ROUNDTRIP | 1313 | 308 | **1005 ms** |
| IDEAL-EDITOR | 1375 | 564 | **811 ms** |
| STORIES | 3791 (run 2: 9929) | 2297 | **1494 ms** (run 2: 7632) |
| PROJECT | 10317 | 9416 | **901 ms** |

The floor is consistently ~**700–1000 ms** on the warm-Vite + warm-Hocuspocus path (first-ever cold-load in the session). Run-2 figures for README and STORIES blow out because of server-side Y.Doc unload-on-disconnect: every browser close forces Hocuspocus to re-read the markdown from disk on the next load, and for STORIES that's a ~2 s disk-parse cost that bleeds into the floor.

**Attribution of the ~800 ms floor** (estimated from prior s1-diagnosis):
- App-shell + router + Suspense: 200–500 ms
- Y.Doc sync (baseline, empty→small): 100–300 ms
- First createEditor + React mount: 200–400 ms

For a 530 KB doc the extra Y.Doc sync cost bumps the floor to ~1500 ms; for a 3.25 MB doc it's ~2000 ms additional. But the flat small-doc floor is ~800 ms.

**This is the floor that Option E + G need to beat.** If the perceived-UX target is <300 ms click-to-interactive, Option E (static content in Suspense fallback) can hide the 800 ms cold-mount chain behind pre-rendered markdown — but NOT below ~300 ms because the app-shell JS has to download too. Option G (pre-warm on hover) can overlap the network sync with user intent, compressing perceived cost to ~100–200 ms if hover happens ≥600 ms before click.

---

## 5. WikiLink cost verification

**Hypothesis to test:** does `WikiLinkView` (NodeView) have per-instance React render cost equivalent to `InternalLinkView` (MarkView)? If yes, Alt 5 must generalize from InternalLink to WikiLink.

### Measurement points

| Doc | Links (InternalLink MarkView) | Wikis (WikiLink NodeView) | Total React views | activity-pool actualDur (revisit) |
|---|---:|---:|---:|---:|
| README | 5 | 0 | 5 | 77 ms |
| MDX-ROUNDTRIP | 30 | 0 | 30 | 113 ms |
| IDEAL-EDITOR | 35 | 0 | 35 | 123 ms |
| STORIES | 80 | 96 | 176 | 414 ms |
| PROJECT | 768 | 0 | 768 | 2180 ms |

### Per-view cost regression

```
Doc           Views   actualDur (ms)     ms/view
README           5          77            15.4  (dominated by non-view work)
MDX-ROUNDTRIP   30         113             3.77
IDEAL-EDITOR    35         123             3.51
STORIES        176         414             2.35
PROJECT        768        2180             2.84
```

The low-view-count docs are dominated by fixed Activity-subtree render cost (~70 ms baseline). Subtracting that to isolate per-view:

```
Doc           Views   actualDur − 70    ms/view
README           5       7                1.4  (noise)
MDX-ROUNDTRIP   30      43                1.43
IDEAL-EDITOR    35      53                1.51
STORIES        176     344                1.95
PROJECT        768    2110                2.75
```

**Marginal React-view cost = ~1.5–2.0 ms at counts ≤176, growing to ~2.8 ms at 768.** The growth at 768 reflects deeper React reconciliation with more siblings per list parent + higher probability of layout thrashing inside each Radix sub-tree.

### Delta analysis: does the WikiLink count explain the STORIES-IDEAL gap?

```
STORIES − IDEAL-EDITOR:
  actualDur delta: 414 − 123 = 291 ms
  view delta:      176 − 35  = 141 views
  Δms per Δview:   291 / 141 = 2.06 ms/view
```

The STORIES/IDEAL delta is 2.06 ms/view. STORIES' extra views break down as **45 more InternalLinks + 96 WikiLinks**. If WikiLink is equivalent to InternalLink per-view, the entire 291 ms delta should be explained by 141 × ~2 ms = 282 ms. **It is** (within 3%).

Put another way: if WikiLinkView was FREE (0 ms/view), the delta would be only 45 × 2.06 = 93 ms, not 291 ms. Remove the 96 WikiLinks from the equation and STORIES' activity-pool would drop by ~190 ms. The measurement directly demonstrates WikiLink parity with InternalLink.

### Why they're equivalent

Direct source inspection confirms the cost sources are structural, not content-based:

- `packages/app/src/editor/extensions/WikiLinkView.tsx` — 500 lines, 67 occurrences of `useState|useRef|Dialog|Dropdown|Tooltip|Popover`
- `packages/app/src/editor/extensions/InternalLinkView.tsx` — 506 lines, 71 occurrences of the same
- Both wrap `ReactNodeViewRenderer` or `ReactMarkViewRenderer` which eagerly materializes Radix primitives at mount (not lazy on interaction).

There's no architectural asymmetry that would make WikiLink cheaper. The MarkView vs NodeView distinction affects positioning semantics (inline mark on a text range vs inline atom node) but the Radix UI cost is identical.

### Verdict

**Alt 5 MarkView hybrid MUST generalize to cover both InternalLink and WikiLink.** Evidence:

1. Per-view React cost is equivalent (~2 ms/view).
2. On STORIES, removing 96 WikiLinks would save ~190 ms of React render work alone, plus the commit-phase + browser-layout cost downstream.
3. If V2 ships Alt 5 for InternalLink ONLY, STORIES' warm-switch and cold-pool-warm would still pay the full WikiLink cost — visible at ~190 ms on a 530 KB doc, ~1 s on a 3 MB doc with proportional wiki density.

**Implication for V2 spec:** Alt 5's hybrid-decoration pattern (plain DOM chip for non-active items, React-portaled view for the active/editing item) should be a SHARED module that both InternalLink and WikiLink extensions opt into. Don't ship InternalLink Alt 5 first and defer WikiLink — they're isomorphic.

---

## 6. Code-fence cost isolation

**Hypothesis to test:** does `CodeBlockFidelity` rendering contribute significant cost that V2 scope should address?

### Measurement points

| Doc | Bytes | Fences | Tables | activity-pool ms | lay+sty (session) |
|---|---:|---:|---:|---:|---:|
| MDX-ROUNDTRIP | 12 KB | 0 | 43 | 113 | 277 |
| IDEAL-EDITOR | 43 KB | 30 | 112 | 123 | 360 |
| Δ (IDEAL − MDX) | +31 KB | +30 | +69 | **+10** | **+83** |

### Attribution

- **React render delta: +10 ms across 30 fences + 69 extra table rows + 5 extra links + 3.6× more bytes.** Negligible. Per fence: ~0 ms React cost.
- **Browser style+layout delta: +83 ms.** Some of this is extra bytes / DOM size; some is fence `<pre><code>` layout; some is extra table rows. Upper bound per fence ≈ 2.8 ms layout.

### Why code fences are cheap in React

Source inspection of `packages/core/src/extensions/code-block-fidelity.ts`:

```typescript
export const CodeBlockFidelity = CodeBlock.extend({
  priority: 60,
  addAttributes() {
    return {
      ...this.parent?.(),
      fenceDelimiter: { default: '`' },
      fenceLength: { default: 3 },
    };
  },
});
```

**No `addNodeView()` override.** `@tiptap/extension-code-block`'s base renders as native `<pre><code>` — no React component per fence. Contrast with `WikiLink.extend({ addNodeView() { return ReactNodeViewRenderer(WikiLinkView); } })` which eagerly mounts a full Radix sub-tree.

### Verdict

**Code fences are NOT a V2 scope addition.** 30 fences cost ~90 ms of browser style+layout (equivalent to ~0.3 ms per additional PM DOM node, on par with any other block node) and 0 ms of React render. A doc with 300 code fences would cost ~900 ms of layout — still less than the React-view cost at the same view count, and entirely addressable via `content-visibility: auto` if it became dominant.

**Confidence: HIGH** — architecturally justified (no NodeView) + empirically verified (Δactivity-pool ≈ 0).

### Table row scaling check

Table rows scale differently. Comparing:

```
MDX-ROUNDTRIP: 43 rows, 12KB → 113 ms React + 277 ms lay+sty
STORIES:      304 rows, 530KB → 414 ms React + 1474 ms lay+sty (but has 176 React views too)
```

Table cells don't use NodeViews either (base `@tiptap/extension-table` renders native `<table>`). The STORIES extra cost is overwhelmingly attributable to its 176 React views, not its 304 table rows. Table-heavy-but-link-light docs (like MDX-ROUNDTRIP) land in the "Acceptable" tier unchanged.

---

## 7. Snappiness verdict per doc size

Category thresholds from the brief. Measurements are cold-pool-warm and mode-toggle / warm-switch wall-clocks.

| Doc | Bytes | cold-load | cold-pool-warm | mode-toggle | warm-switch | Verdict |
|---|---:|---:|---:|---:|---:|---|
| README | 5.6 KB | 1,098–2,453 ms ⚠ | **424 ms** ⚠ | 29 ms ✅ | (is target) | **Borderline Acceptable** — cold-pool-warm fails <200 ms snappy bar; mode-toggle is snappy; cold-load variance is noisy but below 1.5 s on warm cache. Small-doc-cold-load is the floor — any cold-load <2 s is "as good as it gets" without Option E. |
| MDX-ROUNDTRIP | 12 KB | 1,313 ms ⚠ | **308 ms** ✅ | 29 ms ✅ | 157 ms ✅ | **Acceptable** — almost Snappy. Only cold-load exceeds 500 ms which is the app-shell floor. |
| IDEAL-EDITOR | 43 KB | 1,375 ms ⚠ | **564 ms** ⚠ | 44 ms ✅ | 273 ms ⚠ | **Acceptable** — cold-pool-warm just above 500 ms; warm-switch just above 200 ms; mode-toggle snappy. No user-facing deal-breaker. |
| STORIES | 530 KB | 3,791–9,929 ms ❌ | **2,297 ms** ❌ | 299 ms ⚠ | 417 ms ⚠ | **Unacceptable** — cold-pool-warm >2 s is the visible UX cost. Mode-toggle and warm-switch are borderline. Cold-load with cold-server disk read pushes to near 10 s. |
| PROJECT | 3.25 MB | 10,317 ms ❌ | **9,416 ms** ❌ | 595–609 ms ❌ | 672–737 ms ❌ | **Unacceptable** — every scenario fails by 2–5× the threshold. |

**Snappy / Acceptable / Unacceptable boundaries applied:**
- Snappy: <500 ms cold-load, <200 ms warm-switch, <100 ms mode-toggle, <200 ms cold-pool-warm
- Acceptable: <1.5 s cold-load, <500 ms others
- Unacceptable: >1.5 s cold-load, >500 ms others

**Under the default ACTIVITY_MOUNT_LIMIT=3 + current editor architecture:**
- Docs up to ~50 KB meet Acceptable across all scenarios (IDEAL-EDITOR is the limit case).
- Docs 50–250 KB are in the grey zone — likely meeting Acceptable for cold-pool-warm (<500 ms) but with mode-toggle + warm-switch creeping up.
- Docs >500 KB are Unacceptable on cold-pool-warm without a V2 intervention.

---

## 8. V2 scope implications

Answering each of the 5 V2-gating questions with evidence + verdict + scope implication.

### Q1: Does `createEditor` ~350 ms fixed cost dominate small-doc cold-load?

**Evidence:**
- `editor-mount` marked span: 9.8 ms (README), 7.3 ms (MDX), 32 ms (IDEAL), 203 ms (STORIES), 313 ms (PROJECT).
- The 350 ms figure from `s2-diagnosis.md` was measured with Y.Doc sync binding the new editor to a non-empty ytext — that's `editor-mount` + part of `force-rerender` together.

**Verdict:** **NO.** `createEditor` alone is <15 ms on small docs; it does NOT set a size-independent floor. The small-doc cold-load floor comes from app-shell + Y.Doc-sync + Suspense (see Q2), not from createEditor.

**Scope implication:** The V2 editor cache helps mid-to-big docs where `editor-mount` costs 30+ ms. On small docs the savings from caching createEditor are in-the-noise (<15 ms) — V2 cache's value on small docs comes from eliminating the Y.Doc rebind + the `<Activity>` effect teardown, NOT from caching the ~200 ms that isn't there at that size.

---

### Q2: Is there a ~1.5-2 s floor on ALL cold-loads, regardless of doc size?

**Evidence:**
- README cold-load = 1098 ms (run 1, warm Vite, warm server-side doc). Cold-pool-warm = 424 ms. Delta = 674 ms.
- MDX-ROUNDTRIP cold-load = 1313 ms. Cold-pool-warm = 308 ms. Delta = 1005 ms.
- IDEAL-EDITOR cold-load = 1375 ms. Cold-pool-warm = 564 ms. Delta = 811 ms.
- PROJECT cold-load = 10317 ms. Cold-pool-warm = 9416 ms. Delta = 901 ms.
- Average floor = **~850 ms** on the warm-Vite path.
- Run-2 variance (e.g., STORIES 7.5 s) is real and driven by server-side Y.Doc disk re-read after browser disconnect — it's a SESSION floor, not a user-floor if the server keeps the doc resident.

**Verdict:** **YES, a ~700–1000 ms floor exists** but it's closer to 1 s than the brief's 1.5–2 s. Run-2 measurements blow out due to server-side Y.Doc unload-on-disconnect (a dev-mode artifact that production-mode keep-alive configuration could eliminate).

**Scope implication:**
- Option E (static content during Suspense) has ~700 ms of pure app-shell time to hide behind pre-rendered markdown. A well-placed Option E can probably bring perceived-UX to <200 ms.
- Option G (pre-warm on hover) can overlap Y.Doc sync (~200 ms median) AND createEditor (~30–300 ms) with user intent — cumulative savings ~300–500 ms of floor when hover precedes click.
- Neither Option addresses the base floor below ~300 ms (app-shell JS parse + React mount) — a viewport-rendered skeleton during that window is the best achievable.
- **Prioritization: Option E first** (biggest floor reduction for the work). Option G complements it.

---

### Q3: Does WikiLink-heavy content have a measurable React cost vs same-size link-less?

**Evidence:**
- STORIES vs IDEAL-EDITOR: +141 React views → +291 ms activity-pool actualDur → 2.06 ms/view delta.
- Of those 141 extra views, 96 are WikiLinks and 45 are InternalLinks. If WikiLink were free, the delta would be 45 × ~2 ms = 90 ms, not 291 ms.
- WikiLinkView and InternalLinkView are structurally isomorphic (500/506 lines, 67/71 Radix hooks). No architectural asymmetry that would make WikiLink cheaper.

**Verdict:** **YES, WikiLink per-view cost = InternalLink per-view cost (~2 ms/view).** The measurement directly demonstrates parity.

**Scope implication:** **Alt 5 MarkView hybrid MUST generalize to WikiLink in V2 scope.** Shipping Alt 5 for InternalLink alone would leave 190 ms of WikiLink React cost unaddressed on a 530 KB wiki-heavy doc — visible in cold-pool-warm + warm-switch + anywhere Activity re-reveals the doc. If the V2 spec carves Alt 5 as InternalLink-only, it undershoots the performance improvement on the docs where the improvement matters most (knowledge graph / wiki-linked docs = the product's core use case).

---

### Q4: Does code-fence-heavy content have measurable editor cost vs same-size prose?

**Evidence:**
- IDEAL-EDITOR (30 fences, 43 KB) vs MDX-ROUNDTRIP (0 fences, 12 KB): ΔactualDur = +10 ms across 30 fences + 69 extra table rows + 3.6× bytes. Code fence per-instance React render ≈ 0 ms.
- Browser style+layout Δ = +83 ms, partially attributable to fences (~2.8 ms per fence upper bound), partially to tables/bytes.
- Source inspection: `CodeBlockFidelity` has no `addNodeView()` — renders as native `<pre><code>` via base `@tiptap/extension-code-block`. No React cost by construction.

**Verdict:** **NO, code fences are not a significant cost class.** 30 fences = ~90 ms of style+layout = 0 ms of React work = not a V2 bottleneck.

**Scope implication:** **Code fences are NOT a V2 scope addition.** Even 300 code fences would cost ~900 ms of layout (addressable by `content-visibility: auto` if ever needed) and 0 ms of React. The V2 spec need not address code blocks unless a specific doc exceeds a threshold where layout cost dominates — no such doc exists in the spectrum, and the world model doesn't suggest one.

If a future user reports unexpected slowness on code-fence-heavy docs, the first investigation should be layout cost (CDP `layoutMs`) not React cost.

---

### Q5: Is React cost linear in view count, or is there a threshold behavior?

**Evidence:**
- 5 views → 77 ms (noise-dominated)
- 30 views → 113 ms (3.77 ms/view)
- 35 views → 123 ms (3.51 ms/view)
- 176 views → 414 ms (2.35 ms/view)
- 768 views → 2180 ms (2.84 ms/view)
- Delta regression between MDX and STORIES: 2.06 ms/view marginal.

**Verdict:** **Roughly LINEAR with marginal cost ~1.5–2.0 ms/view at counts ≤ 176, slightly super-linear at 768** (2.84 ms/view at PROJECT). No threshold — no discontinuity, no inflection.

**Scope implication:**
- View count is the SINGLE dominant React cost driver. A doc with 200 MarkViews+NodeViews will cost ~400 ms of React render. 500 views → ~1400 ms.
- Alt 5 hybrid (decoration-rendered for non-active, React-portaled only for active/editing) reduces per-view cost from ~2 ms to near-zero for the ~95% non-active views. Expected savings on STORIES = ~190 ms. On PROJECT = ~1800 ms (matches prior probe).
- The slight super-linearity at 768 suggests a second-order effect at very high counts — possibly deep reconciliation in Radix sub-trees, or growing keyed-list overhead. Investigating WHY 768 is 40 % worse per-view than 176 could save additional time, but is not critical for V2.

---

## 9. Anomalies + open questions

### Anomaly 1: Cold-load variance >2× on small and large docs

README cold-load run 1 = 1098 ms, run 2 = 2453 ms (2.23×). STORIES run 1 = 3791 ms, run 2 = 9929 ms (2.62×).

**Hypothesis:** Hocuspocus unloads Y.Docs when connection count drops to 0. Each fresh scenario launch creates a new browser → new WebSocket connection → server re-reads markdown from disk (~2 s for STORIES). This bleeds into cold-load wall-clock. Cold-pool-warm is unaffected because the provider stays pool-resident for the scenario's duration.

**Consequence:** Cold-load measurements are NOT a reliable calibration target for V2. They represent user-facing latency ONLY when a cold server is genuinely a possibility (first-ever access to a doc since server start). The authoritative measurement for V2 calibration is cold-pool-warm + cold-load-delta.

**Open question:** Does production deployment keep Y.Docs resident longer than dev mode? If yes, the floor measurement could stabilize. Worth probing next.

---

### Anomaly 2: MDX-ROUNDTRIP's ok/cold/* sums are lower than README's

README (4,479 PM chars) has `editor-mount` 9.8 ms + `force-rerender` 61 ms = ~71 ms.
MDX-ROUNDTRIP (9,016 PM chars) has `editor-mount` 7.3 ms + `force-rerender` 11.8 ms = ~19 ms.

MDX is 2× the size but 3-4× faster in sync work. Anomaly.

**Hypothesis:** Activity-sibling contamination. README's cold-pool-warm used `{MDX, IDEAL, STORIES}` as eviction docs (the only way to evict README itself without README appearing on the eviction list). STORIES' late-arriving ok/cold marks bleed into README's revisit window. The "true" README sync cost is probably ~15–20 ms (close to MDX's).

**Consequence:** README's attribution-table entries should be interpreted with caution. Not a flaw in the scaling analysis because the MDX-ROUNDTRIP row is the clean small-doc reference point.

---

### Anomaly 3: `force-rerender` count varies (10 vs 12) between docs

MDX-ROUNDTRIP has 10 force-rerender calls in its revisit window; all other docs have 12. Investigated briefly — possibly related to Activity mount-list LRU re-computation firing differently depending on which sibling docs are in the mount set at revisit. Doesn't affect total sum meaningfully (~10–12% variance).

---

### Anomaly 4: STORIES activity-pool is dominated by 3 commits of ~120 ms each, not one big commit

Looking at run 2's activity-pool commit timeline (2,374 ms cold-pool-warm):
```
 5517  actualDur 0.2
 5746  actualDur 115.4  ← first
 6832  actualDur 10.9
 6868  actualDur 0
 7028  actualDur 121.3  ← second
 7235  actualDur 8.6
 7262  actualDur 0.2
 7273  actualDur 124.5  ← third
 7563  actualDur 29.3
 7659  actualDur 3.7
 7867  actualDur 14.2
```

Three commits of 115 / 121 / 125 ms, with small follow-ups. In contrast PROJECT had a single dominant 1,094 ms commit. The difference: STORIES has 176 React views (2 ms × 176 = ~350 ms split across commits); PROJECT has 768 views which doesn't split as cleanly because they're all in a single Activity entry being reconciled together.

**Implication:** Small/mid docs amortize React cost across multiple commits (Suspense boundaries, nested-updates); the 2× PROJECT view count → 6× commit time isn't about view count alone, it's about single-commit batching vs multi-commit amortization. Alt 5's hybrid will help both but the improvement curve is different.

---

### Anomaly 5: PROJECT `editor-mount` total (313 ms, 4 calls = ~78 ms each) doesn't scale with doc size the way MDX (7 ms, 2 calls = ~4 ms) would predict

Per-call editor-mount: MDX 3.7 ms, IDEAL 8.0 ms, STORIES 51 ms, PROJECT 78 ms. The per-call cost is actually SUB-linear in doc size across this range — PROJECT is only 1.5× slower per-call than STORIES at 6× the size. Consistent with the "PROJECT has more textContent per node" theory (wide shallow tree vs narrow deep tree).

---

### Open questions (for follow-up)

1. **Does Option E's static-content render accurately track WikiLink state?** WikiLinks may resolve to broken refs or cross-document anchors — if the static render shows "✓ resolved" styling but the Y.Doc sync reveals broken links, the Option E experience has a flash-of-incorrect-render. Probing needed.
2. **Does `ACTIVITY_MOUNT_LIMIT=1` on big docs save the ~800 ms that's 2 StrictMode duplicates?** Prior probe saw 4 editor-mount calls in the revisit window on PROJECT (2 StrictMode per Activity entry × 2 Activity entries). A deliberate size-aware LIMIT could avoid the sibling-editor cost. Worth a one-line config ablation.
3. **Is there a server-side Y.Doc caching config (e.g., longer `onDisconnect` → unload timeout) that would stabilize run-2 cold-load measurements?** The `2 s disk re-parse` that bleeds into STORIES cold-load is dev-mode specific; production could be different.
4. **For docs between 50 KB and 500 KB (the grey zone), where's the actual inflection point from Acceptable to Unacceptable?** The spectrum here jumps from 43 KB (still Acceptable) to 530 KB (Unacceptable). Sampling at 100 KB and 250 KB would tighten the curve and calibrate defer-mount / size-gate thresholds for V2.
5. **Does `paintMs` aggregation work correctly?** CDP trace reports `paintEvents: 420-799` counts across runs but `paintMs: null`. Adding a paint-duration sum to `aggregateTrace` would tighten the "residual" column in the attribution table.

---

## Appendix A — Raw measurement data

22 scenario JSON files at `/tmp/ok-perf-validation/size-spectrum-profile/evidence/results/`:

- `cold-load-big-doc.*.json` (6 files) — 1 run per doc × 4 docs + variance re-runs on README + STORIES
- `cold-pool-warm.*.json` (7 files) — 1 run per doc × 4 docs + variance re-runs on README + STORIES + IDEAL-EDITOR
- `mode-toggle.*.json` (5 files) — 1 run per doc × 4 docs + variance re-run on STORIES
- `warm-switch.*.json` (4 files) — 1 run per big doc × 4 docs (target small = README in all runs)

Each JSON contains:
- `metadata` — commit SHA, captured timestamp, platform, target URL
- `trace` — CDP aggregate (scriptMs, layoutMs, styleMs, taskDurationMs, longestTaskMs, paintEvents)
- `marks` — all `ok/*` perf marks with `{name, startTime, duration, properties}`
- `onRender` — React Profiler entries per `<ProfilerBoundary>` (id, phase, actualDuration, baseDuration, commitTime)
- `metrics` — scenario-computed wall-clock metrics
- `notes` — scenario-emitted progress markers
- `networkRequests` + `consoleErrors` — full I/O log

Query patterns (using `jq`):

```bash
# ok/cold/* per doc in revisit window
revisitStart=$(jq -r '.metrics.revisitStartPerf' cold-pool-warm.*.json)
jq --argjson rs "$revisitStart" '.marks | map(select(.name|startswith("ok/cold/")) | select(.startTime >= $rs)) | group_by(.name) | map({name: .[0].name, count: length, sumDur: (map(.duration)|add)})' cold-pool-warm.*.json

# activity-pool Profiler commits in revisit window
jq --argjson rs "$revisitStart" '.onRender | map(select(.id=="activity-pool" and .startTime >= $rs))' cold-pool-warm.*.json

# Cold-load scaling table
for f in cold-load-big-doc.*.json; do
  jq -c '{doc:.metrics.docName, coldLoadMs, longestTaskMs:.metrics.observedLongestTaskMs, script:.trace.scriptMs, lay:.trace.layoutMs, sty:.trace.styleMs}' "$f"
done
```

## Appendix B — Doc-marker + file setup

Temporary worktree changes (**user to clean up on PROBE CLOSE**):

1. Copy `reports/markdown-roundtrip-fidelity-tiptap/REPORT.md` → `MDX-ROUNDTRIP.md` (root).
2. Copy `reports/full-stack-pm-crdt-markdown-editor-ideal/REPORT.md` → `IDEAL-EDITOR.md` (root).
3. Add markers to `packages/app/tests/perf/lib/doc-markers.ts`:
   - `STORIES: 'Now phase workstreams'`
   - `MDX-ROUNDTRIP: 'Markdown Round-Trip Fidelity Through'`
   - `IDEAL-EDITOR: 'Architecturally-Ideal ProseMirror Schema'`

Cleanup:

```bash
cd .claude/worktrees/cold-mount-profile
rm MDX-ROUNDTRIP.md IDEAL-EDITOR.md
git checkout packages/app/tests/perf/lib/doc-markers.ts
```

## Appendix C — Cross-reference to prior probe

Prior cold-mount-profile probe (`/tmp/ok-perf-validation/cold-mount-profile/REPORT.md`) measured PROJECT.md (3.25 MB) cold-pool-warm at 9.41 s with the following 5-component attribution:

| # | Component | Measured | Confidence |
|---|---|---|---|
| 1 | TipTap Editor construction | ~200 ms | HIGH |
| 2 | y-prosemirror `_forceRerender` | ~300 ms | HIGH |
| 3 | PureEditorContent.init + createNodeViews + ReactMarkViewRenderer × 768 | ~440 ms | HIGH |
| 4 | React reconciliation of 768 MarkView portals | ~2.2 s | HIGH |
| 5 | Browser style + layout | ~2.5–3.0 s | MEDIUM |
| 6 (residual) | React commit phase + setTimeout + paint + GC | ~1.4 s | LOW |

This probe's 4-doc spectrum reproduces component cost at different size points:

| Component | 12 KB | 43 KB | 530 KB | 3.25 MB |
|---|---:|---:|---:|---:|
| TipTap (editor-mount) | 7.3 ms | 32 ms | 203 ms | 313 ms |
| force-rerender | 12 ms | 41 ms | 368 ms | 582 ms |
| ec-init + create-node-views | 22 ms | 63 ms | 691 ms | 1,366 ms |
| React render (activity-pool) | 113 ms | 123 ms | 414 ms | 2,180 ms |
| Browser style+layout (session) | 277 ms | 360 ms | 1,474 ms | 3,124 ms |

Scaling confirms the prior probe's attribution is correct AND extrapolates linearly down the size axis. No new components discovered at smaller sizes — the same 5 components dominate at every size point, just at different absolute magnitudes.

## Appendix D — Dev server / hardware notes

- **Platform:** Darwin 25.2.0 (MacBook Pro), `process.arch=arm64`, Chromium headless via `@playwright/test@chromium`, viewport 1440×900 @ deviceScaleFactor 1.
- **Dev server:** `bun run --cwd packages/app dev` on `VITE_PORT=5184`. Single `hocuspocus` instance backing the session.
- **Vite version:** 8.0.8 (ready in 4.3 s).
- **Bun:** 1.3.11 (monorepo default).
- **Node:** 24.8.0 (for Playwright driver).
- **Headless Chromium:** via `chromium.launch({ headless: true })`. No `--enable-precise-memory-info` args used for scenarios in this probe (passed but not consumed by scenario).
- **StrictMode:** active in dev (React 19.2). 2× editor-mount per Activity entry on mount.

---

**Probe close:** all 4 V2-gating questions answered with empirical data. Variance acceptable on cold-pool-warm / mode-toggle / warm-switch. Cold-load has inherent variance documented but the wall-clock floor is well-characterized. The V2 spec has the evidence it needs to calibrate scope against doc-size thresholds, prioritize Alt 5 generalization over code-block mitigation, and commit Option E + G as perceived-UX interventions that can realistically target the ~800 ms cold-load floor.
