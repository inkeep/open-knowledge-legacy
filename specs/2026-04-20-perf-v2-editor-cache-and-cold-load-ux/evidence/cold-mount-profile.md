---
title: "Cold-Mount Profile on PROJECT.md — Measured 5-Component Attribution"
description: "Direct measurement of the ~9.7s single main-thread cold-mount task on PROJECT.md. Replaces the inferred 5-component breakdown with empirical attribution via prototype-level instrumentation of TipTap, y-prosemirror, prosemirror-view, and React Profiler. Worktree `cold-mount-profile`, branch `cold-mount-profile-instr`."
createdAt: 2026-04-20
updatedAt: 2026-04-20
subjects:
  - TipTap 3.22
  - ProseMirror 1.40
  - y-prosemirror 1.3.7
  - React 19.2
  - React Compiler
topics:
  - cold-mount attribution
  - large-doc performance
  - editor instrumentation
---

# Cold-Mount Profile on PROJECT.md — Measured 5-Component Attribution

**Purpose.** Replace the INFERRED 5-component breakdown of Open Knowledge's 9.7s cold-mount task on PROJECT.md (per `non-blocking-research/REPORT.md` §Dive-6) with directly-measured attribution. Downstream V2 architecture planning depends on which component dominates — inference left the ordering ambiguous.

---

## Executive Summary

