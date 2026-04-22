---
title: "Open Knowledge Perf Investigation — Consolidated World Model"
description: "Coherent synthesis of the perf-diagnostic-toolkit ship (10 stories, 13 commits, 9 nested-Claude research probes, 3 diagnosis/evidence docs, triage outcomes, and the emerging V2 architecture decision space). Every claim tagged CONFIRMED / SUPPORTED / INFERRED / UNCERTAIN / SPECULATIVE. Non-prescriptive — the consumer builds their own decisions from this topology."
createdAt: 2026-04-20
subjects:
  - Open Knowledge perf-diagnostic-toolkit
  - TipTap 3.22 + React 19.2 + React Compiler
  - ProseMirror (y-prosemirror 1.3.7)
  - CodeMirror 6 + y-codemirror.next
  - Yjs / Hocuspocus
  - V2 Editor Cache
  - Option E static-content-then-upgrade
  - 768 React MarkView (InternalLink) hot path
  - content-visibility (§8b)
topics:
  - cold-mount attribution
  - architecturally-bounded outcomes
  - module-level editor cache
  - Activity + Suspense + use(promise)
  - non-blocking mount feasibility
  - React Compiler interactions
  - empirical perf profiling
---

# Open Knowledge Perf Investigation — Consolidated World Model

**Date:** 2026-04-20
**Scope:** the `perf/investigation` branch work, its 10 user stories, 9+ nested-Claude research probes, 3 evidence diagnoses, triage outcomes, and the emerging V2 architecture decision space.
**Stance:** non-prescriptive. Reports what exists + confidence per claim. Decisions are downstream.

## How to read this document

Every claim carries a confidence label:
- **CONFIRMED** — direct primary-source evidence (measured number, file:line, gh API return, etc.)
- **SUPPORTED** — multiple consistent signals from independent sources
- **INFERRED** — reasoning chain from evidence; not directly measured
- **UNCERTAIN** — thin evidence; alternative interpretations exist
- **SPECULATIVE** — plausible but unsupported

"Divergences" section at the end flags places where sources disagree.

---

## 1. Executive picture

**The ship shipped** (CONFIRMED): 10/10 user stories pass on `perf/investigation` branch, 13 commits (`e86a0505` through `23e86ca9`). A durable perf diagnostic toolkit + S4 outline-polling fix + S1 partial mitigation via defer-mount + evidence-based diagnoses of S1/S2/S3 + CLAUDE.md precedent #24 all landed. `bun run check` + `bun run check:full:parallel` green.

**Three of four symptoms are architecturally-bounded** (CONFIRMED). Only S4 (outline polling) is cleanly fixed (13→0 API calls / 30s idle). S1 (cold-load), S2 (warm-switch), S3 (mode-toggle) each meet their ACs via the "architecturally-bounded OR measured number" escape clause — not the numerical targets.

**The cold-mount cost is ~9.7 seconds on PROJECT.md** (CONFIRMED via cold-pool-warm probe). One single main-thread task. The bottleneck is third-party library code (ProseMirror `EditorView` constructor + y-prosemirror `_forceRerender`) whose maintainers have publicly refused to make it yield-able.

**No first-class non-blocking solution exists** (CONFIRMED across 10-dive research). Not React 19, React Compiler, Scheduler APIs, Workers, Streaming, nor any PM/CM community fork. Every surveyed OSS editor either caps doc size or punts on the problem — none tests a 3.25 MB document.

**Three discovered load-bearing gotchas** (CONFIRMED):
- Precedent #18(b) "warm nav is a visibility flip" is **partially false** — `@tiptap/react`'s `useEditor` destroys editor 1ms after Activity-hidden cleanup, so TipTap state does NOT survive Activity flips (only React-managed state does).
- Memory scales **catastrophically non-linearly** — PROJECT editor alone = ~400 MB in Chromium, not the 1.5 MB the V2 investigation estimated from happy-dom.
- PROJECT.md has **768 markdown links × ReactMarkView** — each instantiating a full Radix Tooltip + DropdownMenu + Dialog tree eagerly on mount. Cold-pool-warm reattach pays 750-1500 ms of React reconciliation for these alone.

**The V2 path forward** consists of overlapping architectural workarounds in the "defer-the-call" family, because no primary fix is available:
- Module-level Editor cache (fixes S2 warm-switch for small docs, does NOT fix S3 or big-doc cold-load on its own)
- `content-visibility: hidden` swap (§8b — empirical probe showed AC22 MET; unconditional ship recommended)
- InternalLink MarkView mitigation (plain PM mark OR hybrid lazy-render — big open question)
- Option E static-content-then-upgrade pattern (the only architectural option for big-doc cold-load perceived-UX, given the 9.7s is genuinely unbreakable)
- Option G pre-warm on hover (complements E)

**An active cold-mount profiling probe** (task `brjgcbvdo`, in flight) will sharpen the inferred 9.7s breakdown into a measured attribution before the V2 spec is committed.

---

## 2. Implementation layer — what shipped

Source: `tmp/ship/spec.json`, `tmp/ship/progress.txt`, `tmp/ship/insights.md`, git log on `perf/investigation`.

### 2.1 The 10 stories (all passes=true, all CONFIRMED)

| ID | Title | Key landed artifact | Status |
|---|---|---|---|
| US-001 | Perf emission layer | `packages/app/src/lib/perf/{mark,profiler-boundary,web-vitals,collector,types,index}.*` + 19 unit tests + `web-vitals@^5.0.0` dep | Foundation |
| US-002 | Scenario framework | `tests/perf/{profile.ts,lib/{scenario.ts,cdp-tracer.ts}}` + 14 cdp-tracer unit tests + turbo task `perf:profile` | CLI driver works |
| US-003 | 4 perf scenarios | `tests/perf/scenarios/{cold-load-big-doc,warm-switch,mode-toggle,outline-polling}.ts` + `lib/doc-markers.ts` | All 4 scenarios emit valid JSON |
| US-004 | Instrumentation wiring | 8 surfaces wrapped in `<ProfilerBoundary>` or emitting `mark('ok/...')` — App, EditorArea, EditorActivityPool, FileSidebar, OutlinePanel, sync-promise, DocumentContext, main.tsx | All gates green |
| US-005 | Pre-fix baseline | `tests/perf/baselines/2026-04-19.json` + CHANGELOG.md | All 4 symptoms reproduce at AC-required magnitudes |
| US-006 | **FIX S4** — replace OutlinePanel polling with Y.Doc update-event invalidation + 300ms debounce | `OutlinePanel.tsx` (no `refetchInterval`; `provider.document.on('update')` subscription) | **apiCallCount 13→0** |
| US-007 | **DIAGNOSIS** of S2 — `useEditor.scheduleDestroy` 1ms setTimeout + Activity mismatch | `evidence/s2-diagnosis.md` | LIMIT=1 attempted + REVERTED (broke F1 scroll) |
| US-008 | **FIX S1 PARTIAL** — defer-mount non-active editor for docs > 500K chars | `EditorActivityPool.tsx` + `computeEditorMountGate` + 16 unit tests + `evidence/s1-diagnosis.md` | `cmCount: 0` on PROJECT cold load; ~200-500ms savings |
| US-009 | **DIAGNOSIS** of S3 — browser `display:none→visible` recalc on 39,608-node PM DOM | `evidence/s3-diagnosis.md` | No code change; documented architecturally-bounded |
| US-010 | Post-fix baseline + CLAUDE.md precedent #24 + final verification | `2026-04-19-postfix.json` + `CHANGELOG.md` + AGENTS.md precedent #24 + `tests/perf/README.md` cross-ref | All gates green; 1 pre-existing E2E flake flagged out-of-scope |

