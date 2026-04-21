---
title: "V2 Perf Spec — Adversarial Challenger Audit"
description: "Adversarial audit of specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/SPEC.md. Finds architectural holes, falsified assumptions, evidence gaps, scope inconsistencies, and coordination risks the spec author missed."
createdAt: 2026-04-20
status: challenger
audits: specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/SPEC.md
audit_baseline_commit: 23e86ca9
---

# V2 Perf Spec — Adversarial Challenger Audit

**Mandate.** Find what's wrong. The spec is Draft / Scaffold-phase and scheduled to ship end-to-end in one autonomous AI sprint. Any hole not caught now will land as tech debt, regression, or missed requirement. Confidence labels are per finding.

---

## Executive summary

The spec is thorough, measurement-grounded, and internally sophisticated. It is NOT ready for implementation as written. Five concerns are genuinely load-bearing:

1. **BLOCK — Option E's data source is architecturally wrong.** SPEC §9.3 states fallback renders from "markdown bytes (from file-watcher cache)" and A3 (§12) plans to fetch via `/api/document?docName=X`. Neither claim survives source verification. The file-watcher's `FileIndexEntry` (`packages/server/src/file-watcher.ts:57-63`) stores `{size, modified, canonicalPath, inode, aliases}` — **no `content` field**. `/api/document` returns `dc.document.getText('source').toString()` (`api-extension.ts:1238`) — the **live Y.Text** of a **forcibly-opened Y.Doc session**. Calling this endpoint during the Suspense fallback triggers a second Y.Doc load for the doc whose first Y.Doc load is the thing the fallback exists to mask. The whole premise of FR11 is broken until either (a) a new endpoint reads disk directly via `fs.readFile`, (b) the file-watcher caches content in memory, or (c) the fallback reads a different source (localStorage, ServiceWorker cache, server-rendered HTML). CONFIRMED.

2. **BLOCK — Walker placement violates CLAUDE.md's core boundary.** D4 LOCKED the walker to `packages/core/src/markdown/to-react.ts`. CLAUDE.md §"Package: core" explicitly says: *"**No React or Node.js server dependencies** — browser + Node compatible."* The walker reference at `/tmp/ok-perf-validation/fumadocs-static-fallback/probe/src/MdToReact2.tsx` imports `react`, `fumadocs-ui/components/*`, and needs a `React.ComponentType` in its public API. Shipping this to `packages/core/` breaks the monorepo's environment-agnosticism invariant. `packages/core/package.json` currently has zero React deps. CONFIRMED.

3. **MUST-FIX — 200-LoC walker reference is missing OK-specific node types.** The reference (`MdToReact2.tsx`, actually 187 LoC) does NOT handle `wikiLink` (emitted by OK's `remarkWikiLink`), `rawMdxFallback` (emitted by OK's tolerant parsing), the full `defaultMdxComponents` spread (`pre`, `a`, `img`, `h1-h6`, `table`, Callout composite), or the `ImageZoom`/`Mermaid`/`TypeTable` components referenced in `docs/src/mdx-components.tsx:11-26`. The reference also uses `remarkMdx` (strict mode, produces `data.estree`) while OK's pipeline uses `remarkMdxAgnostic` (no estree). Porting requires more than "~200 LoC" claimed in D4 — probably 400–600 LoC after real coverage. Unrecognized nodes in the current walker **silently return `null`** (line 174), so wiki-links and rawMdxFallbacks DISAPPEAR from fallback renders. CONFIRMED.

4. **MUST-FIX — InteractionLayer's nodeId contract for MARKS is undefined.** FR4 specifies `registerNode({ type, nodeId, getPos, handlers })`. For block NodeViews (JsxComponent, RawMdxFallback), nodeId is derivable. For MARKS (InternalLink, WikiLink — the 768-count surface on PROJECT that drives the entire Alt 5 rationale), PM marks have NO stable identity: text nodes merge/split on edits, ranges move, attrs don't carry a UUID. The spec doesn't say how a mark acquires its nodeId, when `registerNode` fires for marks, how the layer disposes entries when the mark is removed, or how "activeNodeId" maps back to a mark position. This is the load-bearing migration (FR5 + FR6) for the 2.2 s React reconciliation cost — and the architecture is unspecified. HIGH.

5. **MUST-FIX — Corrigendum evidence file directly contradicts SPEC D6 REVISED.** `evidence/precedent-18b-corrigendum.md` lines 8-13 state *"status: pending_apply"*, *"target: perf/investigation branch (ship as standalone commit per V2 perf spec D6)"*, and repeats the "ship NOW on `perf/investigation` as a standalone commit" framing multiple times. SPEC §10 D6 REVISED (2026-04-20) says *"NOT a standalone commit on `perf/investigation` beforehand"* and *"lands as FIRST commit of V2 impl sprint"*. The two artifacts disagree. An AI coding agent reading the evidence file for execution instructions will follow the OLD protocol. CONFIRMED.

---

## Concerns by attack axis

### Axis 1 — Architectural holes

**A1.1 — V2 Editor cache vs cross-tab state.** FR1 `Map<docName, Editor>` is per-JS-runtime. Same docName opened in two tabs creates two Editor instances, two WebSocket connections, two presence ghosts of the same identity. CRDT state remains correct (Y.js handles this), but:
- Two "me" cursors in the presence bar (both same color/name).
- Doubled Hocuspocus connection cost per tab.
- Neither tab benefits from the other's module-level cache.

This is not catastrophic — it's the status quo today — but the spec doesn't acknowledge it as a non-goal. A future maintainer may attempt BroadcastChannel-based cache sharing and find this constraint. MEDIUM.