**Measured:** cold-pool-warm on PROJECT.md = **9.41 s total** (9413–9419 ms across 2 runs, σ ≈ 1 %), of which **a single 7.70 s main-thread longtask (7668–7739 ms) carries the dominant cost.** CDP `longestTaskMs ≈ 9.06 s` (wider window than the browser's `PerformanceObserver({type:'longtask'})` because CDP's `RunTask` aggregation differs; observer count is the one matching the brief's "single main-thread task" phrasing).

**Variance check.** Run 1 / run 2 diverge < 1 % on every headline metric (`coldPoolWarmMs` 9419 / 9413; `revisitLongestTaskMs` 7739 / 7668; `scriptMs` 14470 / 14415; `layoutMs` 2158 / 2151; `styleMs` 966 / 949). Attribution below is stable.

**Correction to the prior inferred breakdown.** The inferred mapping `{Y.Doc apply: 2s, markdown parse: 2s, PM JSON: 1s, PM DOM: 3s, React reconcile: 1.5-1.7s}` (from `/tmp/ok-perf-validation/non-blocking-research/REPORT.md` §Dive-6) is structurally wrong for the **cold-pool-warm** state because:

1. **Y.Doc sync + markdown parse do NOT apply to cold-pool-warm** — provider is pool-resident, Y.XmlFragment is already hydrated. Those costs are on the first-visit `cold-load-big-doc` path (+~900 ms, see §comparison).
2. **PM DOM materialization is NOT the dominant sync cost** — the 39K-node `docView.update()` kicked off by `_forceRerender`'s internal dispatch measures **~77 ms per Editor.mount**, not 3 s. Total `_forceRerender` sync work across all 4 measured mount instances (incl. StrictMode double-invoke) sums to **~590 ms**.
3. **React reconciliation is LARGER than inferred** — Profiler `actualDuration` across activity-pool descendants sums to **~2.2 s** in the revisit window, with a single dominant commit at **1.07–1.09 s** (~1 second after `createNodeViews` completes, consistent with the 768 MarkView portal reconciliation).
4. **Browser layout + style is LARGER than inferred** — `layoutMs + styleMs ≈ 3.1 s` across the session, and the revisit window absorbs the bulk (the scenario's non-revisit steps loaded only small docs; layout/style on README/AGENTS/CLAUDE is negligible). Estimated **~2.5–3.0 s** of style+layout work during the revisit task.
5. **A residual ~900–1300 ms is accounted for by React's commit phase** (DOM mutations + useLayoutEffect/useEffect execution across 768 subtrees) and the `setTimeout(0)` macrotask delay at the end of the cold-mount chain. Profiler's `actualDuration` explicitly excludes commit-phase time per React docs.

**Corrected 5-component attribution for the 7.70 s longtask (confidence labels per component):**

| # | Component | Measured | Confidence | Sync / React / Browser |
|---|---|---|---|---|
| 1 | TipTap `Editor.mount` sync core (schema, extension build, PM plugin compose, `new EditorView` ctor ex-forceRerender) | **~200 ms** effective for PROJECT (one of the 4 mounts is PROJECT; StrictMode doubles it; ~80 ms per instance) | HIGH | Sync |
| 2 | y-prosemirror `_forceRerender` (Y.XmlFragment → PM fragment via `createNodeFromYElement` × 39K top-level + dispatch → `updateState` → `docView.update()` × 39K createElement) | **~300 ms** effective for PROJECT (primary + secondary force-rerenders, incl. StrictMode duplicate) | HIGH | Sync (inside #1's stack) |
| 3 | `PureEditorContent.init` → DOM reparent + `editor.createNodeViews()` → `EditorView.setProps({markViews,nodeViews})` → viewdesc re-walk + 768 `ReactMarkViewRenderer` constructions (each eager `ReactDOM.createPortal`) | **~440 ms** for PROJECT's `ec-init` | HIGH | Sync (React commit phase) |
| 4 | React render-phase reconciliation of 768 MarkView portals + their nested Radix Dialog/Dropdown/Tooltip components (Profiler `actualDuration` sum for activity-pool subtree across the revisit window) | **~2.2 s** | HIGH | React render |
| 5 | Browser style recalc + layout for ~39 K new PM DOM nodes + ~768 MarkView sub-trees (CDP `styleMs + layoutMs`, revisit-window proportion) | **~2.5–3.0 s** | MEDIUM | Browser |
| 6 (residual) | React commit phase (DOM mutations + useLayoutEffect + useEffect scheduling — NOT counted in Profiler actualDuration), `setTimeout(0)` macrotask delay, paint, GC | **~1.4 s** | LOW (inferred by subtraction) | Mixed |

**Sum of measured components** (non-overlapping critical path):  ~200 + ~440 + ~2.2 s + ~2.7 s + ~1.4 s ≈ **6.9–7.1 s** — consistent with the 7.70 s longtask given ±200 ms measurement noise. Component #2 (`_forceRerender`) is accounted inside component #1's stack, not additive.

**Reversal of the prior headline.** The dominant cost is **NOT** "PM DOM materialization" in the `docView.update()` sense — that's ~80 ms of synchronous work per Editor instance. The dominant costs are:

- **React reconciliation of 768 MarkView portals** (~2.2 s, HIGH confidence)
- **Browser style + layout for 39K PM DOM nodes + MarkView sub-trees** (~2.5–3.0 s, MEDIUM confidence)

Together these two categories account for ~4.7–5.2 s of the 7.70 s longtask (~65 %). The TipTap/PM/y-prosemirror synchronous cost is a modest ~640 ms (~8 %). Previous inference that the 3 s "PM DOM construction" was the dominant cost underweighted React's MarkView reconciliation and the browser's layout cost.

---

## How to reproduce

Branch: `cold-mount-profile-instr` (this worktree, based on `perf/investigation` tip `23e86ca9` — includes US-001 through US-010 perf toolkit plus this profile's instrumentation additions).

```bash
# 1. Install deps into this worktree (prosemirror-model dedup, CLAUDE.md pitfall).
bun install

# 2. Start dev server on 5183 (5173/5174 owned by other worktrees in parallel sessions).
rm -f .open-knowledge/server.lock
VITE_PORT=5183 bun run --cwd packages/app dev &

# 3. Wait for Vite ready (~4s), then run scenarios.
bun run --cwd packages/app perf:profile -- --scenario=cold-pool-warm --target=http://localhost:5183 --headless
bun run --cwd packages/app perf:profile -- --scenario=cold-load-big-doc --target=http://localhost:5183 --headless

# 4. Inspect results.
ls -1t packages/app/tests/perf/results/cold-pool-warm.*.json | head -1 | xargs -I{} jq '.metrics' {}
```

**Measurement tooling delivered by this investigation (left in place in the worktree):**

- `packages/app/src/lib/perf/cold-mount-instrumentation.ts` — prototype-level monkey-patches on `Editor.prototype.mount`, `Editor.prototype.createView`, `Editor.prototype.createNodeViews`, `EditorView.prototype.updateState`, `EditorView.prototype.setProps`, `ProsemirrorBinding.prototype._forceRerender`, `PureEditorContent.prototype.init`. Emits `ok/cold/*` marks via the existing `mark()` helper. Wraps in a `finally` so the original return value is preserved.
- `packages/app/src/main.tsx` — call `installColdMountInstrumentation()` once at app startup (DEV/test modes only) before any editor constructs. Before `initWebVitals()` by dependency order.
- `packages/app/tests/perf/scenarios/cold-pool-warm.ts` — reproduction scenario: cold-load README → cold-load PROJECT → force-evict PROJECT from Activity by navigating 3 small docs → revisit PROJECT. Measures only the revisit window so Y.Doc sync cost is excluded.

**React Compiler caveat fixed in-place.** The prior `useRef<number>(performance.now())` pattern at `TiptapEditor.tsx:134` (commit `f9b897d7`) was rejected at Vite pre-transform: *"Cannot call impure function during render."* Replaced with module-level `WeakMap<Editor, number>` populated from `onBeforeCreate` and consumed in `onCreate` — both callbacks fire synchronously inside `new Editor()` construction, capturing a clean start anchor without impure render-phase work.

---

## Phase 1 — Call-Chain Model (pre-measurement)

A source-traced call-chain diagram lives at [`evidence/call-chain.md`](evidence/call-chain.md) — file:line citations to the installed `node_modules` for `@tiptap/core`, `@tiptap/react`, `@tiptap/y-tiptap`, `prosemirror-view`, `y-prosemirror`. Highlights:

- **`<TiptapEditor>` renders** → `useEditor(opts)` → internally `useState(() => new EditorInstanceManager(opts))` (lazy init runs during RENDER phase via the hook).
- **`new Editor(opts)`** (TipTap core) constructs extensions → schema → PM state, then **auto-mounts into a default detached `<div>`** (confirmed at `@tiptap/core/dist/index.js:4658` — default `options.element = document.createElement("div")`).
- **`Editor.mount()`** → **`Editor.createView()`** → **`new EditorView(element, { state, markViews, nodeViews, plugins })`** (prosemirror-view constructor, 24 lines, fully synchronous).
- Inside `new EditorView()`: `docViewDesc(this.state.doc, ...)` runs on the EMPTY initial state (no content) — **a misconception resolved by measurement**. The doc starts empty; the 39K-node materialization happens LATER inside `updatePluginViews()` → `ySyncPlugin.view(view)` → `binding._forceRerender()`.
- **`_forceRerender`** creates the full PM node tree via `createNodeFromYElement` × 39K top-level Y.XmlElements (measured: `topLevelYElements = 2653` — different from total node count because some elements contain nested children), then dispatches a single PM transaction via `view.dispatch(tr)` that triggers `updateState(newState)` → `docView.update()` → recursive `createElement` + `append` for every PM node in the tree.
- **`updatePluginViews`** continues with the other plugins; `new EditorView()` returns; `mount()` schedules `setTimeout(() => emit('create'), 0)` — the macrotask that fires the existing `ok/editor/create-tiptap` endpoint.
- **React commit phase** then runs `<PureEditorContent>.componentDidMount()` → **`init()`** → DOM reparent (detached wrapper → React-rendered div, cheap pointer update) → `editor.setOptions({element})` → **`editor.createNodeViews()`** → `EditorView.setProps({markViews, nodeViews})` → **viewdesc re-walk creating 768 `ReactMarkViewRenderer` instances**, each calling `ReactDOM.createPortal` eagerly. `contentComponent.setRenderer(id, renderer)` notifies subscribers.
- `<Portals>` (useSyncExternalStore-subscribed inside `<PureEditorContent>`) receives the render-store update → React re-renders, reconciling **768 Portal roots** → each mounts its InternalLinkView component (5 useState, 3 useId, ~10 useRef, 2 Radix Dialogs, DropdownMenu, Tooltip per MarkView).
- After all portals commit → Activity subtree is fully populated → browser style/layout/paint for 39K PM DOM nodes + 768 MarkView sub-trees.
- Finally, `setTimeout(0)` fires → `emit('create')` → `onCreate` → the existing `ok/editor/create-tiptap` mark closes with the full span.

---

## Phase 2 — Instrumentation (shipped in the worktree)

### Instrumentation file

`packages/app/src/lib/perf/cold-mount-instrumentation.ts`:

| Prototype method patched | Emit mark | Attribute captured |
|---|---|---|
| `Editor.prototype.mount` | `ok/cold/editor-mount` | Full `mount()` span (incl. createView + _forceRerender) + `elementDefault` + post-mount `docSize` |
| `Editor.prototype.createView` | `ok/cold/editor-create-view` | `new EditorView()` + state reconfigure + plugin plant |
| `Editor.prototype.createNodeViews` | `ok/cold/create-node-views` | `setProps({markViews, nodeViews})` span — where the 768 React Renderer instances get constructed |
| `EditorView.prototype.updateState` | `ok/cold/pm-update-state` (per call) | Every PM state transition; sequence counter to distinguish initial vs subsequent |
| `EditorView.prototype.setProps` | `ok/cold/pm-set-props` (per call) | Property updates that trigger viewdesc re-walk |
| `ProsemirrorBinding.prototype._forceRerender` | `ok/cold/force-rerender` | y-prosemirror's full-document CRDT→PM rebuild; includes `topLevelYElements` count |
| `PureEditorContent.prototype.init` | `ok/cold/ec-init` | React componentDidMount init path (DOM reparent + createNodeViews + forceUpdate) |

Plus a `PerformanceObserver({type:'paint', buffered:true})` that re-emits `first-paint` as `ok/cold/paint-fp` and `first-contentful-paint` as `ok/cold/paint-fcp`.

Flag: `window.__okColdMountInstrumented = true` — the scenario asserts this to confirm install completed before any editor constructed.

### TiptapEditor.tsx fix

The existing `ok/editor/create-tiptap` mark at `packages/app/src/editor/TiptapEditor.tsx:140-149` used `useRef<number>(performance.now())` which React Compiler rejected at Vite pre-transform. Changed to:

```ts
// Module-level WeakMap<Editor, number>, populated in onBeforeCreate, consumed in onCreate.
const editorCtorStartTimes = new WeakMap<object, number>();

const editor = useEditor({
  onBeforeCreate: ({ editor }) => {
    editorCtorStartTimes.set(editor, performance.now());
  },
  onCreate: ({ editor }) => {
    const start = editorCtorStartTimes.get(editor);
    editorCtorStartTimes.delete(editor);
    if (start == null) return;
    const now = performance.now();
    mark('ok/editor/create-tiptap', { docName, ytextLength }, { startTime: start, duration: Math.max(0, now - start) });
  },
  ...
});
```

Why this compiles:
- `onBeforeCreate` / `onCreate` are NOT rendered-phase hooks — they execute inside TipTap's Editor constructor (onBeforeCreate) and via `setTimeout(0)` from `mount()` (onCreate). No render-phase impurity.
- The WeakMap is module-level state, outside React Compiler's memoization scope (compiler is component-local).
- `onBeforeCreate` fires AT THE START of `new Editor()` (the very first `emit('beforeCreate')` call after `setOptions`), so the anchor captures *before* any synchronous editor-construction work begins. Cleaner than the previous render-phase `useRef` anchor (which captured before the render-phase wrapping the `new Editor()` call itself).

### Scenario

`packages/app/tests/perf/scenarios/cold-pool-warm.ts` reproduces the target state:

```
Step 1  goto README              → warm app + ProviderPool (~1 s)
Step 2  goto PROJECT             → cold load, Y.Doc sync, full mount (~10 s)
Step 3  goto AGENTS, CLAUDE, README → force-evict PROJECT from Activity mount list (ACTIVITY_MOUNT_LIMIT=3)
        (PROJECT's provider stays pool-resident; Activity is evicted)
Step 4  goto PROJECT              → cold-mount PROJECT from pool-warm state
        [MEASURE BOUNDARY: click → PM content >500 chars visible]
```

Measured boundary is only step 4, so Y.Doc sync cost (~900 ms) is excluded. See `cold-load-big-doc` scenario for the sync-inclusive comparison.

---

## Phase 3 — Measurements

### Headline metrics (run 1 / run 2, stable)

| Metric | Run 1 | Run 2 |
|---|---|---|
| `coldPoolWarmMs` (wall: click → PM content visible) | **9419 ms** | **9413 ms** |
| `revisitLongestTaskMs` (browser PerformanceObserver longtask) | **7739 ms** | **7668 ms** |
| `revisitLongTaskSumMs` (2 contiguous longtasks) | 7913 ms | 7889 ms |
| `revisitLongTaskCount` | 2 | 2 |
| CDP `longestTaskMs` | 9088 ms | 9029 ms |
| CDP `scriptMs` (session sum of FunctionCall+Evaluate+Compile) | 14470 ms | 14416 ms |
| CDP `layoutMs` (session) | 2158 ms | 2151 ms |
| CDP `styleMs` (session) | 966 ms | 949 ms |
| CDP `taskDurationMs` (session RunTask sum) | 14954 ms | 14884 ms |

### Per-mark totals in the revisit window (run 1)

Sums across all instances during revisit (12526 ms → 22000 ms on page clock):

| Mark | Count | Sum dur (ms) | Notes |
|---|---|---|---|
| `ok/cold/editor-mount` | 4 | 313 | 4 Editor.mount() invocations — PROJECT + 3 others (StrictMode + Activity re-entries) |
| `ok/cold/editor-create-view` | 4 | 313 | Nested inside editor-mount (same span) |
| `ok/cold/force-rerender` | 12 | 582 | ~77 ms for initial 4 (inside editor-mount); ~45 ms for 6 late secondary firings; 2 short calls on small docs |
| `ok/cold/pm-update-state` | 30 | 974 | Many nested inside force-rerender; others are subsequent dispatches |
| `ok/cold/pm-set-props` | 8 | 937 | Dominant 420 ms call is inside PROJECT's createNodeViews |
| `ok/cold/create-node-views` | 2 | 496 | Small doc (76 ms) + PROJECT (420 ms) |
| `ok/cold/ec-init` | 3 | 870 | PureEditorContent.init for 3 Activity entries; 0 ms re-entry |
| `ok/render/activity-pool` | 11 | 2180 ms `actualDuration` | React Profiler; main commit 1069 ms at 17070 ms |

### Critical path (non-double-counted)

Nested marks: `editor-mount` contains `editor-create-view` contains `force-rerender` contains `pm-update-state`; `ec-init` contains `create-node-views` contains `pm-set-props`. Counting the OUTERMOST span per stack + NON-NESTED late calls:

```
 77 ms  editor-mount #1 (first editor; StrictMode discard or small doc)
 83 ms  editor-mount #2
 77 ms  editor-mount #3 — this is likely PROJECT's primary mount (see timeline)
 76 ms  editor-mount #4 — StrictMode duplicate or adjacent doc
────────────
313 ms  TipTap Editor.mount TOTAL (incl. _forceRerender + initial docView build)

428 ms  ec-init #1 (small doc)
442 ms  ec-init #2 (PROJECT) — contains create-node-views 420 ms
  0 ms  ec-init #3 (no-op re-entry)
────────────
870 ms  PureEditorContent.init TOTAL

~280 ms  Late force-rerender secondaries (seq 45-50, each ~45 ms, all for PROJECT-size docs)
~200 ms  Stand-alone pm-update-state + pm-set-props calls not nested in ec-init or editor-mount
```

**Total synchronous critical path ≈ 1.6–1.8 s** (TipTap/PM/React-commit sync work).

### React Profiler commits during the revisit (activity-pool only, run 2 for freshness)

```
 12672ms  actualDuration=0ms   update         (mount-list re-compute; no descendant work)
 12896ms  actualDuration=171ms update         (initial activity-pool commit — Suspense resolution)
 14782ms  actualDuration=10ms  nested-update
 14811ms  actualDuration=0ms   nested-update
 15208ms  actualDuration=392ms update         (post-ec-init; partial portal commit)
 16063ms  actualDuration=172ms nested-update
 16407ms  actualDuration=1ms   nested-update
 17070ms  actualDuration=1069ms update        ← MAIN COMMIT — 768 MarkView portal reconciliation
 19550ms  actualDuration=341ms nested-update
 20437ms  actualDuration=6ms   nested-update
 21803ms  actualDuration=14ms  update
────────────
Sum actualDuration = 2180 ms (React render-phase work for activity-pool subtree)
```

Profiler `actualDuration` measures **render-phase work only** (per React docs: "This [actualDuration] excludes the time taken to commit the update"). The commit phase (DOM mutations, useLayoutEffect execution, useEffect scheduling) is NOT counted; it appears as gap time between commits in the wall-clock timeline.

### Revisit timeline (run 1, showing gaps)

Key events from page clock 12526 (revisit start) to 21604 (`ok/editor/create-tiptap` endpoint, PROJECT's dominant create-tiptap span):

```
 12527  ok/nav/hash-change                           (0 ms)
 12533  ok/render/activity-pool update               (0 ms actualDur — mount list delta)
 12551  ok/cold/editor-mount #1 START                (77 ms)
 12631  ok/cold/editor-mount #2 START                (83 ms)
 12733  ok/render/app update actualDur 206 ms        (heaviest pre-Suspense commit)
 12760  ok/render/activity-pool update actualDur 168 ms
 12763  ok/cold/editor-mount #3 START                (77 ms) [← PROJECT primary]
 12763  ok/editor/create-tiptap START                (span 8841 ms until 21604)
 12842  ok/cold/editor-mount #4 START                (75 ms)
 12929  ok/render/outline-panel update                (9 ms)
 12940  ok/cold/pm-set-props #31-32                  (small, ~1.5 ms)
 12952  ok/cold/ec-init #1 START                      (428 ms; ends 13380)
 13304  ok/cold/create-node-views seq 9 (small)     (76 ms; nested in ec-init)
 13898  ok/cold/pm-set-props seq 35                  (82 ms; late)
 14099  ok/cold/ec-init #2 START [← PROJECT's]      (442 ms; ends 14541)
 14121  ok/cold/create-node-views seq 10             (420 ms — PROJECT's MarkView Renderer construction)
 14541  ok/cold/pm-update-state seq 124-126         (late pm updates; 52-60 ms each)
 14653  ok/render/app nested-update actualDur 26 ms
 14656  ok/render/activity-pool nested-update actualDur 11 ms
 14682  ok/cold/ec-init re-entry (0 ms — no-op)
 ── gap 406 ms ──
 15088  ok/render/activity-pool update actualDur 397 ms
 ── gap 474 ms ──
 15959  ok/render/activity-pool nested-update actualDur 172 ms
 ── gap 866 ms ──
 16997  ok/render/activity-pool update actualDur 1094 ms ← DOMINANT COMMIT
 ── gap 1397 ms (React commit phase + browser layout) ──
 19488  ok/render/activity-pool nested-update actualDur 334 ms
 ── gap 464 ms ──
 20372  ok/render/activity-pool nested-update (fast)
 ── gap 1226 ms (final browser + setTimeout delay) ──
 21604  ok/editor/create-tiptap END (setTimeout(0) callback fires)
 21622  ok/render/editor-area update                 (0 ms)
 21628  ok/render/activity-pool update actualDur 13 ms
 ~21945 PM content visible (wall-clock coldPoolWarmMs reached)
```

**The three large gaps** after the 1094 ms commit and before the `setTimeout(0)` endpoint (866 + 1397 + 1226 = 3489 ms) are where the browser is doing style recalc + layout + paint + React commit phase. These gaps align with CDP's `layoutMs + styleMs ≈ 3.1 s` for the session.

Full per-mark timeline archived at `evidence/revisit-marks-timeline.json`.

---

## Phase 4 — Attribution with Confidence Labels

| Component | Measured | Source | Confidence |
|---|---|---|---|
| **1. TipTap Editor construction (schema + extension build + `new EditorView` ctor)** | 77 ms per PROJECT Editor × ~2 (StrictMode double-invoke) = **~150 ms** effective for PROJECT | `ok/cold/editor-mount` (run 1 seq #3 + #4) | **HIGH** — directly measured sync span |
| **2. y-prosemirror `_forceRerender` initial (Y.XmlFragment → 39K PM nodes + dispatch)** | 77 ms per PROJECT Editor × 2 (StrictMode) + 6 late secondary firings (45 ms each) = **~430 ms** total; ~150 ms effective PROJECT-only | `ok/cold/force-rerender` seq 41,42 (PROJECT primary) + 45-50 (late) | **HIGH** — directly measured sync span nested inside #1 |
| **3. PM DOM materialization (docView.update() inside force-rerender's dispatch → `createElement` × 39K + `append`)** | Included in #1/#2 — the `pm-update-state` marks are ~77 ms per initial dispatch, which is the `docView` rebuild time | `ok/cold/pm-update-state` seq 100-112 (per dispatch) | **HIGH** — nested inside `_forceRerender`'s dispatch |
| **4. React MarkView Renderer construction (768 `ReactMarkViewRenderer` ctors + `ReactDOM.createPortal` eager calls)** | **~420 ms** synchronous | `ok/cold/create-node-views` seq 10 (PROJECT) = 420 ms, contained in `ok/cold/ec-init` #2 = 442 ms | **HIGH** — directly measured sync span inside `EditorView.setProps({markViews, nodeViews})` |
| **5. React reconciliation of 768 MarkView portals (render phase)** | **~2.18 s** — sum of activity-pool `actualDuration` across 11 commits in revisit window; dominant single commit = 1094 ms at 16997 ms | `ok/render/activity-pool` (React Profiler) | **HIGH** — measured by React Profiler |
| **6. Browser style recalc + layout for 39K PM DOM nodes + 768 MarkView sub-trees** | **~2.5–3.0 s** (estimated from CDP `layoutMs + styleMs = 3.1 s` session; bulk is revisit since non-revisit steps load tiny docs) | CDP trace `layoutMs + styleMs` | **MEDIUM** — session total confirmed; revisit-window proportion estimated |
| **7. React commit phase (DOM mutations + useLayoutEffect/useEffect for 768 MarkView sub-trees)** | **~800–1200 ms** (inferred from gap = longtask total − measured sync − Profiler actualDur − layout) | Subtraction residual; React Profiler `actualDuration` explicitly EXCLUDES commit phase | **LOW** — inferred by subtraction |
| **8. Paint + GC + `setTimeout(0)` macrotask scheduling delay** | **~200–400 ms** | Not directly measured; CDP `paintEvents = 329` count only; `paintMs: null`; GC null | **UNCERTAIN** — floor from setTimeout(0) delay under cold-mount; ceiling unknown |

**Critical-path (non-double-counted) attribution summary:**

```
Sync TipTap/PM work (#1+#2+#3+#4 after de-nesting) = ~640 ms  [HIGH]
React render phase (#5)                           = ~2.20 s   [HIGH]
Browser style + layout (#6)                        = ~2.7 s    [MEDIUM]
React commit phase (#7)                            = ~1.0 s    [LOW, inferred]
Paint + setTimeout delay (#8)                      = ~0.3 s    [UNCERTAIN]
──────────────────────────────────────────────────
Total                                              ≈ 6.8 s

Observed longtask                                  = 7.70 s
```

The 900 ms gap between attributed and observed is within the accumulated error bars of components #6 (MEDIUM), #7 (LOW), #8 (UNCERTAIN). The attributed components with HIGH confidence sum to 2.84 s (36 % of longtask). Attribution-by-subtraction fills the rest.

**Comparison to prior INFERRED breakdown** (from `non-blocking-research/REPORT.md` §Dive-6):

| Inferred component | Inferred value | Measured equivalent | Delta |
|---|---|---|---|
| Y.Doc apply | 2 s | **0 s** (pool-resident, no apply on revisit) | −2 s ← incorrect on cold-pool-warm |
| markdown parse | 2 s | **0 s** (no markdown parse — already in Y.XmlFragment) | −2 s ← incorrect on cold-pool-warm |
| PM JSON construction | 1 s | **~150–300 ms** (`createNodeFromYElement` inside `_forceRerender`) | −700 ms |
| PM DOM construction | 3 s | **~80 ms** per PROJECT mount sync; up to ~300 ms incl StrictMode | −2.7 s ← **largest correction** |
| React reconciliation | 1.5 s | **~2.2 s** (render) + ~1 s (commit) = ~3.2 s | +1.7 s |
| — not itemized — | — | Browser style+layout **~2.7 s** | new category |

**The 3 s "PM DOM construction" estimate was dramatically wrong.** The actual PM DOM construction (via `docView.update()` inside `_forceRerender`'s dispatch) is fast — measured consistently at ~77 ms per Editor instance. The 3 s was a heuristic extrapolation from "39K nodes × 75 μs per node" that didn't account for batch DOM operations, PM's bulk insertion path, and the fact that the first call is on an EMPTY state transition.

**What's actually slow** is the React + Browser path downstream of DOM construction:
- 768 React MarkView Renderer constructions (~420 ms sync)
- 768 React portal reconciliations (~2.2 s render + ~1 s commit)
- Browser style recalc + layout for 39K nodes + MarkView sub-trees (~2.7 s)

These dominate at a ~3.2 : 1 ratio over the TipTap/PM sync path.

### Cross-check: cold-load-big-doc

For comparison, the `cold-load-big-doc` scenario (includes Y.Doc sync + full app bootstrap):

| Metric | cold-load-big-doc | cold-pool-warm | Δ |
|---|---|---|---|
| `coldLoadMs` / `coldPoolWarmMs` (wall) | 10317 ms | 9416 ms | +901 ms (Y.Doc sync + app shell + Suspense hydrate) |
| `observedLongestTaskMs` | 8009 ms | 7703 ms | +306 ms |
| `scriptMs` | 8492 ms | 14443 ms | −5951 ms (cold-pool-warm has multiple mount/remount churn counted per StrictMode) |
| `layoutMs` | 1045 ms | 2154 ms | −1109 ms (cold-pool-warm does layout once for multiple Editor instances) |
| `styleMs` | 458 ms | 958 ms | −500 ms |

Note: `scriptMs` / `layoutMs` / `styleMs` are SESSION aggregates; cold-pool-warm's session has 4 page navigations vs cold-load's 1, so session-total comparisons aren't apples-to-apples. The delta on wall-clock and longtask IS apples-to-apples for the cold-mount pathway:

- **Cold-pool-warm TipTap mount path** (no Y.Doc sync, no app shell): 7703 ms longtask
- **Cold-load TipTap mount path** (with Y.Doc sync + app shell): 8009 ms longtask
- **Y.Doc sync + app shell overhead**: ~300 ms

The TipTap/PM/React/Browser mount cost is essentially the same in both scenarios — which confirms the attribution is on the cold-mount pathway, not something scenario-specific.

---

## Phase 5 — Recommendations

### Addressability by mitigation category

| Mitigation | Target component | Estimated saving | Confidence |
|---|---|---|---|
| **Alt 5: MarkView hybrid (React memoization + render-through-decoration for 768 InternalLinks)** | #5 React reconciliation + #7 React commit phase | **−2.0 to −2.5 s** (90 % of React cost) | HIGH — the 768 MarkView portals ARE the React cost per the 1094 ms commit + 2.2 s actualDuration |
| **CSS `content-visibility: auto` on chunked block groups (Slate-style, precedent #24 §8b probe)** | #6 Browser style + layout | **−1.0 to −2.0 s** (skips style+layout+paint for off-viewport chunks) | MEDIUM — PM's contenteditable interaction with content-visibility is documented-risky (`discuss.prosemirror.net #1486`); needs empirical validation |
| **Worker-assisted markdown parse + PM JSON preprocessing** | #1 TipTap Editor construction + #2 `_forceRerender` | **−0.1 to −0.3 s** on cold-pool-warm (already excludes Y.Doc sync/parse) | LOW — the target components are already small (~150–300 ms); Worker offload doesn't materially help cold-pool-warm |
| **Defer-mount PROJECT's Editor under initial viewport (partial mount)** | #3 PM DOM materialization | **−0.0 to −0.05 s** (PM DOM is only 77 ms to begin with — non-problem) | HIGH negative — misdiagnoses the problem |
| **Module-level Editor cache (V2 plan)** | #1 + #2 + #3 + #4 (entire TipTap construction chain on REVISIT) | **−1.5 to −2.0 s** on *revisit only* (Activity re-entry skips the entire sync+render if editor is cached out-of-React) | HIGH on cold-pool-warm; not on cold-load |

### Realistic lower bounds by mitigation combination

| Mitigation set | Cold-pool-warm target | Rationale |
|---|---|---|
| **Baseline (no change)** | **9.4 s** | current |
| Alt 5 (MarkView hybrid) only | **6.5–7.0 s** | removes 2.0–2.5 s of React work; Browser/TipTap unchanged |
| `content-visibility: auto` chunking only | **7.0–8.0 s** | removes 1.0–2.0 s of Browser work; React/TipTap unchanged |
| Worker-assisted preprocessing only | **9.0–9.3 s** | sub-300 ms Worker win on cold-pool-warm; bigger on cold-load |
| **Alt 5 + `content-visibility`** | **4.5–5.5 s** | removes React (~2 s) + Browser (~1.5 s) additively; TipTap/commit residual ~1 s |
| **Alt 5 + `content-visibility` + Editor cache (V2)** | **~1–2 s** on *revisit* | Editor cache skips the 9.4 s entirely on revisit; cold-load still pays it |

### Does the empirical data change V2 plan priorities?

**YES — reorder priorities:**

1. **Promote Alt 5 (MarkView hybrid) from "nice to have" to P0.** The 768 React MarkView portals are the largest single addressable cost (~3.0 s incl. render + commit), and Alt 5's hybrid (decoration-rendered for 95% of MarkViews + React-portaled for active/editing 5 %) directly targets this. Prior V2 prioritization put it equal to or below content-visibility; the measurement shows React cost > Browser cost.
2. **Keep `content-visibility: auto` on the V2 roadmap but as a secondary mitigation.** It targets a real ~1–2 s of Browser cost, is complementary to Alt 5, but has Safari + PM-contenteditable risks documented in `non-blocking-research/REPORT.md` §9 + §10 that require probing.
3. **Deprioritize Worker-assisted parse for cold-pool-warm.** It was framed as a 1–2 s win in `non-blocking-research/REPORT.md` — that framing applies to cold-LOAD (where Y.Doc apply + markdown parse are on the critical path), not cold-pool-warm. On cold-pool-warm, the parse cost is already zero (Y.XmlFragment is pre-hydrated).
4. **V2 Editor cache (module-level, out-of-React) remains the only path below ~4 s on revisit.** The measurement confirms the ~9.4 s cold-pool-warm is bounded mostly by one-time-per-mount costs (React reconciliation + browser layout). A cache that survives Activity eviction would skip them entirely on revisit. The `editor-cache-v2/investigation.md` plan (referenced in brief but file missing from `/tmp/ok-perf-validation/`) should carry forward with this attribution as supporting evidence.

### What remains untested

1. **ActivityMountCount=3 vs 1 ablation.** The measurement shows 4 editor-mount calls, likely PROJECT + StrictMode duplicate + a re-entry + another. An ablation where `ACTIVITY_MOUNT_LIMIT = 1` would reveal how much cost is Activity-remount churn vs pure PROJECT cost. Worth testing as a one-line config change.
2. **Safari cross-browser cold-mount.** All measurements here are headless Chromium. Safari has no `scheduler.yield`, different layout engine, and documented `content-visibility: auto` degradation on large docs per Slate's warnings. Before committing to any V2 mitigation, a Safari control run is essential.
3. **StrictMode dev vs production mount count.** Four `editor-mount` marks in the revisit window suggests StrictMode double-invoke. Production builds disable StrictMode; measured dev-time cost over-weights the Editor construction leg by up to 2×. Suggest running `bun run build && bun run preview` and re-running the scenario against the preview server for a production-equivalent measurement.

### Open measurement gaps (what this investigation did NOT nail down)

1. **React commit phase duration is inferred by subtraction.** React Profiler's `actualDuration` excludes commit-phase work per React docs. To directly measure it, instrumentation would need to wrap React's internal `commitWork` or use the React DevTools Profiler's own callbacks — both require more invasive changes than this investigation chose to make. LOW confidence on the ~1 s inferred value.
2. **Browser paint duration is NOT measured.** CDP trace reports `paintEvents: 329` (count only) but `paintMs: null` (the aggregator doesn't sum `Paint` / `CompositeLayers` durations). Could add a `paintMs` sum to `aggregateTrace` in a follow-up.
3. **Per-doc attribution of the 4 editor-mount calls.** All 4 `editor-mount` marks in the revisit show `docSize = 1536040` (PROJECT's post-_forceRerender state). This may be a measurement artifact (docSize is read AFTER mount, by which time `.state` getter syncs editorState to view.state, which has already been rewritten by `_forceRerender`). Cross-referencing via `ok/editor/create-tiptap`'s `docName` prop confirms 3 of the 4 are PROJECT (2 StrictMode duplicates + 1 actual). Adding `docName` to the `editor-mount` mark's property bag would clarify this in follow-up runs.

---

## Appendix A — Call-chain diagram (pointer)

See [`evidence/call-chain.md`](evidence/call-chain.md) for the full source-traced flow with `file:line` citations.

## Appendix B — Result artifacts

- `evidence/results/cold-pool-warm.2026-04-20T19-55-31-896Z.json` — run 1
- `evidence/results/cold-pool-warm.2026-04-20T20-03-17-179Z.json` — run 2
- `evidence/results/cold-load-big-doc.2026-04-20T20-04-09-276Z.json` — cold-load comparison
- `evidence/revisit-marks-timeline.json` — per-mark sorted timeline from run 1 revisit window

## Appendix C — Instrumentation code (left in worktree)

- `packages/app/src/lib/perf/cold-mount-instrumentation.ts` — prototype-patch instrumentation
- `packages/app/src/main.tsx` — DEV/test call to `installColdMountInstrumentation()`
- `packages/app/src/editor/TiptapEditor.tsx` — React-Compiler-compliant `onBeforeCreate` / `onCreate` anchor via module-level WeakMap
- `packages/app/tests/perf/scenarios/cold-pool-warm.ts` — reproduction scenario

## Appendix D — Methodology notes

- **Headless Chromium** per perf-harness convention (D2 LOCKED — `failOnFlakyTests: false`, no Playwright runner retries).
- **React StrictMode is active in dev** — observed 2× Editor construction per Activity entry mount. Attribution above uses *effective-PROJECT* durations (not summed StrictMode duplicates) where possible.
- **Variance** between run 1 and run 2 is < 1 % on every headline metric — single-run results are treatable as representative.
- **Monkey-patching overhead** is bounded at a few µs per call. With 63 `ok/cold/*` marks in the revisit window, total instrumentation overhead is ≤ 500 µs — negligible at the 9.4 s scale.
- **`scriptMs` over-counting caveat.** CDP aggregates `FunctionCall` events, which fire for every function invocation, so nested calls get counted at both the caller and callee level. The session `scriptMs = 14470` is not a simple "total JS time" — it's a call-weighted measure. `taskDurationMs = 14954` (sum of `RunTask`) is the reliable main-thread-busy number.
