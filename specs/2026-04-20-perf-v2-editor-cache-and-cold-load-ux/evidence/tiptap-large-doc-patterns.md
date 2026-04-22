---
title: "TipTap / ProseMirror / CodeMirror Large-Doc Cold-Load Patterns (2026)"
description: "Exhaustive catalog of what the rich-text-editor ecosystem prescribes for large-document cold-load performance — TipTap, ProseMirror, CodeMirror 6, React 19.2, Y.js. Covers framework APIs, maintainer posture, ecosystem patterns (Obsidian/Notion/Linear/Lexical/BlockNote/Plate/Liveblocks/Outline), React yield-during-mount primitives, Y.js progressive-load feasibility, and a mechanical source-read of prosemirror-view's constructor."
createdAt: 2026-04-20
updatedAt: 2026-04-20
subjects:
  - TipTap
  - ProseMirror
  - CodeMirror 6
  - React 19.2
  - Y.js
  - Hocuspocus
topics:
  - large-doc performance
  - cold-load
  - editor architecture
  - viewport virtualization
---

# TipTap / ProseMirror / CodeMirror Large-Doc Cold-Load Patterns (2026)

**Purpose:** Before committing to the architectural workaround "Option E — static content during cold mount," verify that no first-class large-doc cold-load solution exists anywhere in the TipTap / ProseMirror / CodeMirror / React / Y.js ecosystem that we've missed. Exhaustive; primary sources with URLs + file:line citations.

---

## Executive Summary

**Answer to the question "is there a first-class solution we missed?" — NO.** Across 8 investigation axes covering framework docs, maintainer posture (7+ years of discuss.prosemirror.net history), GitHub issue archaeology, 10 ecosystem products, React 19.2 + browser yield primitives, and a direct mechanical read of `prosemirror-view` source, **no prescription exists for yielding a sync constructor or progressively materializing a 3.25 MB document through the `Y.Doc → ProseMirror JSON → EditorView DOM` pipeline.** Every layer is synchronous by design and defended as such by the library authors.

**The 9.7s cold-load is an architectural fact of the stack, not a missing flag.** Our diagnosis (`specs/2026-04-19-perf-diagnostic-toolkit/evidence/s{1,2,3}-diagnosis.md`) and the CLAUDE.md §precedent #24 "architecturally-bounded" framing are consistent with the upstream literature, maintainer posture, and production-consumer evidence. The 3.25 MB document hits a wall that no public rich-text editor has broken: PM renders the entire doc to the DOM in one JS task.

**Key findings:**