**A1.2 — Activity-hidden Y.js observer load scales with cache size.** Precedent #18(c) already documents: *"Y.js observers are NOT React effects and do NOT pause when Activity flips to hidden — a hidden Activity entry with a live provider still processes every remote-peer update at full CPU cost."* FR3 caps editor cache memory via `viewCount ≥ 200` but NOT observer-CPU cost. With MAX_POOL=10 and potentially 10 editors alive simultaneously (if all under 200 views), 5 collaborators actively editing, you get 50 Y.js observer firings per remote keystroke. The current architecture (pre-V2) partially mitigates by destroying editors on Activity-hidden — V2 explicitly removes that mitigation. The spec doesn't model this. HIGH.

**A1.3 — InteractionLayer event delegation vs PM node movement.** FR4 routes interactions by `activeNodeId` via event delegation on editor root reading `data-node-id` attribute. When a PM transaction reorders/merges/splits nodes (via text edits, paste, etc.), the `data-node-id` attributes on chips may become stale OR the chip DOM may be rebuilt by PM. The current per-instance React portals bind via closure, not a DOM attribute — they're naturally resilient to node movement. Moving to attribute-based delegation introduces a new stale-ID class that must be actively invalidated. Spec doesn't address. HIGH.

**A1.4 — Option E snapshot vs Y.Doc-ahead state.** FR11 renders from `cachedMarkdown`. If the user has live local edits not yet persisted (e.g., 20 s uncommitted typing, persistence debounce still pending at 2 s), the snapshot is STALE vs Y.Doc. When editor hydrates, content flashes to the newer state — worse than a blank skeleton, because user sees THEIR OWN already-typed text disappear then reappear in slightly different form. Spec §14 "Option E fallback shows stale content if Y.Doc diverges from disk" flags the risk but mitigation is "Last synced: …" timestamp — cosmetic, not a fix. HIGH.

**A1.5 — V2 cache + ScrollPreservingContainer interaction.** `EditorActivityPool.tsx:154-168` explicitly explains: *"LIMIT=3 to keep ScrollPreservingContainer's `useRef` alive across navigation."* V2 cache introduces **two** layers: cached editor (up to MAX_POOL=10) + Activity-mounted container (up to ACTIVITY_MOUNT_LIMIT=3). Revisiting a pool-resident-but-not-Activity-mounted doc remounts ScrollPreservingContainer — the useRef is GONE, scroll position is lost. Pre-V2, this was also the case, but the TipTap editor was also destroyed (consistent cost). Post-V2, user sees "editor state preserved, scroll position lost" — an asymmetry. Spec §13 notes "revise `ACTIVITY_MOUNT_LIMIT` decoupling" but doesn't resolve this asymmetry. MEDIUM.

**A1.6 — FR3 N=50 threshold boundary policy undefined.** At exactly 50 views → cache decision? A doc with 48 views that user adds a link (viewCount → 49, 50, 51) — is cache gate re-evaluated? Does an already-cached editor get evicted when it crosses threshold? Spec says it's "measured at mount" (A5) but docs aren't static. Policy undefined. MEDIUM.

**A1.7 — Option G prewarm rate limiting vs MAX_POOL capacity.** FR12 rate-limits pre-warms to 3 concurrent. MAX_POOL = 10. User scrolling a 100-item sidebar at 80 ms intent debounce can queue N items → LRU eviction of currently-active pool entries, destroying warm providers we actually need. No eviction policy interaction defined. MEDIUM.

---

### Axis 2 — Missing requirements / scope creep

**A2.1 — No cache-eviction ordering contract.** FR1/FR3 say "LRU eviction + size gates". When both triggers fire simultaneously (e.g. bring in the 11th editor, and one of the existing 10 is > 200 views), ordering is undefined. Does size-gate evict first? LRU? Test later, ship now? Spec doesn't say. MEDIUM.

**A2.2 — No telemetry for `BridgeMergeContentLossError` interaction with V2 cache.** Precedent #11(b) logs `bridge-merge-content-loss`. V2 cache preserves Editor state across nav — the telemetry event's metadata doesn't include which cached-Editor fired it. On 10 cached editors, distinguishing source becomes harder. §7 M1-M6 don't enumerate this telemetry. LOW.

**A2.3 — Option E mermaid carveout left unspecified.** §9.3 says "mermaid (~1.5 MB lib) renders a placeholder in fallback, defers to post-hydration." What does "placeholder" look like? Dimensions? Text? Same height as rendered diagram? Mismatched dimensions cause layout shift — the very thing the spec §1 wants to avoid. Spec §14 risk table says "One-frame skeleton with same dimensions; mermaid mounts on hydration and replaces" — HOW does it know dimensions pre-mount? The mermaid source is arbitrary. HIGH (for jank-free fallback goal).

**A2.4 — V2 cache rollback mechanism.** FR14 regression gates but no rollback plan. If V2 ships and causes a memory leak in prod, how do we roll back? Spec §13 "Feature flag rollout: NONE — greenfield directive, atomic rollout." With no feature flag and atomic rollout, rollback = revert the PR, which in a single-sprint-shipped V2 means reverting DOZENS of files. No emergency off-switch. HIGH.

**A2.5 — Playwright e2e coverage for InteractionLayer interactions not specified.** §13 says "extend ux-interactions + docs-open scenarios". But: drag-drop of a chip? Keyboard selection across chips? Screen-reader a11y on chips vs MarkView? Undo of link-edit-via-PropPanel? The existing InternalLinkView handles these cases; moving to InteractionLayer reintroduces them as unverified regressions. Spec doesn't enumerate. HIGH.

**A2.6 — No plan for mobile/touch interaction on plain-DOM chips.** Existing React NodeView has React event handlers. Plain-DOM chip + event delegation only hears `click` / `mouseover`. iOS Safari touch → click takes 300 ms unless `touch-action` is set. iPad long-press for copy context menu? Right-click context menu on desktop? Spec doesn't address. MEDIUM.

