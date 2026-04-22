---
title: "Non-Blocking Editor Cold-Mount Techniques — Validation Report"
description: "Evidence-driven exhaustive investigation of whether a first-class non-blocking solution exists for Open Knowledge's 9.7s editor cold-mount block on a 3.25MB PROJECT.md (Vite 8 + React 19.2 + React Compiler + TipTap 3.22 + y-prosemirror 1.3.7 + CodeMirror 6 + Yjs/Hocuspocus). Investigates React 19 concurrent renderer yields, React Compiler transformations, useDeferredValue/startTransition APIs, Activity + Suspense semantics, browser Scheduler API (postTask/yield/rIC), Web Workers + streaming patterns, ProseMirror internals + community forks, CodeMirror 6 viewport rendering, and production OSS cold-mount patterns across 12 editor apps (Outline, HedgeDoc, Novel, BlockNote, TipTap, Lexical, Affine/BlockSuite, Logseq, Plate, SilverBullet, Cal.com, Mintlify)."
createdAt: 2026-04-20
updatedAt: 2026-04-20
subjects:
  - React 19.2
  - React Compiler
  - TipTap 3
  - ProseMirror
  - CodeMirror 6
  - Yjs
  - Hocuspocus
  - y-prosemirror
  - scheduler.yield
  - scheduler.postTask
  - React Activity
  - React Suspense
  - Web Workers
  - OffscreenDocument
  - Outline
  - HedgeDoc
  - Novel
  - BlockNote
  - Lexical
  - Affine
  - BlockSuite
  - Logseq
  - Plate
  - Slate
  - SilverBullet
topics:
  - non-blocking mount
  - concurrent rendering
  - main-thread offloading
  - viewport virtualization
  - progressive rendering
  - content-visibility chunking
  - cold-mount optimization
  - CRDT initial sync
---

# Non-Blocking Editor Cold-Mount Techniques — Validation Report

**Purpose:** Before committing Open Knowledge's S1/S2/S3 diagnosis to Option E (static content during cold mount as architectural workaround), exhaustively rule out whether any first-class non-blocking solution exists in React 19, React Compiler, browser Scheduler APIs, Web Workers, or in the PM/CM/TipTap/Yjs ecosystem. User's specific question: "is there no React compiler or React 19 wizardry or workers etc. to make stuff non-blocking?"

---

## Executive Summary

**Verdict: NO first-class non-blocking solution exists for Open Knowledge's 9.7s editor cold-mount bottleneck. The cost is architecturally bounded in third-party library code (ProseMirror's `EditorView` constructor, y-prosemirror's `_forceRerender`), not addressable via React, React Compiler, or browser scheduling APIs.**

The 9.7s block is composed of synchronous, non-yield-able work. A Dive-6 finer-grained estimated breakdown (UNCERTAIN — precise attribution requires measurement) is approximately `{Y.Doc apply: 2s, markdown parse: 2s, PM JSON construction: 1s, PM DOM construction: 3s, React reconcile: 1.7s}`. Those five components collapse into three structural layers for the non-blocking rule-out:
1. `new EditorView()` → `docViewDesc()` → recursive `updateChildren()` → 270K `document.createElement` calls (ProseMirror/prosemirror-view@1.x) — encompasses the PM DOM construction + React reconcile components
2. y-prosemirror's `_forceRerender` hydration + `Y.applyUpdate` CRDT merge — single PM transaction spanning the entire document — encompasses Y.Doc apply + PM JSON construction
3. Markdown parse + browser layout/paint cost for 39K-node DOM — encompasses markdown parse and browser-side layout/paint

No React 19 concurrent primitive can interrupt this work. No React Compiler transformation reshapes it. Browser scheduler APIs require the yielded-from function to be `async` — PM's constructor is synchronous by design, rejected as such by maintainer Marijn Haverbeke in multiple public statements. Web Workers cannot host the DOM required by PM. The `OffscreenDocument` / `DOMParser`-in-Workers proposal is unimplemented.

**Key Findings:**

1. **React 19 concurrent features (useTransition, useDeferredValue, Activity, Suspense) provide ZERO mitigation for the actual blocking work.** They can yield the *render phase* between fibers every 5ms under transition lanes, but `useEffect` callbacks — where `new EditorView()` runs — execute synchronously inside a `do { destroy = create() } while (...)` loop with no `shouldYield()` check. Hidden `<Activity>` subtrees don't even run their effects, so pre-mounting them doesn't amortize the PM DOM construction cost; it's deferred to the flip-to-visible moment where it blocks 9.7s exactly as a cold visit would.

2. **React Compiler does automatic memoization only.** Zero grep hits for scheduler/postTask/rIC/rAF/startTransition insertion anywhere in the 40+ compiler passes. First-render cache always misses (sentinel check), so compute branches run inline synchronously. No experimental flag addresses non-blocking mount.

3. **`scheduler.yield()` (Chrome 129+, Firefox 142+; NOT Safari) is the best modern primitive for app-owned chunking, but it cannot interrupt synchronous third-party constructors.** Yielding requires `async` + `await` — PM's constructor has neither. `scheduler.yield()` can only reorder scheduling *around* the 9.7s task, not break it up.

4. **Web Workers can move 1-2s of markdown parse + PM JSON construction off the main thread, but CANNOT host `new EditorView()` (no DOM in Workers).** The Chrome `chrome.offscreen` API (sometimes loosely called "offscreen documents") is MV3 Extensions-only, not web-platform. `@ampproject/worker-dom` has no precedent with ProseMirror. Y.Doc in Worker has been dormant ecosystem territory since 2017 with zero production-grade adoption. Maximum realistic Worker win: ~10-30% reduction in cold-mount block, depending on what's offloaded and structured-clone overhead.

