# V2 Editor Cache + Alt 5 MarkView + Cold-Load UX — Spec

**Status:** APPROVED (2026-04-20 post-Verify; ready for implementation sprint)
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-20
**Baseline commit:** `23e86ca9` (post-ship of `specs/2026-04-19-perf-diagnostic-toolkit/` US-001–US-010; includes precedent #24 + cold-mount instrumentation ACs)
**Verification history:** Intake + Scaffold + Audit (parallel Challenger + Auditor) + Assess-findings (13 BLOCKs / 17 SHOULD-FIXes / 3 FYIs integrated) + Verify. Full trail in `meta/_changelog.md`.
**Supersedes:** N/A (extends precedent #18 and precedent #24)
**Foundation (shipped on main):**
- `specs/2026-04-19-perf-diagnostic-toolkit/` — perf toolkit (10 user stories). Delivered `<ProfilerBoundary>`, `mark()`, `installWebVitals()`, cold-mount instrumentation prototype (commit `b6c6455b` in `cold-mount-profile` worktree), §8b CV:hidden protocol (US-009 + US-010 post-fix baseline).
- Precedent #18 (hybrid Activity + Suspense + `use(promise)`) — ships on main. Establishes the Activity pool + syncPromise cache pattern V2 extends.
- Precedent #24 (perf instrumentation as first-class) — ships on main.

**Links:**
- Probes (copied to `./evidence/`): `cold-mount-profile.md`, `size-spectrum-profile.md`, `grey-zone-and-prod-floor.md`, `h1-cm6-reparent-probe.md`, `h2-fumadocs-standalone-probe.md`, `non-blocking-research.md`, `tiptap-large-doc-patterns.md`, `option-e-utilities.md` (with corrections)
- Cross-spec: `specs/2026-04-14-component-blocks-v2/SPEC.md` (draft; see `./evidence/component-blocks-v2-interweaving.md`)
- Reports: `reports/perf-investigation-worldmodel-2026-04-20/REPORT.md` (worldmodel synthesis — pre-probe; post-probe update pending after Node-path probe lands)
- Foundation specs: `specs/2026-04-19-perf-diagnostic-toolkit/SPEC.md` + `evidence/s{1,2,3}-diagnosis.md`

**Confidence conventions used throughout this document:**
- **HIGH** — directly measured / source-code-verified / empirically probed with deterministic outcome
- **MEDIUM** — inferred from multiple primary sources / single-source measurement with variance understood
- **LOW** — inferred without direct measurement / based on a single claim not independently verified
- **UNCERTAIN** — contested or thin evidence; documented as an open question

---

## 1) Problem statement

**Situation.** Open Knowledge's TipTap + y-prosemirror + CodeMirror 6 + Yjs editor has architecturally-bounded cold-load performance on medium-to-large documents. Direct measurement on `PROJECT.md` (3.25 MB / 270 K PM chars / 768 React MarkViews) yields `coldPoolWarmMs ≈ 9.41 s` wall-clock with a `~7.70 s` single main-thread longtask (HIGH confidence; cold-mount-profile §Executive Summary, variance <1 % across 2 runs). Production build measurements show the cold-load floor is `~950 ms` bundle-bound and large-doc cold-load reaches `1845 ms` on `STORIES.md` (530 KB / 176 views) even in prod (HIGH confidence; grey-zone-and-prod-floor §Part B). Across a 6-doc scaling curve, **React-view count dominates byte count by ~6×** on cold-pool-warm cost (HIGH confidence; grey-zone-and-prod-floor §Part A fit: `CPW ≈ 185 + 10.6·views + 1.8·bytes_KB` on 6 points spanning 111 KB→3.25 MB / 0→768 views). The Activity + Suspense + `use(promise)` pattern shipped on main as precedent #18 amortizes provider sync but does NOT amortize the `~7.70 s` cold-mount longtask itself: TipTap's `useEditor` calls `scheduleDestroy(1 ms)` on component unmount (HIGH confidence; tiptap-large-doc-patterns §Q1), so Activity-hidden flips still destroy the Editor instance — every revisit pays the full cold-mount cost.

**Complication.** Three compounding factors make the status quo untenable:

1. **Ecosystem consensus: no first-class fix exists.** 10-dimension cross-stack investigation ruled out React 19 concurrent primitives, React Compiler, `scheduler.yield`, Web Workers, and all community PM forks (HIGH confidence; non-blocking-research §Executive Summary + 10 dives + 12-editor survey). ProseMirror maintainer Marijn Haverbeke has refused viewport virtualization across 4 primary sources spanning 2017-01-16 → 2025-01-12 (HIGH confidence; tiptap-large-doc-patterns §Q3 with direct quotes). TipTap maintainer Philipp Kühn twice rejected pagination as out-of-scope (2021, 2024) and canonical async-init guidance is literally *"mount the editor after the content is loaded"* (HIGH confidence; tiptap-large-doc-patterns §Q1/Q2). Open Knowledge is in unexplored territory: 10–15× beyond what any surveyed production editor (Outline 250 K / 516 KB cap, HedgeDoc 1 M, TipTap demo 10 K) treats as supported.

2. **`component-blocks-v2` ships next and multiplies per-instance NodeView cost 5–10×.** The `JsxComponentView` NodeView renders live fumadocs components + ComponentErrorBoundary + ComponentToolbar + conditional PropPanel + ContextBridgeProvider chain + hover outline CSS per `<Callout>` / `<Tabs>` / `<Accordion>` block (HIGH confidence; direct read of `specs/2026-04-14-component-blocks-v2/SPEC.md` §9.7). Fumadocs-heavy docs with 50–100 jsxComponents would reach the cold-mount dominance band without any size growth (`~100 ms/view × 100 views = 10 s`, MEDIUM confidence extrapolation from measured ~2 ms/view marginal cost × 5-10× per-instance multiplier). Without V2 caching + NodeView mitigation, `component-blocks-v2` ships a known-worse-than-current pattern.

3. **Greenfield directive precludes pragmatic patches.** User has stated: *"Not optimizing for expediency/scope/pragmatism — optimizing for architecturally and product right."* Implementation time is NOT a factor. Implementation is by an AI coding agent that can absorb ~15 engineer-days of scope in a sprint. The binding constraint is spec correctness, not calendar.

**Resolution.** Ship a V2 architecture in one spec execution sprint with dependency-ordered 5-phase topology:

- **Phase 1 — Primitives (V2 Editor Cache + size-aware policy + generic InteractionLayer).** Module-level `Map<docName, Editor>` using TipTap's `Editor.mount()/unmount()` first-class APIs and CM6's re-parent-without-destroy pattern (H1 probe: FEASIBLE at 12/12 tests, §5 of H1 REPORT codifies the contract). Size policy gates mount based on `viewCount ≥ 50` (primary) + `bytes > 500 KB` (secondary for multi-MB byte outliers). `InteractionLayer` is a generic editor-root React plane routed by `activeNodeId` — plain-DOM chips for simple marks, shared React plane for rich NodeViews.

- **Phase 2 — Consumer migrations.** Port InternalLink + WikiLink + RawMdxFallback + JsxComponent from per-instance `ReactMarkViewRenderer` / `ReactNodeViewRenderer` to the InteractionLayer pattern. This directly attacks the dominant cost — measured ~2.2 s of React reconciliation for 768 MarkView portals on PROJECT (HIGH confidence; cold-mount-profile §Corrected 5-component attribution row 4).

- **Phase 3 — Orthogonal surfaces.** §8b content-visibility: hidden swap for mode toggle (empirically validated; CV:hidden probe AC22 MET at 204 ms first / 115 ms repeat; 19/19 E2E pass). Precedent #18(b) corrigendum + precedent #18(h) addition (CM6 reparent contract). CM6 re-parent-without-destroy (H1 FEASIBLE).

- **Phase 4 — Cold-load UX.** Option E (static fumadocs render in Suspense fallback via `mdast → React` walker — NOT `hast-util-to-jsx-runtime` which errors on MDX expression attrs; H2 empirically validated custom walker at `probe/src/MdToReact2.tsx` ~200 LoC). Option G pre-warms provider on hover (80 ms intent debounce).

- **Phase 5 — Telemetry & gates.** Prod-mode baselines for all ACs. Per-doc view-count + bytes measured at mount (feeds cache gate).

---

## 2) Goals

- **G1** — Warm-switch (cache hit) `< 200 ms prod P95` across all doc sizes up to STORIES (530 KB / 176 views). Evidence baseline: current cold-pool-warm prod is 192 ms (README) / 76 ms (IDEAL-EDITOR anomaly — likely Activity visibility flip) / 541 ms (STORIES). Target: STORIES drops to ≤ 200 ms via V2 cache + InteractionLayer.
- **G2** — Cold-pool-warm `< 500 ms prod P95` for all docs with ≤ 200 React views. Evidence baseline: per grey-zone-and-prod-floor Part A, AGENTS (155 KB / 8 views) = 423 ms dev which projects ~200 ms prod. STORIES (176 views) = 541 ms prod — FAILS this target today, Alt 5 InteractionLayer is the lever.
- **G3** — Cold-load `< 1500 ms prod P95` for docs up to 500 KB / 200 views. Evidence baseline: STORIES prod cold-load = 1845 ms — FAILS, requires Option E + V2 cache.
- **G4** — Mode-toggle (Source↔Visual) `< 200 ms prod P95` across all doc sizes. Evidence baseline: CV:hidden probe on PROJECT showed 204 ms first / 115 ms repeat dev — already MET; prod would be faster.
- **G5** — Perceived first-paint (Suspense fallback visible) `< 500 ms prod P95`. Evidence baseline: Option E target is to hide the ~950 ms prod cold-load floor behind a pre-rendered static tree.
- **G6** — Zero visible flash on Activity mode flip for cached editors. Enforced by V2 cache preserving DOM + reparenting (not destroying).
- **G7** — Architectural unification: editor + docs-site + MCP render preview share one markdown→React pipeline (Open question Q1 resolves this — `@fumadocs/local-md` may serve all three).

## 3) Non-goals

- **[NEVER] NG1:** **PM viewport virtualization.** 3–6 month engineering effort per CM6-patterns comparison, explicitly refused by Marijn Haverbeke across 4 primary sources 2017–2025 (HIGH; tiptap-large-doc-patterns §Q3). Three structural blockers — tree vs flat, NodeView state, Yjs coordination — make even a community fork unmaintainable. Revisit: NEVER (library architecture locked).

- **[NEVER] NG2:** **Fork TipTap or prosemirror-view for async-chunked mount.** Multi-week effort + permanent maintenance burden + re-port against every major release (tiptap-large-doc-patterns §Q6 architectural path (b)). Greenfield directive prefers architectural fit over ownership of upstream divergence. Revisit: NEVER unless upstream merges an async-builder API (no maintainer signal).

- **[NOT NOW] NG3:** **Worker-assisted markdown parse + PM JSON construction.** Bounded to ~1–2 s savings of 9.7 s (MEDIUM; non-blocking-research §Dive 6 with structured-clone overhead). No OSS precedent for TipTap/Yjs stack — first-of-class research. Revisit: if prod baseline post-V2 shows large-doc cold-load still above G3 target AND stakeholder perceives the residual cost.

- **[NOT NOW] NG4:** **Full RSC adoption (move editor off Vite SPA).** Would convert the entire editor app to Next.js / TanStack Start. Out of scope for this spec; Option E's Suspense fallback path does NOT require RSC. Revisit: if docs-site/editor unification via shared runtime pipeline emerges as a stronger motivation than currently sized.

- **[NOT UNLESS] NG5:** **`content-visibility: auto` on continuously-rendered large docs** (Slate PR #5871 pattern — 90 % FF / 99.7 % Chrome latency reduction on 50 K-block docs). Orthogonal to V2 cold-load + mode-toggle focus. Slate's 10× is attributable specifically to their React-memoization chunking primitive (MEDIUM; non-blocking-research §Finding 7). Revisit: only if post-mount keystroke latency on multi-MB docs becomes a stakeholder complaint AND an equivalent chunking primitive can be wired into PM.

- **[NOT UNLESS] NG6:** **Cold-load telemetry standard à la Affine (20 s / 60 s escalation).** Precedent exists (tiptap-large-doc-patterns §Q5 Affine row). Cheap addition under precedent #24. Revisit: in a follow-up perf-telemetry spec; not blocking V2 delivery.

- **[NOT UNLESS] NG7:** **Static fallback rendering via `@fumadocs/mdx-remote`'s `executeMdx`.** Uses Function-constructor eval + 500 KB bundle cost + Node-only dependencies (HIGH; option-e-utilities + fumadocs-ecosystem-component-blocks-reuse report + fumadocs-full-pipeline report). `@fumadocs/local-md` evaluated + REJECTED by Node-path probe: its "no eval" claim is conditional (only `.md`; `.mdx` uses `new AsyncFunction()` identically to mdx-remote). Revisit: NEVER for `.mdx` content; `.md`-only content might allow reuse if OK ever ships a non-MDX document class (no current plan).

- **[NEVER] NG8:** **Cross-tab V2 cache coordination (BroadcastChannel-based shared cache).** Cache is per-JS-runtime. Same docName opened in two browser tabs creates two Editor instances, doubled Hocuspocus connection, presence ghost of same identity. Status quo today; V2 does NOT regress this. Shared-cache optimization deferred indefinitely — trade-off ratio (complexity of BroadcastChannel coordination + serialization vs frequency of 2-tab usage) unfavorable. Raised by Audit §A1.1 2026-04-20; resolved as explicit non-goal.

## 4) Personas / consumers

- **P1: Authoring humans using Open Knowledge editor.** Care about: fast warm-switch (nav feels instant), short perceived cold-load on cold visits, no flash on mode toggle, interactive sidebar during cold-mount.
- **P2: AI coding agents writing markdown via MCP.** Care about: programmatic fidelity — unchanged by V2 perf; V2 is pure render-side optimization.
- **P3: `component-blocks-v2` spec consumer (follow-up spec, currently Draft).** Care about: Alt 5 InteractionLayer is ready from day 1 for `JsxComponentView`; no duplicated ReactNodeViewRenderer migration later; BridgeStore identity preserved across nav (§9.15 of CB-v2 depends on WeakMap<Editor, BridgeStore> stability).
- **P4: Docs-site + MCP render-preview consumers.** Care about: G7 — one markdown→React pipeline shared across the editor Suspense fallback, docs-site build (currently fumadocs-mdx), and MCP render-preview. Locked by Q1 (Node-path probe in flight).

## 5) User journeys

**P1 — Cold visit to large doc (STORIES, 530 KB, 176 views):**
1. User clicks STORIES in sidebar → `openDocumentTransition(docName)` fires inside `startTransition`.
2. Provider pool opens Hocuspocus sync (async, ~2 s, main thread idle — sidebar + header remain interactive).
3. Suspense fallback renders `<FallbackDocumentRender markdown={cachedSnapshot} />` — full-fidelity fumadocs tree, paints within ~500 ms prod (G5 target).
4. `useEffect` mount fires: V2 cache creates Editor instance, mounts into container. Cold mount work (~1845 ms prod baseline today; ~650–900 ms target post-V2) runs on main thread.
5. InteractionLayer replaces fallback — shared PropPanel/Toolbar plane mounts at editor root; per-NodeView chips render (~0.5 ms/chip vs 2 ms/ReactMarkViewRenderer today).
6. First interaction (click a link, toggle mode) works.
- **Failure (sync timeout 30 s):** DocumentErrorBoundary catches `SyncTimeoutError`, renders "Try again" → invalidates syncPromise + reopens. Fallback re-renders from same cached snapshot (G2 content continuity).
- **Failure (no cached markdown):** Skeleton fallback only (plain prose, no components). Visible content swap on editor mount. Acceptable one-time cost.

**P1 — Warm-switch to already-pooled editor:**
1. User clicks a pool-resident doc → `openDocumentTransition(docName)`.
2. Activity subtree for that docName flips from `hidden` to `visible`. V2 cache reparents `editor.dom` from parking node to visible Activity container; `editor.focus()` restores cursor.
3. No suspend, no re-mount, no cold work. CM6 side: `view.dom` re-attached, `view.scrollSnapshot()` dispatch restores scroll position (~93 % fidelity per H1 empirical).
4. Total wall-clock: `< 200 ms prod P95` (G1 target).
- **Failure (cache miss due to eviction under `ACTIVITY_MOUNT_LIMIT = 3`):** falls back to cold-pool-warm path above.

**P1 — Mode toggle (Source ↔ Visual):**
1. Click toggle → `content-visibility: hidden` CSS swap on non-active editor's container.
2. Browser skips style + layout recalc on the 39 K-node DOM (CV:hidden probe measured 576 → 204 ms, AC22 MET).
3. Active editor pops visible in < 200 ms (G4 target).
- **Failure:** N/A — this path has no failure mode; content-visibility is a pure style directive.

**P2 — AI agent markdown write:** unchanged. V2 is render-side only; agent-write → Y.Text → server → Y.XmlFragment via XmlFragment-authoritative pattern (precedent #10, existing).

**P3 — `component-blocks-v2` future NodeView (JsxComponentView):**
1. Markdown parse emits `mdxJsxFlowElement`.
2. JsxComponentView NodeView registers with InteractionLayer via `registerNode(nodeId, { type: 'jsxComponent', ... })`.
3. NodeView renders per-instance component (live fumadocs Callout/Tabs/etc.) with `<NodeViewContent />` for children — no per-instance PropPanel or Toolbar.
4. When selected: InteractionLayer's singleton PropPanel resolves to this nodeId, reads descriptor from registry, renders edit UI at editor root (not per-NodeView).
5. Context Bridge: existing §9.15 mechanism. BridgeStore persists across nav because V2 cache preserves Editor identity (concrete forward-compat win of Phase 1.1).

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR1 — Module-level editor cache (TipTap)** | V2 cache holds up to `MAX_CACHE = 10` editors keyed by `docName`. On first mount, create Editor and stash. On Activity hidden, reparent `editor.view.dom` to parking node (NOT destroy). On Activity visible, reparent back + `editor.focus()`. On eviction, call `editor.destroy()` + cleanup provider. | Phase 1.1. H1 verified reparent preserves state; precedent #18(b) corrigendum clarifies need. |
| Must | **FR2 — Module-level editor cache (CodeMirror 6)** | Symmetric to FR1 using CM6's reparent pattern (no `setRoot()` needed for within-Document). Optional scroll restoration via `view.scrollSnapshot()` + dispatch effect. | Phase 1.1. H1 §5 codifies the contract (see `evidence/cm6-reparent-contract.md`). |
| Must | **FR3 — Size-aware cache policy** | Do NOT cache editors where `viewCount ≥ 200` (memory cost exceeds cache value per cold-mount-profile measurement of ~400 MB/editor on PROJECT). Fall through to current "destroy on unmount" for multi-MB outliers. Secondary gate on `bytes > LARGE_DOC_CHAR_THRESHOLD = 500_000` retained for prose-only multi-MB docs. **Threshold policy:** gate evaluated ONCE at mount, stored on cache entry. Crossing threshold post-mount (user edits push viewCount past 50) does NOT trigger eviction — the editor remains cached for the rest of its lifetime. Eviction is purely LRU-driven. **N=50 rationale:** gives 2× headroom below the measured ~100-view Acceptable→Unacceptable boundary (grey-zone-and-prod-floor §Part A scaling curve). ~2 ms/view marginal cost × 50 views ≈ 100 ms CPW delta vs view-less baseline — comfortably within Acceptable. Tunable constant; recalibrate post-ship if prod data indicates drift. **Eviction ordering:** size-gate and LRU are orthogonal — size-gate denies caching at mount-time (editor never enters cache if over threshold); LRU handles capacity overflow of accepted entries. No ambiguity. | Phase 1.2. View-count-primary gate is novel; derived from grey-zone-and-prod-floor §Part A. |
| Must | **FR3b — Activity-hidden observer CPU cap (NEW per Audit §B6)** | Editors in the V2 cache but NOT in the `ACTIVITY_MOUNT_LIMIT = 3` MRU mount list have their HocuspocusProvider DISCONNECTED (via `provider.disconnect()`). Local Y.js observers still fire (Y.Doc-driven), but CRDT updates do NOT arrive from peers. On Activity promotion from hidden to visible: `provider.connect()` re-establishes WebSocket + sync; awareness re-broadcasts local presence. **Trade-off:** user no longer sees doc B's collaborators typing in real-time while doc B is cached-but-hidden. Acceptable — Activity UX contract is "return to doc, pick up state." Multi-doc real-time awareness is a separate product concern, deferred. Without this cap, V2 cache amplifies the `precedent #18(c)` observer-load class (10 editors × 5 collaborators = 50 firings/keystroke). | Phase 1.2. Depends on FR1/FR2. |
| Must | **FR4 — Generic InteractionLayer primitive** | Editor-root React plane rendered once per Editor instance. Accepts registrations via `registerNode({ type, nodeId, getPos, handlers })`. Routes interactions by `activeNodeId`. Singleton slots for PropPanel / Toolbar / Breadcrumb — **V2 ships PropPanel wiring only**; Toolbar + Breadcrumb are extension points the primitive supports but CB-v2 wires them at its integration (per Audit §S15 scope tightening). Chips include `touch-action: manipulation` CSS (eliminates iOS 300 ms click delay). Event delegation via `data-mark-id` / `data-node-id` attrs on editor root. `contenteditable="false"` on chips (collaborator cursors render outside chip, consistent with existing contenteditable=false NodeViews per Audit §S12). | Phase 1.3. Novel architecture; replaces per-instance `ReactMarkViewRenderer` / `ReactNodeViewRenderer` for the 4 extensions below. |
| Must | **FR4b — Mark-identity PluginState (NEW per Audit §B4)** | PM marks have no stable identity (text nodes merge/split on edits; ranges move; attrs don't carry UUIDs). Solved via `markIdentityPlugin` — a PM plugin maintaining `PluginState<WeakMap<PmMarkInstance, string>>`. On every `appendTransaction`: walk doc, for each InternalLink/WikiLink mark, check if `{markType, attrs, rangeFrom, rangeTo}` hashed identity has WeakMap entry. If not: assign `'m' + ++editorCounter`, store. Mark split/merge/move: new span gets fresh ID (old GC'd via WeakMap). Plugin fires `interactionLayer.register(...)` and `.deregister(...)` on PM-state changes. Chip render sets `data-mark-id` attr from PluginState lookup. Pattern mirrors CB-v2 §9.15 Q10 Option A (bridgeId in PluginState, not schema attr — precedent #9 add-only schema preserved). | Phase 1.3. Required for FR5/FR6 correctness under PM mutations. |
| Must | **FR5 — Port InternalLink to InteractionLayer** | Plain-DOM chip (`<span>` with CSS) per link; hover / click interactions routed to editor-root plane via event delegation. PropPanel / Dropdown for link editing lives at root, keyed by activeNodeId. | Phase 2.1. Primary lever for 768-MarkView cost reduction. |
| Must | **FR6 — Port WikiLink to InteractionLayer** | Isomorphic to FR5. Size-spectrum probe confirmed WikiLinkView per-view cost = InternalLinkView per-view cost. | Phase 2.2. |
| Must | **FR7 — Port RawMdxFallback to InteractionLayer** | Plain-DOM chip for broken-MDX span; embedded CodeMirror source editor surfaced via InteractionLayer plane (not per-instance). Alignment with CB-v2 §9.14 nested-CM Precedent #24 — uses same `createNestedCMExtensions` factory. | Phase 2.3. |
| Must | **FR8 — Port JsxComponent to InteractionLayer (forward-compat for CB-v2)** | When CB-v2 ships, its JsxComponentView uses InteractionLayer for PropPanel + Toolbar + Breadcrumb. Context Bridge Registry (CB-v2 §9.15) continues to live in NodeView per-instance (per-render capture of scope-resolved contexts). BridgeStore WeakMap keyed by Editor identity benefits from V2 cache. | Phase 2.4. Coordination surface with CB-v2; see `evidence/component-blocks-v2-interweaving.md`. |
| Must | **FR9 — §8b content-visibility: hidden swap** | Swap `display: none` → `content-visibility: hidden` on the non-active editor container during mode toggle. Includes `contain-intrinsic-size` fallback for scrollbar preservation. | Phase 3.1. Already empirically validated (AC22 MET). |
| Must | **FR10 — CM6 re-parent on Activity flip** | Apply H1's verified reparent pattern to source-mode editor. Cache entry holds (view, ydoc, ytext, provider). On park: detach `view.dom`. On visible: re-attach + `view.focus()` + dispatch scroll-snapshot effect. | Phase 3.3. H1 FEASIBLE. |
| Must | **FR11 — Option E static Suspense fallback (full-fidelity)** | `<FallbackDocumentRender markdown={diskMarkdown} />` rendered in Suspense fallback. Disk markdown fetched via **NEW endpoint `GET /api/document-disk?docName=X`** (per Audit §B1 — `/api/document` returns live Y.Text, which defeats the fallback's purpose). Endpoint reads `fs.readFile(canonicalPath, 'utf-8')`, no Y.Doc session side-effect. Uses **SPLIT walker**: pure `packages/core/src/markdown/to-react.ts` (mdast → factory-created React-elements; no React import; ~150 LoC) + React binding `packages/app/src/editor/mdast-to-react.tsx` (imports React + fumadocs componentMap; ~50 LoC). Walker delegates parse to `MarkdownManager.parse(md)` (already includes Phase A restoreFromMdx + Phase B merged walker). Handler coverage required: paragraph, heading, text, strong, emphasis, inlineCode, code, list, listItem, blockquote, link, image, thematicBreak, break, delete, table, row, cell, html, yaml/toml (skip), mdxJsxFlowElement, mdxJsxTextElement, **wikiLink** (OK-specific), **rawMdxFallback** (OK-specific). ComponentMap is a TRANSFORMATION of `docs/src/mdx-components.tsx:11-26` — spreads `defaultMdxComponents` from `fumadocs-ui/mdx` + 13 additional bindings (runtime resolution). **Behavioral clauses (per Audit §B8):** (a) Skip-fallback fast path: if syncPromise resolves `< 200 ms prod`, skip fallback render entirely. (b) Per-session mount tracking: once a doc's cache entry exists, revisit path NEVER renders fallback — reparents directly. (c) Hydration timeout: if syncPromise rejects at 30s, DocumentErrorBoundary's "Try again" UI composites OVER fallback (fallback stays rendered as backdrop). **Mermaid carve-out (per Audit §B9):** fixed-aspect placeholder `<div style={{aspectRatio: '16/9', minHeight: 200}}>` with `<pre>` source + `role="status"` label. Layout shift on hydrate accepted for mermaid only; 1.5 MB lib ships post-fallback-paint. | Phase 4.1. Custom walker LoC revised to **400-600** per Audit §B5. |
| Must | **FR12 — Option G provider pre-warm on sidebar hover** | On sidebar item hover with ≥ 80 ms intent debounce, call `ProviderPool.prewarm(docName)` which opens a HocuspocusProvider without assigning it to an Activity. On click, connection is already sync'd — shaves ~2 s off perceived cold-load. Rate-limit to 3 concurrent pre-warms. **Interaction with MAX_POOL (per Audit §S4):** prewarms cannot evict any doc currently in Activity mount list. Prewarms enter cache at LRU-oldest position (evictable before any user-initiated navigation). If cache is at `MAX_POOL - ACTIVITY_MOUNT_LIMIT` (= 7), new prewarms are deferred until an LRU slot is freed. | Phase 4.2. |
| Should | **FR13 — Size telemetry at mount** | Per-editor mount emits `ok/cold/editor-mount-stats` with `{ viewCount, bytes, cacheHit }`. Feeds cache policy (FR3) and future telemetry (NG6). | Phase 5. |
| Should | **FR14 — Prod-baseline regression gate** | CI captures cold-load / cold-pool-warm / mode-toggle / warm-switch prod baselines for README + IDEAL-EDITOR + STORIES. Regression gate at `2× p50 baseline` per CLAUDE.md Playwright perf convention. | Phase 5. |
| Should | **FR15 — Emergency kill switch (NEW per Audit §B10)** | `packages/app/src/editor/editor-cache.ts` exports module-level constant `CACHE_ENABLED: boolean = true`. When `false`, `mountEditor()` falls through to pre-V2 behavior (create new Editor, destroy on unmount). `parkEditor()` becomes no-op; `evictEditor()` calls destroy. Deployable via 1-line code edit — NOT a feature flag, NOT a config system, NOT gradual rollout. Purely a fire-drill escape hatch for production incident response. Preserves atomic-rollout directive while bounding blast radius. | Phase 1.1. Tested once in Phase 5 (flip → confirm pre-V2 behavior restored → flip back). |

### Non-functional requirements

- **Performance:** See §2 G1–G5. All targets stated in prod-build terms (not dev). Dev-mode numbers in evidence/ are context only.
- **Reliability:** V2 cache eviction under memory pressure (FR3 size-aware policy) protects against runaway memory. SyncTimeoutError + DocumentErrorBoundary continue to catch provider failures (existing precedent #18(e)).
- **Security/privacy:** No new attack surface. Option E's walker uses `new Function()` for MDX expression attrs — same trust level as MDX authoring (documented in SECURITY note of §9 below).
- **Operability:** Perf instrumentation per precedent #24. `ok/cold/*`, `ok/render/*`, `ok/vitals/*` marks. Cold-load telemetry standard (NG6) is follow-up spec.
- **Cost:** +21 KB gzip for fumadocs-ui components in fallback bundle (H2 measured). Dynamic imports per component defer ~20 KB to post-fallback-paint. Not a ship-blocking cost.

## 7) Success metrics & instrumentation

- **Metric M1 — Warm-switch wall-clock P95.** Baseline (dev, measured): PROJECT cache miss = 9.41 s; cache hit (target) = no measurement today — V2 introduces this path. Target: `< 200 ms prod` for docs ≤ 200 views. Instrumentation: `ok/activity/revisit-wall-clock` mark wrapping reparent + focus + scroll-snapshot dispatch.
- **Metric M2 — Cold-pool-warm P95 prod.** Baseline: README 192 ms / IDEAL-EDITOR 76 ms / STORIES 541 ms. Target: STORIES `< 300 ms` post-V2. Instrumentation: existing `coldPoolWarmMs` scenario in perf harness.
- **Metric M3 — Cold-load P95 prod.** Baseline: README 961 ms / IDEAL-EDITOR 946 ms / STORIES 1845 ms. Target: STORIES `< 1500 ms` post-Option E. Instrumentation: existing `coldLoadMs` scenario.
- **Metric M4 — Mode-toggle P95 prod.** Baseline: PROJECT CV:hidden probe 204 ms first / 115 ms repeat dev. Target: `< 200 ms prod`. Instrumentation: existing `modeToggleMs` scenario.
- **Metric M5 — Perceived first-paint (Option E) P95 prod.** Baseline: N/A (fallback not shipped). Target: `< 500 ms prod`. Instrumentation: new `ok/render/fallback` mark emitted on FallbackDocumentRender mount.
- **Metric M6 — Cache hit rate.** Operational metric. Instrumentation: `ok/cache/hit` vs `ok/cache/miss` count in emission stream.

What we will log/trace:
- Per-editor mount: `{ viewCount, bytes, cacheHit, docName }`
- Cache evictions: `{ reason: 'size' | 'lru' | 'manual', victim: docName }`
- Fallback renders: `{ durationMs, componentCount, bytes }`

## 8) Current state (how it works today)

### 8.1 Measured cold-mount attribution (HIGH confidence)

Direct measurement on PROJECT.md cold-pool-warm (cold-mount-profile REPORT.md §Corrected 5-component attribution, variance < 1 % across 2 runs):

| Component | Measured cost | % of 7.70 s longtask | Confidence |
|---|---:|---:|---|
| TipTap `Editor.mount` sync core (schema, extension build, PM plugin compose, `new EditorView` ex-forceRerender) | ~200 ms | 2.6 % | HIGH |
| y-prosemirror `_forceRerender` (Y.XmlFragment → PM fragment, 39 K top-level Y.XmlElements) | ~300 ms | 3.9 % | HIGH |
| `PureEditorContent.init` + `EditorView.setProps({markViews, nodeViews})` + 768 `ReactMarkViewRenderer` constructions | ~440 ms | 5.7 % | HIGH |
| **React render-phase reconciliation of 768 MarkView portals** | **~2.2 s** | **28.5 %** | HIGH |
| **Browser style + layout for 39 K PM DOM nodes + 768 MarkView sub-trees** | **~2.5–3.0 s** | **32–39 %** | MEDIUM |
| React commit + `setTimeout(0)` macrotask + paint + GC (residual, by subtraction) | ~1.4 s | 18.2 % | LOW |

**Reversal from prior inferred breakdown:** Previous informal framing had "PM DOM construction ~3 s" as dominant cost — that was inferred before direct measurement. Measured: **React reconciliation of 768 MarkView portals (~2.2 s) + browser layout (~2.5–3.0 s) together account for ~65 % of the 7.70 s longtask**. TipTap/PM/y-prosemirror synchronous cost is a modest ~640 ms (~8 %).

**Implication for V2 scope:** the biggest lever is Alt 5 InteractionLayer (collapses per-instance React MarkView cost) combined with V2 cache (preserves DOM, avoids re-paying browser layout on revisit). Either one alone is insufficient — together they attack the two dominant cost components.

### 8.2 Size-to-cost scaling curve (HIGH confidence)

Direct measurement across 6 documents (grey-zone-and-prod-floor Part A + size-spectrum-profile):

| Doc | Bytes | PM chars | Views | cold-pool-warm (dev) | Verdict |
|---|---:|---:|---:|---:|---|
| README | 5.6 K | 4.5 K | 5 | 424* ms | Acceptable |
| MDX-ROUNDTRIP | 12 K | 9 K | 30 | 308 ms | Acceptable |
| IDEAL-EDITOR | 43 K | 37 K | 35 | 564 ms | Acceptable (borderline) |
| **ARCHITECTURE** | **111 K** | **67 K** | **0** | **185 ms** | **Snappy** |
| **AGENTS** | **155 K** | **142 K** | **8** | **423 ms** | **Acceptable** |
| STORIES | 530 K | 470 K | 176 | 2297 ms | Unacceptable |
| PROJECT | 3250 K | 270 K | 768 | 9416 ms | Unacceptable |

Regression fit: `CPW ≈ 185 + 10.6·views + 1.8·bytes_KB`. **View-count coefficient dominates bytes by ~6×.** Acceptable→Unacceptable boundary sits at ~100 views, not at a byte threshold.

Marginal per-view cost: ~2 ms/view across 30–768 views (size-spectrum-profile §Exec Summary finding 5). α ≈ 10.6 ms/view in the regression fit is an artifact of the 6-point fit across a wider range; the ~2 ms/view direct marginal is the load-bearing number for V2 gate calibration.

### 8.3 Production vs dev delta (HIGH confidence)

Production build measurements (grey-zone-and-prod-floor Part B, variance < 1 % across 2 runs per scenario):

| Doc | Dev cold-load | Prod cold-load | Dev CPW | Prod CPW |
|---|---:|---:|---:|---:|
| README | 1098–2453 ms | **961 ms** | 424* ms | **192 ms** |
| IDEAL-EDITOR | 1375 ms | **946 ms** | 564 ms | **76 ms** (anomaly†) |
| STORIES | 3791–9929 ms | **1845 ms** | 2297 ms | **541 ms** |

† IDEAL-EDITOR prod CPW at 76 ms is anomalously low — likely Activity visibility-flip (not truly cold) rather than cold-pool-warm semantics. OQ documented in §11.

**Implications:**
- Cold-load floor is ~950 ms prod (bundle + hydrate + Suspense resolve bound — not doc-specific below ~50 KB).
- CPW floor is ~190 ms prod.
- **STORIES prod cold-load 1845 ms is STILL Unacceptable** even after prod optimization — V2 Alt 5 + Option E remain load-bearing.
- StrictMode 2× mount contribution is ~5–6 % of dev→prod delta (small). Rest is React prod reconciler + no HMR + no Y.Doc disk re-parse.

### 8.4 Known gaps

- **Precedent #18(b) is partially false for TipTap** (HIGH confidence; S2 diagnosis + tiptap-large-doc-patterns §Q1 Editor.mount analysis). States "navigation between already-pooled items becomes a visibility flip" but TipTap's `useEditor.scheduleDestroy(1 ms)` destroys the editor on Activity hidden. Requires corrigendum (see `evidence/precedent-18b-corrigendum.md`).
- **Activity-hidden Y.js observers do NOT pause** (precedent #18(c) already documents; reinforces need for FR3 size-aware cache policy).
- **CM6 has no documented mount/unmount API** (tiptap-large-doc-patterns §Q4). H1 empirically established reparent is safe (12/12 tests) but contract lived only in `/tmp/` — promoted to `evidence/cm6-reparent-contract.md`.

## 9) Proposed solution (5-phase dependency-ordered topology)

**Implementation order is load-bearing:** Phase 2 cannot start before 1.3 (InteractionLayer primitive doesn't exist yet). Option E (4.1) depends on V2 cache's mount semantics (1.1). Size policy (1.2) depends on the cache existing to evict from.

```
Phase 1 — Primitives (no consumers yet; foundation)
  1.1  V2 Editor cache module (module-level Map<docName, Editor>,
       Editor.mount/unmount wrapper, destroy-on-evict contract)
  1.2  Size-aware cache policy (measured views + bytes; eviction)
  1.3  InteractionLayer primitive (editor-root React plane,
       activeNodeId routing, plain-DOM chip contract)

Phase 2 — Consumer migrations (use the primitives)
  2.1  Port InternalLink → InteractionLayer (validates mark path)
  2.2  Port WikiLink → InteractionLayer (structural twin)
  2.3  Port RawMdxFallback → InteractionLayer (validates NodeView path)
  2.4  Port JsxComponent → InteractionLayer (CB-v2 forward-compat)

Phase 3 — Orthogonal surfaces (parallel to Phase 2; no dep on 2.x)
  3.1  §8b content-visibility: hidden swap (empirically validated)
  3.2  Precedent #18(b) corrigendum + precedent #18(h) addition
  3.3  CM6 re-parent-without-destroy

Phase 4 — Cold-load UX (depends on Phase 1.1)
  4.1  Option E: static markdown render in Suspense fallback
  4.2  Option G: pre-warm provider on sidebar hover

Phase 5 — Telemetry & gates
  5.1  Prod-mode baselines for all revised ACs
  5.2  Per-doc view-count + bytes measured at mount
```

### 9.1 V2 Editor cache — contract (Phase 1.1)

Reference implementation in `evidence/cm6-reparent-contract.md` (§5.1 of H1 REPORT). TipTap-side is symmetric: the Editor instance holds its own `view.dom`; the React binding (`<TiptapEditor>` component) is a thin wrapper that calls `mountEditor(docName, containerRef.current)` on mount and `parkEditor(entry, parkingNode)` on unmount. **Do NOT call `editor.destroy()` on component unmount** — only `evictEditor(docName)` on cache eviction.

Key invariants (from H1 §5):
1. Module-level `Map<docName, CachedEditor>` survives React remounts, SPA nav, Activity mode flips.
2. `parkEditor()` reparents `.dom` to a detached parking node. Editor keeps running (local observers + plugins process Y.Doc events), but **provider is DISCONNECTED (`provider.disconnect()`) if this editor is NOT in the `ACTIVITY_MOUNT_LIMIT = 3` MRU mount list** (FR3b). CRDT updates don't arrive from peers while provider is disconnected. Painting stops.
3. `mountEditor()` on cache-hit: reparents `.dom` to new container. Focus restored (`editor.focus()` / `view.focus()`). Scroll restored from `scrollTop` persisted on cache entry at `parkEditor()` time (coupling scroll to cache entry, per Audit §S2). If provider was disconnected: `provider.connect()` + await sync; awareness re-broadcasts local presence.
4. `evictEditor()` is the ONLY path that calls `editor.destroy()` / `view.destroy()` / `ydoc.destroy()` / `provider.destroy()`.
5. **Kill switch (FR15):** `CACHE_ENABLED` constant at module top branches `mountEditor` / `parkEditor` / `evictEditor` behavior. When `false`: pre-V2 pattern (create on mount, destroy on unmount). Emergency escape hatch only.

### 9.2 InteractionLayer primitive (Phase 1.3) — novel architecture

**Problem being solved:** per-instance `ReactMarkViewRenderer` / `ReactNodeViewRenderer` for InternalLink + WikiLink + RawMdxFallback + JsxComponent creates 768 React portals on PROJECT (~2.2 s reconciliation cost). Each portal's React subtree includes Radix Dialog + Dropdown + Tooltip primitives (5 `useState` + 3 `useId` + ~10 `useRef` per instance for InternalLinkView).

**Shape:**

```
<Editor>
  ↓ renders
<EditorContainer>
  <PMDom />                               ← plain-DOM chips for simple marks
  <InteractionLayer>                      ← singleton plane at editor root
    <ActivePropPanel nodeId={activeNodeId} />
    <ActiveToolbar nodeId={activeNodeId} />
    <ActiveBreadcrumb nodeId={activeNodeId} />
  </InteractionLayer>
</EditorContainer>
```

Registrations: `interactionLayer.register(nodeId, { type, getPos, handlers })` called from node/mark setup (not from React). Plain-DOM chips render via `renderHTML({ HTMLAttributes })` — zero React. Each chip carries `data-mark-id` (for marks) or `data-node-id` (for NodeViews) set at render time from mark-identity PluginState lookup. On click/hover/touch, event delegation on editor root dispatches to InteractionLayer based on that attribute. Layer's active state: single `useState<{ nodeId, type } | null>`.

**Mark-identity via PluginState (FR4b).** PM marks have no stable identity — text nodes merge/split; ranges move; attrs don't carry UUIDs. Solved with `markIdentityPlugin`: PM plugin maintaining `PluginState<WeakMap<PmMarkInstance, string>>`. On every `appendTransaction`, walks doc; for each InternalLink/WikiLink mark whose identity (derived from `{markType, attrs, from, to}`) lacks a WeakMap entry, assigns `'m' + ++counter` and stores. Mark split/merge/move: new span gets fresh ID (old WeakMap entry GC'd). Plugin fires `interactionLayer.register()` / `.deregister()` on state changes. Chip render reads mark-id from PluginState lookup; PM transactions that move chips regenerate `data-mark-id` attrs naturally via PM's re-render cycle. Pattern mirrors CB-v2 §9.15 Q10 Option A (bridgeId via PluginState, not schema attr) — precedent #9 add-only-schema preserved.

**Two modes for the layer's interior:**
- **Simple marks (InternalLink, WikiLink):** plain-DOM chip (`<span>` with `contenteditable="false"` + `touch-action: manipulation`) + shared Popover triggered by activeNodeId. Collaborator cursor decorations render OUTSIDE the chip (on surrounding paragraph), consistent with existing contenteditable=false NodeViews.
- **Rich NodeViews (RawMdxFallback, JsxComponent):** per-instance live React render (required for fumadocs component mounting) + shared PropPanel at layer root. This bifurcation is load-bearing — JsxComponent MUST render per-instance because fumadocs components are React.

**V2 ships PropPanel only; Toolbar + Breadcrumb are extension points** (per Audit §S15 scope tightening). V2's extensions (InternalLink, WikiLink, RawMdxFallback) wire PropPanel. CB-v2's `JsxComponentView` wires Toolbar + Breadcrumb at CB-v2's integration time — the primitive supports additional singleton slots via the same `register({ type, nodeId, controls: { propPanel, toolbar, breadcrumb } })` shape.

**Cost model (rewritten per Audit §B13 — separate savings by mechanism):**

| Optimization | Attacks | Savings |
|---|---|---|
| **InteractionLayer (FR4–FR8)** | React reconciliation of per-instance MarkView/NodeView portals | ~2.2 s on PROJECT cold-pool-warm (768 × ~2.8 ms/view reconciliation → 1 × shared plane) |
| **V2 Editor cache (FR1–FR2)** | Browser style + layout on cold-pool-warm revisit | ~2.5–3.0 s on PROJECT (preserves 39 K PM DOM nodes + 768 chip subtrees across nav; first cold mount still pays, subsequent revisits reparent DOM without re-rendering) |
| **§8b content-visibility: hidden (FR9)** | Browser style + layout on MODE TOGGLE (Visual ↔ Source) | 576 → 204 ms measured (CV:hidden probe). Does NOT help cold-mount; orthogonal. |
| **Option E (FR11)** | Perceived first-paint — doesn't save work, hides it | ~950 ms prod cold-load floor → ~500 ms perceived fallback paint |

Total cold-pool-warm improvement (MEASURED 7.70 s longtask → target < 500 ms prod P95 for STORIES) requires ALL three (InteractionLayer + V2 cache + §8b) acting together. Pre-chip-cost verification pending in Phase 2.1 (probe: hand-build a 768-chip test page, measure plain-DOM layout cost; spec assumes < 0.5 ms/chip but empirical check required).

For CB-v2 forward compat (FR8): JsxComponent's NodeView-side render remains per-instance (fumadocs component + `<NodeViewContent />`). PropPanel / Toolbar / Breadcrumb move to InteractionLayer. ContextBridgeProvider chain wraps the per-instance render as CB-v2 §9.15 specifies — unchanged.

### 9.3 Option E full-fidelity fallback (Phase 4.1)

**IMPORTANT CORRECTION to prior research:** `option-e-utilities.md` (Opus subagent output) recommended `hast-util-to-jsx-runtime` with `passThrough: ['mdxJsxFlowElement']`. **Empirically WRONG** per H2 probe — that path fails with `Cannot handle MDX estrees without createEvaluater` as soon as a JSX attr uses an expression (`items={['TS','JS']}`). See `evidence/option-e-utilities.md` Corrections Appendix + `evidence/h2-fumadocs-standalone-probe.md` §"Markdown-to-React pipeline" for the empirical failure.

**Correct implementation:** SPLIT custom walker (per Audit §B2 — core's "No React deps" invariant preserved):
- `packages/core/src/markdown/to-react.ts` — PURE mdast walker (~150 LoC). Accepts `createElement(type, props, ...children)` factory + componentMap as parameters. **NO React import.** Environment-agnostic: runs in browser, Node, Worker, or any runtime with a React-like factory.
- `packages/app/src/editor/mdast-to-react.tsx` — thin React binding (~50 LoC). Imports React, provides `React.createElement` as factory, imports fumadocs componentMap, exports `markdownToReact(md: string): React.ReactElement`.

Reference walker at `evidence/reference-walker-from-h2.tsx` (copied from H2 probe). **LoC estimate revised to 400-600** per Audit §B5 (original 200 LoC reference was proof-of-concept missing wikiLink, rawMdxFallback, full defaultMdxComponents spread, ImageZoom/Mermaid/TypeTable, and using strict `remarkMdx` vs OK's agnostic variant).

**Required handler coverage:** paragraph, heading, text, strong, emphasis, inlineCode, code, list, listItem, blockquote, link, image, thematicBreak, break, delete, table, row, cell, html, yaml/toml (skip), mdxJsxFlowElement, mdxJsxTextElement, **wikiLink** (OK-specific), **rawMdxFallback** (OK-specific).

Pipeline:

```
markdown bytes (from GET /api/document-disk?docName=X — NEW endpoint; reads fs.readFile directly; no Y.Doc session)
  → MarkdownManager.parse(md)  [includes Phase A restoreFromMdx + Phase B merged walker — see CLAUDE.md §Markdown Pipeline]
  → mdast (with mdxJsxFlowElement/mdxJsxTextElement/wikiLink/rawMdxFallback nodes)
  → packages/core/src/markdown/to-react.ts walker: each node → createElement(tag|component, props, ...children)
  → (in app binding) React tree with real fumadocs Callout/Tabs/Accordion/Steps/Files/Card/Cards
```

**Data source (per Audit §B1 — original spec claim of file-watcher cache or `/api/document` was falsified; both return live Y.Text or are content-less):** NEW HTTP endpoint `GET /api/document-disk?docName=X` in `packages/server/src/api-extension.ts`:
- Validates docName via file-watcher index (404 if not found)
- Returns `fs.readFile(canonicalPath, 'utf-8')` as `{ markdown: string, mtime: number, bytes: number }`
- No Y.Doc session creation, no file-watcher mutation
- Symlink-safe (resolves realpath via existing `resolveRealpath` helper)

**ComponentMap (per Audit §S14 — "portable as-is" claim was false):** TRANSFORMATION of `docs/src/mdx-components.tsx:11-26`. Spreads `defaultMdxComponents` from `fumadocs-ui/mdx` + 13 additional bindings (Callout, Tabs, Accordion, Steps, Card, Files, Folder, ImageZoom, Mermaid, TypeTable, etc.). Spread resolution runs at runtime; exported as `getMDXComponents(additional?) → Record<string, ComponentType>`. Located at `packages/app/src/editor/componentMap.ts`. Imports directly from `docs/src/mdx-components.tsx` when possible (single source of truth per Audit §F2); otherwise duplicates the structure with explicit test covering parity.

**Fallback render behavior (per Audit §B8):**
- **Skip-fallback fast path:** if syncPromise resolves `< 200 ms prod`, skip fallback render entirely. Suspense fallback only renders if syncPromise remains pending at 200ms.
- **Per-session mount tracking:** once a doc has been mounted in current session (cache entry exists), revisit path NEVER renders fallback — reparents cached editor directly.
- **Content-comparison guard:** if disk-fetched markdown differs from cache entry's last-known-markdown, prefer in-memory version to avoid content regression.
- **Hydration timeout (per Audit §S11):** if syncPromise rejects at 30 s, DocumentErrorBoundary's "Try again" UI composites OVER fallback (fallback stays rendered as backdrop, not replaced).

**Mermaid carve-out (per Audit §B9):** fixed-aspect placeholder `<div style={{aspectRatio: '16/9', minHeight: 200}}>` with `<pre>` of source + `role="status"` label. Layout shift on hydrate accepted for mermaid only (1.5 MB lib not worth fallback-chunk ship). All other components render real in fallback.

**Node-path alternative was evaluated and REJECTED.** Probe `b8vgi4rpc` evaluated `@fumadocs/local-md` (bundleless runtime, claimed "virtual JS engine" avoiding eval). Findings (HIGH confidence, 8 empirical probes + source-level read):
1. **"No eval()" is CONDITIONAL.** Only for `.md` files. `.mdx` path is `new AsyncFunction(...)` (dist/index.js:178-192) — byte-identical to mdx-remote. Source comment at line 180: `Note: unsafe by design`.
2. **Virtual JS engine requires estree-annotated mdast.** OK's `remarkMdxAgnostic` (chosen for R1/R6/R8 crash-class resistance) produces `mdxJsxAttributeValueExpression { value: '<raw string>' }` with NO `data.estree`. Local-md fails with the same `Cannot handle MDX estrees without createEvaluater` error H2 saw. The only fix re-adds acorn parsing — which negates the agnostic-mode crash resistance OK ships today.
3. **No duplication win.** docs/ shares zero source with `packages/core/src/markdown/` — they render different content. 85% (3,665 LoC) of OK's markdown pipeline encodes invariants no general-purpose renderer implements.
4. **Architectural cost.** Node-path adds HTTP round-trip to a 950 ms cold-load budget — degrades the flow whose entire purpose is to CUT perceived TTI.

**Forward-compat placement:** walker file lives at `packages/core/src/markdown/to-react.ts` (NOT `packages/app/`). Environment-agnostic (mdast → React, no DOM access). Serves future MCP render-preview, read-only mode, CLI export consumers with zero refactor.

See `evidence/mdx-remote-node-path-probe.md` for full 287-line REPORT.

**SECURITY note:** walker uses `new Function()` to eval simple expression attrs. Trust level = MDX authoring itself. Documented + isolated to the walker module.

**Mermaid carve-out:** mermaid (~1.5 MB lib) renders a placeholder in fallback, defers to post-hydration. All other components render real in fallback.

### 9.4 Alternatives considered

| Option | Why rejected |
|---|---|
| **A. Stay on precedent #18 + accept 9.7 s cold-mount** | Contradicts greenfield directive ("not optimizing for expediency"). Does not solve G1–G3 for STORIES/PROJECT. |
| **B. Fork PM for chunked async mount** | Multi-week effort + permanent maintenance burden. Marijn has refused the pattern upstream (4 primary sources). |
| **C. Worker-assisted markdown parse only** | Bounded 1–2 s savings of 9.7 s (MEDIUM per non-blocking-research §Dive 6). Doesn't close G3 gap. No OSS precedent for TipTap/Yjs. Deferred to NG3. |
| **D. `@mdx-js/mdx` `evaluate()` for Option E** | 500 KB bundle + Function-constructor eval + React-reconciliation pitfall (MDXContent must be called as function, not rendered as JSX element). Custom walker is strictly better. |
| **E. `hast-util-to-jsx-runtime` for Option E** | Empirically errors on MDX expression attrs (H2 probe). Custom walker is the correct path. |
| **F. Full RSC adoption** | Moves editor off Vite SPA — architectural change too big for this spec. NG4. |

---

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D0 | V2 spec combines cache + InteractionLayer + CV:hidden + CM6 reparent + Option E + Option G into one monolithic spec with dependency-ordered 5-phase topology | X | **LOCKED** | NO | Greenfield directive + AI coding agent absorbs ~15 engineer-days in one sprint; monolithic spec keeps architectural coherence | User directive 2026-04-20 ("anything that is not Future Work will be done in the same execution sprint"); see §9 | All phases ship together or not at all |
| D1 | Alt 5 InteractionLayer scope = all 4 React-view extensions (InternalLink + WikiLink + RawMdxFallback + JsxComponent) + view-count-measured gate at `N=50` | T | **LOCKED** | YES | 6-point scaling curve shows view-count dominates bytes 6× (grey-zone-and-prod-floor Part A); CB-v2 ships JsxComponent NodeView 5–10× heavier than InternalLink; greenfield directive rejects deferred migrations | `evidence/size-spectrum-profile.md` §Exec Summary finding 5; `evidence/grey-zone-and-prod-floor.md` §Part A fit | Phase 1.3 + Phase 2.1–2.4 all in scope |
| D2 | Prod-mode calibration for all ACs (G1–G5). Dev numbers in evidence/ are context only | T | **LOCKED** | NO (evolvable) | Dev→prod delta is 2–7× on CPW and 1.3–5× on cold-load (grey-zone-and-prod-floor Part B). "Fix perf in dev" over-targets. | `evidence/grey-zone-and-prod-floor.md` §Part B dev-vs-prod deltas table | Redo baselines in prod before final sign-off |
| D3 | CM6 cache via reparent-without-destroy (FR2, FR10) | T | **LOCKED** | YES | H1 probe 12/12 tests pass, zero console errors; Marijn endorses reparent pattern on discuss.codemirror.net; y-codemirror.next zero DOM coupling | `evidence/h1-cm6-reparent-probe.md` §Exec Summary + §4.2 results | Phase 3.3 ships |
| D4 | Option E shape = full-fidelity fumadocs fallback via **SPLIT** custom walker (pure mdast→React factory in `packages/core/src/markdown/to-react.ts`, ~150 LoC, NO React dep; thin React binding in `packages/app/src/editor/mdast-to-react.tsx`, ~50 LoC). Total ~400-600 LoC after full node coverage + fixture tests. NOT `hast-util-to-jsx-runtime`, NOT `@fumadocs/local-md`. | T | **LOCKED (revised 2026-04-20 per Audit §B2, §B5)** | YES | H2 probe proved `hast-util-to-jsx-runtime` errors on MDX expression attrs (`Cannot handle MDX estrees without createEvaluater`). Node-path probe (b8vgi4rpc) proved `@fumadocs/local-md`'s "no eval()" is conditional — `.mdx` path uses `new AsyncFunction()` identically to `mdx-remote`; `.md` path's virtual-JS engine requires estree-annotated mdast which OK's agnostic-MDX pipeline (`remarkMdxAgnostic`, chosen for R1/R6/R8 crash-class resistance) does NOT produce. docs/ shares zero source with `packages/core/src/markdown/` — no duplication win for Node-path. **SPLIT rationale (Audit §B2):** placing walker in `packages/core/` alone would import React, violating CLAUDE.md's "Package: core — No React or Node.js server dependencies — browser + Node compatible" invariant. Split preserves forward-compat (MCP render-preview / CLI export consume pure core module with their own factory) while honoring core's boundary. | `evidence/h2-fumadocs-standalone-probe.md` §"Markdown-to-React pipeline"; `evidence/mdx-remote-node-path-probe.md` §TL;DR + §Part 1 virtual-JS engine analysis; `evidence/option-e-utilities-CORRECTIONS.md`; `evidence/audit-findings-resolution.md` §B2, §B5 | Phase 4.1 LOCKED to split walker. Pure core walker takes `createElement` factory + componentMap as params. App binding imports React + fumadocs map. |
| D5 | Size policy = view-count primary (N=50 threshold) + byte-count secondary (500 KB for multi-MB prose outliers) | T | **LOCKED** | NO (tunable) | Grey-zone-and-prod-floor Part A established view-count as dominant axis; existing `LARGE_DOC_CHAR_THRESHOLD = 500_000` in `EditorActivityPool.tsx` misclassifies | `evidence/grey-zone-and-prod-floor.md` §V2 scope implication | FR3 encodes both gates; tunable constants |
| D6 | Precedent #18(b) corrigendum text LOCKED; lands as FIRST commit of V2 impl sprint (Phase 3.2). NOT a standalone commit on `perf/investigation` beforehand. | X | **LOCKED (revised 2026-04-20)** | NO | User directive: ship V2 end-to-end in one go. Original calendar-wedging rationale for separate commit no longer applies. Atomic delivery = one PR = single review surface. Corrigendum text already drafted. | User directive 2026-04-20 ("ship this end to end in one go, complete"); `evidence/precedent-18b-corrigendum.md` | Sprint commit 1: docs(CLAUDE): precedent #18(b) corrigendum. Sprint commit 2+: V2 feature work |
| D7 | Precedent **#18(g)** candidate = CM6 reparent contract. Promoted at V2 ship time. | X | **DIRECTED (revised 2026-04-20 per Audit §S10)** | NO | Reusable pattern for any future CM-in-PM nested editor (per CB-v2 §9.14 Precedent #24 — same principle). **Letter correction:** existing CLAUDE.md precedent #18 has sub-rules (a)-(f); new addition is (g), not (h). **Shape correction:** rewritten to match existing #18 sub-rule format (concise paragraph ~300 chars, bold prefix, pointer to full artifact) per Audit §S10 — not the 1200-char original that was a structural outlier. Full contract remains in `evidence/cm6-reparent-contract.md` §1-10; §11 holds the concise precedent text. | `evidence/cm6-reparent-contract.md` §11; `evidence/audit-findings-resolution.md` §S10 | Add #18(g) to CLAUDE.md §Architectural precedents at V2 ship |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Should Option E use browser-side custom walker or `@fumadocs/local-md` Node-side render? Architectural unification implication for G7 | T | P0 | NO (resolved) | **RESOLVED 2026-04-20 via probe b8vgi4rpc** (8 empirical probes + source-level read of local-md@0.1.1 + mdx-remote + next-mdx-remote). Verdict: keep browser walker. local-md's "no eval()" is conditional (only `.md` path; `.mdx` uses `new AsyncFunction()` identically to mdx-remote). Local-md's renderer fails on OK's agnostic-MDX mdast (no `data.estree` on `mdxJsxAttributeValueExpression`). docs/ and editor render DIFFERENT content (zero shared source with `packages/core/src/markdown/`) — no duplication win. Forward-compat: hoist walker to `packages/core/src/markdown/to-react.ts` (not `packages/app/`). See `evidence/mdx-remote-node-path-probe.md` | **Resolved** |
| Q2 | What's the right Option G hover intent threshold? 80 ms, 150 ms, other? | T | P2 | NO | Ship with 80 ms default; add post-ship telemetry task to measure actual hover→click latency distribution; recalibrate | Deferred to post-ship |
| Q3 | IDEAL-EDITOR prod CPW 76 ms is 2.5× faster than README prod CPW 192 ms — is this Activity visibility flip masking a cold path? | T | P1 | NO | Focused ablation: re-run cold-pool-warm with explicit eviction between README and IDEAL-EDITOR. If 76 ms holds, semantics of "cold-pool-warm" need updating | Flagged for pre-finalization |
| Q4 | Cold-load telemetry standard à la Affine (20 s / 60 s escalation)? | X | P2 | NO | Follow-up perf-telemetry spec. Cheap addition under precedent #24. Not blocking V2 | Deferred (NG6) |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | TipTap 3.22.x's `Editor.mount()`/`Editor.unmount()` APIs work as documented for reparent-without-destroy (not just React-tick-alignment) | MED | **Phase 1.0 spike probe (NEW, per Audit §B12):** replicate H1 probe structure for TipTap. Drive Editor with full production extension stack (sharedExtensions + Collaboration + CollaborationCursor + y-tiptap + image-upload + clipboard serializer). 12 test scenarios mirroring H1 §4.2. Gate Phase 1.1 on probe passing. **Fallback ladder:** (1) if `Editor.mount/unmount` doesn't preserve state → use raw `editor.view.dom` reparent (symmetric to H1 CM6 pattern; verified via probe). (2) If BOTH fail → V2 cache for TipTap is INFEASIBLE; escalate before Phase 1.1. Pre-V2 destroy+recreate behavior remains the fallback-fallback. | Phase 1.0 (pre-1.1 gate) | Active |
| A2 | The ~2 ms/view marginal cost measured at 30–768 views extrapolates downward to 50 views (our gate threshold) | HIGH | Measured across 30→768 view range; fit is linear; 50 is inside the measured range | Before Phase 1 ships | Active |
| A3 | Cached markdown snapshot for Option E fallback can be fetched from `/api/document?docName=X` before Y.Doc sync completes | MED | Verify during Phase 4.1 impl: endpoint exists in server (per AGENTS.md API table) — confirm it returns disk bytes, not live Y.Text, for the cold-load case | Before Phase 4.1 ships | Active |
| A4 | +21 KB gzip for fumadocs-ui components in fallback chunk is acceptable given code-split | HIGH | H2 measured; Vite chunk boundary analysis during Phase 4.1 | Before Phase 4 ships | Active |
| A5 | View-count measured at mount-time (post-parse, post-decoration-attach) is accurate and cheap | **LOW (revised 2026-04-20 per Audit §B11)** | No probe measured the measurement cost. Per spec's own confidence taxonomy, unmeasured claims are LOW. Phase 1.2 implementation must measure `ok/cache/view-count-measure-ms` on PROJECT-scale docs. If > 20 ms per mount, cache view-count at parse-time (stored on cache entry) rather than measuring on mount. | Before Phase 1.2 ships | Active |

## 13) In Scope (implement now)

All 14 Functional Requirements (FR1–FR14), dependency-ordered per §9 5-phase topology. Non-functional requirements per §6. Evidence-based ACs calibrated to prod terms per Decision D2.

**File-level scope (revised 2026-04-20 per Audit findings):**

- `packages/app/src/editor/editor-cache.ts` — NEW: V2 cache module (FR1, FR2, FR3, FR3b, FR15 kill switch)
- `packages/app/src/editor/interaction-layer.tsx` — NEW: InteractionLayer primitive (FR4)
- `packages/app/src/editor/extensions/mark-identity-plugin.ts` — NEW: Mark-identity PluginState (FR4b per Audit §B4)
- `packages/app/src/editor/extensions/internal-link.ts` — MODIFY: port to InteractionLayer (FR5)
- `packages/app/src/editor/extensions/wiki-link-source.ts` — MODIFY: port to InteractionLayer (FR6)
- `packages/app/src/editor/extensions/InternalLinkView.tsx` — DELETE (replaced by InteractionLayer)
- `packages/app/src/editor/extensions/WikiLinkView.tsx` — DELETE (replaced by InteractionLayer)
- `packages/core/src/extensions/raw-mdx-fallback.ts` — MODIFY: port to InteractionLayer (FR7)
- `packages/core/src/extensions/jsx-component.ts` — MODIFY: port to InteractionLayer (FR8, forward-compat with CB-v2)
- `packages/app/src/components/EditorActivityPool.tsx` — MODIFY: integrate V2 cache (FR1); Activity mount-list MRU drives provider connect/disconnect (FR3b)
- `packages/app/src/components/FallbackDocumentRender.tsx` — NEW: Option E fallback (FR11)
- `packages/core/src/markdown/to-react.ts` — NEW: **PURE** mdast→React walker (FR11 pure core part; ~150 LoC; NO React import; accepts factory + componentMap as params)
- `packages/app/src/editor/mdast-to-react.tsx` — NEW: **React binding** for walker (FR11 app part; ~50 LoC; imports React + componentMap; exports `markdownToReact(md)`)
- `packages/app/src/editor/componentMap.ts` — NEW: transformation of `docs/src/mdx-components.tsx:11-26` (spread + 13 additional bindings per Audit §S14)
- `packages/app/src/editor/provider-pool.ts` — MODIFY: add `prewarm(docName)` for Option G (FR12); LRU ordering respects Activity mount list (FR12 per Audit §S4)
- `packages/app/src/components/FileSidebar.tsx` + `FileTree.tsx` — MODIFY: hover intent + pre-warm call (FR12)
- `packages/app/src/globals.css` — MODIFY: §8b `content-visibility: hidden` swap + fumadocs CSS bridge (FR9, FR11); 1-line `.fd-step::before` `top: 0` removal per H2 probe
- `packages/app/src/editor/TiptapEditor.tsx` + `SourceEditor.tsx` — MODIFY: wire cache calls (FR1, FR2)
- `packages/server/src/api-extension.ts` — **MODIFY (NEW scope per Audit §B1):** add `GET /api/document-disk?docName=X` endpoint for Option E fallback data source. Reads `fs.readFile` directly; no Y.Doc session side-effect.
- `CLAUDE.md` — MODIFY: precedent #18(b) corrigendum + add precedent **#18(g)** CM6 reparent contract (letter correction per Audit §S10) + new WARN rule about editor-outlives-React-subtree (per Audit §F3, for #18(c) interaction)

**Test infrastructure:**
- `packages/app/tests/perf/scenarios/` — new scenarios for warm-switch, cache-hit, cache-miss variants (FR14)
- `packages/app/tests/stress/*.e2e.ts` — extend ux-interactions + docs-open scenarios for InteractionLayer interactions (FR5–FR8 verification)
- `packages/app/tests/integration/bridge-matrix.test.ts` — verify cache + observer interaction (no cross-CRDT write-path regression)
- `packages/app/tests/fidelity/` — no changes required (Option E walker produces React tree, not PM JSON; fidelity is CB-v2 concern)

**Owner/DRI:** Nick Gomez.

**Next actions (ordered, per Audit findings integration):**
1. ~~Wait for Q1 probe (b8vgi4rpc) to land; integrate into D4 finalization~~ **DONE 2026-04-20 — D4 LOCKED to browser walker.**
2. ~~Spec Audit phase (parallel challenger + auditor nested Claudes)~~ **DONE 2026-04-20.**
3. ~~Spec Assess-findings phase~~ **DONE 2026-04-20 — 13 BLOCKs + 17 SHOULD-FIXes + 3 FYIs integrated. See `evidence/audit-findings-resolution.md`.**
4. Spec Verify + finalize phase (NEXT)
5. **Implementation sprint prep (before first feature commit):**
   - (a) Cherry-pick `b6c6455b` (S7-T1 createEditor mark WeakMap-anchored fix from `cold-mount-profile-instr` branch) onto sprint branch. Without this, `ok/editor/create-tiptap` instrumentation breaks dev server under React Compiler — load-bearing for FR14 Phase 5 telemetry gates.
   - (b) **Phase 1.0 spike probe (NEW per Audit §B12):** TipTap reparent probe mirroring H1. Drives Editor with full production extension stack (sharedExtensions + Collaboration + CollaborationCursor + y-tiptap + image-upload + clipboard). 12 test scenarios mirroring H1 §4.2. Gates Phase 1.1. Results written to `evidence/tiptap-reparent-probe.md`.
   - (c) Sprint commit 1: `docs(CLAUDE): precedent #18(b) corrigendum + new WARN rule + #18(g) CM6 reparent contract` (per D6 revised + D7 revised + Audit §F3)
   - (d) Sprint commit 2+: V2 feature work per 5-phase topology
6. Implementation sprint (AI coding agent, 5-phase topology per §9)

**Risks + mitigations (revised per Audit):**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A1 fails (TipTap mount/unmount actually destroys) | MED | HIGH | **Phase 1.0 spike probe gates Phase 1.1.** Fallback-1: raw `editor.view.dom` reparent (H1 CM6 pattern). Fallback-2: destroy+recreate with state snapshot (pre-V2 behavior on TipTap side; V2 cache applies to CM6 only). |
| InteractionLayer breaks some edge UX (drag-drop, keyboard nav, right-click, touch, screen-reader) | LOW | MED | Enumerated ACs under FR5/FR6/FR7/FR8 per Audit §A2.5/§A2.6. Playwright e2e coverage parity with existing `InternalLinkView` interactions is the pass bar. |
| Memory: V2 cache of large docs at N=200 views still holds 50+ MB each | MED | MED | FR3 size-aware policy (gate at mount time). Cache-miss fallback preserves pre-V2 behavior. |
| `component-blocks-v2` ships with different InteractionLayer shape | LOW | HIGH | Pinned evidence at commit `a0d86fab8cffeb7959cb838ca0ec8bc44cd6c50c`. FR8 is the contract. CB-v2 is Draft; V2 ships independently per user directive. |
| TipTap 4 breaking change to `Editor.mount/unmount` (per Audit §F1) | LOW | HIGH | V2 cache isolates TipTap-specific code to `editor-cache.ts`. Re-wire on major bump is bounded to that module. |
| Emergency production issue requires rapid rollback | LOW | HIGH | FR15 kill switch constant: 1-line code edit flips `CACHE_ENABLED = false` to restore pre-V2 behavior. Not a feature flag; deployed via normal PR. |
| Observer CPU load scales with cache size under heavy collaboration | MED | MED | FR3b: provider-disconnect for cached-but-not-Activity-mounted editors. Bounds observer load to `ACTIVITY_MOUNT_LIMIT = 3` actively-observed editors. |

**What gets instrumented/measured:** §7 M1–M6. Prod baselines captured during Phase 5.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Fumadocs-ui bundle lands in fallback chunk, not critical path | Vite `React.lazy(() => import('./FallbackDocumentRender'))` + dynamic imports per fumadocs component | `bun run build` bundle analyzer; assert fallback chunk <100 KB gzip |
| CSS variable bridge for fumadocs + editor coexistence | §9.7a of CB-v2 (80 LoC) + 1-line Steps counter fix from H2 | Visual regression on Tabs / Accordion / Steps / Callout mixed with editor chrome |
| Cache persists across HMR in dev | WeakMap-per-editor + module-level Map survive HMR by default | Verify during dev; if broken, use `import.meta.hot` disposal |
| Feature flag rollout | NONE — greenfield directive, atomic rollout | N/A |
| Emergency kill switch (NOT a feature flag — FR15) | `CACHE_ENABLED` module constant at `editor-cache.ts` top. Edit + deploy flips to pre-V2 behavior. | Once post-ship: confirm `CACHE_ENABLED = false` restores pre-V2 cold-mount timing exactly (regression gate would flag if different). |

## 14) Risks & mitigations (consolidated)

See §13 "Risks + mitigations" table. Additional cross-cutting risks not specific to a single requirement:

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| V2 cache + CB-v2 BridgeStore race during rapid nav | LOW | MED | BridgeStore keyed by Editor identity; cache preserves Editor → BridgeStore persists naturally. Integration point: FR8 in Phase 2.4 | Nick |
| Option E fallback content regression vs Y.Doc (user's uncommitted typing) | LOW | MED | FR11 specifies: skip-fallback fast path (<200 ms prod syncPromise), per-session mount tracking (revisit doesn't re-render fallback), content-comparison guard. | Nick |
| Alt 5 InteractionLayer per-click latency degrades vs per-instance React | LOW | MED | Event delegation is O(1) through a single listener. Empirical check Phase 2.1: hand-build 768-chip test page, measure; spec assumes <0.5 ms/chip. | Nick |
| Mermaid placeholder hydration layout shift (per Audit §B9) | MED | LOW | Fixed-aspect placeholder (`aspectRatio: 16/9, minHeight: 200`) with `<pre>` of source; accepted tradeoff for mermaid's 1.5 MB lib cost. | Nick |
| Walker custom code bus-factor (per Audit §A8.1) | MED | MED | Per-node-type unit tests + corpus fixture regression suite parallel to `packages/core/src/markdown/fixtures/`. Inline docstring explains security boundary of `new Function()` + componentMap conventions. Ownership: markdown pipeline team. | Nick + Miles |
| Plain-DOM chip vs presence-cursor UX (per Audit §S12) | LOW | MED | Chip is `contenteditable="false"`; collaborator cursor decorations render outside (on surrounding paragraph). Same pattern as existing contenteditable=false NodeViews. | Nick |

## 15) Future Work

### Explored

- **Worker-assisted markdown parse + PM JSON construction (NG3).**
  - What we learned: First-of-class research for TipTap/Yjs stack. Worker-safe pipeline confirmed (remark + rehype are pure JS). Bounded 1–2 s savings of 9.7 s.
  - Recommended approach: main thread constructs `PmNode.fromJSON(schema, json)` + `new EditorView(...)` after receiving PM JSON over postMessage. Structured-clone 200–1000 ms overhead at 40 K-node tree scale.
  - Why not in scope now: V2 cache + InteractionLayer should close the STORIES gap. If PROJECT-class docs become supported workflow, revisit.
  - Triggers to revisit: (a) stakeholder complaint on PROJECT-class cold-load post-V2; (b) component-blocks-v2 post-ship shows NodeView cost beyond expected.
  - Implementation sketch: see non-blocking-research §Dive 6.

- **Content-visibility: auto for post-mount keystroke cost on multi-MB docs (NG5).**
  - What we learned: Slate PR #5871 (merged 2025-06-06) delivers 90 % FF / 99.7 % Chrome latency reduction on 50 K-block docs via `content-visibility: auto` + block-level React chunking. The 10× claim is attributable to the chunking primitive; PM doesn't have an equivalent.
  - Recommended approach: if post-mount perf becomes an issue, start with the content-visibility half (no PM chunking primitive needed); measure.
  - Why not in scope now: different problem from V2 cold-load + mode-toggle focus. No stakeholder signal today.
  - Triggers to revisit: keystroke latency complaint on multi-MB docs.

- **Cold-load telemetry standard (Affine-style 20 s / 60 s escalation) — NG6.**
  - What we learned: Affine tracks `track.doc.loadDoc({success, time})` with escalation. Open Knowledge has no equivalent.
  - Recommended approach: emit `ok/doc/load-progress` marks at 5 s / 20 s / 60 s; GitHub issue on 60 s failure.
  - Why not in scope now: V2 focuses on eliminating the cost, not observing it.
  - Triggers to revisit: follow-up perf-telemetry spec.

### Identified

- **Full RSC adoption (NG4).** Long-term unification of editor + docs-site. Needs its own spec.
- **~~Q1 (local-md for docs-site renderer swap)~~ RESOLVED 2026-04-20** — Node-path probe rejected local-md; no follow-up spec needed.
- **ComponentMap source-of-truth management (per Audit §F2).** V2's `packages/app/src/editor/componentMap.ts` imports from `docs/src/mdx-components.tsx` (or duplicates via explicit parity test). Future: if docs-site adds a new component, editor fallback must see it. Investigation: could docs-site export componentMap to a shared `packages/core/src/componentMap/` with both docs-site and editor importing? Would eliminate drift entirely. Deferred until a concrete "component added to docs but not editor" bug surfaces.

### Noted

- **Canvas-based rich-text editors** (Google Docs / Canva) — only architecture that fully avoids DOM-per-node cost. Out of scope for Open Knowledge's editor-as-document model.
- **Automerge 2 streaming sync protocol** — post-load incremental sync documented; could replace Yjs for initial state delivery only. Research-grade feasibility probe would be required.
- **TipTap 4 breaking-change fragility (per Audit §F1).** V2 cache locks OK into TipTap's `Editor.mount()/unmount()` contract (or raw `view.dom` reparent fallback). TipTap 4.0 roadmapped. On major bump, V2 cache may need re-architecture. Mitigation: V2 cache isolates TipTap-specific code to `packages/app/src/editor/editor-cache.ts`; re-wire on major bump is bounded to that module.

## 16) Agent constraints

- **SCOPE:** `packages/app/src/editor/**`, `packages/app/src/components/**`, `packages/core/src/extensions/jsx-component.ts`, `packages/core/src/extensions/raw-mdx-fallback.ts`, `packages/core/src/markdown/to-react.ts` (NEW — pure core walker; no React), `packages/app/src/editor/mdast-to-react.tsx` (NEW — React binding for walker), `packages/app/src/editor/componentMap.ts` (NEW), `packages/app/src/editor/extensions/mark-identity-plugin.ts` (NEW — FR4b), `packages/server/src/api-extension.ts` (MODIFY — add `GET /api/document-disk` endpoint ONLY per Audit §B1 — no other server changes), `packages/app/src/globals.css`, `CLAUDE.md` (precedent #18(b) corrigendum + precedent **#18(g)** CM6 reparent contract + new WARN rule per Audit §F3), test infrastructure under `packages/app/tests/**`.
- **EXCLUDE:** `packages/server/**` EXCEPT for the `/api/document-disk` endpoint addition in `api-extension.ts` (scoped addition only; do NOT touch CRDT/observer/bridge code). `packages/cli/**`, `docs/**` (docs-site unchanged for V2), any `bridge/` or observer code (out of V2 scope; V2 is render-side only).
- **STOP_IF:** Any proposed change touches CRDT bridge code (server-observers, client observers, Y.Text/Y.XmlFragment sync) — that's bridge-correctness spec territory, not V2 perf. Any proposed change modifies the schema — precedent #9 add-only. Any proposed change destroys editor instance during Activity hidden (that's the thing V2 is fixing). The `/api/document-disk` endpoint MUST NOT create a Y.Doc session or mutate file-watcher state — if implementation suggests otherwise, stop and escalate. Phase 1.0 spike probe MUST pass before Phase 1.1 starts (Audit §B12).
- **ASK_FIRST:** Adding a new npm dependency (beyond fumadocs-ui + its transitives already pulled by CB-v2); introducing a patch to `prosemirror-view` or `y-prosemirror` (out of V2 philosophy per NG2); any change to `ACTIVITY_MOUNT_LIMIT`, `MAX_POOL`, `LARGE_DOC_CHAR_THRESHOLD`, or `CACHE_ENABLED` constants without updating the evidence trail; flipping `CACHE_ENABLED = false` in production (fire-drill only).