---

### Axis 3 — 1-way door evidence strength

**A3.1 — D1 (Alt 5 scope + N=50) evidence is strong but has a gap.** 6-point scaling curve IS legitimate. Fit `CPW ≈ 185 + 10.6·views + 1.8·bytes_KB` works. But: the spec picks N=50 with "margin below 100-view Acceptable→Unacceptable boundary." At N=50 × 2 ms/view = ~100 ms marginal cost — still within Acceptable. N=30 would be even safer. Why N=50? Document doesn't say. Tunable constant (D5 LOCKED tunable), but calibration basis is thin. MEDIUM.

**A3.2 — D3 (CM6 cache via reparent) is well-evidenced BUT missed OK-specific extension stack.** H1 probe `/tmp/ok-perf-validation/cm6-reparent/probe-source.ts` (380 LoC per REPORT line 159) ran 12/12 tests — BUT the extension stack is stated as *"matching `packages/app/src/editor/SourceEditor.tsx` — `basicSetup`, `@codemirror/lang-markdown` with GFM, compartment-gated theme + placeholder, `EditorView.lineWrapping`, and (for collab tests) `yCollab`"* (H1 REPORT §4.1). **Missing:** `createSourcePolishExtension` (ViewPlugin lezer walk), `createWikiLinkSourceExtension`, `createMdLinkSourceExtension`, `codeLanguages` allowlist, domEventHandlers for clipboard, any custom ViewPlugin.fromClass that may capture `view.dom` in closure. The probe tested a RESEMBLING stack, not the PRODUCTION stack. D3 is PROBABLY still correct (most ViewPlugins don't stash view.dom), but *"12/12 tests pass"* is technically wrong-context — it's 12/12 on a simpler rig. MEDIUM.

**A3.3 — D4 (walker, not hast-util-to-jsx-runtime) is correct on the rejection but weak on the walker's completeness.** See BLOCK #3 above. The walker reference is 187 LoC and misses critical node types. D4 LOCKED to an underspecified implementation. MUST-FIX.

**A3.4 — D7 (CM6 contract → precedent #18(h)) has shape-mismatch with existing precedents.** CLAUDE.md precedent #18 is a DENSE block with sub-rules (a)-(f), each one a tight paragraph tied to a specific behavior. `cm6-reparent-contract.md` §11 proposes a SINGLE 700+ character paragraph as "#18(h)". This doesn't match:
- Existing #18 sub-rules start with `**(X) — <Rule name>.**` bold prefix. Proposed #18(h) starts with `**#18(h) — CodeMirror 6 caching via reparent-without-destroy.**` — minor but the `#18(h)` prefix inside the text itself is weird.
- Existing #18 rules ~150–300 chars. Proposed is 1200+ chars.
- Existing #18 cross-refs internal to #18 sub-rules. Proposed cross-refs to `packages/app/...` paths and #24.

Better shape: add as `#18(g)` or `#18(h)` sub-rule with the SAME formatting as (a)-(f), move the 1200-char body to the evidence file as the normative contract, and keep the precedent entry concise. Alternatively, make it a new standalone precedent #25 (CM6 editor caching) rather than a #18 sub-rule. The current plan deposits a conspicuous structural outlier. MEDIUM.

---

### Axis 4 — Over-confident MEDIUM assumptions

**A4.1 — A1 (TipTap mount/unmount) MEDIUM with unspecified fallback compatibility.** SPEC §12 says fallback if A1 fails: "raw `editor.view.dom` reparent à la H1 CM6 pattern." But:
- `@tiptap/extension-collaboration-cursor`'s `CollaborationCursor` extension wires `yCursorPlugin` which mounts cursor decorations in PM view. Reparenting `view.dom` preserves the plugin state, but does the cursor rendering survive without a fresh `view.destroy() → new view()` cycle? Not tested.
- `@tiptap/y-tiptap`'s `ySyncPlugin` — does `_forceRerender` fire correctly on re-attach?
- ProseMirror `EditorView` constructor is mechanically-verified sync via tiptap-large-doc-patterns Q8 — but the RE-ATTACH path is NOT covered by Q8.

The "raw view.dom reparent" fallback path is advocated without evidence that it works for OK's full TipTap extension set (Collaboration + CollaborationCursor + y-tiptap + image-upload plugin + clipboard serializer + extensions). A feasibility probe analogous to H1 (but for TipTap) would close this. MEDIUM→HIGH RISK.

**A4.2 — A3 (markdown snapshot endpoint) is FALSE on verification.** See BLOCK #1 above. `/api/document` returns live Y.Text and requires a session open. A3 says "confirm it returns disk bytes, not live Y.Text, for the cold-load case" — verification WILL FAIL, and there's no Plan B named. CONFIRMED.

**A4.3 — A5 (view-count measurement) cost has no probe.** "Measure cost-of-measurement as part of Phase 1.2." Walking a 270K-node PM doc looking for marks/views is O(N). Measured on PROJECT with 768 views this could be 50-100 ms per mount — meaningful vs the <200 ms warm-switch target. Spec should specify caching (measure once at parse, store on editor entry) but doesn't. MEDIUM.

---

### Axis 5 — Missing failure modes

**A5.1 — InteractionLayer: cross-editor event bleed.** With multiple Editor instances in cache, clicking a chip in Editor A triggers event delegation on Editor A's root → dispatches to Editor A's InteractionLayer. If chip DOM is temporarily attached to a parking node (during mid-nav reparent), clicks on that chip have no route to an InteractionLayer. Not addressed. MEDIUM.

**A5.2 — Option E hydration timeout.** If Hocuspocus provider NEVER reaches `synced` (edge case per FR1 / SPEC D8), fallback stays forever, editor never mounts. `syncPromise` rejects at 30 s → DocumentErrorBoundary shows "Try again" — but this transitions AWAY from fallback content. The spec doesn't specify whether fallback stays visible behind the error UI or gets unmounted. HIGH.

**A5.3 — V2 cache corruption mid-reparent.** During `parkEditor()` (detach `.dom` to parking node), if a React commit re-renders the parking node tree for an unrelated reason, `.dom` might end up in an inconsistent state. No mutex / guard specified. LOW-MEDIUM.

**A5.4 — Activity-hidden + cache eviction race.** If user navigates doc1 → doc2 → doc3 ... → doc11 (exceeds MAX_POOL), doc1 is evicted → `editor.destroy()`. If user simultaneously hits Back button heading to doc1, `openDocumentTransition(doc1)` starts mid-destroy — `Editor.destroyed` race. No ordering contract. MEDIUM.

**A5.5 — Option E bundle chunk failure.** `React.lazy(() => import('./FallbackDocumentRender'))` + dynamic imports per fumadocs component. If the network drops mid-chunk-fetch, the user sees mid-rendered fumadocs components interspersed with loading placeholders — worse than a plain skeleton. §13 says "dynamic imports per component deferred ~20 KB" but no retry policy or offline fallback. HIGH for offline-capable editor scenarios. LOW for always-online typical use.

**A5.6 — InteractionLayer: collaborator cursor on a chip location.** Existing MarkView React rendering puts text inside `<MarkViewContent />` which PM recognizes as content-editable. InteractionLayer plain-DOM chip — is the chip content-editable? Can a collaborator place their cursor inside the chip? If chip is `<span>` without `contenteditable`, cursor decorations from `CollaborationCursor` may render outside the chip, breaking presence UX. Not addressed. HIGH.

---

### Axis 6 — Internal consistency / cross-reference integrity

**A6.1 — D6 corrigendum protocol mismatch.** See BLOCK #5 above. CONFIRMED.

**A6.2 — SPEC §1 says "~15 engineer-days of scope in a sprint"** — but §9 5-phase topology × 14 FRs × full Playwright e2e × prod-build regression gates is probably larger than 15 days even for an AI agent. The spec itself says in §1 "Implementation time is NOT a factor" — but §13 next-action (6) "Implementation sprint (AI coding agent, 5-phase topology per §9)" implies a single sprint. Is 15 days realistic? 7 days? Unknowable. Not load-bearing for correctness, but the spec's mental model of "single sprint" should be examined. LOW.

**A6.3 — §9.3 Option E pipeline includes `restoreFromMdx`** — but `restoreFromMdx` operates on PM-bound mdast during parse (Phase A of OK's pipeline per CLAUDE.md). Walker consumes mdast output of `remarkMdxAgnostic` — does it need `restoreFromMdx`? Unclear. If walker needs to restore PUA sentinels before rendering, it needs to also run Phase B's merged-walker. Spec §9.3 lists it in the pipeline but doesn't specify what phase. Under-specified. MEDIUM.

**A6.4 — FR11 cites `docs/src/mdx-components.tsx:11-26` as componentMap source.** Verified: exists (26 lines, `getMDXComponents` runs lines 11-26). But: this map is for the docs-site build, uses fumadocs-mdx's MDXComponents type, spreads `defaultMdxComponents`. The "portable copy" in `packages/app/src/editor/componentMap.ts` would need to either:
- Import fumadocs-ui/mdx (pulls the full `defaultMdxComponents`)
- Reimplement the spread as individual component imports
- Accept feature drift (map has 13 entries + spread; walker reference has 12; they differ)

FR11 says "portable as-is". It isn't — it's `{...defaultMdxComponents, ...13 additions}`. Spread requires runtime resolution. HIGH (for docs-site parity).

**A6.5 — `spec §13 file-level scope` vs `§16 Agent constraints SCOPE`.** §13 includes `packages/core/src/markdown/to-react.ts` (NEW) and `packages/app/src/editor/componentMap.ts` (NEW). §16 SCOPE mentions `packages/core/src/markdown/to-react.ts (new)` + "packages/app/src/editor/**". Mostly consistent. BUT: §13 modifies `packages/app/src/editor/SourceEditor.tsx` (wiring V2 cache) — §16 SCOPE includes `packages/app/src/editor/**` so OK. Consistent. LOW.

**A6.6 — Evidence file `component-blocks-v2-interweaving.md` is pinned to CB-v2 commit `a0d86fab8cffeb7959cb838ca0ec8bc44cd6c50c`.** CB-v2 is Draft and may change. If CB-v2 shifts `JsxComponentView`'s NodeView render shape before V2 sprint, FR8 may be wrong. Coordination risk. §14 Risk table notes this as "LOW likelihood, HIGH impact." A mechanical check: automate pin-drift detection? MEDIUM.

---

### Axis 7 — Scope creep / over-engineering

**A7.1 — InteractionLayer's singleton `ActivePropPanel` + `ActiveToolbar` + `ActiveBreadcrumb` is over-engineered for current scope.** FR4 adds THREE singleton controls at editor root. Current scope: 2 marks (InternalLink, WikiLink with no Breadcrumb today), 2 NodeViews (RawMdxFallback no Toolbar/Breadcrumb, JsxComponent via CB-v2 → PropPanel + Toolbar + Breadcrumb). Not all 4 extensions need all 3 controls — this is CB-v2 scope creeping into V2. Recommend: FR4 defines the PRIMITIVE (registration + activeNodeId routing) and leaves Toolbar / Breadcrumb to CB-v2's spec where those controls are actually required. Start with PropPanel only. MEDIUM.

**A7.2 — Option G (FR12) is over-ambitious for a V2 bet.** Hover intent + pre-warm + rate limiting + sidebar hover wiring + config for 80 ms debounce. This is a whole UX feature, not a primitive. If V2 cache is the lever, Option G is a complement at best. Spec's own §14 puts it in the medium-risk column. Recommend: Option G becomes Phase 4.2 and is CONDITIONAL on Phase 4.1 success. LOW-MEDIUM.

**A7.3 — Prod-mode regression gate (FR14) with 3-tier scoring convention mirrored from existing CI.** Mostly fine, but §7 M1–M6 has 6 metrics. Each needs a baseline, budget, and measurement scenario. That's 18 calibrations. A sprint trying to produce prod baselines from green cold-run × 2 runs for 6 metrics is non-trivial. Consider reducing to 2–3 gated metrics (M1, M3, M4) and treating others as non-gated telemetry. LOW.

---

### Axis 8 — Post-ship review — what happens 6 months later?

**A8.1 — Bus-factor risk for the custom walker.** The walker at `packages/core/src/markdown/to-react.ts` (or wherever it ultimately lands) is ~200-600 LoC of OK-specific mdast→React glue. Future contributors need to understand: `remarkMdxAgnostic`'s attr shape, `wikiLink` node semantics, `rawMdxFallback` shape, the dev-secure `new Function()` boundary, fumadocs componentMap conventions. No walker maintainer beyond Nick. Spec should specify: (a) unit tests per node type, (b) a FIXTURE-based regression suite (parallel to `packages/core/src/markdown/fixtures/`), (c) docstring explicitly calling out the security boundary for `new Function()`. MEDIUM.

**A8.2 — TipTap 4 breaking-change fragility.** A1 already MEDIUM-confidence on TipTap 3.22.x's `Editor.mount/unmount`. TipTap 4.0 is roadmapped. V2 cache locks OK into TipTap's mount/unmount contract (or raw view.dom reparent). If TipTap 4 makes breaking changes, V2 cache may need re-architecture. Spec doesn't address "how does V2 evolve" under TipTap major version bumps. LOW for ship-ready; HIGH for 6-month maintenance.

**A8.3 — `FallbackDocumentRender` vs MCP render-preview vs docs-site build drift.** Q1 RESOLVED keeps walker browser-side. G7 (unified pipeline across editor + docs-site + MCP render preview) becomes a FUTURE intention. Walker must stay in sync with docs-site's `getMDXComponents()` output shape. If docs-site adds a new component (e.g., `Banner`), editor's Option E fallback doesn't render it until the walker's componentMap is updated. Two sources of truth forever. Ownership: unclear. MEDIUM.

**A8.4 — Activity-hidden destroy-then-cache flip introduces counterintuitive developer mental model.** Today: "Activity hidden → editor destroyed, DOM gone." Post-V2: "Activity hidden → editor alive, DOM parked, observers running." Anyone writing a new extension with a `useEffect` cleanup-on-unmount expectation will now see the editor persist across "unmount". CLAUDE.md WARN rules already call out the similar TipTap proxy quirk. V2 adds another. Spec should propose a new WARN rule for "editor instance may outlive the React subtree that owns it." MEDIUM.

**A8.5 — Rollback impact if V2 cache is shipped then needs reverting.** No feature flag, no gradual rollout. Revert PR = revert 15+ files simultaneously. If a production-only bug surfaces, this is a 5-minute fire-drill during prod incident. Spec §13 explicitly says "NONE — greenfield directive, atomic rollout" — which is the user's stated preference, but it's still high-blast-radius. Worth calling out in §14 Risks. MEDIUM.

---

## Severity-ranked findings list

| # | Severity | Finding | Reference | Recommendation |
|---:|---|---|---|---|
| 1 | **BLOCK** | `/api/document` returns live Y.Text (not disk bytes); file-watcher doesn't cache content. Option E premise is falsified. | SPEC §9.3, §12 A3; `packages/server/src/api-extension.ts:1238`; `packages/server/src/file-watcher.ts:57-63`; CLAUDE.md API table | Add a new `/api/document-disk` endpoint that reads `fs.readFile(filePath)` directly (bypasses Y.Doc session). Alternatively: cache content in file-watcher's index. Resolve before Phase 4.1. |
| 2 | **BLOCK** | Walker placement in `packages/core/` violates CLAUDE.md's "No React deps" boundary for core. | SPEC §10 D4 LOCKED; SPEC §13 file-level scope; CLAUDE.md §"Package: core"; `packages/core/package.json` | Move walker to `packages/app/src/markdown/to-react.ts` OR split: pure mdast-walk core, React-binding app. Update D4 + §13 + §16 SCOPE. |
| 3 | **MUST-FIX** | Walker reference (~200 LoC) missing `wikiLink`, `rawMdxFallback`, full `defaultMdxComponents` spread, ImageZoom/Mermaid/TypeTable. Uses `remarkMdx` (strict) vs OK's `remarkMdxAgnostic`. | `/tmp/ok-perf-validation/fumadocs-static-fallback/probe/src/MdToReact2.tsx` line 150-175; `docs/src/mdx-components.tsx:11-26`; SPEC §10 D4 | Update LoC estimate to 400-600. Explicitly list supported mdast types. Require fixture coverage per node type. |
| 4 | **MUST-FIX** | InteractionLayer nodeId contract for MARKS is undefined. Marks have no stable identity in PM. | SPEC §9.2 FR4, FR5, FR6 | Specify: how marks acquire nodeIds (attr widening per precedent #9? synthesized per render? plugin state?), when `registerNode` fires, how cleanup works on mark removal. |
| 5 | **MUST-FIX** | `evidence/precedent-18b-corrigendum.md` says status=pending_apply on perf/investigation; SPEC D6 REVISED says V2 sprint commit. Internal inconsistency. | `evidence/precedent-18b-corrigendum.md` lines 8-13, 66-75; SPEC §10 D6 | Update corrigendum evidence file: `status: scheduled_for_v2_sprint_commit_1`. Remove "ship NOW on perf/investigation" language throughout the file. |
| 6 | **MUST-FIX** | Activity-hidden Y.js observer load scales with V2 cache size; not capped by FR3's memory policy. | SPEC §12 A1 interaction with precedent #18(c); `packages/app/src/components/EditorActivityPool.tsx:9-14` comment | Add FR3b: observer-processing-CPU cap (e.g. max 3 actively-observed docs; others pause observer via provider.disconnect + reconnect-on-revisit). |
| 7 | **MUST-FIX** | InteractionLayer event delegation vs PM node movement — `data-node-id` attrs can become stale on paste/merge/split. | SPEC §9.2 | Specify ID rebind on PM transaction via appendTransaction or plugin state sync. |
| 8 | **MUST-FIX** | Option E fallback rendering when user has Y.Doc-ahead state (uncommitted typing) — flashes content loss+return. | SPEC §14 "Option E fallback shows stale content" risk | Specify behavior: (a) skip fallback when syncPromise resolves fast (<N ms), (b) compare snapshot vs current live Y.Text before render, (c) don't re-render fallback on revisit when editor already mounted once. |
| 9 | **MUST-FIX** | Mermaid placeholder dimensions unknown pre-render; causes layout shift that defeats fallback's purpose. | SPEC §9.3 "Mermaid carve-out"; §14 Risk #4 | Either: (a) reserve min-height = 200px + spinner, acknowledging shift; (b) extract mermaid dimensions from source; (c) accept carveout and skip mermaid in fallback tree entirely. |
| 10 | **MUST-FIX** | No rollback mechanism / kill switch for V2. Atomic rollout = revert-the-PR, dangerous in prod incident. | SPEC §13 "Feature flag rollout: NONE" | Add optional rollback via: `localStorage.setItem('ok-v2-cache-disabled', '1')` env check OR a single `ENABLE_V2_CACHE` constant that branches to pre-V2 path. Not for gradual rollout — for emergencies. |
| 11 | **SHOULD-FIX** | InteractionLayer + collaborator cursor on chip — presence UX breaks if chip isn't content-editable. | SPEC §9.2 FR4/FR5/FR6 | Specify: plain-DOM chips keep `contenteditable="true"` (or false with explicit selection-bridge) to preserve cursor-on-chip UX. Add Playwright test. |
| 12 | **SHOULD-FIX** | A1 fallback plan ("raw view.dom reparent") unverified for OK's full TipTap extension stack. | SPEC §12 A1; SPEC §14 Risk #1 | Add a focused probe (analogous to H1): drive TipTap with Collaboration + CollaborationCursor + y-tiptap + image-upload + table + clipboard through a reparent cycle. Verify cursor/presence/paste still work. Gate Phase 1.1. |
| 13 | **SHOULD-FIX** | H1 probe's stack missing OK-specific CM6 extensions (`createSourcePolishExtension`, `createWikiLinkSourceExtension`, `createMdLinkSourceExtension`, codeLanguages allowlist). | `evidence/h1-cm6-reparent-probe.md` §4.1 | Add a follow-up test with the production extension stack. Expected: still passes, but confirms. |
| 14 | **SHOULD-FIX** | #18(h) CM6 contract text-shape doesn't match existing #18 sub-rule conventions. | `evidence/cm6-reparent-contract.md` §11 | Rewrite as a concise sub-rule paragraph (~300 chars) mirroring #18(a)-(f) format. Keep full contract in evidence file. |
| 15 | **SHOULD-FIX** | Cost model §9.2 conflates "MarkView portal cost" (~2.2s) with "browser layout cost" (~2.5-3.0s). Removing portals doesn't remove layout for 39K DOM nodes. | SPEC §9.2 Cost model; §8.1 attribution | Clarify: InteractionLayer saves ~2.2s React reconciliation. Browser layout (~2.5-3.0s) is ADDRESSED SEPARATELY by V2 cache (skips layout on revisit) + §8b content-visibility (skips layout on hidden). Re-split the savings. |
| 16 | **SHOULD-FIX** | Plain-DOM chip per-instance cost "~0.5 ms" cited without empirical basis. | SPEC §9.2 | Probe: hand-build a 768-chip test page (no React) and measure layout cost. If > 1 ms/chip, G1/G2 at-risk. |
| 17 | **SHOULD-FIX** | FR3 threshold boundary (exactly 50 views, dynamic re-evaluation) policy undefined. | SPEC §6 FR3; §12 A5 | Specify: gate evaluated ONCE at mount, stored on cache entry. Crossing threshold post-mount does NOT trigger eviction. |
| 18 | **SHOULD-FIX** | Option G prewarm (FR12) vs MAX_POOL LRU interaction undefined. | SPEC §6 FR12; MAX_POOL=10 + rate-limit=3 | Specify: prewarms cannot evict any doc currently Activity-mounted. Prewarms go to the end of LRU order. |
| 19 | **SHOULD-FIX** | §9.3 cites `restoreFromMdx` in Option E pipeline; phase ordering within walker pipeline unclear. | SPEC §9.3 | Explicitly specify: walker runs Phase A (`restoreFromMdx`) before mdast→React traversal OR walker delegates parse to existing `MarkdownManager.parse()` which already includes both phases. |
| 20 | **SHOULD-FIX** | componentMap §9.3 "portable as-is" claim is false — docs map uses spread + fumadocs mdx shape. | SPEC §9.3; FR11 | Specify: componentMap is a TRANSFORMATION of docs mdx-components.tsx, not a copy. Define the spread resolution at runtime. |
| 21 | **SHOULD-FIX** | No test plan for InteractionLayer interactions: drag-drop, keyboard navigation, a11y, right-click context menu, touch/iOS. | SPEC §13 test infrastructure | Add AC list under FR5/FR6 enumerating these interaction surfaces as preserve-or-regress. |
| 22 | **FYI** | Q3 (IDEAL-EDITOR prod CPW 76 ms anomaly) still unresolved; could falsify baselines. | SPEC §11 Q3; §2 G1 | Close this ablation BEFORE final sign-off — document already flags it, but note here: without resolution, G1 target calibration is on shaky ground. |
| 23 | **FYI** | §13 Next actions requires cherry-picking `b6c6455b` from `cold-mount-profile-instr` branch before sprint. Coordination risk. | SPEC §13 Next actions 5(a) | Add to sprint kickoff checklist explicitly. If cherry-pick is forgotten, all Phase 5 telemetry gates fail silently. |
| 24 | **FYI** | Cross-tab V2 cache (same docName in two tabs) not addressed. Presence ghost, doubled connection cost. | SPEC §9 / §12 | Document as NG8 non-goal: "V2 cache is per-JS-runtime. Multi-tab collaboration uses existing presence deduplication; no shared-cache BroadcastChannel optimization." |
| 25 | **FYI** | No WARN rule drafted for CLAUDE.md about "editor instance may outlive React subtree that owns it" post-V2. | SPEC §13 CLAUDE.md mods | Add to precedent #18(b) corrigendum OR to Known Pitfalls: "Post-V2, a TipTap editor in the module-level cache outlives the `<TiptapEditor>` React component that rendered it. `useEffect` cleanups on the component must NOT `editor.destroy()` — only `evictEditor()` (cache eviction) should destroy." |
| 26 | **FYI** | Bus-factor: custom walker is Nick-specific; no unit-test fixture plan. | SPEC §13 test infrastructure | Require per-node-type unit tests + corpus-fixture regression tests parallel to `packages/core/src/markdown/fixtures/`. |
| 27 | **FYI** | G7 (unified pipeline: editor + docs-site + MCP render) deferred to "Future Work" — componentMap drift forever. | SPEC §2 G7; §11 Q1 | Document ownership: who keeps editor walker in sync with docs-site componentMap as components are added? |

---

## Required changes before Implementation

The spec needs these six updates BEFORE the AI coding agent can safely execute the sprint. Everything else is SHOULD-FIX (can be handled during implementation with spec amendments).

**R1. Resolve Option E's data source (BLOCK #1).** Option E cannot render from a file-watcher cache that doesn't exist. Either add a new endpoint that reads disk bytes (preferred, minimal server change), accept that fallback shows skeleton for first-load-ever docs (product decision), or change FR11 to render from an in-browser client-side cache (which doesn't exist either, but has a cleaner path). Write a section in §9.3 naming the chosen mechanism.

**R2. Move walker out of `packages/core/` (BLOCK #2).** D4 LOCKED to the wrong package. Either: `packages/app/src/markdown/to-react.ts` (pragmatic), or split — pure walker in core (no React deps, takes a `createElement`-shaped factory as parameter), React binding in app. The split path preserves forward-compat for MCP render-preview / CLI export (D4's stated rationale) WITHOUT violating core's boundary.

**R3. Fix corrigendum evidence file (BLOCK #5).** Update `evidence/precedent-18b-corrigendum.md` to match D6 REVISED. Strip all "ship NOW on perf/investigation" language. Change `status: pending_apply` to `status: scheduled_for_v2_sprint_commit_1`. AI agents consume evidence files as instructions; contradictory instructions across spec + evidence cause execution drift.

**R4. Specify InteractionLayer mark-identity contract (MUST-FIX #4).** PM marks don't have stable IDs. Before FR5/FR6 can ship, the spec MUST define: how marks acquire nodeIds, when `registerNode` fires, how the layer handles mark removal/merge/split, what happens when a chip's mark is torn apart by a text edit. Options:
 - (a) Attr widening (precedent #9-compatible): add `bridgeId`-style PluginState per mark. But PM mark identity still unstable.
 - (b) Pseudo-IDs synthesized per-render from `{from, to, mark-hash}` — bound to live position.
 - (c) Per-instance React still for marks, InteractionLayer for blocks only. Scope reduction.
 Pick one. Without this, Phase 2.1/2.2 can't start.

**R5. Add a TipTap cache-via-Editor.mount/unmount probe (MUST-FIX / A4.1).** A1's fallback plan ("raw view.dom reparent") needs empirical validation against OK's full TipTap extension stack (Collaboration + CollaborationCursor + y-tiptap + image-upload + table-controls + clipboard serializers). This is the analogue of H1 for TipTap. Without it, A1 is a spec bet, not a verified plan.

**R6. Add rollback/kill-switch (MUST-FIX #10).** Atomic rollout is the user's directive, BUT a single `const ENABLE_V2_CACHE = true` constant at the top of `editor-cache.ts` that branches to pre-V2 behavior is cheap insurance. Doesn't undermine greenfield directive; gives emergency rollback without reverting the sprint.

---

## Disagreements with the spec's decisions

These are calls I genuinely disagree with as a reviewer. The user can adjudicate.

**D1 — Against D1 (Alt 5 scope = all 4 extensions).** The spec commits Phase 2 to porting 4 extensions to InteractionLayer. I'd argue for INCREMENTAL SCOPE:
- Phase 2.1 (InternalLink) ships and measures actual impact.
- If actual impact closes the STORIES gap, stop there.
- Port WikiLink only if measurement says it's needed.
- Defer JsxComponent to CB-v2 (they own it anyway).
- Defer RawMdxFallback until CB-v2's nested CM pattern stabilizes.

The spec's argument is greenfield directive + no-deferred-tech-debt. Counter-argument: measuring intermediate states is HOW you learn the architecture is correct. Shipping all 4 ports at once means the architecture's cost model (~0.5 ms/chip) is unverified at scale, and if it's wrong, all 4 ports need rework. Incremental shipping surfaces the empirical truth earlier.

**D2 — Against locking Option E to custom walker (D4 LOCKED).** The rejection of `@fumadocs/local-md` is well-evidenced. But "custom walker" locked-in at V2 leaves OK owning 400-600 LoC of mdast→React infrastructure forever. Two other options partially evaluated:
 - Server-side render (SSR) via Node-compatible Tiptap JSON → HTML conversion, served as static HTML that hydrates into the live Tiptap editor. No walker needed.
 - `react-markdown` with custom components (different ecosystem; rejected by subagent but not probed empirically by OK).

The LOCKED decision may be premature. Recommend: DIRECTED, revisit if walker maintenance burden becomes painful.

**D3 — Against the "15 engineer-days in one sprint" mental model.** The spec's §1 framing that implementation time isn't a factor assumes AI agent productivity. In practice, AI agents have context-window limits, occasional errors, and the cost of the SPEC being wrong is high (any spec mistake gets implemented mechanically). Compressing all 14 FRs into one sprint trades implementation-speed benefit for RISK of spec errors being unfixable mid-sprint (too many decisions already committed). A 2-phase sprint (Phase 1+3 first, then measure; Phase 2+4 second) would be safer given the audit findings above.

**D4 — Against D6 REVISED (corrigendum lands in V2 sprint, not standalone).** Original D6 was right — documentation bug is independent, users of CLAUDE.md read false info today. V2 sprint is ~15 days. That's 15 days someone reads a false precedent. Cost of a standalone 1-commit PR on `perf/investigation` is < 1 hour. The REVISED rationale ("atomic PR = single review surface") is weak — CLAUDE.md changes are trivially reviewable. Recommend: revert D6 back to the standalone-commit shape.

---

## What's GOOD (brief)

- **Measurement-grounded.** 6-point scaling curve, cold-mount 5-component attribution with HIGH-confidence attribution, prod-mode baselines ×3 docs ×2 runs. The decision basis is load-bearing empirical work, not vibes. This is the strongest part of the spec.
- **Ecosystem research is exhaustive.** `tiptap-large-doc-patterns.md` across 8 investigation axes, 10 ecosystem products, 6 subagents with primary sources. The "no first-class solution exists anywhere" framing is well-defended.
- **H1/H2 probes validate the hardest architectural bets empirically.** H1: CM6 reparent 12/12 tests. H2: fumadocs standalone 4 probe variants + screenshots. These are the right kinds of evidence for 1-way-door decisions.

---

## Confidence labels summary

| Finding class | Count | Typical severity |
|---|---:|---|
| CONFIRMED (verified against source) | 5 | BLOCK |
| HIGH (single strong source or logical certainty) | 10 | MUST-FIX / SHOULD-FIX |
| MEDIUM (inferred from partial evidence) | 9 | SHOULD-FIX / FYI |
| LOW (thin basis, flagged for awareness) | 3 | FYI |

---

## Verification tracker — what the reviewer should re-verify

The following citations in SPEC.md were verified AGAINST SOURCE during this audit:

| Claim | Citation | Verified? |
|---|---|---|
| `@tiptap/react`'s `useEditor.scheduleDestroy(1ms)` | node_modules/@tiptap/react/dist/index.js:460 | VERIFIED. Conditional destroy (early-returns if isComponentMounted) — NUANCE captured in §8.4. |
| `/api/document` returns live Y.Text | packages/server/src/api-extension.ts:1238 | VERIFIED. Falsifies A3. |
| File-watcher doesn't cache file content | packages/server/src/file-watcher.ts:57-63 | VERIFIED. FileIndexEntry has no `content` field. |
| ACTIVITY_MOUNT_LIMIT=3 | packages/app/src/components/EditorActivityPool.tsx:174 | VERIFIED. |
| MAX_POOL=10 | packages/app/src/editor/provider-pool.ts:77 | VERIFIED. |
| `docs/src/mdx-components.tsx:11-26` componentMap | docs/src/mdx-components.tsx | VERIFIED. File is 26 lines, function spans 11-26. |
| Core has no React deps | packages/core/package.json | VERIFIED. Reveals BLOCK #2. |
| Walker reference at /tmp/.../MdToReact2.tsx | /tmp/ok-perf-validation/fumadocs-static-fallback/probe/src/MdToReact2.tsx | VERIFIED. 187 LoC (spec says ~200), missing wikiLink + rawMdxFallback handlers. |
| InternalLinkView size | packages/app/src/editor/extensions/InternalLinkView.tsx | VERIFIED. 506 LoC with complex state. |
| WikiLinkView size | packages/app/src/editor/extensions/WikiLinkView.tsx | VERIFIED. 500 LoC. |
| `cold-mount-instrumentation.ts` in worktree | packages/app/src/lib/perf/ | NOT present — lives in `cold-mount-profile-instr` branch per spec §13. Cherry-pick dependency confirmed. |

No unverified citations drove a finding without note.

---

**End of audit.** Spec author: these findings are adversarial by design. The spec is strong; the findings listed here are the 5% that catches a reviewer's eye. Adjudicate severities against your own risk tolerance.