**Precedent number slip** (CONFIRMED): SPEC.md called for precedent #20 but 4 unrelated precedents landed during the ship (#20 E2E conventions, #21 tree derivations, #22 shell-script conventions, #23 async-socket handling), so the new perf precedent is **#24**. Corrigendum breadcrumb added at SPEC.md §1.

### 2.2 Three assess-findings commits (post-ship tier)

After the 10 stories landed, an `/assess-findings` triage of 25 validation-pass suggestions produced 3 additional commits:
- `e0e0b518` — US-010 post-fix baseline + precedent #24 (actually part of the 10-story ship)
- `f9b897d7` — Tier 1 fixes: documentation fidelity + createEditor perf mark (S7-T1)
- `23e86ca9` — Document content-visibility probe protocol in s3-diagnosis.md §8b

### 2.3 Current dev server broken on perf/investigation (CONFIRMED; INSIGHT-6)

Commit `f9b897d7` added `useRef<number>(performance.now())` at `TiptapEditor.tsx:134` for the S7-T1 createEditor mark. **React Compiler's Babel plugin rejects this** as "Cannot call impure function during render." The dev server does not start from this branch. Fix-approach queued (effect-anchored mark) but not yet landed per user direction to defer until V2 spec execution.

---

## 3. The 4 symptoms — outcomes

Source: `specs/2026-04-19-perf-diagnostic-toolkit/evidence/s{1,2,3}-diagnosis.md` (read directly), `baselines/2026-04-19.json`, `baselines/2026-04-19-postfix.json`.

### S1 — Cold load of large doc (PROJECT.md 3.25 MB)