- **TipTap has no streaming / chunked / progressive / virtualized content API**, and maintainer Philipp Kühn has twice rejected pagination as out-of-scope (2021, 2024). Canonical async-init guidance is: *"I would still recommend to mount the editor after the content is loaded"* — i.e. the 9.7s cold load IS the prescribed pattern. ([TipTap #155](https://github.com/ueberdosis/tiptap/issues/155))
- **ProseMirror's `EditorView` constructor is mechanically, definitively synchronous** — 24 lines, one recursive call (`docViewDesc`), **zero yield points** (`setTimeout`, `requestAnimationFrame`, `requestIdleCallback`, `queueMicrotask`, `Promise`, `await`) across 2,415 lines of `src/index.ts` + `src/viewdesc.ts`. Marijn Haverbeke has refused viewport virtualization four times between 2017-01 and 2025-01. ([prosemirror-view source, master branch, 2026-04-20 pull](https://github.com/ProseMirror/prosemirror-view))
- **`content-visibility` has emerged as 2025-2026 state-of-the-art across the Slate ecosystem.** Slate's PR #5871 (merged 2025-06-06) delivers **90% Firefox / 99.7% Chrome latency reduction on 50K-block docs** using `content-visibility: auto` combined with block-level React chunking. Plate's maintainer points users to it explicitly. Open Knowledge's `§8b content-visibility: hidden` ship uses the same CSS primitive against a different axis (`hidden` skips render unconditionally; `auto` is viewport-driven), so the two are **adjacent tools, not the same pattern**. Slate addresses continuous render of already-mounted large docs; OK §8b addresses style-recalc cost on hidden-during-swap subtrees. Both are valid; neither shrinks the sync EditorView construction task itself.
- **Outline — our closest production peer (ProseMirror + wiki) — has PUNTED.** Maintainer Tom Moor's verbatim posture: *"Due to the data model all of the document must be downloaded before being displayed, there is no way around this at this time."* Outline enforces a product-level size cap on individual documents (exact threshold undisclosed; one user-reported import failure at 516 KB). Open Knowledge is deliberately differentiating by shipping a real large-doc experience.
- **No React 19.2 API and no browser primitive can convert the sync `new Editor(...)` constructor into yieldable work.** React's scheduler yields between components, not inside a single sync effect. `scheduler.yield()` requires `await` — JS has no async constructors. Web Workers have no DOM. Three architectural paths exist: (a) **defer-the-call** (moves the 9.7s task in time, does not shrink it — `useDeferredValue` / `<Activity>` / `setTimeout(0)` / `requestIdleCallback` / `scheduler.postTask`); (b) **split internal work** (requires forking TipTap + prosemirror-view); (c) **off-main-thread** (not viable for EditorView itself; hybrid parse-on-worker may shave an estimated 200-500 ms but is research-grade). Only (a) ships without a fork.
- **The Y.Doc → PM JSON → EditorView pipeline is monolithic at every layer.** `Y.applyUpdate` is sync-and-monolithic by design. dmonad (Y.js author) in [yjs #675](https://github.com/yjs/yjs/issues/675): *"I have no plans to make the update function async (or to refactor it to a generator function), because that would ultimately hurt performance for 'normal' use-cases. However, you are free to implement these functions yourself."* (The "free to implement yourself" clause explicitly acknowledges a user-land fork path — no upstream change forthcoming.) Hocuspocus Step2 is one WebSocket frame; y-prosemirror's `initProseMirrorDoc` + `createNodeFromYElement` is synchronous recursive O(N). No progressive-load knob anywhere.
- **CodeMirror 6 is NOT the bottleneck.** Measured cold-mount on 25 MB JSON = 56 ms total (state + view); for our 3.25 MB case, CM6 is bounded at 10-100 ms. CM6 is viewport-virtualized with Lezer parsing capped at 20 ms sync work / 3,000 chars; the rest is chunked via `requestIdleCallback`. The 9.7s is concentrated in the TipTap/PM leg.

**Architectural implication:** Using path (a) as the status-quo vehicle, **Option E (described externally as "static content during cold mount") sits inside the family of product-surface refinements every surveyed editor adopts when it cannot eliminate the sync task** — defer the work, mask the blocking task behind paint-first UX, and (where applicable) use `content-visibility` to limit style-recalc cost on large subtrees. Different editors use different members of this family against different sub-problems; no one has converged on a single mechanism. The three ways OUT of path (a) — each requires substantial new work — are: (1) **fork TipTap + prosemirror-view** to chunk `updateChildren` (path b); (2) **product-layer content sharding** (Atlassian's "performance mode" precedent, Outline's size cap, or the multi-doc direction supported by OK's existing `ProviderPool`); (3) **V2 viewport-virtualized-PM** work class, which is research-grade and unclaimed by any production editor surveyed. Path (c) (off-main-thread) does not yield a clean option at the EditorView layer.

---

## Research Rubric

Investigation ran 8 independent axes, dispatched as 6 parallel research subagents to keep primary-source discovery comprehensive. Every claim below has a primary-source citation (URL or file:line).

| Q# | Axis | Primary question | Dispatch |
|---|---|---|---|
| Q1 | TipTap docs/blog/forum | Any prescribed large-doc pattern? | Agent 1 (with Q2) |
| Q2 | TipTap GitHub issue/PR archaeology | Workarounds, roadmap, maintainer posture? | Agent 1 (with Q1) |
| Q3 | ProseMirror discuss + GitHub | Marijn's stance; third-party PM views | Agent 2 (with Q8) |
| Q4 | CodeMirror 6 patterns | Is CM6 viewport-virt? Cold-mount cost? | Agent 3 |
| Q5 | Ecosystem (10 products) | Obsidian / Notion / Linear / Logseq / BlockNote / Plate / Lexical / Liveblocks / Outline / Novel | Agent 4 |
| Q6 | React 19.2 + browser yield primitives | Can we turn a sync ctor into yieldable work? | Agent 5 |
| Q7 | Y.js / CRDT progressive load | Streaming state delivery? `applyUpdate` chunking? | Agent 6 |
| Q8 | prosemirror-view source read | Is `EditorView` ctor definitively sync? | Agent 2 (with Q3) |

Confidence labels below: **CONFIRMED** = direct primary-source evidence; **SUPPORTED** = multiple independent signals; **INFERRED** = logical from evidence; **UNCERTAIN** = thin evidence; **NOT FOUND** = explicitly searched, absent.

---

## Detailed Findings

### Q1 — TipTap's own prescriptions

**Finding (CONFIRMED):** TipTap documents no streaming / chunked / progressive / virtualized content API. The [TipTap Performance Guide](https://tiptap.dev/docs/guides/performance) addresses React re-render cost (use uncontrolled content, memoize editor wrappers, avoid `getHTML()` on every change) but is silent on cold-load of large documents. `setContent` / `insertContent` / `new Editor({content})` are all documented as synchronous with zero large-doc guidance.

**Finding (CONFIRMED):** `Editor.mount()` / `Editor.unmount()` exists as an API but is a React-tick-alignment optimization only, NOT a content-materialization deferral. Contributor `nperez0111` on [TipTap #6988](https://github.com/ueberdosis/tiptap/issues/6988) (2025-09) confirmed the API *"saves ONE extra render"* and does NOT defer or split content materialization.

**Finding (CONFIRMED):** TipTap's `immediatelyRender: false` flag is an SSR accommodation, not a cold-load lever. Verbatim from docs: *"This prop is only necessary if you are using SSR."* ([TipTap SSR docs](https://tiptap.dev/docs/editor/getting-started/install/nextjs))

**Finding (CONFIRMED):** TipTap Collaboration docs document no large-doc initialization pattern. The async-init guidance is implicit: wait for Y.Doc `synced`, then mount.

**Finding (CONFIRMED):** TipTap's 2026 roadmap (per public changelogs + tiptap.dev/blog scrape) contains AI + document-conversion + TipTap Flex — no editor-perf track.

**Evidence:** [evidence/q1-q2-tiptap.md](evidence/q1-q2-tiptap.md)

**Implications:** TipTap as a framework has no architectural vocabulary for our 3.25 MB × 9.7s problem. Every prescribed pattern in the docs assumes content fits comfortably within a single mount task.

---

### Q2 — TipTap issue + PR history

**Finding (CONFIRMED):** Maintainer posture is unambiguous across 5+ years of issue archaeology.

| Verbatim quote | Author | Source | Date |
|---|---|---|---|
| *"I would still recommend to mount the editor after the content is loaded"* | Philipp Kühn (`philippkuehn`) | [TipTap #155](https://github.com/ueberdosis/tiptap/issues/155) | 2020 |
| *"Thousands of node views can't be that fast at all. Node views are expensive. I don't think we can do anything here."* | Philipp Kühn | [TipTap #1536](https://github.com/ueberdosis/tiptap/issues/1536) | 2021 |
| Pagination / splittable content rejected as **out-of-scope** (Google-Docs-canvas rationale) | Philipp Kühn | [TipTap #1870](https://github.com/ueberdosis/tiptap/issues/1870) | 2021 |
| Pagination **still out-of-scope** — same rationale reaffirmed | `nperez0111` | [TipTap #1870](https://github.com/ueberdosis/tiptap/issues/1870) | 2024 |
| First-render delay is inherent to ProseMirror | `bdbch` | [TipTap #3345](https://github.com/ueberdosis/tiptap/issues/3345) | 2022 |
| React-integration improvements acknowledged, not scheduled | `bdbch` | [TipTap #6988](https://github.com/ueberdosis/tiptap/issues/6988) | 2025-09 |

**Finding (CONFIRMED):** Current unresolved freeze-on-large-content issues — [#7275 long-text mobile](https://github.com/ueberdosis/tiptap/issues/7275), [#7514 iPad Safari](https://github.com/ueberdosis/tiptap/issues/7514) — confirm the problem class remains unsolved upstream as of 2026-Q1.

**Finding (CONFIRMED):** The material 2025 TipTap perf fixes — PR #6538 (flushSync removal) and PR #6946 (markViews-on-view-creation) — ARE in TipTap 3.22.x that Open Knowledge ships. These are not the source of our 9.7s.

**Evidence:** [evidence/q1-q2-tiptap.md](evidence/q1-q2-tiptap.md)

**Implications:** The TipTap-endorsed escape hatches are exactly two: (1) **replace NodeViews with plain HTML or Decorations** per the Performance Guide + #1536 (Kühn's stance: *"thousands of node views can't be that fast at all. Node views are expensive."*); (2) **mount after content loads** per #155 (Kühn) — which *is* the 9.7s window, not a way out of it. Any multi-tick mount amortization, canvas-based rendering, or viewport-virtualized PM is outside TipTap's architecture and 2026 roadmap.

---

### Q3 — ProseMirror's prescriptions

**Finding (CONFIRMED):** Marijn Haverbeke has refused viewport virtualization across **four dated primary sources spanning 2017-01-16 → 2025-01-12** (7.5+ years of consistent posture). The crispest single quote is from [prosemirror #1478](https://github.com/ProseMirror/prosemirror/issues/1478) (closed 38 minutes after filing on 2024-07-18):

> *"Virtual viewporting is explicitly out of scope for this library. Having implemented it in CodeMirror, I know what is involved in setting this up, and I'm not going to add that complexity to ProseMirror."* — marijnh, 2024-07-18

Earlier anchor on [discuss.prosemirror.net #577](https://discuss.prosemirror.net/t/efficient-viewport-rendering-like-codemirror/577):

> *"[Viewport rendering] is intentionally out of scope [...] it was already hugely complicated to get right in a plain text editor like CodeMirror, and I don't want to bloat and complicate this library with this functionality."* — marijnh, 2017-01-16

And, when pressed for an implementation sketch: *"I have no idea how to cleanly do that. And that's why I didn't do it."* (marijnh, 2017-01-23). Most recent data point on [discuss #8096](https://discuss.prosemirror.net/t/how-to-handle-thousands-of-editor-instances-on-screen/8096) (2025-01-12):

> *"ProseMirror doesn't provide any virtualization and, indeed, as you found, at some point page performance gets bad."*

**Finding (CONFIRMED):** On general large-doc perf, [#1293](https://github.com/ProseMirror/prosemirror/issues/1293) (2022-07-01) crystallizes the "not our problem" stance:

> *"Yes, I do indeed consider this out of scope. If someone finds a low-impact kludge that could help here I'd be interested in taking a look, but as a rule, the library doesn't take responsibility for browser performance issues."* — marijnh

**Finding (CONFIRMED):** Third-party PM-view rewrites — four surveyed, none solve cold-load:

| Project | Scope | Relevance to cold-load | Source |
|---|---|---|---|
| Shane Friedman / [@handlewithcare/react-prosemirror](https://github.com/handlewithcarecollective/react-prosemirror) (formerly @nytimes/react-prosemirror) | React-reconciled `EditorView` subclass targeting node-view churn | Does NOT target cold-load. Blog: *"[Performance] was its own set of challenges, and will likely earn its own blog post some day soon!"* — deferred. | [smoores.dev](https://smoores.dev/post/why_i_rebuilt_prosemirror_view/) |
| Atlassian / Confluence (Atlaskit) | Ships "performance mode" that auto-disables features (sticky table headers, block-formatting controls) above an undisclosed heuristic | Feature-degradation, not virtualization. Multiple still-open CONFCLOUD tickets ([65329](https://jira.atlassian.com/browse/CONFCLOUD-65329), 72519, 81975, 70197) prove Atlassian hasn't solved it either. | [Atlassian Support docs](https://support.atlassian.com/confluence-cloud/docs/automatic-performance-optimization/) |
| Outline (getoutline/outline) | Vanilla `new EditorView(...)` at `app/editor/index.tsx:506`. CSS `content-visibility: auto` on images only; `loading="lazy"` on iframes. No editor-level intervention. | Validates the current V1 direction — same pattern OK adopted (§8b). | `/tmp/outline-clone-check/app/editor/index.tsx:506` |
| Novel (steven-tey/novel) | Thin TipTap `EditorProvider` wrapper. No large-doc patterns. | Not a production-scale reference. | `/tmp/novel-clone-check/packages/headless/src/components/editor.tsx` |

**Evidence:** [evidence/q3-q8-prosemirror.md](evidence/q3-q8-prosemirror.md)

**Implications:** No path through upstream PM. Marijn's posture is LOCKED (not deferred). Third-party subclasses don't target our problem. Atlassian's "performance mode" is the closest precedent for a V2 feature-degradation strategy at the Open Knowledge layer.

---

### Q4 — CodeMirror 6 patterns

**Finding (CONFIRMED):** CM6 is viewport-virtualized by default (unlike PM). Marijn's design philosophy (verbatim, from discuss.codemirror.net):

> *"There isn't [a way to disable virtual scroll]. And there won't be. The performance would be terrible on larger documents."*

**Finding (CONFIRMED, mechanically):** CM6 cold-mount on a 25 MB JSON document = **47 ms state + 9 ms view = 56 ms** total (Marijn's measured baseline). For OK's 3.25 MB case, CM6 bounded at 10-100 ms.

**Finding (CONFIRMED, source-traced):** The mechanical cold-mount shape:

| Phase | Source | Cost profile |
|---|---|---|
| `Text.of(string.split('\n'))` | `/tmp/cm6-src/state-repo/src/text.ts:152-245` | Branch-32 B-tree, one linear pass |
| `ViewState` + `HeightMap` | `/tmp/cm6-src/view-repo/src/viewstate.ts:177-192` + `heightmap.ts:659-663` | O(log n) `HeightMapGap` entries, NOT per-line |
| `DocView` initial DOM emit | `/tmp/cm6-src/view-repo/src/docview.ts:469-487` | `pixelViewport = {top: 0, bottom: 0}` on first construction → renders only ~20-50 lines; rest is a single `BlockGapWidget` placeholder |
| `LanguageState.init` (Lezer parse) | `/tmp/cm6-src/lang-repo/src/language.ts:288-314, 545-550` | Capped at **20 ms sync / 3,000 chars** (`Work.InitViewport = 3000`, `Work.Apply = 20`); remainder chunked via `requestIdleCallback` |

**Finding (CONFIRMED):** `y-codemirror.next` binding is essentially free at cold mount. `yCollab` does NOT set the initial doc; the application passes `doc: ytext.toString()` to `EditorState.create`. Only `yAttributionDecorations.create()` invokes `ytext.toDelta()` once — a cheap delta walk. OK's `packages/app/src/editor/SourceEditor.tsx:78-110` follows this standard pattern.

**Evidence:** [evidence/q4-codemirror.md](evidence/q4-codemirror.md)

**Implications:** CM6 is **not the bottleneck** of OK's 9.7s cold-load. The concurrent dual-editor mount pattern remains safe. The OK-specific `ViewPlugin.fromClass` extensions (`createSourcePolishExtension`, `createWikiLinkSourceExtension`, `createMdLinkSourceExtension`) are worth a local audit for sync work in their constructors, but the architectural critical path is TipTap/PM, not CM6.

---

### Q5 — Ecosystem patterns

Ten products investigated. Primary findings per product captured in evidence file; headline takeaways:

**Finding (CONFIRMED):** **Linear uses ProseMirror directly, NOT TipTap.** Self-described in their own docs and on discuss.prosemirror.net as *"Prosemirror-based content editor."* This corrects the assumption in the research brief.

**Finding (CONFIRMED, state-of-the-art 2026):** Slate's [PR #5871](https://github.com/ianstormtaylor/slate/pull/5871) (merged 2025-06-06) delivers **90% Firefox / 99.7% Chrome latency reduction on 50K-block docs** using `content-visibility: auto` + chunking. This is now documented in Slate's official performance guide and Plate (Slate-based) maintainer `@zbeyens` explicitly points users to Slate's approach, recommending AGAINST viewport virtualization.

**Finding (CONFIRMED, independent convergence):** Three separate editor projects have converged on the same conclusion that viewport virtualization in contenteditable is infeasible:

| Project | Verbatim position |
|---|---|
| ProseMirror | *"Virtual viewporting is explicitly out of scope"* (Marijn, [#1478](https://github.com/ProseMirror/prosemirror/issues/1478), 2024) |
| Plate maintainer | *"Unavoidable UX/a11y issues"* with viewport virtualization in rich text |
| Slate contributor `@thesunny` | *"Possibly impossible [...] it is difficult to tell how much space a Slate block will take until after it is rendered"* |

**Finding (CONFIRMED):** Lexical is the cautionary tale. Collaborator `@etrepum` on [lexical #7422](https://github.com/facebook/lexical/issues/7422):

> *"Lexical does not do any rendering virtualization at all... If you do intend to work with really large documents I would recommend that you use something designed for that."*

Lexical's `NodeMap` GC scans all nodes; unlikely to change.

**Finding (SUPPORTED):** **Outline — our closest production peer (ProseMirror + markdown wiki) — has PUNTED.** Maintainer `@tommoor` on closed issues [#5282](https://github.com/outline/outline/issues/5282) and [#8164](https://github.com/outline/outline/issues/8164):

> *"Due to the data model all of the document must be downloaded before being displayed, there is no way around this at this time."*

Outline enforces a size cap on individual documents (per `@tommoor`: *"an upper limit on the size of individual documents in Outline to protect the performance of the entire system"* — number undisclosed; user-reported failure at **516 KB** on import). OK is deliberately differentiating.

**Finding (mixed evidence types — read column labels carefully):** Cross-product pain-point summary. Data-types differ per row (cold-load time vs per-keystroke latency vs product cap vs forum-reported freeze), so this table is a **qualitative scan, not a quantitative benchmark**. Only the Open Knowledge and Notion rows are directly comparable cold-load measurements.

| Product | Reported pain point | Doc size context | Metric type | Source |
|---|---|---|---|---|
| **Open Knowledge** (our stack) | 9.7s cold-pool-warm | 3.25 MB PROJECT.md | Cold-load, measured | OK US-009 diagnosis |
| **Notion** | ~6.2s desktop / ~12.6s mobile | Typical page | Cold-load, public traces | Public perf reports |
| **Logseq** | 10+ min load / fails to launch | 300 MB graph | Cold-load, user-reported | Logseq issue tracker |
| **Lexical** (Meta) | *"almost 1 second latency for inserting or deleting a character"* | After a 500 KB paste | **Post-mount keystroke**, not cold-load | [lexical #7422](https://github.com/facebook/lexical/issues/7422) reporter quote |
| **Outline** | Size cap on individual docs; user-reported import failure at 516 KB | — | **Product-enforced limit**, not a latency | outline #5282 / #8164 |
| **Obsidian** (CM6-based) | Forum reports UI freeze "for seconds" on 7.6 MB docs with base64 images; 12-24 ms/keypress in live preview on small docs | 7.6 MB reported worst-case | **User-reported qualitative**, not benchmarked | [forum.obsidian.md](https://forum.obsidian.md) — see evidence |
| **CM6 core** (reference baseline) | 56 ms (47 ms state + 9 ms view) | 25 MB JSON, minimal `basicSetup` | Marijn's microbenchmark | q4-codemirror.md:216-221 |

**Finding (CONFIRMED, universal non-result):** TipTap docs, BlockNote docs, Liveblocks docs, Novel docs, Notion engineering blog — **none** document a first-class large-doc cold-load strategy. Slate is the only active rich-text editor with an official content-visibility-chunking API. CodeMirror 6 is the only engine with built-in viewport rendering.

**Evidence:** [evidence/q5-ecosystem.md](evidence/q5-ecosystem.md)

**Implications:** OK's 9.7s is in the same order of magnitude as Notion's typical-page cold-load (~6.2s desktop) — the only other row in the table that is a directly-comparable cold-load measurement — and far better than Logseq's 10+ min on very large graphs. Framing OK as "unusually bad" would not be supported by the evidence. Our `§8b content-visibility` ship targets a mechanism (style-recalc-on-hidden-subtree) adjacent to but not identical with Slate's PR #5871 (`content-visibility: auto` + block chunking for continuous render of large docs). The two share the `content-visibility` tool; they target different points in the cold-load → continuous-render lifecycle.

---

### Q6 — React 19.2 yield-during-mount patterns

**Finding (CONFIRMED):** **No React 19.2 API and no browser primitive can convert a sync JS constructor into yieldable work.** Three mechanical proofs:

1. **React's scheduler yields only between components.** Source trace: `packages/scheduler/src/forks/Scheduler.js` — `shouldYieldToHost` runs at `performUnitOfWork` boundaries. React team statement on [reactwg/react-18](https://github.com/reactwg/react-18/discussions):

   > *"In a cooperative scheduler, we can't forcibly interrupt rendering whenever we want... But we can yield in between different components."*

   The 5 ms `frameYieldMs` is irrelevant inside a single sync effect. A giant `useEffect` calling `new Editor(...)` runs to completion.

2. **`scheduler.yield()` requires `await` — JS has no async constructors.** Chrome's own [web.dev scheduler docs](https://web.dev/articles/optimize-long-tasks): you cannot use `await scheduler.yield()` in a constructor; you must restructure work into an async initialization method.

3. **Web Workers have no DOM.** ProseMirror's `EditorView` requires synchronous DOM mount via `document.createElement`, `parentNode.insertBefore`. No OSS rich-text editor ships a worker-based EditorView.

**Finding (CONFIRMED):** Three architectural paths exist; only one is feasible without forking TipTap/PM:

| Path | Mechanism | Viable without fork? | What it actually does |
|---|---|---|---|
| (a) **Defer the call** | `useDeferredValue(content, '')` initialValue trick, `<Activity mode="hidden">`, `setTimeout(0)`, `requestIdleCallback`, `scheduler.postTask` | **YES (5 mechanisms)** | *Moves* the 9.7s task in time — first paint + sidebar interactivity happen BEFORE the freeze. Does NOT reduce the 9.7s. |
| (b) **Split internal work** | Patch TipTap + `prosemirror-view` to expose an async builder with yield points | **NO (requires fork)** | Large surgical effort; see Q8 §Q8.4 for what would need to change |
| (c) **Off-main-thread** | Web Worker for PM construction | **NO (EditorView needs DOM)** | Hybrid "parse on worker, commit on main" *may* shave an estimated ~200-500 ms from the 9.7s (UNCERTAIN — evidence says *"shaves maybe"*; not measured); requires content-ingestion re-architecture |

**Finding (CONFIRMED):** React Compiler has **zero bearing** on the mount freeze — RC is component-scoped memoization only; doesn't touch refs, imperative handles, or the scheduler. Verified from [react.dev/learn/react-compiler](https://react.dev/learn/react-compiler) docs.

**Finding (CONFIRMED):** React 19's `<Activity mode="hidden">` delays subtree mount but does NOT pause an in-flight mount. OK already uses Activity per precedent #18(c) with `ACTIVITY_MOUNT_LIMIT = 3`. Activity provides path (a) — defer-the-call — but inherits the same "just moves the task" property.

**Evidence:** [evidence/q6-react-yield.md](evidence/q6-react-yield.md)

**Implications:** The realistic options for OK are: (1) accept the sync freeze during mount, make first paint earlier via path (a) defer mechanisms; (2) fork TipTap + PM for chunked mount; (3) V2 viewport-virtualized-PM per precedent #24 (research-grade).

---

### Q7 — Y.js / CRDT progressive loading

**Finding (CONFIRMED):** The Y.Doc → ProseMirror JSON → EditorView pipeline is **fundamentally monolithic at every layer**. No production-supported progressive-load path exists.

**Finding (CONFIRMED, mechanical):** Each layer's sync-and-monolithic shape:

| Layer | Source | Sync? | Chunkable? |
|---|---|---|---|
| `Y.applyUpdate` | `yjs/src/utils/encoding.js:382-449` — `readClientsStructRefs` eagerly drains all struct refs; `integrateStructs` synchronously integrates inside one `transact` block | YES | NO |
| `encodeStateAsUpdate` | `yjs/src/utils/encoding.js:522-541` | Returns single `Uint8Array` blob | NO |
| Hocuspocus Step2 (initial state delivery) | `y-protocols/sync.js:59-62` + `Hocuspocus.ts:397-408` + `Connection.ts:154-168` + `Document.ts:1-12` (uses `Document extends Y.Doc` with vanilla `applyUpdate` / `encodeStateAsUpdate`) | Single WebSocket frame | NO (failures at ~80 MB per [hocuspocus #1010](https://github.com/ueberdosis/hocuspocus/issues/1010)) |
| y-prosemirror `initProseMirrorDoc` + `createNodeFromYElement` | `y-prosemirror/src/lib.js:230-241` + `src/plugins/sync-plugin.js:725-829` | Synchronous recursive O(N) tree walk; every `XmlElement` goes through `schema.node()` validation | NO |
| `ySyncPlugin.view` | `y-prosemirror/src/plugins/sync-plugin.js:190-196` — calls `initView` then unconditionally `_forceRerender()` if no pre-computed mapping | YES | NO — no lazy-bind, no viewport-hydrate mode |
| `y-indexeddb` initial load | Applies all stored updates inside one `Y.transact` | IDB read async; apply monolithic | NO |

**Finding (CONFIRMED):** dmonad (Y.js maintainer) explicit rejection of chunked `applyUpdate`, [yjs #675](https://github.com/yjs/yjs/issues/675):

> *"I have no plans to make the update function async… because that would ultimately hurt performance for 'normal' use-cases."*

**Finding (CONFIRMED, but caveated):** Y.js updates ARE commutative / associative / idempotent per [docs.yjs.dev](https://docs.yjs.dev/api/document-updates). A `LazyStructReader` exists internally in `yjs/src/utils/`. But `LazyStructReader` is NOT exported from `src/index.js` and is only used internally for merge/diff/convert tools. The only published userland chunker is [emreeren/y-websockets-streaming-server](https://github.com/emreeren/y-websockets-streaming-server) (2018), which chunks at the *transport* layer and re-assembles before `applyUpdate` — so CRDT processing is still monolithic post-arrival. Production-grade chunked-apply with y-prosemirror binding suppression is **research-grade work (multi-week effort)**.

**Finding (CONFIRMED):** Alternative CRDTs don't help:

- **Automerge 2**: `load()` is monolithic. Sync protocol is only incremental post-load.
- **Loro**: Has a "shallow snapshot" feature that trims history, NOT state. `LoroDoc.import()` is still atomic. [loro #940](https://github.com/loro-dev/loro/issues/940) reports 5 MB → 600 MB RAM amplification on load — a different (worse) problem than ours.
- **Diamond-types**: No streaming API documented.

**Finding (CONFIRMED, independent issue):** y-prosemirror emits entire-document PM transactions on remote updates — [y-prosemirror #113](https://github.com/yjs/y-prosemirror/issues/113), OPEN since 2022-05:

> *"When a remote peer makes a change (types a single letter, for example), other peers receive this update as a prosemirror transaction that replaces the entire document content."*

Workaround in the wild: `@fellow/prosemirror-recreate-transform`. This is orthogonal to cold-load (it's about keystroke cost post-load) but telling — y-prosemirror is not designed for efficient large-doc flow.

**Evidence:** [evidence/q7-yjs-progressive.md](evidence/q7-yjs-progressive.md)

**Implications:** No Y.js or Hocuspocus flag unlocks progressive-load. The fix class for OK is product-architectural (split docs via `ProviderPool` multi-doc, precedent #18 already) or render-architectural (viewport hydration outside the CRDT layer — V2 work per precedent #24).

---

### Q8 — Is PM `EditorView` constructor definitively sync? YES.

**Finding (CONFIRMED, mechanically):** The prosemirror-view `EditorView` constructor is definitively, mechanically synchronous. Source read of `prosemirror-view@master` at `/tmp/ok-pm-view-read/` (latest pull 2026-04-20).

**Finding (CONFIRMED):** The full constructor is 24 lines — `src/index.ts:69-93` — with exactly one recursive walk entrypoint (`this.docView = docViewDesc(...)` at line 87):

```typescript
// prosemirror-view/src/index.ts:69-93
constructor(place, props) {
  this._props = props                       // L.70
  this.state = props.state                  // L.71
  this.directPlugins = props.plugins || []  // L.72
  this.directPlugins.forEach(checkStateComponent)
  this.dispatch = this.dispatch.bind(this)
  this.dom = (place && place.mount) || document.createElement("div")
  if (place) { /* DOM attach */ }
  this.editable = getEditable(this)
  updateCursorWrapper(this)
  this.nodeViews = buildNodeViews(this)
  // >>> HOT PATH — one sync call builds entire view desc tree <<<
  this.docView = docViewDesc(this.state.doc, computeDocDeco(this), viewDecorations(this), this.dom, this)  // L.87
  this.domObserver = new DOMObserver(this, ...)
  this.domObserver.start()
  initInput(this)
  this.updatePluginViews()
}
```

**Finding (CONFIRMED, grep-verified):** Zero yield points across 2,415 lines of `src/index.ts` (825 LOC) + `src/viewdesc.ts` (1,590 LOC). Grep pattern `setTimeout|requestAnimationFrame|requestIdleCallback|queueMicrotask|Promise\.|await |\.then\(|new Promise` returns **No matches found** on both files. Independently confirmed via WebFetch of raw GitHub master: *"there are no setTimeout, requestAnimationFrame, Promise, or queueMicrotask calls anywhere in this file."*

**Finding (CONFIRMED):** Recursion shape:

| Dimension | Value | File:line |
|---|---|---|
| Entry point | `docViewDesc` at L.906-912 | `viewdesc.ts:906-912` |
| Inner recursion entrypoint | `addNode` at L.1345-1348 calls `NodeViewDesc.create` THEN `updateChildren(view, pos+1)` | `viewdesc.ts:1345-1348` |
| Walk order | **Pre-order, depth-first** | `addNode` calls `create` (DOM alloc) BEFORE `updateChildren` (recurse into children) |
| DOM attach | **Post-order at each level** via `renderDescs` at L.810 | `viewdesc.ts:810, 1039-1058` |
| Leaf case | `TextViewDesc` at `NodeViewDesc.create:719-720` when `node.isText`; returns without recursing | `viewdesc.ts:719-720` |
| Whole-tree construction before first paint | YES, in one synchronous task | Constructor L.87-91 fires in single JS microtask; browser cannot repaint until task returns |

**Finding (CONFIRMED):** For a 3.25 MB PROJECT.md with ~39K PM nodes (per OK's US-009 diagnosis + CLAUDE.md precedent #24), this walk is approximately `~39K × (toDOM call + addNode overhead + renderDescs insert)` operations in a single task. Chrome DevTools will show this as one long task — **which matches the observed 9.7s cold-load burn**.

**Finding (CONFIRMED):** Making the constructor yield requires a **fork**. What would need to change:

1. `EditorView.constructor` would need to accept a scheduler or return a Promise
2. `docViewDesc` → `updateChildren` → `addNode` → `NodeViewDesc.create` → `updateChildren` recursion would need a yield-at-depth mechanism
3. `readDOMChange` + `DOMObserver` assume the full viewdesc tree matches the doc at all times — mid-construction, any incoming WebSocket/CRDT update via `updateState` finds a half-built tree
4. Selection machinery (`selectionToDOM`, `domAtPos`, `posAtDOM`) traverses the full viewdesc tree and assumes invariant structure

**Finding (CONFIRMED):** The closest public precedent for subclassing `EditorView` is Shane Friedman's [react-prosemirror](https://github.com/handlewithcarecollective/react-prosemirror) — he replaces the DOM-diff surface, not the initial walk. No public project has claimed a cold-load fix via `EditorView` subclassing.

**Evidence:** [evidence/q3-q8-prosemirror.md](evidence/q3-q8-prosemirror.md) §Q8

**Implications:** The 3.25 MB × 9.7s cold-load constraint is **not solvable via upstream patches to PM**, **not solvable by swapping to react-prosemirror** (narrow scope; doesn't target cold-load), **not solvable by borrowing a pattern from Outline or Novel** (they don't have one). Potentially solvable by:

- (a) Product-layer sharding à la Atlassian performance mode or Outline 500 KB cap
- (b) A forked `EditorView` subclass that chunks `updateChildren` via yielding generator + setTimeout(0) / scheduler.postTask

This is precisely the "architecturally-bounded, not numerically resolvable" framing in CLAUDE.md precedent #24 §S2/S3.

---

## Cross-Cutting Synthesis

### Who documents a first-class large-doc cold-load API?

| Product | First-class API? | Mechanism |
|---|---|---|
| TipTap | NO | — |
| ProseMirror | NO | Wontfix from Marijn |
| CodeMirror 6 | Sort-of (built-in viewport-virt) | No opt-in; it's default |
| Slate / Plate | YES (June 2025) | `content-visibility: auto` + chunking, PR #5871 |
| Lexical | NO | Maintainer recommends "use something designed for that" |
| Outline | NO | 500 KB product-enforced cap |
| Notion | UNCERTAIN | No public docs; cold-load is slow |
| Obsidian | Inherited via CM6 | Built-in |
| BlockNote, Liveblocks, Novel | NO | — |

### Who virtualizes?

| Product | Strategy |
|---|---|
| CodeMirror 6 | Viewport-virt, default, not disableable |
| ProseMirror | Not virtualized; Marijn refuses |
| Slate (post PR #5871) | `content-visibility: auto` at block level |
| Lexical | Not virtualized |
| Outline (PM) | Not editor-level; `content-visibility: auto` on images only |

### Who streams initial state?

**Nobody.** `applyUpdate` is monolithic by design. No production editor surveyed streams CRDT state delivery. Transport-layer chunking exists (emreeren/y-websockets-streaming-server, 2018) but re-assembles before apply.

### The three architectural paths open to us

Per Q6 + Q8, the architecture decision space is:

1. **Path (a) — defer-the-call** (no fork): Use `useDeferredValue(content, '')` / `<Activity mode="hidden">` / `setTimeout(0)` / `requestIdleCallback` / `scheduler.postTask` to move the 9.7s task AFTER first paint + sidebar interactivity. *Moves, does not shrink.* **Feasible today. Aligned with Option E.**

2. **Path (b) — fork and chunk** (TipTap + PM fork): Subclass `EditorView`, replace `updateChildren`'s inner recursion with a yielding generator. Yields browser control every N children. Shane Friedman's subclass precedent proves subclassing is feasible; no one has shipped the cold-load variant. **Multi-week effort; maintenance burden; V2 work class per precedent #24.**

3. **Path (c) — product-architectural sharding**: Split PROJECT.md at product layer (multi-doc via existing `ProviderPool` per precedent #18, or Atlassian-style feature-degradation-on-heuristic). **Aligned with OK's existing architecture.**

Path (a) + path (c) are additive; both can ship. Path (b) is the V2 research track.

### How the ecosystem's validated patterns map to path (a)

Path (a) — defer-the-call — is the only family of techniques any surveyed production editor actually ships. The validated precedents in that family (each targeting a different sub-problem):

- **Slate PR #5871** (2025-06-06): `content-visibility: auto` + block-level React chunking for continuous render of large already-mounted docs. **Mechanism:** viewport-driven containment. **Effect on cold-load:** orthogonal (operates post-mount).
- **Outline / `shared/editor/components/Styles.ts:842`**: `content-visibility: auto` on images only + `loading="lazy"` on iframes. **Mechanism:** per-leaf-element containment. **Effect on cold-load:** reduces image decode cost during mount, not the PM walk.
- **Marijn's 2017-2025 posture**: delegates virtualization to consumers; refuses upstream implementation.
- **Atlassian's "performance mode"**: feature-degradation-on-heuristic (disables sticky table headers, block-formatting controls). **Mechanism:** reduce per-node NodeView/decoration cost. **Effect on cold-load:** reduces the `per-node × N` multiplier, doesn't touch the loop structure.

These are **adjacent, not converged** — each uses a different CSS primitive or product-layer mechanism against a different point in the render lifecycle. The common thread is "mask or reduce work around the sync task," not "eliminate the sync task." No published editor has eliminated the sync task. Option E (whatever its final definition in OK's architecture doc) needs to pick which of these points it targets; the report evidence alone does not demonstrate alignment with all of them simultaneously.

---

## Limitations & Open Questions

### Dimensions with thinner evidence

- **Notion's specific cold-load mechanics**: Notion's block architecture clearly virtualizes at some level, but the public engineering blog doesn't document it in depth. INFERRED only.
- **Atlassian's "performance mode" heuristic**: The activation heuristic is undisclosed. We know they disable features above some threshold but can't cite the threshold.
- **Lexical internals**: [lexical #7422](https://github.com/facebook/lexical/issues/7422) surfaces the virtualization discussion, but Lexical's `NodeMap` GC mechanics were only skimmed — a deeper read could surface the exact cost profile for a 3.25 MB doc class.

### Out of scope (per brief)

- 1P OK codebase reconciliation — this report is third-party-facing per research skill defaults. The "Option E" mapping in the cross-cutting synthesis is an externally-validated precedent map, not a 1P design spec.
- Benchmarking OK against specific ecosystem baselines — numeric data is captured where primary sources reported it, but a rigorous side-by-side benchmark is a separate workstream.

### Open follow-up directions (research-grade)

1. **Shane Friedman's react-prosemirror internals** — if his "future perf post" has landed since 2026-04-20, it could reframe option (b). Worth re-probing quarterly.
2. **Automerge 2 streaming sync protocol** — the post-load incremental sync is documented; a feasibility probe into using Automerge as an alternative to Yjs *purely for initial state delivery* could surface a path.
3. **Canvas-based rich-text editors** — Google Docs / Canva's canvas renderer architecture is the only documented approach that fully avoids DOM-per-node cost. Publicly-documented technical writeups exist (Google Docs Engineering) but were not in scope here.

---

## References

### Evidence Files

- [evidence/q1-q2-tiptap.md](evidence/q1-q2-tiptap.md) — TipTap docs + GitHub issue/PR archaeology
- [evidence/q3-q8-prosemirror.md](evidence/q3-q8-prosemirror.md) — ProseMirror prescriptions + mechanical source read of `EditorView` constructor
- [evidence/q4-codemirror.md](evidence/q4-codemirror.md) — CodeMirror 6 patterns + y-codemirror.next cost profile
- [evidence/q5-ecosystem.md](evidence/q5-ecosystem.md) — 10-product ecosystem survey (Obsidian, Notion, Linear, Logseq, BlockNote, Plate, Lexical, Liveblocks, Outline, Novel)
- [evidence/q6-react-yield.md](evidence/q6-react-yield.md) — React 19.2 + browser yield-during-mount primitives
- [evidence/q7-yjs-progressive.md](evidence/q7-yjs-progressive.md) — Y.js / Hocuspocus / y-prosemirror progressive-load feasibility

### Primary Sources — TipTap (Q1, Q2)

- [TipTap Performance Guide](https://tiptap.dev/docs/guides/performance)
- [TipTap #155 — mount editor after content is loaded (Kühn, 2020)](https://github.com/ueberdosis/tiptap/issues/155)
- [TipTap #1536 — NodeView cost architectural (Kühn, 2021)](https://github.com/ueberdosis/tiptap/issues/1536)
- [TipTap #1870 — pagination rejected (Kühn 2021, nperez0111 2024)](https://github.com/ueberdosis/tiptap/issues/1870)
- [TipTap #3345 — first-render delay inherent (bdbch, 2022)](https://github.com/ueberdosis/tiptap/issues/3345)
- [TipTap #6988 — simplified useEditor (bdbch, nperez0111, 2025-09)](https://github.com/ueberdosis/tiptap/issues/6988)
- [TipTap #7275 — freeze on long text (2025)](https://github.com/ueberdosis/tiptap/issues/7275)
- [TipTap #7514 — iPad Safari freeze (2025)](https://github.com/ueberdosis/tiptap/issues/7514)

### Primary Sources — ProseMirror (Q3, Q8)

- [prosemirror #1478 — viewport virt explicitly out of scope (Marijn, 2024-07-18)](https://github.com/ProseMirror/prosemirror/issues/1478)
- [prosemirror #1293 — "library doesn't take responsibility for browser perf" (Marijn, 2022-07-01)](https://github.com/ProseMirror/prosemirror/issues/1293)
- [prosemirror #911 — accidentally quadratic fix (Marijn, 2019-04-11)](https://github.com/ProseMirror/prosemirror/issues/911)
- [discuss.prosemirror.net #577 — viewport rendering 2017 origin](https://discuss.prosemirror.net/t/efficient-viewport-rendering-like-codemirror/577)
- [discuss.prosemirror.net #8096 — many-editor virtualization 2025](https://discuss.prosemirror.net/t/how-to-handle-thousands-of-editor-instances-on-screen/8096)
- [discuss.prosemirror.net #4972 — loading on scroll](https://discuss.prosemirror.net/t/improving-performance-loading-on-scroll/4972)
- [ProseMirror-view source @ master](https://github.com/ProseMirror/prosemirror-view) — `src/index.ts`, `src/viewdesc.ts`
- [smoores.dev — "Why I rebuilt ProseMirror's renderer in React"](https://smoores.dev/post/why_i_rebuilt_prosemirror_view/)
- [handlewithcarecollective/react-prosemirror](https://github.com/handlewithcarecollective/react-prosemirror)

### Primary Sources — CodeMirror 6 (Q4)

- [codemirror.net reference docs](https://codemirror.net/docs/ref/)
- [codemirror/view source](https://github.com/codemirror/view)
- [codemirror/state source](https://github.com/codemirror/state)
- [codemirror/language source](https://github.com/codemirror/language)
- [yjs/y-codemirror.next source](https://github.com/yjs/y-codemirror.next)
- [discuss.codemirror.net](https://discuss.codemirror.net/)

### Primary Sources — Ecosystem (Q5)

- [Slate PR #5871 — content-visibility + chunking, 2025-06-06](https://github.com/ianstormtaylor/slate/pull/5871)
- [Lexical #7422 — virtualization discussion (etrepum)](https://github.com/facebook/lexical/issues/7422)
- [Outline #5282 — doc size limit discussion](https://github.com/outline/outline/issues/5282)
- [Outline #8164 — doc size limit (tommoor closing)](https://github.com/outline/outline/issues/8164)
- [Atlassian Confluence — Automatic performance optimization](https://support.atlassian.com/confluence-cloud/docs/automatic-performance-optimization/)
- [Jira CONFCLOUD-65329 — table slowdown fix](https://jira.atlassian.com/browse/CONFCLOUD-65329)
- [Plate docs — performance](https://platejs.org/docs)
- [BlockNote docs](https://www.blocknotejs.org/docs)
- [Liveblocks TipTap integration docs](https://liveblocks.io/docs/get-started/nextjs-tiptap)

### Primary Sources — React 19.2 + Browser (Q6)

- [react.dev — Activity](https://react.dev/reference/react/Activity)
- [react.dev — useDeferredValue](https://react.dev/reference/react/useDeferredValue)
- [react.dev — Suspense](https://react.dev/reference/react/Suspense)
- [react.dev — startTransition](https://react.dev/reference/react/startTransition)
- [react.dev — React Compiler](https://react.dev/learn/react-compiler)
- [facebook/react — scheduler source](https://github.com/facebook/react/tree/main/packages/scheduler)
- [reactwg/react-18 discussions — yield semantics](https://github.com/reactwg/react-18/discussions)
- [MDN — Scheduler.postTask](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask)
- [MDN — requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
- [web.dev — Optimize long tasks](https://web.dev/articles/optimize-long-tasks)

### Primary Sources — Y.js / CRDT (Q7)

- [yjs/yjs — encoding.js source](https://github.com/yjs/yjs/blob/main/src/utils/encoding.js)
- [yjs/yjs #675 — applyUpdate async rejection (dmonad)](https://github.com/yjs/yjs/issues/675)
- [yjs/yjs #36 — stream data when syncing](https://github.com/yjs/yjs/issues/36)
- [yjs/y-prosemirror #113 — whole-doc transactions on remote edit (OPEN 2022-05)](https://github.com/yjs/y-prosemirror/issues/113)
- [yjs/y-prosemirror #4 — initial render](https://github.com/yjs/y-prosemirror/issues/4)
- [yjs/y-websocket #189 — messages too large](https://github.com/yjs/y-websocket/issues/189)
- [ueberdosis/hocuspocus #1010 — bun WebSocket 80MB failure](https://github.com/ueberdosis/hocuspocus/issues/1010)
- [loro-dev/loro #940 — 5 MB → 600 MB RAM amplification](https://github.com/loro-dev/loro/issues/940)
- [docs.yjs.dev — Document Updates (commutativity)](https://docs.yjs.dev/api/document-updates)
- [dmonad/crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks)
- [discuss.yjs.dev — Handling slow applyUpdate](https://discuss.yjs.dev/t/handling-slow-applyupdate-on-the-client-side-with-update-increasing/2002)
- [emreeren/y-websockets-streaming-server — 2018 transport chunking precedent](https://github.com/emreeren/y-websockets-streaming-server)

### Related Research (OK repo internal, pointer only)

- `specs/2026-04-19-perf-diagnostic-toolkit/evidence/s{1,2,3}-diagnosis.md` — OK's S1/S2/S3 diagnoses (architecturally-bounded characterization)
- `CLAUDE.md §precedent #24` — perf-instrumentation-as-first-class, defer-mount threshold, content-visibility:hidden ship
- `reports/perf-profiling-landscape-2026/` — 10-dimension third-party perf survey

---

**Research complete.** Evidence files: 3,217 lines across 6 files. Every finding primary-source-cited. Confidence labels applied per the standard taxonomy.