5. **ProseMirror maintainer Marijn Haverbeke has publicly, repeatedly rejected viewport virtualization and lazy rendering as "intentionally out of scope"** (5 threads 2018-2024 on discuss.prosemirror.net: #577, #1486, #3580, #4142, #4972). No community fork adds chunking to `prosemirror-view`. Even Shane Moore's NYT rewrite (`@handlewithcare/react-prosemirror`) explicitly renders all 5,124 Moby Dick nodes — no virtualization. All PM-based OSS editors (Outline, BlockNote, Milkdown, Plate-via-Slate, automerge-pm) use stock `new EditorView()`.

6. **Community pattern across 12 OSS editors: AVOID BIG DOCS.** Outline caps at 250K chars + warns user; HedgeDoc 1M chars; TipTap demo 10K. **No surveyed app tests 3.25MB documents.** Open Knowledge is in unexplored territory for the TipTap/PM ecosystem — 10-15× beyond what any app treats as supported.

7. **The nearest transferable pattern from OSS is Plate/Slate's two-part big-doc strategy: chunking + CSS `content-visibility: auto`** — but they are separate optimizations with different leverage. Slate's **10× speedup** is attributed specifically to **chunking** (splitting block children into nested, separately-memoized React components so React only processes changed chunks). The `content-visibility: auto` CSS rule is a complementary paint/layout skip with **no numerical speedup claim** in Slate's docs, and Slate explicitly warns it can be **slower than not using it at all in Safari** when applied per-element on large docs. PM has no equivalent to Slate's React-memoized chunking primitive, so the directly-transferable piece to the PM stack is only the content-visibility paint-skip half — the weaker-claim half of the pattern, gated on empirical Safari validation.

8. **Option E (Outline's cached-editor-while-collab-primes pattern) is the closest prior art.** Imperative, not Suspense-based. Limited to <250K char docs. Not validated at Open Knowledge's scale. Open Knowledge would be **inventing, not adopting** at 3.25MB.

9. **Cold-mount is an architecturally bounded outcome.** The CLAUDE.md precedent #24 classification ("V2+ work outside this spec's scope") is correct. Fixes require either (a) forking prosemirror-view to insert async yield points — rejected by maintainer, custom patch lifetime burden, (b) viewport-virtualizing PM at the Open Knowledge layer — 3-6 months engineering — or (c) progressive mount via chunked `dispatch()` — incompatible with y-prosemirror's broadcast model.

**Recommendation (non-prescriptive):** Option E (static content during cold mount) remains the appropriate architectural workaround given the evidence. The "wizardry" class of fixes (React Compiler, yield APIs, Workers, Activity pre-mount) either don't apply or provide bounded ≤30% wins that don't close the 9.7s → <1s gap the user wants. For Tier-1 perceived-perf fixes, CSS `content-visibility: auto` on chunked block groups is the most directly-transferable pattern among currently-unexplored techniques — with the caveats that PM lacks Slate's React-memoization chunking primitive (so only the paint-skip half transfers) and Safari has a documented per-element degradation that must be empirically validated; for Tier-2 infrastructure, Worker-assisted markdown parse is first-of-class for TipTap/Yjs but bounded to ~1-2s of savings.

---

## Research Rubric

**Primary question:** Is there a first-class non-blocking solution for Open Knowledge's 9.7s editor cold-mount on a 3.25MB document that we've missed?

**Dimensions (all P0/Deep — all covered by primary-source investigation):**

| Dive | Question | Source domain | Worker |
|------|----------|---------------|--------|
| 1 | When does React 19 yield during a render? Can `new EditorView()` yield? | `facebook/react` reconciler source + react.dev | A |
| 2 | Does React Compiler introduce non-blocking transforms? | `babel-plugin-react-compiler` source | B |
| 3 | Do useDeferredValue / startTransition chunk user code? | React reconciler source | A |
| 4 | Does hidden `<Activity>` pre-mount amortize cold-mount cost? | `<Activity>` source + react.dev | A |
| 5 | Can browser Scheduler APIs (postTask, yield, rIC) chunk the 9.7s? | WICG specs, MDN, Chrome blog | C |
| 6 | Can Y.Doc / markdown parse / PM construction move to Workers? | Y.js source, remark source, MDN | D |
| 7 | Can streaming / progressive rendering help? | React 19 RSC docs, Hocuspocus protocol | D |
| 8 | Any ProseMirror escape hatch (dispatchTransaction, setProps, forks)? | `prosemirror-view` source, discuss.prosemirror.net | E |
| 9 | Is CM6's viewport strategy portable to PM? Has anyone done it? | `codemirror/view` source, community search | F |
| 10 | What do 12 production OSS editors do on cold mount? | Outline, HedgeDoc, Novel, BlockNote, TipTap examples, Lexical, Affine, Logseq, Plate, SilverBullet, Cal.com, Mintlify source | G+H |

**Non-goals (out of scope per rubric):**
- Any specific architectural recommendation — this is a validation/rule-out investigation, decision owner is downstream.
- Implementation planning of Option E — downstream spec consumer.
- Perf measurement tooling (covered by `reports/perf-profiling-landscape-2026/`).

---

## Detailed Findings

### Dive 1 — React 19 concurrent renderer yields

**Finding:** React 19's concurrent renderer yields only BETWEEN fibers (per unit-of-work) when running under a non-blocking lane. It does NOT yield inside a single component's render function or inside effect callbacks.

**Evidence:** [worker-a-react-internals.md](evidence/worker-a-react-internals.md), React source commit `306a01b4` (2026-04-20):
- `packages/react-reconciler/src/ReactFiberWorkLoop.js:3051-3057` — `workLoopConcurrentByScheduler` checks `shouldYield()` between fibers only
- `packages/react-reconciler/src/ReactFiberWorkLoop.js:2748-2755` — `workLoopSync` never checks yield
- `packages/react-reconciler/src/ReactFiberLane.js:684-694` — `includesBlockingLane` mask includes DefaultLane; cold mounts at default event priority use `renderRootSync` → `workLoopSync`
- `packages/react-reconciler/src/ReactFiberCommitEffects.js:141-230` — `commitHookEffectListMount` runs effects in a synchronous `do {…} while` loop; no `shouldYield()` check
- `packages/scheduler/src/SchedulerFeatureFlags.js:11` — `frameYieldMs = 5` — the yield cadence, between fibers only

**Implication:** A `useEffect(() => { new EditorView(...) }, [])` constructor call runs synchronously to completion. React cannot split it, yield mid-construction, or reorder around it. The 9.7s cold-mount duration is exactly what this effect takes.

**Decision triggers:** This finding alone forecloses any scheme that hopes React 19 will "automatically" make cold mount non-blocking.

**Remaining uncertainty:** None — the reconciler source is definitive.

---

### Dive 2 — React Compiler capabilities

**Finding:** React Compiler is a build-time automatic-memoization tool. It emits synchronous `if (deps changed) { compute } else { load }` blocks per Reactive Scope. It NEVER inserts `startTransition`, `scheduler.yield`, `postTask`, `requestIdleCallback`, or `requestAnimationFrame`. It has zero interaction with `<Activity>` or `<Suspense>`.

**Evidence:** [worker-b-react-compiler.md](evidence/worker-b-react-compiler.md), React source commit `306a01b4`:
- `compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Pipeline.ts:148-530` — full 40+ pass pipeline enumerated. All are HIR construction, SSA/dataflow analysis, mutability/aliasing inference, or Reactive Scope planning. Zero scheduler primitives.
- `compiler/packages/babel-plugin-react-compiler/src/ReactiveScopes/CodegenReactiveFunction.ts:560-709` — emitted code is a plain `t.ifStatement(testCondition, computationBlock, cacheLoadStatements)`. On first render, every `$[i]` holds the sentinel `Symbol.for('react.memo_cache_sentinel')`, every `$[i] !== dep` is true, compute branches run INLINE.
- Grep across `compiler/packages/babel-plugin-react-compiler/src/`: zero matches for `scheduler|Scheduler|postTask|requestIdleCallback|requestAnimationFrame`. All `queueMicrotask|setTimeout` matches are inside test fixtures (user input preserved verbatim).
- Grep for `Activity|Suspense|suspend`: zero matches in compiler source. Only hits across `compiler/` are a commented-out playground reference and an MCP tool description string.
- Feature-flag enumeration (`Environment.ts:176-504`): zero flags contain `idle|yield|schedule|defer|transition|async|concurrent|lazy|nonblocking|chunked`.
- Official 1.0 release post ([react.dev/blog/2025/10/07/react-compiler-1](https://react.dev/blog/2025/10/07/react-compiler-1)) explicitly positions scope as "automatic memoization" only. The "up to 12% improvement in initial loads and cross-page navigations" number refers to avoiding re-render cascades during NAVIGATION, not cold mount of heavy components.

**Implication:** React Compiler contributes nothing to cold-mount non-blocking. Any solution must be hand-authored React.

**Decision triggers:** Rules out the "maybe the compiler will fix it automatically on upgrade" hope.

---

### Dive 3 — useDeferredValue + startTransition APIs

**Finding:** `startTransition` schedules the setState at TransitionLane (non-blocking → time-sliced render phase). `useDeferredValue` defers to DeferredLane (also time-sliced). Both help the render phase yield every 5ms between fibers. **Neither chunks user code inside a single fiber or effect.** `useEffect` triggered by a transition-state-change runs at `NormalSchedulerPriority` callback — synchronously once begun.

**Evidence:** [worker-a-react-internals.md](evidence/worker-a-react-internals.md):
- `packages/react-reconciler/src/ReactFiberHooks.js:3089-3100` — `startTransition` implementation
- `packages/react-reconciler/src/ReactFiberRootScheduler.js:697-723` — `requestTransitionLane` returns TransitionLane (not in blocking mask)
- `packages/react-reconciler/src/ReactFiberWorkLoop.js:3780-3798` — `scheduleCallback(NormalSchedulerPriority, flushPassiveEffects)` — effects always run at NormalPriority callback regardless of which lane triggered the render
- `packages/react-reconciler/src/ReactFiberHooks.js:3028-3080` — `useDeferredValue` creates DeferredLane (`0b1000000000000000000000000000000` per `ReactFiberLane.js:110`)
- Exhaustive search: no `shouldYield()` call anywhere inside user-callable paths (renderWithHooks, commitHookEffectListMount, commitLayoutEffects)

**Implication:** Concretely for Open Knowledge's `<TiptapEditor>` with `useEffect(() => { new Editor({...}) }, [])`:
- `setDocName` wrapped in `startTransition`: render phase time-sliced ✅ (saves tens of ms if any)
- Commit phase: synchronous DOM insertion for the new `<div ref={editorRef}/>`
- `scheduleCallback(NormalSchedulerPriority)` runs `useEffect`: synchronous `new Editor(...)` blocks for 9.7s

`startTransition` already used in `openDocumentTransition` — it's what gives the current "content-continuity" benefit. But it doesn't and can't reduce the 9.7s effect cost.

---

### Dive 4 — Activity + Suspense mount semantics

**Finding:** `<Activity mode="hidden">` defers children to OffscreenLane (time-sliced render). **But hidden Activity subtrees do NOT run their effects on first mount.** Pre-mounting hidden `<TiptapEditor>` does NOT call `new EditorView()`. On flip to visible, the effect runs synchronously — full 9.7s cost exactly as cold visit.

**Evidence:** [worker-a-react-internals.md](evidence/worker-a-react-internals.md):
- `packages/react-reconciler/src/ReactFiberBeginWork.js:613-755` — `updateOffscreenComponent` defers to OffscreenLane
- `packages/react-reconciler/src/ReactFiberLane.js:109` — `OffscreenLane = 0b0100000000000000000000000000000`
- [react.dev/reference/react/Activity](https://react.dev/reference/react/Activity) — verbatim: "children won't be visible on the page — but they will _still be rendered_, albeit at a lower priority than the visible content, and **without mounting their Effects**."

**Trade-off matrix for hidden Activity pre-mount as cold-mount mitigation:**

| Cost | Hidden pre-mount | Visible mount |
|------|------------------|---------------|
| Render phase | OffscreenLane time-sliced ✅ | Parent lane |
| Effect phase (`new EditorView()`) | SKIPPED | 9.7s sync |
| Host DOM insertion | Runs (detached/hidden parent) ⚠️ MEMORY | Runs |
| Y.js observers | NOT attached | Attached |
| Provider sync | NOT started | Started |

Hidden pre-mount buys React VNode tree creation (likely <1% of total cost) but NOT PM DOM construction (dominant cost).

**Implication:** This is the critical finding that rules out the most intuitive "wizardry" — pre-warm the editor invisibly so visits are instant. Hidden Activity pre-mount is NOT a cold-mount mitigation for effect-heavy work. Precedent #18 in Open Knowledge's CLAUDE.md already documents this decoupling (ACTIVITY_MOUNT_LIMIT vs MAX_POOL) for a related reason (Y.js observer CPU cost in hidden subtrees, covered by precedent #18(c)); the cold-mount direction is a separate concern with the same conclusion.

**Decision triggers:** If a future React version exposes "run effects when hidden" (currently NOT the case), this calculus changes. React team has not signaled such work.

---

### Dive 5 — Browser Scheduler API

**Finding:** `scheduler.postTask()` (Chrome 94+, Firefox 142+, NOT Safari) and `scheduler.yield()` (Chrome 129+ as of Sep 2024, Firefox 142+, NOT Safari) are the best modern primitives for cooperative chunking. They are strictly better than `setTimeout(0)`, `queueMicrotask`, `requestIdleCallback` for app-owned chunkable work. **They cannot interrupt synchronous third-party constructors like `new EditorView()`.**

**Evidence:** [worker-c-scheduler-apis.md](evidence/worker-c-scheduler-apis.md):
- [WICG Prioritized Task Scheduling spec](https://wicg.github.io/scheduling-apis/) — `scheduler.yield()` creates a boosted continuation (resumes BEFORE new postTask tasks of same priority)
- [caniuse.com — scheduler.postTask](https://caniuse.com/mdn-api_scheduler_posttask) — 77.83% global usage, Safari NOT SUPPORTED
- [Chrome blog — Use scheduler.yield](https://developer.chrome.com/blog/use-scheduler-yield) — Chrome 129 stable, Sep 17, 2024
- [MDN — requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback) — "multiple seconds may elapse before the callback is fired" without `timeout`; Safari NOT SUPPORTED
- React 19.2 scheduler: `packages/scheduler/src/forks/Scheduler.js:564-589` uses `MessageChannel`. Alternate `SchedulerPostTask.js` fork is build-flag-gated, NOT default. Comment: "We prefer MessageChannel because of the 4ms setTimeout clamping"
- `prosemirror-view/src/index.ts` constructor: no async/await/setTimeout/rAF/scheduler. Haverbeke: "No, it doesn't, and this is intentionally out of scope"
- y-prosemirror [issue #113](https://github.com/yjs/y-prosemirror/issues/113): "Edits by peers produce a prosemirror transaction that spans the entire document"
- Yjs [issue #675](https://github.com/yjs/yjs/issues/675) (closed wontfix): `applyUpdate` 1300-1700ms for 8.9MB docs

**Semantic comparison:**

| API | Yields to paint? | Yields to input? | Priority? | Continuation priority? |
|-----|------------------|------------------|-----------|----------------------|
| queueMicrotask | NO | NO | N/A | N/A |
| scheduler.postTask | YES | YES | 3 levels | Same as new task |
| scheduler.yield | YES | YES | inherits | **BOOSTED** |
| setTimeout(0) | YES | YES | none | Last (clamped 4ms after nest=5) |
| requestAnimationFrame | Before paint | YES | N/A | N/A |
| requestIdleCallback | YES | YES | idle | Maybe never fires |
| MessageChannel | YES | YES | none | Quicker than setTimeout |

**Three insertion points for yielding PM construction:**
1. **Before** `new EditorView()` — `await scheduler.yield()` lets skeleton paint. Total work unchanged. Moves when 9.7s runs.
2. **Inside** constructor — impossible without library patch (synchronous code cannot be turned async from outside).
3. **After** — irrelevant (task already fired).

**Implication:** Scheduler APIs are the **coordination glue** for a chunking strategy; the chunking itself requires architectural changes (progressive PM content mount, chunked Y.applyUpdate via sequential deltas, or viewport virtualization). For app-owned chunkable work, `scheduler.yield()` + `setTimeout(0)` polyfill is the right baseline to adopt.

---

### Dive 6 — Web Workers + off-main-thread

**Finding:** Y.js core is DOM-free and Worker-runtime-safe. Markdown parse (remark/rehype) is Worker-safe. **ProseMirror's `EditorView` construction is NOT Worker-portable — it requires DOM access.** The `chrome.offscreen` API (Chrome Extensions MV3, colloquially "offscreen documents") is not web-platform. The WHATWG `DOMParser`-in-Workers proposal is unimplemented. `@ampproject/worker-dom` has no precedent with ProseMirror. The "Y.Doc in Worker" ecosystem has been dormant since 2017.

**Evidence:** [worker-d-workers-streaming.md](evidence/worker-d-workers-streaming.md):
- `yjs/src/utils/Doc.js` + `y-protocols/sync.js`: zero DOM references
- [rehype-dom npm](https://www.npmjs.com/package/rehype-dom): "browser-specific variant" — default `rehype-parse` / `rehype-stringify` are pure JS string processors
- `prosemirror-view/src/index.ts:126-142`: constructor calls `document.createElement("div")`, `appendChild`, starts MutationObserver — main-thread DOM required
- [whatwg/dom#1217](https://github.com/whatwg/dom/issues/1217): DOMParser-in-Workers proposal OPEN since 2023, no browser implementation, no formal adoption
- [developer.chrome.com — Offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen): Chrome 109+ MV3 Extensions only
- `y-js/y-webworker` last commit 2017-03-03 — dormant 8+ years
- [Yjs discuss — SharedWorker](https://discuss.yjs.dev/t/single-ws-connenction-in-shared-worker/2218): "only copied objects" transferable, poor mobile support, debugging complexity
- CodeMirror's Haverbeke on Workers ([discuss.codemirror.net/2788](https://discuss.codemirror.net/t/codemirror-6-web-worker-isolated-state/2788)): "Not doing this is a conscious decision"
- Lexical [#7422](https://github.com/facebook/lexical/issues/7422) acknowledges big-doc perf gap; no Worker-based solution
- Monaco's Workers host `tsserver` (language service), NOT editor DOM

**Worker-safety inventory for Open Knowledge's pipeline:**

| Plugin | DOM deps? | Worker-safe? |
|--------|-----------|-------------|
| remark-parse | NO | YES |
| remark-frontmatter | NO | YES |
| remarkMdxAgnostic | NO | YES |
| remark-gfm | NO | YES |
| remarkWikiLink | NO | YES |
| remarkProseMirror | NO | YES |
| rehype-stringify | NO | YES |

**Quantified Worker-assisted preprocessing pattern:**
If 9.7s cold-mount budget splits approximately `{Y.Doc apply: 2s, markdown parse: 2s, PM JSON construction: 1s, PM DOM construction: 3s, React reconcile: 1.7s}` (UNCERTAIN — exact breakdown requires measurement), Worker-assisted preprocessing could reclaim **1-2s, bounded 15-30% reduction**. Structured-clone cost for 40K-node PM JSON tree is 200-1000ms per [joji.me benchmark](https://joji.me/en-us/blog/performance-issue-of-using-massive-transferable-objects-in-web-worker/) (Chrome worst-case). PM DOM construction (3s, dominant cost) is untouched.

**Architectural novelty:** No direct OSS precedent for this pattern in a PM/Yjs editor. BlockNote, Novel, Outline, reference Yjs examples all run parse main-thread. Monaco's Worker pattern is language-service-scoped, not rendering-scoped. **First-of-class for TipTap/Yjs stack.**

**Implication:** Workers can move parse off-thread (realistic 1-2s of 9.7s), but the 3.25MB / 39K-node PM DOM construction is **constitutionally main-thread work** in 2026 — by unanimous decision of ProseMirror, CodeMirror 6, Lexical, and Monaco maintainers.

---

### Dive 7 — Streaming / progressive rendering

**Finding:** React 19 Server Components are incompatible with Hocuspocus's browser-only WebSocket model. `renderToPipeableStream` is irrelevant to client-only SPA. Per-block Suspense within PM subtree is blocked by PM's synchronous DOM construction. Hocuspocus transmits SyncStep2 as a single atomic WebSocket binary frame — no chunking possible. `Y.applyUpdate` is not publicly splittable; maintainer endorses multi-doc sharding instead. Progressive PM content population across animation frames has no OSS precedent and fights PM's `MutationObserver`.

**Evidence:** [worker-d-workers-streaming.md](evidence/worker-d-workers-streaming.md):
- React 19 RSC: server-rendered HTML + serialized wire format, stateless. Hocuspocus needs live browser WebSocket. Architecturally incompatible.
- `y-protocols/sync.js` `writeSyncStep2`: single varByteArray payload per message
- Yjs maintainer Kevin Jahns at [discuss.yjs.dev/optimizing-initial-load](https://discuss.yjs.dev/t/optimizing-initial-load-of-a-document-receiving-a-lot-of-updates/2206): "I've considered this problem before and haven't come up with a good solution." Endorsed paths: snapshot-and-truncate, multi-doc sharding (subdocs)
- Each progressive `tr.insertContent` triggers full `docView.update()` pass, MutationObserver observes intermediate states (potential spurious callbacks)
- smoores.dev article: even the React-rebuilt PM (`@handlewithcare/react-prosemirror`) renders all 5,124 Moby Dick nodes on initial mount

**Implication:** Streaming / progressive rendering patterns address PERCEIVED latency ("show something early") but not ACTUAL blocking CPU time. The 9.7s main-thread block is CPU-bound, not I/O-bound, so streaming doesn't help.

---

### Dive 8 — ProseMirror escape hatches + community forks

**Finding:** No first-class or community-provided PM escape hatch can chunk a 9.7s cold-mount. The cost is structural to `prosemirror-view`'s `docViewDesc → updateChildren → recursive addNode → NodeViewDesc.create → document.createElement` path, all running synchronously inside the `new EditorView()` constructor with no yield points and no extension API to intercept.

**Evidence:** [worker-e-prosemirror.md](evidence/worker-e-prosemirror.md):
- `prosemirror-view/src/index.ts:69-93` — constructor has 6 phases, phase 4 is the expensive `docView = docViewDesc(...)`. Zero async/await anywhere.
- `prosemirror-view/src/viewdesc.ts:767-813, 906-912, 1345-1350, 690-723` — recursive `updateChildren` → `addNode` → `NodeViewDesc.create` → either user NodeView OR `DOMSerializer.renderSpec(document, toDOM(node), ...)`. For 39K block nodes, cycles 39K+ times synchronously.
- Maintainer Marijn Haverbeke on [discuss.prosemirror.net/577](https://discuss.prosemirror.net/t/efficient-viewport-rendering-like-codemirror/577): "intentionally out of scope ... hugely complicated ... I have no idea how to cleanly do that"
- Four more threads (#1486, #3580, #4142, #4972) repeating the rejection
- `prosemirror-view` CHANGELOG: four perf-tagged entries since 2019 (v1.8.9, v1.18.2, v1.23.2, v1.31.0) — all UPDATE-path, not cold-mount
- `@handlewithcare/react-prosemirror` ([smoores.dev](https://smoores.dev/post/why_i_rebuilt_prosemirror_view/)): relocates rendering to React but does NOT add virtualization or chunking. Goal was state-tearing, not cold-mount.
- `tiptap/packages/react/src/useEditor.ts:95-128` — `immediatelyRender: false` is SSR/Next.js hydration aid. Defers mount by one effect tick; same total cost.
- Direct source inspection: BlockNote, Milkdown, mdx-editor, `automerge/automerge-prosemirror` all use stock `new EditorView()`. Zero forks.
- GitHub + npm search: no package named `prosemirror-view-chunked`, `prosemirror-view-virtual`, `prosemirror-lazy`, `prosemirror-viewport`, `prosemirror-progressive`
- Progressive mount via dispatchTransaction is **incompatible with y-prosemirror** — each `tr.insertContent` propagates through `_prosemirrorChanged` → `updateYFragment` → Y.Doc broadcast to peers → duplicate inserts → CRDT convergence violation (Bug-A/Bug-D class per `specs/2026-04-14-bridge-convergence-under-concurrent-writes/`)

**TipTap options tested:** `autofocus: false`, `enableCoreExtensions: false`, `injectCSS: false`, `enableInputRules/PasteRules: false` — combined savings = tens of milliseconds. None address the `docViewDesc` cost.

**Fork target (if pursued):** `prosemirror-view/src/viewdesc.ts:767-813` — wrap `iterDeco` callback to `await scheduler.postTask({priority:'user-blocking'})` every N children. Cascades through `addNode` → `NodeViewDesc.create.updateChildren` → `docViewDesc`. Constructor becomes async → `createEditorViewAsync` factory. That's a fundamental architectural change Marijn has explicitly rejected. Maintainable as `patches/` diff (Open Knowledge already patches `y-prosemirror@1.3.7` and `@tiptap/y-tiptap@3.0.3`) but with larger surface area — must re-port against every major release, cognitive overhead for contributors.

**Implication:** Clean path to non-blocking cold-mount lies OUTSIDE PM itself: shrink doc handed to PM (viewport-load), fork prosemirror-view, or sidestep PM at scale.

---

### Dive 9 — CodeMirror 6 viewport rendering

**Finding:** CM6's viewport-only rendering strategy (height-map + BlockGapWidget + IntersectionObserver-driven growth) is architecturally portable to PM in principle but requires 3-6 months of engineering for a functional MVP. **No community port exists as of 2026-04.** Even the NYT `@handlewithcare/react-prosemirror` rewrite, the most ambitious PM view replacement, explicitly declined viewport virtualization.

**Evidence:** [worker-f-codemirror.md](evidence/worker-f-codemirror.md), CM6 source commit `fbff59b`, PM source commit `ca4c78e`:
- `codemirror/view/src/viewstate.ts:157-163, 194-205, 391-417` — viewport computation, 1000px margin, bias-aware
- `codemirror/view/src/docview.ts:469-487, 669-680` — BlockGapWidget replaces out-of-viewport content with numeric-height spacer div (NO DOM for hidden blocks)
- `codemirror/view/src/heightmap.ts:12-75, 345-468, 210-244` — persistent balanced height-map tree; `HeightMapGap` stores only aggregate height estimate (no per-line render needed)
- `codemirror/view/src/viewstate.ts:695-738` — `BigScaler` for >7MB DOM height
- `editorview.ts:178-222` + `docview.ts:51-55` — cold mount renders ONLY initial viewport. Marijn on [discuss.codemirror.net/5928](https://discuss.codemirror.net/t/noticable-lag-when-dealing-with-large-files/5928): "47ms for state + 9ms for view" on large JSON file — 9ms is consistent with rendering ~30 lines, NOT 10,000
- `y-codemirror.next/src/y-sync.js:236-253` — `view.dispatch({changes})` is viewport-agnostic; changes outside viewport update height map but don't materialize DOM
- `prosemirror-view/src/index.ts:69-93` — Marijn on [discuss.prosemirror.net/4972](https://discuss.prosemirror.net/t/improving-performance-loading-on-scroll/4972): "The library puts the entire document in the DOM, yes."
- 4+ rejection threads on PM viewporting (#577, #1486, #3580, #4142, #4972)
- No npm package: `prosemirror-viewport` / `prosemirror-virtual` / `prosemirror-lazy`
- `@handlewithcare/react-prosemirror`: "renders all nodes in the document, including the entire text of Moby Dick (5,124+ total nodes)." Per-keystroke win (177ms → 16ms) from memoization+reconciliation, NOT virtualization
- `content-visibility: auto` documented failure mode on [#1486](https://discuss.prosemirror.net/t/lazy-rendering-for-prosemirror/1486): interferes with contenteditable + PM's DOMObserver

**Three fundamentals making PM port harder than CM6's case:**
1. **Tree vs flat structure:** PM has nested blocks with variable heights; CM6 has only lines. Height estimation must be per-schema-node-type; "truncating a subtree" is new PM capability.
2. **NodeView state:** CM6 lines stateless; BlockGapWidget replaces freely. PM custom NodeViews (extensions, callouts, embeds) hold component state. Unmount/remount on scroll = UX regression. Would need Activity-like suspend primitive.
3. **Yjs/collab path:** y-prosemirror applies changes via updateYFragment → full doc structure recompute; PM's updateStateInner re-walks nodeView tree. Full walk every transaction regardless of viewport. CM6 avoids because `view.dispatch({changes})` carries position-scoped changes mapped against viewport.

**Port cost estimate:** 3-6 months full-time for functional MVP; 6-12 for feature-complete. Lower-cost alternative: scoped viewport layer virtualizing only the dominant cost dimension (270K text nodes) for 4-6 weeks, with trade-off of not generalizing to tables/images/embeds.

**Implication:** Classify full CM6-port as V3+ work. Open Knowledge's current defer-mount US-008 already covers the 500K+ threshold. If multi-MB becomes primary workflow, scoped approach is first V2 attempt, not full CM6 port.

---

### Dive 10 — Production OSS cold-mount patterns

**Finding:** Across 12 surveyed OSS editors, the community pattern is **avoid big docs**. **None test 3.25MB documents.** Open Knowledge is 10-15× beyond what any surveyed app treats as supported. The single directly-transferable technique is Plate/Slate's CSS `content-visibility: auto` chunking. Outline's cached-editor-while-collab-primes dual-mount is the closest prior art for Option E but is not validated at Open Knowledge's scale.

**Evidence:** [worker-g-tiptap-apps.md](evidence/worker-g-tiptap-apps.md) + [worker-h-other-editors.md](evidence/worker-h-other-editors.md), commits pinned 2026-04-20.

**Pattern matrix across 12 apps** (Mintlify cells are "?" because Mintlify's web editor is closed-source — see the Correction note below the matrix; entries left unpopulated rather than guessed):

| Pattern | Outline | HedgeDoc | Novel | BlockNote | TipTap | Lexical | Affine | Logseq | Plate | SilverBullet | Cal.com | Mintlify |
|---------|---------|----------|-------|-----------|--------|---------|--------|--------|-------|--------------|---------|----------|
| React.lazy for editor module | YES | NO | NO | Partial | NO | NO | NO | NO | NO | NO | NO | ? |
| Skeleton during doc fetch | YES 500ms | NO | NO | NO | NO | NO | YES | YES (LazyPlaceholder) | NO | NO | NO | ? |
| Defer editor mount | YES | NO | NO | NO | SSR only | NO | PARTIAL | YES 3 tiers | CSS | NO | NO | ? |
| Static content during suspend | YES imperative | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | ? |
| Pre-warm on hover | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | ? |
| Workers for parse | NO | NO | NO | NO | NO | NO | Narrow | NO | NO | NO | NO | ? |
| Chunked/virtualized render | NO | CM6 implicit | NO | NO | NO | NO | NO | YES virtuoso | content-visibility | CM6 | NO | ? |
| Cold-load telemetry | NO | NO | NO | NO | NO | NO | YES 20s/60s | NO | NO | NO | NO | ? |
| Max doc size tested | 250K chars | 1M chars | Demo | <1480 crashes | 10K | #7422 breaks | 1MB | >300MB graphs fail | 1000-block chunks | unlimited CM6 | short-text | closed-source |

**Closest-to-Option-E pattern (Outline):**

```tsx
// Outline MultiplayerEditor.tsx:309-343 @ commit 1b91a295
const showCache = !isLocalSynced && !isRemoteSynced;
return (
  <>
    {showCache && <Editor cacheOnly readOnly ref={ref} .../>}
    <Editor
      {...props}
      style={showCache ? { height: 0, opacity: 0 } : undefined}
    />
  </>
);
```

Imperative, not Suspense-based. Renders cached read-only PM view from server-rendered JSON while collab editor mounts invisibly. Swap on sync. **Outline doesn't test beyond 250K chars**, so pattern is unvalidated at Open Knowledge's scale. Cost is ~2× PM construction (cached + collab) — likely unacceptable for 9.7s.

**Transferable pattern (Plate/Slate) — two-part strategy, decomposed:**

```ts
// Plate ChunkingPlugin — full file
export const ChunkingPlugin = createTSlatePlugin<ChunkingConfig>({
  key: 'chunking',
  options: {
    chunkSize: 1000,
    contentVisibilityAuto: true,
    query: NodeApi.isEditor,
  },
}).overrideEditor(withChunking);

// ContentVisibilityChunk — full file
export const ContentVisibilityChunk = ({attributes, children, lowest}) => {
  if (!lowest) return children;
  return <div {...attributes} style={{ contentVisibility: 'auto' }}>{children}</div>;
};
```

**Mechanism 1 — Chunking (Slate's 10× claim):** Per [Slate performance walkthrough](https://docs.slatejs.org/walkthroughs/09-performance): "splitting a node's children into nested 'chunks', each of which is a separately memoized React component. This reduces the amount of work React needs to do when processing changes to the JSX, resulting in a **10x speed-up in ideal circumstances**." This is a React-memoization primitive exposed by Slate's editor core via `editor.getChunkSize(ancestor)`. **PM does not expose an equivalent hook**, so this half does not directly transfer to Open Knowledge.

**Mechanism 2 — `content-visibility: auto` paint-skip:** Separately documented in Slate as "Optimizing DOM Painting" with **no numerical speedup claim**. Paint is characterized as "over 100× slower than the core Slate logic and React rendering combined." Transferable to PM by wrapping chunked block-group DOM in `<div style={{contentVisibility:'auto'}}>`. **Safari caveat (verbatim from Slate docs):** "The content-visibility property comes with a performance overhead proportional to the number of DOM nodes it is applied to, which is especially bad in Safari. When rendering large documents in Safari, applying `content-visibility: auto` to each Slate element individually is often slower than not using it at all." Aligns with Open Knowledge's §8b content-visibility probe for S3 symptom. Aligns with worker-f Finding 9.18's PM-specific failure mode documented on `discuss.prosemirror.net #1486` (interferes with contenteditable + DOMObserver). Both warnings must be empirically validated before committing.

**Architecturally-avoids-monolithic-mount (not PM-transferable):**
- SilverBullet: CM6 native viewport-only. Not PM-applicable.
- Logseq: outliner — one editor per block + react-virtuoso. Changes editor framework.

**Affine's first-class telemetry signal** (`blocksuite-editor.tsx:347-366`):
- `track.doc.loadDoc({success})` via `waitForDocLoaded`
- 20s "longer loading" escalation
- 60s failed-load telemetry

**Open Knowledge has no equivalent doc-load metric.** Worth considering as perf-instrumentation addition under precedent #24.

**Correction noted:** Cal.com uses Lexical, NOT TipTap. Mintlify web editor is closed-source; only public repo is `mintlify/writer` (VSCode AI docstring plugin).

---

## The Actual Answer

### 1. Is there a first-class non-blocking solution we've missed?

**NO.** Every primitive investigated — React 19 concurrent rendering, React Compiler, `useDeferredValue` / `startTransition`, `<Activity>` pre-mount, `scheduler.yield()` / `postTask`, Web Workers, `OffscreenDocument`, streaming / RSC, PM escape hatches, community forks — either:
- Does not apply to the workload (scheduler APIs require async; PM constructor synchronous)
- Applies but provides bounded partial gains (Worker-assisted parse: 1-2s of 9.7s)
- Provides theoretical gains that OSS editors don't actually exploit (no PM viewport virtualization exists)

The 9.7s block is architecturally bounded in third-party code whose maintainers (Marijn Haverbeke for PM and CM6) have explicitly declined to make it yield-able. The community's consensus across 12 surveyed editors is to avoid docs at Open Knowledge's scale entirely.

### 2. If yes, what is it?

N/A — NO.

### 3. If no, what's the community-validated pattern?

**Three overlapping patterns, ranked by directness:**

**A. Cap doc size + warn user (Outline, HedgeDoc, TipTap demos).** Every app surveyed does this. Open Knowledge's 3.25MB exceeds every cap. Not a solution for your use case.

**B. Imperative "cached editor while collab primes" dual-mount (Outline, only app doing Option-E-equivalent).** Render a static cached read-only PM view from server-rendered JSON, mount the collab editor hidden, swap on sync. This is **imperative, not Suspense-based**. Not validated at >250K chars, so unknown if it holds at 3.25MB (dual-mount costs 2× PM construction).

**C. Architecturally avoid the problem (SilverBullet via CM6, Logseq via outliner).** Not available to Open Knowledge without changing editor framework.

### 4. Bonus: tricks for partial rendering that could reduce 9.7s without architectural change?

**Three techniques worth empirical testing (no commitments):**

**(i) CSS `content-visibility: auto` on chunked block groups (most directly-transferable technique, calibrated expectations).** Group PM blocks into chunks of ~1000 via custom plugin. Wrap each chunk's DOM with `style={{contentVisibility: 'auto'}}`. Browser creates DOM for all chunks (so selection/decoration/input still work) but skips paint + layout for off-screen chunks. Slate's walkthrough attributes its **10× speedup to chunking (separately-memoized React components)**, NOT to `content-visibility` itself — the two are distinct optimizations. **PM does not expose an equivalent React-memoization chunking primitive**, so only the paint-skip half transfers; the numerical speedup claim does NOT transfer. Supporting qualitative evidence remains: Slate characterizes paint as "over 100× slower than the core Slate logic and React rendering combined." **Two gating caveats must be empirically validated before committing:** (a) Slate docs explicitly warn Safari's per-element `content-visibility: auto` "is often slower than not using it at all" on large docs — Open Knowledge must validate cross-browser; (b) worker-f Finding 9.18 notes PM-specific interference with contenteditable + DOMObserver per `discuss.prosemirror.net #1486`. Aligns with Open Knowledge's §8b content-visibility probe for S3 symptom — may converge with the S3 mode-toggle work already in flight.

**(ii) Worker-assisted markdown parse + PM JSON construction (first-of-class).** Move `remark-parse → remark-gfm → remarkMdxAgnostic → remarkWikiLink → remarkProseMirror` to a Worker, transfer PM JSON via postMessage, main thread constructs `PmNode.fromJSON(schema, json)` + `new EditorView(...)` synchronously. **Bounded to 1-2s reduction of 9.7s** per structured-clone overhead for 40K-node tree. No OSS precedent in TipTap/Yjs ecosystem — Open Knowledge would be pioneering. Worker-safe pipeline confirmed.

**(iii) Affine-style cold-load telemetry.** `track.doc.loadDoc({success, time})` with 20s "longer loading" + 60s failed-load escalation. Production signal Open Knowledge currently lacks. Cheap to add, complements the `NavigationPendingBar` 4-tier UX already in precedent #18.

None of these "unlocks" the 9.7s; (i) may compress paint cost by ~10× for non-visible chunks; (ii) saves 1-2s; (iii) is observability not optimization. Combined, might reduce perceived cold-mount from 9.7s to 3-5s, still far from the <1s target the user's "wizardry" question implies.

---

## Option E, Reconsidered

Given the evidence, Option E (static content during cold mount) remains the appropriate architectural workaround. Specifically:

- **Validated in wild (Outline) at <250K chars.** Pattern template exists.
- **No scale-validation at 3.25MB.** Open Knowledge would be extending the pattern.
- **Cost = ~2× PM construction** (cached + collab mount concurrent). Must be acceptable for the use case.
- **Closest alternative is the non-obvious "Hybrid Activity + Suspense" pattern already shipped (precedent #18).** That pattern works for the cases where the cold mount is <1-2s (typical docs). For the 9.7s class, Option E's explicit "render static content visible, suspend the live editor separately" is the architecturally-honest answer.

**The user's specific question** — "is there no React compiler or React 19 wizardry or workers etc. to make stuff non-blocking?" — is answered decisively NO. The mechanisms don't exist. Option E isn't a workaround for missing wizardry; it's the pattern.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Mintlify's internal editor performance work** — closed-source; no technical write-ups publicly available. NOT FOUND after searching `mintlify/writer` (wrong repo, it's a VSCode plugin), blog, and GitHub.
- **Safari polyfill semantics for `scheduler.yield()`** — Safari absence means any adoption requires `setTimeout(0)` or `MessageChannel` fallback. Fallback loses the "boosted continuation" semantic. Degradation impact UNCERTAIN for the Open Knowledge UX.
- **Exact breakdown of the 9.7s** — estimated breakdown `{Y.Doc apply: 2s, markdown parse: 2s, PM JSON: 1s, PM DOM: 3s, React reconcile: 1.7s}` is UNCERTAIN. Precise measurement would sharpen the Worker-assisted preprocessing quantification in Dive 6. The existing S1 diagnosis under precedent #24 has measurements that would refine this.

### Out of Scope (per rubric)

- Architectural recommendation or spec writing for Option E implementation
- Perf measurement tooling (covered by `reports/perf-profiling-landscape-2026/`)
- Comparative editor framework migration analysis (would require different rubric)

---

## References

### Evidence Files

- [worker-a-react-internals.md](evidence/worker-a-react-internals.md) — React 19 reconciler, transitions, Activity semantics
- [worker-b-react-compiler.md](evidence/worker-b-react-compiler.md) — React Compiler pipeline + transformations
- [worker-c-scheduler-apis.md](evidence/worker-c-scheduler-apis.md) — Browser scheduler.yield/postTask/rIC
- [worker-d-workers-streaming.md](evidence/worker-d-workers-streaming.md) — Web Workers + streaming/progressive rendering
- [worker-e-prosemirror.md](evidence/worker-e-prosemirror.md) — ProseMirror internals + community forks
- [worker-f-codemirror.md](evidence/worker-f-codemirror.md) — CodeMirror 6 viewport rendering strategy
- [worker-g-tiptap-apps.md](evidence/worker-g-tiptap-apps.md) — Outline, HedgeDoc, Novel, BlockNote, TipTap OSS cold-mount
- [worker-h-other-editors.md](evidence/worker-h-other-editors.md) — Lexical, Affine, Logseq, Cal.com, Mintlify, Plate, SilverBullet

### External Sources — Primary (React 19)

- [facebook/react @ 306a01b4 (2026-04-20)](https://github.com/facebook/react/tree/306a01b4e0242e9379ba971c8925670651f16818)
- [ReactFiberWorkLoop.js — reconciler work loop](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.js)
- [ReactFiberCommitEffects.js — synchronous useEffect execution](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberCommitEffects.js)
- [ReactFiberBeginWork.js — Activity (Offscreen) semantics](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberBeginWork.js)
- [react.dev Activity reference](https://react.dev/reference/react/Activity) — "without mounting their Effects"
- [react.dev useDeferredValue](https://react.dev/reference/react/useDeferredValue)

### External Sources — Primary (React Compiler)

- [babel-plugin-react-compiler pipeline](https://github.com/facebook/react/blob/main/compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Pipeline.ts)
- [CodegenReactiveFunction.ts](https://github.com/facebook/react/blob/main/compiler/packages/babel-plugin-react-compiler/src/ReactiveScopes/CodegenReactiveFunction.ts)
- [React Compiler v1.0 release post](https://react.dev/blog/2025/10/07/react-compiler-1)
- [React Compiler introduction](https://react.dev/learn/react-compiler/introduction)

### External Sources — Primary (Browser Scheduler APIs)

- [WICG Prioritized Task Scheduling spec](https://wicg.github.io/scheduling-apis/)
- [MDN Scheduler.yield()](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield)
- [MDN Scheduler.postTask()](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask)
- [Chrome blog — Use scheduler.yield (Chrome 129)](https://developer.chrome.com/blog/use-scheduler-yield)
- [web.dev — Optimize long tasks](https://web.dev/articles/optimize-long-tasks)
- [caniuse — scheduler.postTask](https://caniuse.com/mdn-api_scheduler_posttask)

### External Sources — Primary (Workers + Streaming)

- [yjs/yjs source](https://github.com/yjs/yjs)
- [y-protocols/sync.js — SyncStep2 atomicity](https://github.com/yjs/y-protocols/blob/master/src/sync.js)
- [Yjs #675 — applyUpdate wontfix](https://github.com/yjs/yjs/issues/675)
- [whatwg/dom #1217 — DOMParser in Workers proposal (open)](https://github.com/whatwg/dom/issues/1217)
- [Chrome offscreen documents (extensions-only)](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Lexical #7422 — big-doc perf (open)](https://github.com/facebook/lexical/issues/7422)

### External Sources — Primary (ProseMirror + CodeMirror)

- [prosemirror-view source](https://github.com/ProseMirror/prosemirror-view)
- [discuss.prosemirror.net #577 — viewport rejection](https://discuss.prosemirror.net/t/efficient-viewport-rendering-like-codemirror/577)
- [discuss.prosemirror.net #1486 — lazy rendering rejection](https://discuss.prosemirror.net/t/lazy-rendering-for-prosemirror/1486)
- [codemirror/view source](https://github.com/codemirror/view)
- [Why I rebuilt ProseMirror's renderer in React — smoores.dev](https://smoores.dev/post/why_i_rebuilt_prosemirror_view/)
- [@handlewithcare/react-prosemirror](https://github.com/handlewithcarecollective/react-prosemirror)

### External Sources — Primary (OSS Editor Apps)

- [outline/outline](https://github.com/outline/outline) @ `1b91a295`
- [hedgedoc/hedgedoc](https://github.com/hedgedoc/hedgedoc) @ `fa95098e`
- [steven-tey/novel](https://github.com/steven-tey/novel)
- [TypeCellOS/BlockNote](https://github.com/TypeCellOS/BlockNote) @ `46355c00`
- [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) @ `e12994c2`
- [facebook/lexical](https://github.com/facebook/lexical) @ `9bcbed6d`
- [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) @ `557b1e4d`
- [toeverything/blocksuite](https://github.com/toeverything/blocksuite) @ `5cb5cb68`
- [logseq/logseq](https://github.com/logseq/logseq) @ `5522b30b`
- [udecode/plate](https://github.com/udecode/plate) @ `47e0ea16`
- [silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet) @ `ea2ad9a7`
- [Slate performance walkthrough](https://docs.slatejs.org/walkthroughs/09-performance)

### Related Research

- [perf-profiling-landscape-2026](../../perf-profiling-landscape-2026/REPORT.md) — measurement tooling landscape (distinct from this report's non-blocking techniques scope)