**Pre-fix (CONFIRMED)**:
- Scenario (CDP-traced): `coldLoadMs = 22,338 ms`, `observedLongestTaskMs = 18,271 ms` (the scenario's own `PerformanceObserver({type:'longtask'})` — captures actual contiguous main-thread block)
- Raw probe (git-stashed): `coldLoadMs = 8,923 ms`, `cmCount = 1`

**Post-fix (US-008, CONFIRMED)**:
- Raw probe: `coldLoadMs = 8,465–8,741 ms`, **`cmCount = 0`** (CodeMirror initial mount skipped)
- 200-500ms improvement, scales with doc size (plausibly ≥500ms on SPEC's original 9.7MB doc)

**Root cause (s1-diagnosis §3, INFERRED attribution)**:
| Contributor | Cost (ms) | Category |
|---|---|---|
| Y.Doc sync + initial `applyUpdate` | 1,700-2,300 | Content size + network (architectural) |
| App shell + router + Suspense boundaries | 200-500 | Framework cost (architectural) |
| React commit #1 (Suspense resolution) | 200-400 | Reconciliation cost |
| React commit #2 (TipTap mount + PM DOM for 25K+ nodes) — HEAVIEST | 900-1,300 | DOM cardinality (architectural) |
| Nested-update commits (cascading Y.js) | 300-500 | Architectural |
| Browser layout/paint | 400-800 | DOM size (architectural) |
| CodeMirror initial mount (DEFERRED post-fix for large docs) | 200-500 saved | Architecturally optional |

**Architectural floor**: ~5.5–7 s on 3.25 MB; scales to ~10–13 s on 9.7 MB. **AC20 (<5000ms) is below the floor — architecturally-bounded**.

**Disagreement between probes** (NOTED, not resolved): scenario CDP-traced = 22s vs raw probe = 8.9s. The scenario's note (s1-diagnosis §2) explicitly says CDP overhead doubles cold-load measurement and the raw probe is authoritative for user-perceived latency.

### S2 — Warm switch-back (between README and PROJECT)

**Pre-fix (CONFIRMED)**: `warmSwitchMs = 737 ms`
**Post-fix (US-010, CONFIRMED)**: `warmSwitchMs = 672 ms` (within noise)

**Root cause** (CONFIRMED via direct source read at `node_modules/@tiptap/react/src/useEditor.ts:228-320`): `@tiptap/react`'s `useEditor` hook runs `this.scheduledDestructionTimeout = setTimeout(destroy, 1)` on every effect cleanup. React 19.2 `<Activity mode="hidden">` runs effect cleanups → 1ms later the editor destroys → on Activity show-flip, `createEditor()` rebuilds the full schema + Yjs binding (~350 ms fixed overhead regardless of doc size).

**Major architectural finding** (CONFIRMED, INSIGHT-1 in the plan): Precedent #18(b)'s "warm nav becomes a visibility flip" claim is **partially false** for the TipTap editor surface. Only React-managed state (useRef, useState, context, error-boundary state, scroll position via `ScrollPreservingContainer`) survives Activity flips. TipTap editor state (undo history, cursor, selections, decorations) does NOT survive.

**LIMIT=1 attempt** (CONFIRMED): reducing `ACTIVITY_MOUNT_LIMIT 3→1` produced warmSwitchMs=708 (no gain) AND broke `docs-open.e2e.ts:F1` scroll preservation because `ScrollPreservingContainer`'s `useRef<number>(0)` dies on full unmount. REVERTED.

**AC21 (<100ms) outcome**: architecturally-bounded. Fix requires a module-level editor cache outside React's lifecycle (V2).

**Correction to s2-diagnosis applied in triage** (CONFIRMED via `gh issue view 5761`): TipTap issue #5761 was closed **COMPLETED on 2025-04-18**, about `TiptapCollabProvider` name-change hot-swap — not editor hot-swap. TipTap's first-class `Editor.mount(el)` / `Editor.unmount()` APIs at `@tiptap/core/src/Editor.ts:161,190` + `@tiptap/react/src/EditorContent.tsx:155` TODO confirm the cache pattern is upstream-supported.

### S3 — Mode toggle on large doc (PROJECT Source→Visual)

**Pre-fix (CONFIRMED)**: `modeToggleMs = 609 ms` wall-clock, `modeToggleLayoutMs = 2,038 ms` (scenario-wide upper bound).
**Post-fix (US-010, CONFIRMED)**: `modeToggleMs = 595 ms`, `modeToggleLayoutMs = 1,974 ms` (within noise; US-008 defer-mount does NOT help S3).

**Root cause** (s3-diagnosis §4, CONFIRMED via PM node count probe):
- `pmNodeCount = 39,608` (direct DOM audit — 58% higher than SPEC's "25K" estimate)
- 606 ms wall-clock ≈ 30 ms React reconciliation + 576 ms browser style + layout + paint
- 576 ms is the **measured floor on this hardware/doc pair**, not a universal ceiling — scales with DOM cardinality

**S1-to-S3 orthogonality** (CONFIRMED): US-008's defer-mount does NOT fix S3 because both editors are mounted after the first toggle. The `display:none → visible` recalc on the 39,608-node TipTap PM DOM fires regardless of defer-mount state. Small-doc mode-toggle (README 36ms / 51ms layout+style) is 27× under the 1s no-regression AC bar — pre-mount-both IS the correct default for small-to-medium docs.

**AC22 (<300ms) outcome**: documented architecturally-bounded at ship close. **BUT — post-ship §8b probe (see §4.1) empirically showed AC22 MET at 204ms first-toggle + 115ms repeat-toggle via `content-visibility: hidden` swap.** Ship did not re-open the AC but flipped the V2 priority of §8b.

**Three V2 paths catalogued** (post-US-009 triage-corrected ranking):
- **§8b `content-visibility: hidden`** — lowest-risk, 30-min probe (PROBE RESULT: SHIP unconditional)
- **§8a module-level editor cache + conditional-mount-of-active-only** — fixes S2 alone via cache; fixes S3 only with additional conditional-mount layer. CORRECTION from original s3-diagnosis: cache **ALONE does NOT fix S3**.
- **§8c viewport-virtualized PM** — Marijn Haverbeke (PM maintainer) has publicly rejected this direction 5+ times across 2017-2025. Multi-quarter in-house engineering if pursued.

### S4 — Outline polling (README)

**Pre-fix (CONFIRMED)**: 13 `/api/page-headings` requests / 30s idle.
**Post-fix (US-006, CONFIRMED)**: **0 requests / 30s idle**.

**Root cause (CONFIRMED via code read at `OutlinePanel.tsx`)**: hardcoded `refetchInterval: 2000` in `useQuery`.

**Fix (CONFIRMED)**: removed `refetchInterval`, subscribed to `activeProvider.document.on('update', ...)` (Y.Doc public API, not HocuspocusProvider's internal event), 300 ms trailing-edge debounce (matches precedent #11 `TYPING_DEFER_MS`), gate on `activeDocName === docName`.

**Refinement accepted in triage (S6-R1)**: `staleTime: Number.POSITIVE_INFINITY` per TkDodo's guidance for subscription-source-authoritative queries.

**Event path trace** (CONFIRMED, INSIGHT-2 in insights.md): zero upstream batching anywhere from keystroke to listener. 5 peers × 60 WPM = ~25 Hz/client without the debounce. The 300ms debounce is ESSENTIAL + right-sized.

**Only symptom cleanly fixed. AC19 MET.**

---

## 4. The 9+ research probes — findings

Source: plan file at `~/.claude/plans/enchanted-greeting-russell.md` (the CANONICAL consolidated insights log), `tmp/ship/insights.md`, `tmp/ship/improvement-suggestions.md`, 2 surviving REPORT.md files (`non-blocking-research`, `tiptap-large-doc-patterns`), `/tmp/ok-perf-validation/editor-cache-v2/investigation.md`.

**Caveat on evidence provenance**: 7 of 9 original probe REPORT.md files were lost when `/tmp/ok-perf-validation/` was wiped by a machine reboot mid-investigation. The probe FINDINGS are preserved in:
1. The plan file's 8 numbered INSIGHT blocks with evidence pointers
2. `tmp/ship/improvement-suggestions.md` (detailed validation pass catalog, S6-R/S7-R/S7-T/S8-R/S8-T/S9-R/S9-T entries)
3. The spec.json `userStories[].notes` (per-story implementation notes)
4. `tmp/ship/insights.md` (rolling during-implementation insights)
5. The 2 respawn probes (TipTap ecosystem + non-blocking research) which explicitly cite and cross-reference the earlier probes' findings

Triangulation confidence on lost-probe findings is HIGH because 4+ independent artifacts consistently record the same evidence.

### 4.1 The 8 canonical INSIGHTs (from plan file, verbatim where possible)

**INSIGHT-1 (CONFIRMED, post-ship): §8b `content-visibility: hidden` works — unconditional ship recommended.** Empirical probe on the `cv-probe` worktree (task `b5jxoym0l`) returned:
- PROJECT first `modeToggleMs`: 595 → **204 ms avg** (2.9× faster)
- Repeat `modeToggleMs`: 115 ms avg (4.9× vs baseline)
- Scenario layout/style total: 1,974 → 1,627 ms (−18%)
- README (small-doc control): 36 → 23 ms (no regression)
- `docs-open.e2e.ts`: 19/19 pass (no regression)
- Find-in-page behavior: CV:hidden matches `display:none` (both skip content from Cmd+F). §8b protocol's MDN-citation claim was wrong. No product call needed.

**Unexpected win**: first-toggle improved too (not just repeat). Explanation: the CV cache populates on the `visible→hidden` transition that fires when user toggles to Source mode. Returning to Visual is then a cache hit even on "first" toggle. The code-trace's "first-transition pays full cost" prediction was asymmetric — only `toSourceMs` has that property; `modeToggleMs` benefits on first toggle because TipTap was rendered during cold-load.

**AC22 flips from architecturally-bounded to MET** with the §8b swap. Still deferred-scope post-ship; not yet landed on `perf/investigation`.

**INSIGHT-2 (CONFIRMED, RED FLAG): V2 cache hits AC21 for small docs, NOT big docs.** Cold-pool-warm empirical (cold-pool-warm probe `b3wwngz22`):
- README (5 KB): 145 ms → V2 can drop to 40-70 ms (AC21 <100ms MET)
- PROJECT (3.25 MB): **9,725 ms** single main-thread task
- `longestTaskMs` in window: 9,392 ms (ONE single task; not many small tasks)

The 9.7s is dominated by PM view-rebuild (39K DOM nodes + 768 React MarkViews + y-prosemirror `_forceRerender`), NOT by `createEditor`. V2 cache saves ~1-2s of createEditor + schema + bind cost but PM view-build is the floor.

**INSIGHT-3 (CONFIRMED, RED FLAG): Memory scales catastrophically.** V2 investigation estimated 1.5 MB/editor (happy-dom). Real Chromium measurement:
- Small doc editor: ~2 MB
- Medium doc editor (CM6-ELEMENTS 28 KB): ~3 MB
- Large doc editor (PROJECT 3.25 MB → 270K rendered chars → 39,608 PM DOM nodes): **~400 MB**
- Pool-only entry (no editor): ~0.4 MB

Scaling is **linear in rendered DOM node count**, not source bytes. `MAX_POOL=10` with even one PROJECT = 450 MB heap.

**Implication**: a V2 cache CANNOT be a flat LRU-of-10. Must be size-aware (don't cache big docs, or use different LRU depth tiers).

**INSIGHT-4 (CONFIRMED): CodeMirror cold-pool-warm is fine.** CM6 is viewport-aware — only materializes visible lines. Cold-pool-warm measurements:
- Small doc: 37 ms
- Large doc (PROJECT): 136 ms

Both well under AC21. CM6 is NOT the bottleneck; V2 work for CM is lower priority than TipTap. Marijn Haverbeke's CM6 numbers ([discuss.codemirror.net/5928](https://discuss.codemirror.net/t/noticable-lag-when-dealing-with-large-files/5928)): 56ms total on 25 MB JSON cold mount.

**INSIGHT-5 (CONFIRMED, RED FLAG): 768 React MarkViews on PROJECT.** Direct measurement:
- `grep -c '\[.*\](.*)' PROJECT.md` returns **768** (CONFIRMED by reading PROJECT.md)
- `packages/app/src/editor/extensions/internal-link.ts:22-24` uses `addMarkView: () => ReactMarkViewRenderer(InternalLinkView)` (CONFIRMED)
- Each `InternalLinkView` instantiates 2 Radix Dialog.Root + DropdownMenu.Root + Tooltip.Root + 5 useState + 3 useId + ~10 useRef + 4 useControllableState + 8 lucide-react icons mounted EAGERLY (not lazy on interaction)

**Cost estimate**: 768 × 1-2 ms mount = 750-1500 ms React reconciliation on cold-pool-warm reattach. This is ORTHOGONAL to the V2 cache — neither Stage 1 nor Stage 2 of the cache fixes this, because `EditorContent.componentWillUnmount` unconditionally calls `editor.view.setProps({nodeViews: {}})` which destroys all MarkViews, forcing remount.

**InternalLinkView architectural alternatives** (from deep-dive probe, 5 options ranked):
| Alt | Cost | PROJECT cold-pool-warm | AC21? |
|---|---:|---:|---|
| 1. Keep as-is | 0d | ~1500 ms | ❌ |
| 2. Lazy-render chip on hover | 1-2d | ~230 ms | Close |
| 3. Viewport-virtualize (IntersectionObserver) | 2-3d | 150-300 ms | Borderline |
| **4. Port to plain PM Mark + event-delegated interaction** | **5-7d** | **20-80 ms** | **✅** |
| 5. Hybrid (plain DOM chip + shared React interaction layer at editor root) | 3-5d | 80-200 ms | ✅ |

**What other editors do** (from research probe): Lexical uses `LinkNode` as ElementNode with plain TextNodes (no React per link). Obsidian uses CM6 viewport-scoped decorations. Notion caps at 25 mentions per block. Logseq has documented perf issues on many-reference pages. We're in the "React MarkView per link" category which is the architectural worst-case.

**INSIGHT-6 (CONFIRMED): Pre-existing bug — S7-T1 createEditor mark broken under React Compiler.** Commit `f9b897d7` added `useRef<number>(performance.now())` at `TiptapEditor.tsx:134`. React Compiler's Babel plugin rejects it as "Cannot call impure function during render." Breaks dev server on `perf/investigation`. Fix approach: effect-anchored (`useState(() => performance.now())` lazy initializer or `useEffect`-captured start time). User authorized fix as separate commit; not yet landed.

**INSIGHT-7 (SUPPORTED): TipTap upstream stalled.** Issue #6988 (simplified useEditor + `editor.mount()` modernization) open. Maintainer @bdbch last commented **2025-09-22: "I'll circle back when I can."** No timeline, not in any release. Project owns V2 implementation indefinitely. Additionally, maintainer Philipp Kühn publicly rejected pagination/splittable content in 2021 AND 2024 (citing the Google-Docs-canvas rationale), and in 2021 said "*Thousands of node views can't be that fast at all. Node views are expensive. I don't think we can do anything here.*" TipTap 2026 roadmap has AI + document-conversion + TipTap Flex — **no editor-perf track**.

**INSIGHT-8 (CONFIRMED): CM6 has no mount/unmount API — but re-parent-without-destroy works.** Deep-source research probe (`b4hdhpvtc`) read `node_modules/@codemirror/view/dist/index.js` and found:
- `EditorView.destroy()` is unconditional (lines 8575-8588) — tears down DOM, plugins, DocView, InputState, observer, MutationObserver, IntersectionObservers, window listeners
- **But re-parenting works** — `measure()` early-returns when detached (line 6313), MutationObserver keeps observing, plugins stay alive
- **Bonus side effect**: never destroying the view means never re-invoking `yCollab()`, which eliminates y-codemirror.next's latent Y.UndoManager reset bug (y-codemirror has no equivalent of `@tiptap/extension-collaboration`'s UndoManager preservation workaround)
- Two workarounds needed: (a) call `(view as any).observer.listenForScroll()` after re-parent (scroll-ancestor tracking is stale 1-2s otherwise), (b) hoist `Y.UndoManager` outside `yCollab()` as defense-in-depth
- Resource cost at `MAX_POOL=10`: ~50 window/document listeners + 30 observers
- **Nobody in OSS caches CM6 EditorView across React unmount** — @uiw/react-codemirror unconditionally destroys. We're pattern-leading.

**Savings on PROJECT**: 115-275 ms vs fresh construct. Smaller than TipTap because CM6's viewport virtualization makes cold-mount cheap anyway.

### 4.2 The two respawn probes (on disk)

**Probe: `tiptap-large-doc-patterns/REPORT.md`** (515 lines) — TipTap docs/issue archaeology + PM/CM/ecosystem survey (8 axes). Headline: **"NO first-class solution exists."** Key direct quotes:

- Philipp Kühn (TipTap maintainer), 2020 on [#155](https://github.com/ueberdosis/tiptap/issues/155): *"I would still recommend to mount the editor after the content is loaded"* — the 9.7s cold load IS the prescribed pattern.
- Philipp Kühn, 2021 on #1536: *"Thousands of node views can't be that fast at all. Node views are expensive. I don't think we can do anything here."*
- Marijn Haverbeke (ProseMirror maintainer), 2024-07-18 on [prosemirror#1478](https://github.com/ProseMirror/prosemirror/issues/1478): *"Virtual viewporting is explicitly out of scope for this library. Having implemented it in CodeMirror, I know what is involved in setting this up, and I'm not going to add that complexity to ProseMirror."* (closed 38 minutes after filing)
- dmonad (Y.js maintainer) on [yjs#675](https://github.com/yjs/yjs/issues/675): *"I have no plans to make the update function async (or to refactor it to a generator function), because that would ultimately hurt performance for 'normal' use-cases. However, you are free to implement these functions yourself."*
- Tom Moor (Outline maintainer — our closest OSS peer): *"Due to the data model all of the document must be downloaded before being displayed, there is no way around this at this time."* Outline **caps individual docs at 250K chars** (one user-reported import failure at 516 KB).

**Mechanical source read**: `prosemirror-view/src/index.ts` constructor (24 lines, L69-93) has **ZERO yield points** (`setTimeout`, `requestAnimationFrame`, `requestIdleCallback`, `queueMicrotask`, `Promise`, `await`) across 2,415 lines of `src/index.ts` + `src/viewdesc.ts`. Hot path = recursive `docViewDesc()` → `NodeViewDesc.create` → `updateChildren`.

**Slate PR #5871** (merged 2025-06-06) — Slate ecosystem state-of-the-art: `content-visibility: auto` + block-level React-memoization chunking. Slate reports 90% Firefox / 99.7% Chrome latency reduction on 50K-block docs. **Critical nuance**: Slate's 10× speedup claim is from the **chunking half** (separately-memoized React components — a primitive PM does NOT expose). The `content-visibility: auto` paint-skip half has no numerical claim. Only the paint-skip half transfers to PM — NOT the 10× number. Safari caveat (Slate docs verbatim): *"applying `content-visibility: auto` to each Slate element individually is often slower than not using it at all."*

**Probe: `non-blocking-research/REPORT.md`** (553 lines) — 10 deep dives. Verdict: **"NO first-class non-blocking solution exists for Open Knowledge's 9.7s editor cold-mount bottleneck. The cost is architecturally bounded in third-party library code (ProseMirror's `EditorView` constructor, y-prosemirror's `_forceRerender`), not addressable via React, React Compiler, or browser scheduling APIs."**

Key dive findings (CONFIRMED via primary-source reads):
- React 19 concurrent renderer yields BETWEEN fibers only (`workLoopConcurrentByScheduler` at `ReactFiberWorkLoop.js:3051-3057`); `useEffect` callbacks run synchronously in `commitHookEffectListMount` with NO yield check (`ReactFiberCommitEffects.js:141-230`).
- React Compiler: **zero scheduler/yield insertion across 40+ compiler passes** (grep-verified against `babel-plugin-react-compiler/src/`).
- `scheduler.yield()` (Chrome 129+, NOT Safari) requires `async`+`await`. PM constructor has neither. Can ONLY reorder scheduling *around* the 9.7s task, not break it up.
- Web Workers CANNOT host `new EditorView()` (no DOM in Workers). Worker-assisted markdown parse + PM JSON construction can save **1-2 s of 9.7s** bounded by structured-clone overhead. No OSS precedent in TipTap/Yjs.
- Hidden `<Activity>` subtrees skip effect mount (react.dev verbatim: "without mounting their Effects"). Pre-mounting in hidden Activities does NOT amortize cold-mount.
- **12-editor OSS survey** (Outline / HedgeDoc / Novel / BlockNote / TipTap / Lexical / Affine / Logseq / Plate / SilverBullet / Cal.com / Mintlify): **no one tests 3.25MB documents.** Pattern matrix:
  - Outline: 250K cap; Tom Moor "no way around this"
  - HedgeDoc: 1M chars cap (CM6-based)
  - Novel: demo-only
  - BlockNote: <1480 blocks crashes
  - TipTap demo: 10K cap
  - Lexical: "#7422 breaks"; maintainer recommends *"something designed for that"*
  - Affine: 1 MB; has first-class `track.doc.loadDoc({success})` telemetry with 20s/60s escalation
  - Logseq: >300MB graphs fail
  - Plate: content-visibility + chunking pattern
  - SilverBullet: unlimited via CM6
  - Cal.com: uses **Lexical**, NOT TipTap (correction from earlier-conversation assumption)
  - Mintlify: closed-source web editor

**Inferred 9.7s breakdown** (non-blocking research, flagged UNCERTAIN): `{Y.Doc apply: 2s, markdown parse: 2s, PM JSON construction: 1s, PM DOM construction: 3s, React reconcile: 1.7s}` = 9.7s. Individual components NOT measured; sums match observed but attribution is inferential.

**IMPORTANT CORRECTION** (from the conversation AFTER the research completed): markdown parse is NOT in the cold-mount path. The bridge (markdown↔PM) runs server-side per CLAUDE.md precedent #14. The client just receives Y.XmlFragment (already PM-shaped). The "markdown parse: 2s" line in the non-blocking research's estimated breakdown is a misframing — the actual 2s in that slot is more likely additional y-prosemirror `_forceRerender` + React MarkView portal creation.

**Three paths out of the sync constructor**:
1. **Defer-the-call** (Option E family) — moves 9.7s in time, doesn't shrink. Feasible without fork.
2. **Split internal work** — fork PM/TipTap to inject `await scheduler.postTask()` in `viewdesc.ts:767-813` (`iterDeco` callback). Constructor becomes async. Marijn has explicitly rejected this. Maintainable as patch but cognitive burden.
3. **Off-main-thread** — Workers for parse/preprocessing only. Bounded savings. First-of-class for TipTap/Yjs (no OSS precedent).

**Only (1) ships without a fork.**

### 4.3 The V2 editor cache investigation (`/tmp/ok-perf-validation/editor-cache-v2/investigation.md`, 917 lines)

**Two-stage architecture** (from the investigation, landed on the `v2-editor-cache-probe` worktree):

**Stage 1 — Module-level cache, never call unmount.** Editor sits at orphan `<div>` between Activity evictions. `<EditorContent>`'s existing DOM re-parent hack handles visibility. Editor never destroyed on React component unmount; destroyed only on provider pool eviction. `createEditor` cost paid once per pool lifetime per doc.
- Target: ≤50 ms warm-switch within `ACTIVITY_MOUNT_LIMIT=3`
- Cold-switch-inside-pool: depends on React NodeView density (see INSIGHT-5 — 768 MarkViews on PROJECT)
- Confidence: HIGH on correctness (4 empirical probes validated undo survival, Yjs sync, memory cost, StrictMode compat)
- **Does NOT fix S3** (INSIGHT-7 correction): both editors still mounted; toggle still triggers PM DOM recalc

**Stage 2 — Explicit `editor.mount(el)` / `editor.unmount()`.** Conditional on Stage 1's cold-pool-warm latency being too high. Uses TipTap's first-class upstream APIs. Adds `_forceRerender` cost per remount (40-200 ms on big docs) but reduces memory and observer CPU. Stage 2 adds work, doesn't subtract — strictly WORSE for link-heavy cold-pool-warm latency than Stage 1 alone.

**User's V2-depth decision (mid-conversation)**: user selected Stage 2 as hard prereq for link-heavy docs, but based on conversation correction — Stage 2 doesn't solve the MarkView problem (neither stage does). User re-opened the decision with: *"generally lets wait until we do all research we want to, just keep tabs on our insights"*.

### 4.4 Multi-peer observer CPU probe (`brodu8s34`, finding captured in plan)

V2 cache keeps up to 10 editors alive; Y.js observers fire on all of them regardless of Activity mode. Measured:
- 5 peers × 60 WPM: observer cost per remote update = **0.031 ms mean / 0.083 ms p95 / 0.796 ms max**
- Total JS/sec: **1.6 ms/sec ≈ 0.16% CPU** per hidden V2-cached editor
- Doc-size invariant (same cost at 7 KB and 17 KB): y-prosemirror caches PM nodes in `this.mapping` keyed by Y.XmlElement; cost scales with diff size, not doc size

**Verdict**: Stage 1's "keep editors alive" has NO CPU problem for OK's workload (typical 1-3 peers). **Stage 2 is not justified on CPU grounds for typical or elevated (5 peers) collaboration.**

### 4.5 Option H empirical verification (`bz1ki669f`, finding captured in plan)

Tests whether sidebar/header stay interactive during the 1-2s PM construction block.

**Claim: PARTIALLY FALSIFIED** (CONFIRMED empirically):
| Scenario | Main thread responsive? | User outcome |
|---|---|---|
| Direct `goto` to PROJECT (no prior editor) | Responsive — one 207 ms block at t=2.46s | No UX cost (user hasn't clicked) |
| In-app nav README → PROJECT, continuous 150ms clicks stream | Responsive — max 91 ms queue | Unrealistic (not a real user behavior) |
| In-app nav, no input (probe-quiet) | **Blocked 6,132 ms** (main thread frozen nav+1,811 ms to nav+7,943 ms) | Idle — user sees pending bar |
| **In-app nav, single click during cold mount (realistic)** | **Click handler latency = 2.1-6.3 s** (all queued until block ends) | **Clicks feel broken for 6 s** |
| In-app nav PROJECT → README (warm, pool-resident) | Responsive — 29 ms queue | Fast, as expected |

**Attribution of the 6s block**: y-prosemirror initial content apply + React commit + browser synchronous layout/paint of 3 MB DOM. **None of it is React reconciliation** — React's concurrent renderer cannot yield through it. `startTransition` does NOT help.

**Implication**: Option E (static content during cold mount) is NOT just UX polish — the page IS genuinely frozen during cold mount. Options E + G compress the unusable-window but don't eliminate the inevitable PM construction time.

### 4.6 CV:hidden probe protocol + execution (`b5jxoym0l`)

See §4.1 INSIGHT-1 above — includes the surprise first-toggle win, the find-in-page misframing correction, and the decision matrix outcome (SHIP unconditional; size-gate optional).

### 4.7 Cold-pool-warm baseline (`b3wwngz22`)

See §4.1 INSIGHT-2 + INSIGHT-3 above — established the 9.7s / 400 MB / 9,392 ms longestTask numbers.

### 4.8 NodeView density + CM6 lifecycle + TipTap #6988 (`bglyssfld`)

See §4.1 INSIGHT-5 + INSIGHT-7 + INSIGHT-8 above.

### 4.9 Option E + G patterns (`bj18xqwzy`, captured in conversation)

Catalog of prior art for static-content-then-upgrade (E) and pre-warm-on-hover (G):
- TipTap ships `@tiptap/static-renderer/pm/html-string` (first-party utility for static PM render). We have an equivalent in-core via `MarkdownManager.renderHTML()` / `mdast-to-html.ts`.
- **Notion is the anti-model**: 5.6s spinner → 6.2s interactive (no static-then-upgrade).
- **Linear is NOT TipTap** (correction): uses ProseMirror via Outline's `rich-markdown-editor`.
- `useDeferredValue` is NOT the right primitive for Option E (defers values, not mounts).
- `startTransition` does NOT reduce `createEditor` wall-clock (consistent with precedent #24).
- No upstream CRDT pre-warm-on-hover pattern exists — we're pattern-leading on Option G. Router consensus is 50-100ms debounce + 3-event model (mouseenter/focus/touchstart) + concurrency cap.
- Cost estimates: Option E = 3-5 days. Option G = 2-3 days.

### 4.10 InternalLink deep-dive (`bknn5unzk`)

See §4.1 INSIGHT-5 above — 5 architectural alternatives ranked.

### 4.11 Cold-mount attribution probe (`brjgcbvdo`, IN FLIGHT at time of writing)

Active probe will measure the 9.7s cold-mount component breakdown with direct instrumentation. Adds perf marks at:
- `ok/cold/editor-ctor-start/end`
- `ok/cold/pm-view-construct-start/end`
- `ok/cold/force-rerender-start/end`
- `ok/cold/create-node-views-start/end`
- `ok/cold/react-commit-start/end`
- `ok/cold/first-paint`

**Expected deliverable**: HIGH-confidence attribution of the 9.7s. Will either confirm the estimated breakdown (`{Y.Doc apply: 2s, PM JSON: 1s, PM DOM: 3s, React: 1.7s, browser: 1s}`) or surface misattribution. Once landed, updates the "UNCERTAIN" 9.7s breakdown in this worldmodel to CONFIRMED.

---

## 5. The V2 architecture decision space (current best picture)

Based on evidence to date. Still pending the active cold-mount-profile probe.

### 5.1 What's architecturally-bounded and we can't fix

- **Cold-mount < 1s on multi-MB docs**: impossible without forking PM + y-prosemirror. Marijn refuses, no community fork exists. The 9.7s is a library-level fact.
- **Warm-switch < 100ms with `useEditor`**: impossible as long as `@tiptap/react`'s `useEditor` schedules destroy on effect cleanup. Must bypass `useEditor` via module-level editor cache.
- **PM viewport virtualization**: not available from upstream; 3-6 months in-house; community has rejected (5 projects independently converged on "unavoidable UX issues in contenteditable").

### 5.2 What the evidence suggests is fixable

**Clean fixes**:
- **S4 polling**: FIXED (US-006 shipped).
- **S3 mode-toggle**: EMPIRICALLY FIXED via §8b (ships as `content-visibility: hidden` class swap). AC22 flips from bounded to MET. Not yet landed on `perf/investigation`.
- **S2 warm-switch <100ms for small docs**: fixable via Stage 1 module-level editor cache (TipTap uses first-class `mount()`/`unmount()`; CM6 uses re-parent-without-destroy per INSIGHT-8).

**Partial fixes**:
- **S1 cold-load perceived-UX on big docs**: Option E (static markdown content in Suspense fallback, editor lazy-mounts) — 3-5 days. Makes page feel alive during the 9.7s freeze.
- **S2 warm-switch <100ms on big docs**: not reachable through cache alone. Requires InternalLink MarkView mitigation + cache. Best achievable estimate: 5-6s.
- **Option G pre-warm on hover**: cuts ~2s off perceived cold-load (network sync happens during hover). 2-3 days.

**Unknowns pending probe**:
- **768-MarkView mitigation**: Alt 4 (plain PM Mark, 5-7 days) vs Alt 5 (hybrid, 3-5 days). User leaned Stage 2 then re-opened. Cold-mount-profile probe may shift priorities.

### 5.3 Emerging V2 spec shape (SPECULATIVE pending final probe)

From the plan file's "emerging plan shape" (subject to revision):
1. Ship §8b unconditional CV:hidden (0.5d, AC22 met)
2. Fix S7-T1 createEditor mark (0.25d, unblocks dev server)
3. V2 Editor cache — TipTap + CodeMirror, size-aware (3-4d, hits AC21 for small docs)
4. MarkView mitigation — path TBD (1-7d depending on alternative)
5. Option E static content during cold mount (2-3d)
6. Option G pre-warm on hover (0.5d)
7. Cold-load telemetry Affine-style (0.25d)
8. Content-visibility: auto probe bonus (1d if pursued)
9. Precedent #18(g) + corrigendum on #18(b) (0.5d)
10. Post-V2 baselines + SPEC.md updates (0.5d)

**Total estimated scope: 11-15 engineering days.** Calibrated as extension to existing `perf-diagnostic-toolkit` spec, not a new one.

### 5.4 deferredScope tracked in state.json (6 items)

| # | Item | Source |
|---|---|---|
| 1 | Run `content-visibility: hidden` probe per s3-diagnosis §8b | EXECUTED post-ship; see INSIGHT-1 |
| 2 | V2 Editor cache refactor spec (Stage 1 + 2) | Investigation landed at `v2-editor-cache-probe` worktree |
| 3 | Size-gated content-visibility variant spec | Depends on #1 outcome (now moot — ship unconditional) |
| 4 | Paint isolation probe — CDP `Rendering.getNodeCount` | Not yet executed |
| 5 | Re-evaluate Activity vs `display:none` (Fix C) | Future arch review |
| 6 | Open upstream `@tiptap/react` GH issue on Activity compat | Deferred user action |

---

## 6. Open questions + genuine unknowns

### 6.1 Active probe will resolve
- **OQ-A**: Precise component breakdown of the 9.7s cold-mount — PM DOM construction vs React NodeView/MarkView vs y-prosemirror `_forceRerender` vs browser layout. (Probe `brjgcbvdo` in flight.)

### 6.2 Answerable by reading source (not yet done)
- **OQ-B**: Is y-prosemirror's `_forceRerender` cost closer to "100-400 ms on 3.25 MB" (V2 investigation estimate) or closer to 1-2 s? Requires direct instrumentation.
- **OQ-C**: Does `content-visibility: auto` (different from shipped `hidden`) provide additional cold-mount paint savings on continuous-render? Slate pattern transferability to PM contenteditable is documented as UNCERTAIN (discuss.prosemirror.net #1486 notes DOMObserver interference).

### 6.3 Genuinely unresolved (architecture-dependent)
- **OQ-D**: For the 768 MarkView problem, which of the 5 alternatives fits best? User preference + cold-mount-profile probe numbers would decide.
- **OQ-E**: Option E's dual-mount cost (~2× PM construction) — acceptable at 3.25 MB? Outline didn't test beyond 250K chars.
- **OQ-F**: Should the V2 cache be size-aware (don't cache big docs) or tiered (small docs get aggressive caching, big docs rarely)? Memory data (400 MB/editor) says flat-LRU-of-10 is a no-go.

### 6.4 Out of scope / deferred indefinitely
- OK 9.7s cold-mount ≤ Notion 6.2s desktop (only two directly-comparable rows in the ecosystem table) — would require CRDT + editor stack change (Automerge + different editor).
- Viewport-virtualized PM (V3+).
- Editor-per-block outliner refactor (Logseq pattern).

---

## 7. Divergences + tensions in the evidence

### 7.1 Cold-load measurement magnitude
- S1 scenario (CDP-traced): 22.3s coldLoadMs on PROJECT
- S1 raw probe (no CDP): 8.9s coldLoadMs on same doc
- Non-blocking research estimated breakdown sums to 9.7s (from cold-pool-warm, not cold-load)
- SPEC's original measurement: 20.2s on 9.7 MB

**Reconciliation** (per s1-diagnosis §2): CDP tracing adds ~2× overhead. Raw probe authoritative for user-perceived latency. Scenario numbers reproduce the SHAPE of S1 faithfully (single dominant long task) but not the absolute magnitude.

### 7.2 Outline's doc-size cap
- Non-blocking research: 250K-char cap
- tiptap-large-doc-patterns: 516 KB user-reported import failure; maintainer cap undisclosed

Both may be correct at different thresholds.

### 7.3 Worker-assisted preprocessing win estimate
- Non-blocking research: 10-30% (1-2s of 9.7s)
- tiptap-large-doc-patterns: 200-500 ms (marked UNCERTAIN)

Both are INFERRED; no measured precedent.

### 7.4 Option E framing
- Non-blocking research: classifies Option E as "architecturally honest for 9.7s class"
- tiptap-large-doc-patterns: frames Option E as member of a broader "defer-the-call" family where each editor targets different sub-problem

Same conclusion, different framing.

### 7.5 Precedent #18(b) accuracy
- CLAUDE.md text: "warm nav becomes a visibility flip — scroll position, cursor, editor undo history, and any other subtree state survive"
- US-007 empirical finding: TipTap editor state does NOT survive (only React-managed state does)

Precedent #18(b) needs a corrigendum per CLAUDE.md's post-ship breadcrumb convention. Not yet applied.

---

## 8. Confidence audit — summary

### 8.1 CONFIRMED (direct primary-source evidence)
- All 10 US-001 through US-010 stories landed and passed (spec.json + progress.txt + 13 commits on branch)
- S4 fix measurements: 13 → 0 API calls / 30s idle
- S1 raw probe: 8,923 ms → 8,465-8,741 ms; `cmCount: 0` post-fix
- S2 baseline 737 ms; LIMIT=1 attempt 708 ms; F1 scroll regression reproducible
- S3 wall-clock 606 ms = 30 ms React + 576 ms browser; 39,608 PM DOM nodes
- `@tiptap/react`'s `useEditor.scheduleDestroy` uses `setTimeout(destroy, 1)` at `useEditor.ts:297-320`
- `packages/app/src/editor/extensions/internal-link.ts` uses `ReactMarkViewRenderer(InternalLinkView)` at line 22-24
- PROJECT.md has 768 markdown links (verified via `grep -c '\[.*\](.*)' PROJECT.md`)
- TipTap issue #5761 closed COMPLETED on 2025-04-18 (gh API)
- TipTap #6988 open; maintainer comment 2025-09-22 (gh API)
- ProseMirror `EditorView` constructor has zero yield points across 2,415 LOC (grep-verified)
- React 19 `workLoopSync` never checks yield (`ReactFiberWorkLoop.js:2748-2755`)
- React Compiler has zero scheduler-primitive insertion (grep-verified)
- §8b empirical probe: first `modeToggleMs` 595→204 avg, repeat 115 avg, scenario layout/style −18%, E2E 19/19 pass
- Cold-pool-warm on PROJECT: 9,725 ms TipTap leg / 136 ms CM leg
- PROJECT editor memory in real Chromium: ~400 MB
- CM6 `EditorView.destroy()` unconditional at `index.js:8575-8588`
- Multi-peer observer CPU cost: 0.031 ms mean / 1.6 ms/sec per hidden editor
- Option H: sidebar click queue 2.1-6.3s during cold-mount window

### 8.2 SUPPORTED (multiple consistent signals)
- Precedent #18(b) "state preservation" claim is partially false (US-007 code-trace + insights.md + e2e F1 regression all triangulate)
- ~350 ms `createEditor` fixed cost (US-007 code-trace, multiple probes consistent)
- TipTap upstream is stalled (2 maintainer quotes 2024, 2025; no 2026 perf roadmap)
- Outline is the closest OSS peer that has PUNTED on big-doc cold-load
- No OSS editor tests 3.25 MB documents (12-editor survey + HEAD-of-main code reads consistent)
- CM6 cold-mount cheap enough (Marijn baseline 56 ms at 25 MB + our 136 ms measurement)

### 8.3 INFERRED (reasoning chain from evidence)
- ~250 ms `createEditor` attribution inside 347 ms dead zone (argument-by-elimination, not direct mark measurement)
- S3 576 ms = 606 ms wall − 30 ms React (attribution-by-subtraction, not direct CDP slice)
- Scaling proportionality (doc-size → cold-load; node-count → layout)
- V2 Stage 1 warm-switch target <100 ms for small docs (INSIGHT-2 cites but unmeasured at US-007 close)
- Worker-assisted markdown parse saves 1-2s (structured-clone-bounded estimate, no measurement)

### 8.4 UNCERTAIN (thin evidence)
- 9.7s breakdown into 5 components (the active cold-mount-profile probe `brjgcbvdo` will resolve)
- §8b `content-visibility: auto` transferability to PM (discuss.prosemirror.net #1486 documents DOMObserver interference; may not apply to `hidden` variant shipped)
- Safari per-element `content-visibility: auto` degradation on our specific PM tree shape
- Whether Outline's dual-mount pattern holds at 3.25 MB (unvalidated >250K chars)
- Option G rate-limiting strategy (we'd be pattern-leading on CRDT pre-warm)
- Whether §8b's find-in-page behavior change is desired or neutral for our UX

### 8.5 SPECULATIVE
- Whether the cold-mount-profile probe will confirm or invalidate the 9.7s estimated breakdown
- Whether TipTap will ship `editor.mount()`/`unmount()` modernization in 2026 (maintainer said "I'll circle back" — no timeline)
- Whether React 19.3+ will add any editor-relevant non-blocking primitives
- Whether the InternalLink Alt 5 Hybrid actually lands at 80-200 ms (based on per-mount-cost estimates)

---

## 9. Key references (by source type)

### In-tree artifacts (CONFIRMED via direct read)
- `.claude/worktrees/playwright-stability/specs/2026-04-19-perf-diagnostic-toolkit/SPEC.md`
- `.claude/worktrees/playwright-stability/specs/2026-04-19-perf-diagnostic-toolkit/evidence/s1-diagnosis.md` (195 lines)
- `.claude/worktrees/playwright-stability/specs/2026-04-19-perf-diagnostic-toolkit/evidence/s2-diagnosis.md`
- `.claude/worktrees/playwright-stability/specs/2026-04-19-perf-diagnostic-toolkit/evidence/s3-diagnosis.md`
- `.claude/worktrees/playwright-stability/tmp/ship/{spec.json, progress.txt, insights.md, improvement-suggestions.md, triage.md, state.json, codebase-context.md}`
- `~/.claude/plans/enchanted-greeting-russell.md` — **canonical running insights log** (the 8 INSIGHTs + open questions + plan shape)
- Git log on `perf/investigation` (13 commits, oldest `e86a0505` → newest `23e86ca9`)
- `CLAUDE.md` / `AGENTS.md` precedents #18 (six sub-principles) and #24 (post-US-010, perf instrumentation as first-class)

### On-disk probe reports (2 of original 9 surviving)
- `/tmp/ok-perf-validation/non-blocking-research/REPORT.md` (553 lines)
- `/tmp/ok-perf-validation/tiptap-large-doc-patterns/REPORT.md` (515 lines)

### In-worktree probe artifacts (survived /tmp wipe because they're in .claude/worktrees/)
- `.claude/worktrees/cv-probe/` — §8b swap + extended mode-toggle scenario + result JSONs
- `.claude/worktrees/cold-pool-warm/` — new `cold-pool-warm.ts` + `memory-snapshot.ts` scenarios + result JSONs
- `.claude/worktrees/option-h-verify/` — Playwright probe scripts
- `.claude/worktrees/multipeer-collab/` — integration harness
- `.claude/worktrees/v2-editor-cache-probe/` — 917-line investigation.md + 4 empirical probe JSONs
- `.claude/worktrees/cold-mount-profile/` — **ACTIVE PROBE**, instrumentation in flight

### Related prior reports (catalogued in reports/CATALOGUE.md)
- `reports/crdt-observer-bridge-latency-analysis/REPORT.md` — cousin problem (bridge 500ms→7.4s as 10KL grows 5× content)
- `reports/full-stack-pm-crdt-markdown-editor-ideal/REPORT.md` — schema design context
- `reports/tiptap-2026-direction-overlap/REPORT.md` — confirms no upstream perf track
- `reports/automerge-prosemirror-migration-assessment/REPORT.md` — rules out CRDT-level migration as cold-load fix
- `reports/codemirror-markdown-source-view-rendering/REPORT.md` — confirms CM6 not the bottleneck
- `reports/cm-in-pm-nested-editor-architecture/REPORT.md` — nested CM6 in PM pattern
- `reports/bun-prosemirror-model-dedup/REPORT.md` — worktree-specific infra issue

### External primary sources (CONFIRMED via URL fetch or gh CLI)
- `node_modules/@tiptap/react/src/useEditor.ts:228-320` (scheduleDestroy)
- `node_modules/@tiptap/core/src/Editor.ts:161,190,766` (mount/unmount/destroy)
- `node_modules/@tiptap/react/src/EditorContent.tsx:155` (TODO for upstream mount() modernization)
- `node_modules/prosemirror-view/src/index.ts:69-93` (constructor, 24 lines, zero yield points)
- `node_modules/@codemirror/view/dist/index.js:8575-8588` (EditorView.destroy)
- TipTap issue [#5761](https://github.com/ueberdosis/tiptap/issues/5761) (closed COMPLETED 2025-04-18)
- TipTap issue [#6988](https://github.com/ueberdosis/tiptap/issues/6988) (open, stalled)
- TipTap issues [#155](https://github.com/ueberdosis/tiptap/issues/155), [#1536](https://github.com/ueberdosis/tiptap/issues/1536), [#1870](https://github.com/ueberdosis/tiptap/issues/1870), [#3345](https://github.com/ueberdosis/tiptap/issues/3345) (maintainer rejections of pagination/virtualization)
- ProseMirror discuss #577, #1486, #3580, #4142, #4972, #8096 + issue #1293, #1478 (Haverbeke refusals)
- Yjs [#675](https://github.com/yjs/yjs/issues/675) (dmonad on non-async `applyUpdate`)
- Lexical [#7422](https://github.com/facebook/lexical/issues/7422) (big-doc perf open)

### External primary sources — Slate content-visibility
- [Slate PR #5871](https://github.com/ianstormtaylor/slate/pull/5871) (merged 2025-06-06)
- [Slate performance walkthrough](https://docs.slatejs.org/walkthroughs/09-performance)

### External primary sources — React internals
- `facebook/react` `packages/react-reconciler/src/{ReactFiberWorkLoop,ReactFiberCommitEffects,ReactFiberBeginWork}.js`
- `facebook/react` `compiler/packages/babel-plugin-react-compiler/src/`
- [React Compiler v1.0 release post](https://react.dev/blog/2025/10/07/react-compiler-1)
- [react.dev Activity reference](https://react.dev/reference/react/Activity)

---

## 10. Meta — provenance + limitations

**Channels harvested**:
- User-provided on-disk artifacts (specs, tmp/ship, plan file, 2 respawn probe REPORTs)
- Codebase via `/explore`-style harvest of `perf/investigation` branch
- Reports catalogue (`reports/CATALOGUE.md`) for related prior work
- Direct primary-source reads (I verified 768-link count myself; read s1/s3-diagnosis in full; read insights.md in full)

**Channels NOT harvested**:
- Web probes (user explicit: skip — introspecting own work)
- OSS repo surveys (covered transitively by the 2 respawn probes)

**Lost-probe reconstruction confidence**:
- 7 of 9 original probe REPORT.md files wiped from `/tmp/ok-perf-validation/` by machine reboot mid-investigation
- Findings preserved via 4 independent artifacts: plan-file INSIGHTs, improvement-suggestions.md, spec.json notes, insights.md
- Triangulation HIGH (4 sources in agreement on all major findings)
- The 2 respawn probes (tiptap-large-doc-patterns, non-blocking-research) cite and cross-reference the lost probes — their findings are independently corroborated

**Active work at time of writing**:
- Cold-mount-profile probe `brjgcbvdo` in flight (~1-2 hours). Will supply direct attribution measurement that replaces the UNCERTAIN 9.7s breakdown in §4.2 with CONFIRMED component timings.

**What this document is NOT**:
- Not a prescription for the V2 spec
- Not a decision log (decisions live in the plan file + state.json deferredScope)
- Not exhaustive of the V2 code surfaces (see agent-dispatched code-channel brief in this session's transcript for fuller file:line map)
- Not a substitute for reading s1/s2/s3-diagnosis.md directly when making load-bearing V2 decisions

**Last verified**: 2026-04-20 (post-machine-reboot, post-respawn of 2 probes, cold-mount-profile probe in flight).
