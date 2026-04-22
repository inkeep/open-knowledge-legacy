---
title: "Audit Findings Resolution — Challenger + Auditor reconciled"
description: "Evidence-based triage of 2 audit REPORTs (Challenger adversarial + Auditor verification) against V2 perf spec. Documents decision for every finding: address-now (with cross-ref), accept-with-reasoning, decline-with-evidence."
createdAt: 2026-04-20
updatedAt: 2026-04-20
status: normative
supersedes: null
audit_inputs:
  - evidence/audit-challenger-report.md (referenced; full text at /tmp/ok-perf-validation/audit-challenger/REPORT.md)
  - evidence/audit-auditor-report.md (referenced; full text at /tmp/ok-perf-validation/audit-auditor/REPORT.md)
applies_to: SPEC.md (all sections) + evidence/ (multiple files)
stance: greenfield + no deferred tech debt + architecture-first per user directive 2026-04-20
---

# Audit Findings Resolution

**Methodology.** Per assessment-protocol-draft.md: assess each finding by merit. Do not default to acceptance. Do not default to rejection. Validate the premise + evaluate correctness + consider tradeoffs. Apply greenfield stance: prefer address-now over defer.

**Audit output counts:**
- Challenger: 5 BLOCKs, 10 MUST-FIXes, 11 SHOULD-FIXes, 7 FYIs, 4 disagreements with spec decisions.
- Auditor: 4 DRIFTs (incl. 1 double-checked with Challenger), 5 VERIFIED citations + 17+ citation-audit passes, 2 confidence-label corrections.

**Net resolution:** 13 findings upgraded to address-now (BLOCK/MUST-FIX band), 17 SHOULD-FIXes also addressed (greenfield directive favors clean landing), 3 FYIs addressed as documentation updates, 4 Challenger disagreements with LOCKED decisions declined with evidence-based reasoning.

---

## Part 1 — BLOCK-level findings (address before Implementation)

### B1. Option E data source broken (Challenger #1 + Auditor A3)

**Finding.** SPEC §9.3 + §12 A3 claim Option E renders from "markdown bytes (from file-watcher cache)" and fetches via `/api/document?docName=X`. Both claims falsified:
- File-watcher's `FileIndexEntry` (`packages/server/src/file-watcher.ts:57-63`) stores `{size, modified, canonicalPath, inode, aliases}` — no `content` field.
- `/api/document` (`api-extension.ts:1238`) returns `dc.document.getText('source').toString()` — the live Y.Text from a forcibly-opened Y.Doc session. Calling it during Suspense fallback triggers a second Y.Doc load, defeating the fallback's purpose.

**Confidence.** CONFIRMED (Challenger verified both files, Auditor cross-confirmed).

**Decision.** ADDRESS. Add a new HTTP endpoint that reads disk bytes directly:

```
GET /api/document-disk?docName=X
  → fs.readFile(canonicalPath, 'utf-8')
  → 200 with { markdown: string, mtime: number, bytes: number }
  → 404 if docName not in file-watcher index
```

No Y.Doc session creation. No file-watcher cache mutation. Server-side change lives in `packages/server/src/api-extension.ts`. Update:
- SPEC §6 FR11 (reference new endpoint)
- SPEC §9.3 (data source text)
- SPEC §12 A3 (verification plan: confirm new endpoint lands in Phase 4.0 before Phase 4.1)
- SPEC §13 file-level scope (add `packages/server/src/api-extension.ts` MODIFY)
- SPEC §16 SCOPE (add server/ to allowed surfaces for this one file)

### B2. Walker placement in `packages/core/` violates React-free invariant (Challenger #2)

**Finding.** D4 LOCKED walker to `packages/core/src/markdown/to-react.ts`. CLAUDE.md §"Package: core" explicitly states: *"No React or Node.js server dependencies — browser + Node compatible."* Walker reference imports React + fumadocs-ui.

**Confidence.** CONFIRMED (verified against `packages/core/package.json`: zero React deps).

**Decision.** ADDRESS via SPLIT (preserves forward-compat per D4 rationale while honoring core's boundary):

- **`packages/core/src/markdown/to-react.ts`** — PURE mdast walker. Accepts `createElement(type, props, ...children)` factory function + componentMap as parameters. NO React import. Environment-agnostic (runs in browser, Node, Worker). `~150 LoC`.
- **`packages/app/src/editor/mdast-to-react.tsx`** — Thin React binding (`~50 LoC`). Imports React, provides `React.createElement` as factory, imports fumadocs componentMap, exports `markdownToReact(md: string): React.ReactElement`.

This preserves forward-compat value (MCP render-preview / CLI export can consume the core module with their own createElement implementation — e.g. `preact/compat` or a plain HTML emitter) WITHOUT violating core's React-free invariant.

Update:
- SPEC §10 D4 (rewrite file-placement rationale for split)
- SPEC §13 file-level scope (two new files instead of one)
- SPEC §16 SCOPE (both paths)

### B3. Corrigendum evidence file contradicts D6 REVISED (Challenger #5 + Auditor DRIFT #1)

**Finding.** `evidence/precedent-18b-corrigendum.md` has three occurrences of "ship NOW on perf/investigation as standalone commit" (frontmatter `status: pending_apply` + target field, body opening paragraph, §Ship protocol section). SPEC §10 D6 REVISED says the opposite: corrigendum lands as FIRST commit of V2 impl sprint.

**Confidence.** CONFIRMED (directly observed drift).

**Decision.** ADDRESS. Edit `evidence/precedent-18b-corrigendum.md`:
- Frontmatter: `status: pending_apply` → `status: scheduled_for_v2_sprint_commit_1`
- Frontmatter: `applies_to: perf/investigation branch` → `applies_to: V2 impl sprint first commit (Phase 3.2 preamble)`
- Body §top: rewrite preamble to point at V2 impl sprint
- §Ship protocol: rewrite from `Branch: perf/investigation / Single commit` to `Branch: V2 impl sprint branch / First commit of sprint, Phase 3.2 preamble`
- §Validation post-apply: retain

### B4. InteractionLayer nodeId contract for MARKS undefined (Challenger #4)

**Finding.** FR4 specifies `registerNode({ type, nodeId, getPos, handlers })`. Block NodeViews (JsxComponent, RawMdxFallback) have stable identity via PM node. MARKS (InternalLink, WikiLink — the 768-instance surface that drives the entire Alt 5 rationale) have NO stable identity: text nodes merge/split on edits, ranges move, attrs don't carry a UUID.

**Confidence.** HIGH (PM mark identity is a known technical fact; spec genuinely doesn't address it).

**Decision.** ADDRESS. Add FR4b specifying mark-identity contract using the same pattern CB-v2 §9.15 uses for jsxComponent bridgeId (precedent: already-proven):

- **Mark-identity PluginState.** New PM plugin `markIdentityPlugin` maintains `PluginState<WeakMap<PmMarkInstance, string>>`. On every transaction's `appendTransaction`:
  - Walk doc. For each InternalLink / WikiLink mark span, check if the mark's identity (derivable from `{markType, attrs, rangeFrom, rangeTo}`) has an entry in the map.
  - If not: assign `'m' + ++editorCounter`, store in WeakMap.
  - When PM transactions split/merge/move marks: the new mark span gets a fresh ID (old ID garbage-collected via WeakMap). InteractionLayer sees the change as "old ID deregistered, new ID registered."
- **Interaction rebind.** `markIdentityPlugin` fires `interactionLayer.register(nodeId, ...)` and `.deregister(nodeId)` on PM-state changes. Event delegation on editor root reads `data-mark-id` from the chip's DOM (set at render-time from the PluginState lookup).
- **Cleanup.** WeakMap keys are mark instances; GC'd naturally when PM marks are removed from the doc.

This pattern:
- Consistent with CB-v2's Q10 Option A (bridgeId in PluginState, NOT schema attr).
- Does NOT widen the schema (precedent #9 safe).
- Handles merge/split/move via PM's existing transaction mechanism.
- Provides stable `data-mark-id` for event delegation.

Update:
- SPEC §9.2 (InteractionLayer primitive) — add mark-identity sub-section
- SPEC §6 FR4b (new requirement)
- SPEC §13 file-level scope — add `packages/app/src/editor/extensions/mark-identity-plugin.ts`

### B5. Walker reference incomplete; CORRECTIONS file incomplete (Challenger #3 + Auditor V5 uncaught drifts)

**Finding.**
- Challenger: walker reference `MdToReact2.tsx` (187 LoC) misses `wikiLink`, `rawMdxFallback`, full `defaultMdxComponents` spread, ImageZoom/Mermaid/TypeTable. Uses `remarkMdx` (strict) vs OK's `remarkMdxAgnostic`.
- Auditor: `option-e-utilities-CORRECTIONS.md` caught ONE drift (`hast-util-to-jsx-runtime` error) but missed TWO others in `option-e-utilities.md`:
  - Recommends importing `fumadocs-ui/css/preset.css` — H2 explicitly REJECTS this (3 concrete CSS conflicts documented).
  - Claims `fumadocs-core/link` "needs Vite alias → plain `<a>`" — H2 says NO alias needed; fumadocs-core Link falls back to plain `<a>` in non-Next environments.

**Confidence.** HIGH (both audits independently identified gaps; Auditor verified by re-reading both files).

**Decision.** ADDRESS via three edits:

1. Update SPEC §10 D4 + FR11 with explicit walker completeness requirements:
   - Handler for: paragraph, heading, text, strong, emphasis, inlineCode, code, list, listItem, blockquote, link, image, thematicBreak, break, delete, table, row, cell, html, yaml/toml (skip), mdxJsxFlowElement, mdxJsxTextElement, **wikiLink** (OK-specific), **rawMdxFallback** (OK-specific)
   - ComponentMap includes full `defaultMdxComponents` spread + 13 docs-site additions
   - Revise LoC estimate: `200 LoC` → `400–600 LoC` (pure walker in core + React binding in app, plus fixture tests)
   - Require unit test coverage per node type + corpus fixture regression tests (parallel to `packages/core/src/markdown/fixtures/`)

2. Expand `option-e-utilities-CORRECTIONS.md` with the 2 uncaught drifts:
   - CSS strategy: REJECT `fumadocs-ui/style.css` import; use minimal §9.7a bridge + 1-line Steps fix per H2
   - `fumadocs-core/link`: no Vite alias needed per H2 empirical probe

3. Copy `MdToReact2.tsx` into `evidence/reference-walker-from-h2.tsx` for durability (per Auditor V7). `/tmp/` path is ephemeral.

### B6. Activity-hidden Y.js observer load not capped by V2 cache policy (Challenger #6)

**Finding.** Precedent #18(c) already documents Y.js observers don't pause in hidden Activity. FR3 caps editor-memory via `viewCount ≥ 200` but NOT observer-CPU cost. With MAX_POOL=10 editors + 5 collaborators, 50 Y.js observer firings per remote keystroke. V2 cache AMPLIFIES this by keeping more editors alive.

**Confidence.** HIGH (mathematically correct; pre-V2 architecture partially mitigated via destroy cycles that V2 removes).

**Decision.** ADDRESS. Add FR3b specifying observer-processing cap:

- **Provider-disconnect policy.** Editors in the cache but NOT in the `ACTIVITY_MOUNT_LIMIT = 3` MRU mount list have their HocuspocusProvider DISCONNECTED. Y.js observers still fire locally (they're driven by Y.Doc events, not network), but no CRDT updates ARRIVE from peers.
- **Reconnect on Activity visible.** When a cached editor flips from hidden to visible (via Activity mount promotion), `provider.connect()` re-establishes WebSocket + sync; awareness re-broadcasts local presence.
- **Trade-off:** user on doc A no longer sees doc B's collaborators typing in real-time while doc B is cached-but-hidden. Acceptable — Activity's UX contract is "return to doc, pick up where state was." Multi-doc real-time awareness is a different product feature.

Update:
- SPEC §6 FR3b (new requirement)
- SPEC §9.1 V2 Editor cache contract (add `parkEditor` → `provider.disconnect()`, `mountEditor` on cache-hit → `provider.connect()`)
- CLAUDE.md precedent #18(c) — add clarification: post-V2, Activity-hidden observer CPU cost is bounded by Activity mount list (not pool size). Different from pre-V2 where observer load scaled with pool size.

### B7. InteractionLayer event delegation vs PM node movement (Challenger #7)

**Finding.** `data-node-id` attrs on chips can become stale on paste/merge/split/move. Current per-instance React portals are closure-bound (resilient); attribute-based delegation isn't.

**Confidence.** HIGH.

**Decision.** ADDRESS. Resolved jointly with B4 (mark-identity contract). The `markIdentityPlugin` fires on PM transactions and keeps PluginState fresh. Chip render-time sets `data-mark-id` from the PluginState; PM transactions that move chips regenerate attrs naturally via re-render.

For block NodeViews (JsxComponent, RawMdxFallback), equivalent pattern applies but simpler (PM block nodes have stable identity via y-prosemirror's Y.XmlElement mapping).

No separate new FR; captured in FR4b from B4.

### B8. Option E fallback with Y.Doc-ahead state causes visible content flash (Challenger #8)

**Finding.** FR11 renders from `cachedMarkdown`. If user has live local edits not yet persisted (typing within persistence debounce 2s window), snapshot is stale vs Y.Doc. When editor hydrates, content flashes to newer state.

**Confidence.** HIGH (realistic user scenario).

**Decision.** ADDRESS. Specify FR11 behavior:

1. **Skip-fallback fast path.** If syncPromise resolves in `< 200 ms prod`, skip fallback render entirely. Suspense fallback only renders if `syncPromise` remains pending at 200ms.
2. **Per-session mount tracking.** Once a doc has been mounted in the current session (cache entry exists), its revisit path NEVER renders the fallback — it reparents the cached editor directly. Fallback only fires on true cold visit.
3. **Content-comparison guard.** At fallback-render time, if `fs.readFile`-fetched markdown differs from the cache entry's last-known-markdown (if any), prefer the in-memory version to avoid content regression.

Update:
- SPEC §6 FR11 (add behavioral clauses)
- SPEC §9.3 (update data flow)

### B9. Mermaid layout shift undefined (Challenger #9)

**Finding.** §9.3 "mermaid renders a placeholder, defers to post-hydration" — how does placeholder know dimensions? §14 says "same dimensions" — mermaid dimensions are source-dependent and unpredictable pre-render.

**Confidence.** HIGH (real problem).

**Decision.** ADDRESS. Specify §9.3 Mermaid carve-out:

- Fallback renders a fixed placeholder: `<div className="mermaid-placeholder" style={{aspectRatio: '16 / 9', minHeight: '200px', padding: '2rem'}}>`
- Inside placeholder: `<pre>` of the raw mermaid source (legible text) + "Rendering diagram..." label (accessible `role="status"`)
- Hydration: mermaid lib loads, replaces placeholder with rendered diagram. Layout shift IS expected for mermaid blocks; accepted tradeoff (mermaid is rare, 1.5 MB lib shipping it in fallback chunk is worse).
- Alternative considered + rejected: Skip mermaid entirely in fallback (user sees no content for that block) — worse UX than source visible.

Update SPEC §9.3 + §14 Risks.

### B10. No rollback/kill switch mechanism (Challenger #10)

**Finding.** User directive is "atomic rollout, no feature flags." But a production-only bug surfacing requires reverting the entire sprint PR — 15+ files simultaneously. 5-minute fire drill in prod incident.

**Confidence.** HIGH (technically accurate).

**Decision.** PARTIAL ADDRESS. User's greenfield/atomic-rollout directive is respected, but we add a cheap emergency-only kill switch that does NOT introduce a feature flag:

- `editor-cache.ts` exports a module-level constant `CACHE_ENABLED: boolean = true`.
- When `false`, `mountEditor()` falls through to pre-V2 behavior (create new Editor, destroy on unmount). `parkEditor()` becomes a no-op. `evictEditor()` calls destroy.
- Deployable via a 1-line code edit (no config system, no dynamic flag). Purely for production incident response.

This is NOT a feature flag (no gradual rollout, no per-user toggle). It IS a fire-drill escape hatch. Greenfield directive is preserved; blast radius of a prod incident is bounded.

Update:
- SPEC §13 "Rollback considerations" section (replace "NONE" with "Kill switch constant at editor-cache.ts")
- SPEC §14 Risk: adjust rollback row

### B11. A5 confidence label is LOW not MED (Auditor DRIFT)

**Finding.** A5 claims MED on "view-count measured at mount-time is accurate and cheap." No probe measured this. Per spec's own confidence taxonomy (§at Baseline conventions), unmeasured claims = LOW.

**Confidence.** HIGH (Auditor applied spec's own taxonomy).

**Decision.** ADDRESS. Downgrade A5 from MED → LOW. Add verification plan: "Phase 1.2 implementation must measure `ok/cache/view-count-measure-ms` on PROJECT-scale docs. If > 20 ms per mount, cache view-count at parse-time rather than mount-time."

### B12. A1 confidence label — add fallback probe plan (Auditor MINOR)

**Finding.** A1 claims MED on "TipTap's `Editor.mount()`/`unmount()` APIs work for reparent-without-destroy." Zero empirical validation. H1 probe was CM6-only.

**Confidence.** HIGH (ecosystem evidence from TipTap #6988 contradicts the optimistic claim).

**Decision.** ADDRESS via probe plan, keep MED label. Add Phase 1.0 (pre-1.1) spike:

- Probe `tiptap-reparent-probe` — replicates H1 structure but for TipTap:
  - Full production extension stack: sharedExtensions + Collaboration + CollaborationCursor + y-tiptap + image-upload + table-controls + clipboard serializer
  - 12 test scenarios mirroring H1 §4.2: basic reparent, undo survives, Y.Text remote updates during detached window, typing after reparent, compartment reconfigure, scroll snapshot restore, 5 reparent cycles, destroy after cycles, long detached window with remote updates, `display:none` mode, fully-orphan detach, requestMeasure during detached
- If probe fails: fallback to raw `editor.view.dom` reparent (still untested but same pattern as H1 CM6)
- If BOTH fail: V2 cache for TipTap is INFEASIBLE and Phase 1.1 must be rethought (destroy+recreate with state snapshot would be the fallback-fallback)

Update:
- SPEC §12 A1 verification plan
- SPEC §13 Next actions: Phase 1.0 is "TipTap reparent probe" (pre-Phase-1.1 gate)

### B13. Cost model clarification — separate savings by mechanism (Challenger #15)

**Finding.** §9.2 conflates MarkView portal cost (~2.2s) with browser layout cost (~2.5-3.0s). Removing portals doesn't remove layout for 39K DOM nodes. Spec under-attributes which optimization saves which cost.

**Confidence.** HIGH (measurement data supports clean separation).

**Decision.** ADDRESS. Rewrite §9.2 cost model with proper attribution:

- **InteractionLayer (FR4-FR8)** saves ~2.2 s React reconciliation on cold-pool-warm revisit by collapsing 768 React portals to O(1) shared plane. Marginal cost: ~0.5 ms per plain-DOM chip (TO BE EMPIRICALLY VERIFIED in Phase 2.1).
- **V2 Editor cache (FR1-FR2)** saves ~2.5-3.0 s browser style+layout on cold-pool-warm revisit by preserving mounted DOM. First cold mount still pays the layout cost; subsequent revisits reparent DOM without re-rendering.
- **§8b content-visibility: hidden (FR9)** saves browser style+layout cost on MODE TOGGLE (Visual↔Source), where previously the non-active editor's display:none → visible transition triggered full recalc. Does NOT help cold-mount.
- **Option E (FR11)** doesn't save work; it hides it behind a static fallback paint. Perceptual improvement only.

Three optimizations attack three distinct cost components. Total cold-pool-warm improvement (MEASURED 7.70 s longtask → target <500 ms prod P95) requires ALL three acting together.

Update SPEC §9.2 cost model section.

---

## Part 2 — SHOULD-FIX findings (address for clean landing)

### S1. Cross-tab V2 cache (Challenger A1.1)

**Decision.** ADDRESS as NG8 non-goal. Add to §3: *"[NEVER] NG8: Cross-tab V2 cache coordination (BroadcastChannel-based shared cache). Cache is per-JS-runtime. Same docName opened in two tabs creates two Editor instances, doubled Hocuspocus connection, presence ghost. Status quo today; not regressing. Shared-cache optimization deferred indefinitely — trade-off ratio (complexity vs 2-tab usage frequency) unfavorable."*

### S2. V2 cache + ScrollPreservingContainer asymmetry (Challenger A1.5)

**Decision.** ADDRESS. Couple scroll persistence to cache entry, not to Activity mount container. Update FR1 contract: `parkEditor()` saves `scrollTop` on cache entry. `mountEditor()` on cache-hit: after reparent + focus, restore `scrollTop` from cache entry.

### S3. FR3 N=50 threshold boundary policy (Challenger A1.6)

**Decision.** ADDRESS. Specify in FR3: *"Gate evaluated ONCE at mount. Stored on cache entry. Crossing threshold post-mount (e.g., user edits add new links pushing viewCount past 50) does NOT trigger eviction — the editor remains cached for the rest of its cache lifetime. Eviction is purely LRU-driven."*

### S4. Option G prewarm vs MAX_POOL (Challenger A1.7)

**Decision.** ADDRESS. Specify in FR12: *"Prewarms cannot evict any doc currently in the Activity mount list. Prewarms enter the cache at LRU-oldest position (evictable before any user-initiated navigation). If cache is at `MAX_POOL - ACTIVITY_MOUNT_LIMIT` (= 7), new prewarms are deferred until an LRU slot is freed."*

### S5. Cache eviction ordering contract (Challenger A2.1)

**Decision.** ADDRESS. Specify in FR3: *"Cache-gate decisions are orthogonal: size-gate (viewCount ≥ 200) denies caching at mount-time (editor never enters cache). LRU handles capacity overflow for entries that passed size-gate. No conflict possible."*

### S6. Playwright e2e for InteractionLayer (Challenger A2.5)

**Decision.** ADDRESS. Add to SPEC §13 test infrastructure: E2E scenarios for FR5/FR6/FR7/FR8 — hover, click, keyboard nav (Tab/Shift-Tab), right-click context menu, undo/redo of link edit, drag-drop of chip, screen-reader a11y (axe-core scan). Coverage parity with existing `InternalLinkView` interactions is the pass bar.

### S7. Mobile/touch interactions on plain-DOM chips (Challenger A2.6)

**Decision.** ADDRESS. Add AC to FR4: *"Chips include `touch-action: manipulation` CSS (eliminates iOS 300ms click delay). Long-press on chip triggers context menu (same UX as current React-rendered InternalLink). Pointer-events fire via event delegation through the layer."*

### S8. N=50 justification (Challenger A3.1)

**Decision.** ADDRESS. Add rationale to FR3 documentation: *"N=50 gives 2× headroom below the measured ~100-view Acceptable→Unacceptable boundary (per grey-zone-and-prod-floor §Part A scaling curve). Direct marginal cost is ~2 ms/view, so 50 views ≈ 100 ms CPW delta vs view-less baseline — comfortably within Acceptable. Tunable; can be raised if empirical prod data shows margin is excessive or lowered if regressions emerge."*

### S9. H1 probe missing OK-specific CM6 extensions (Challenger A3.2)

**Decision.** ADDRESS. Add Phase 3.3 AC: *"Empirical verification with production CM6 extension stack (sharedExtensions + createSourcePolishExtension + createWikiLinkSourceExtension + createMdLinkSourceExtension + codeLanguages allowlist + y-codemirror.next) BEFORE shipping Phase 3.3. Extension stack diff from H1 probe may surface assumptions; run equivalent 12-test scenario against production config. If delta found, document and adjust FR10."*

### S10. #18(g) CM6 contract text-shape (Challenger A3.4)

**Decision.** ADDRESS. Rewrite §11 of `cm6-reparent-contract.md` to match existing precedent #18 sub-rule format:

```
**#18(g) — CodeMirror 6 caching via reparent-without-destroy.** Module-level 
`Map<docName, {view, ydoc, ytext, provider}>` with `parkEditor()` detaching 
`view.dom` to parking node (NOT calling `view.destroy()`) and `mountEditor()` 
re-attaching + calling `view.focus()` + optional `scrollSnapshot()` dispatch. 
Only `evictEditor()` on LRU eviction calls `view.destroy()`. Observers 
(Mutation/Resize/Intersection/EditContext) survive within-Document reparent per 
W3C specs. y-codemirror.next's 3 plugins have zero DOM coupling. Cross-Document 
(iframe/ShadowRoot) requires `EditorView.setRoot()`; within-Document does not. 
Empirical: 12/12 probe tests. See `specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/evidence/cm6-reparent-contract.md` for full contract.
```

Concise paragraph, matches #18(a)-(f) style, pointer to full artifact.

Note on numbering: existing CLAUDE.md #18 has sub-rules (a)-(f). This is #18(g). NOT #18(h) as spec mistakenly said. Update SPEC.md D7 + `cm6-reparent-contract.md` §11 + `meta/_changelog.md`.

### S11. Option E hydration timeout behavior (Challenger A5.2)

**Decision.** ADDRESS. Specify in §9.3: *"If syncPromise rejects at 30s timeout, DocumentErrorBoundary shows 'Try again' UI composited OVER the fallback (not replacing). On retry: syncPromise invalidates + re-enters Suspense. Fallback stays rendered as backdrop behind the error chrome."*

### S12. Collaborator cursor on chip (Challenger A5.6)

**Decision.** ADDRESS. Specify in §9.2 InteractionLayer: *"Plain-DOM chips are `contenteditable='false'` with `data-mark-id`. Collaborator cursor decorations (from `CollaborationCursor` extension) render OUTSIDE the chip (on the surrounding paragraph), same pattern as existing contenteditable=false NodeViews. Cursor-in-chip UX (for text-editable JSX components) is CB-v2 scope."*

### S13. §9.3 restoreFromMdx phase ordering (Challenger A6.3)

**Decision.** ADDRESS. Specify walker delegates to existing `MarkdownManager.parse()`: *"Walker consumes mdast produced by `MarkdownManager.parse(md)`, which already runs Phase A (restoreFromMdx) + Phase B (mergedPostParseWalkerPlugin) per CLAUDE.md §Markdown Pipeline. No separate phase ordering needed in walker; it receives Phase-B-complete mdast."*

### S14. componentMap "portable as-is" claim (Challenger A6.4)

**Decision.** ADDRESS. Rewrite FR11 + §9.3: *"ComponentMap is a TRANSFORMATION of `docs/src/mdx-components.tsx:11-26`, spreading `defaultMdxComponents` from `fumadocs-ui/mdx` + 13 additional component bindings (Callout, Tabs, Accordion, Steps, Card, Files, Folder, ImageZoom, Mermaid, TypeTable, etc.). Spread resolution runs at runtime; componentMap is a function `getMDXComponents(components?) → Record<string, ComponentType>`."*

### S15. InteractionLayer singleton Toolbar + Breadcrumb scope (Challenger A7.1)

**Decision.** PARTIAL ADDRESS. V2 ships InteractionLayer primitive (registration + activeNodeId routing + singleton PropPanel). Toolbar + Breadcrumb are extension points the primitive supports but are NOT wired by V2 — CB-v2's JsxComponentView adds them when CB-v2 ships.

This tightens V2's scope: the PRIMITIVE is general, but V2's CONCRETE IMPLEMENTATIONS ship only what V2's extensions need. InternalLink/WikiLink use PropPanel only. RawMdxFallback uses PropPanel (for source commit). JsxComponent will use all three.

Update:
- SPEC §6 FR4 (specify: primitive supports PropPanel/Toolbar/Breadcrumb slots; V2 wires only PropPanel)
- SPEC §9.2 (primitive architecture; deferred wiring for Toolbar/Breadcrumb)
- component-blocks-v2-interweaving.md (FR8 description: CB-v2 wires Toolbar + Breadcrumb at its integration)

### S16. Custom walker bus-factor (Challenger A8.1)

**Decision.** ADDRESS. Add test requirements to SPEC §13:
- Unit test per mdast node type handled by walker (parallel to pipeline.ts fixture convention)
- Corpus fixture regression test under `packages/core/tests/fidelity/to-react-fixture.test.ts`
- Inline docstring at walker's module head explaining: security boundary (`new Function()` trust level = MDX authoring), componentMap conventions, supported-nodes list

### S17. Copy MdToReact2.tsx into evidence/ for durability (Auditor V7)

**Decision.** ADDRESS. `cp /tmp/ok-perf-validation/fumadocs-static-fallback/probe/src/MdToReact2.tsx specs/.../evidence/reference-walker-from-h2.tsx`

---

## Part 3 — FYI findings (documentation-only addresses)

### F1. TipTap 4 fragility (Challenger A8.2)

**Decision.** DOCUMENT. Add to SPEC §14 Risk table: *"TipTap 4 breaking change to `Editor.mount/unmount`. Mitigation: V2 cache isolates TipTap-specific code to `packages/app/src/editor/editor-cache.ts`. Re-wire on major-version bump is bounded to that single module."*

### F2. FallbackDocumentRender vs MCP/docs-site drift (Challenger A8.3)

**Decision.** PARTIAL ADDRESS. Walker split (B2) gives MCP render-preview a natural reuse hook — the pure core module. ComponentMap drift (editor-side vs docs-site-side) is a documentation/ownership issue. Add to SPEC §15 Explored: *"ComponentMap source-of-truth: `docs/src/mdx-components.tsx` is canonical for 3P consumers. V2's editor-side componentMap imports from it directly (no copy). Drift eliminated by shared import; docs-site changes propagate to editor automatically."*

### F3. CLAUDE.md WARN rule for post-V2 editor outlives component (Challenger A8.4)

**Decision.** ADDRESS. Add to SPEC §13 CLAUDE.md mods: *"New WARN rule in Known Pitfalls — **WARN:** post-V2, a TipTap or CM6 editor instance in the module-level cache outlives the React `<TiptapEditor>` / `<SourceEditor>` component that originally rendered it. `useEffect` cleanups on the component MUST NOT call `editor.destroy()` / `view.destroy()` — only `evictEditor(docName)` on cache eviction should destroy. Extension authors writing lifecycle code: assume editor persists across 'unmount' and reason accordingly."*

---

## Part 4 — Challenger disagreements with LOCKED decisions (evidence-based responses)

### D1.α — Challenger disagrees with D1 (Alt 5 scope = all 4 extensions)

**Challenger argument.** Incremental scope: ship InternalLink only, measure impact, port WikiLink only if needed, defer others.

**Response.** DECLINE.

Evidence basis: D1's all-4-extension scope is not speculative architecture — it's evidence-backed. The 6-point scaling curve + WikiLink-equal-to-InternalLink measurement + CB-v2's JsxComponentView 5-10× heavier structure together establish that:
- Per-instance cost is roughly linear across extension types (~2 ms/view direct)
- The total cost on doc-heavy content is the sum of instances (768 on PROJECT, 176 on STORIES)
- CB-v2's JsxComponentView is architecturally the same class of problem (rich React NodeView in PM)

Incremental shipping would measure impact of InternalLink port, then re-open architecture decisions for others. That's exactly the churn greenfield directive avoids. The spec commits to the full scope because the architecture generalizes across all 4 extensions, and the cost savings stack.

If incremental shipping surfaced a reason to abandon Alt 5 for some extensions (e.g., "InternalLink doesn't help because browser layout still dominates"), that would invalidate V2's cost model entirely. The cost model is HIGH-confidence per the 5-component attribution measurement. No incremental-learning uplift expected.

Stay with D1 LOCKED.

### D2.α — Challenger disagrees with D4 (Option E custom walker)

**Challenger argument.** Consider SSR via Tiptap JSON → HTML, or `react-markdown` with custom components.

**Response.** DECLINE.

Evidence basis:
- SSR via Tiptap JSON: would require a Node-side Tiptap mount, which defeats the browser-only architecture V2 commits to. Also requires PM JSON → HTML serialization, which loses fumadocs component styling (PM JSON doesn't carry the React element tree).
- `react-markdown`: confirmed rejected by the H2 probe + `option-e-utilities.md` ecosystem table — `react-markdown` has "HTML intrinsics only" and cannot render `<Callout>` / `<Tabs>` by component name. No empirical probe needed; the library's limitations are documented in its own README.

The walker is ~400-600 LoC (per B5 correction). That's owned by Nick + future contributors. It's the same kind of commitment as `packages/core/src/markdown/pipeline.ts` (which is 3,665 LoC of OK-specific invariants). Maintenance burden is real but proportionate to value.

Stay with D4 LOCKED.

### D3.α — Challenger disagrees with single-sprint ("15 engineer-days") model

**Challenger argument.** 2-phase sprint (Phase 1+3 first, measure, then 2+4) would be safer.

**Response.** DECLINE.

User directive 2026-04-20 was explicit: *"We want to ship this end to end in one go, complete, irrespective of cb-v2."* Sprint cadence is the user's decision, not the spec's.

The spec's role is to ensure the sprint can safely execute end-to-end. Audit findings being many ≠ spec is too ambitious — audit findings indicate the spec is UNDER-SPECIFIED in places that can be fixed without changing cadence. All BLOCKs + MUST-FIXes addressed in Part 1 above; sprint can execute atomically post-Verify.

Stay with user's single-sprint directive.

### D4.α — Challenger disagrees with D6 REVISED (corrigendum to V2 sprint)

**Challenger argument.** Corrigendum should ship standalone on `perf/investigation` NOW.

**Response.** DECLINE.

The corrigendum window is V2 sprint length. Sprint is scoped to complete without calendar wedging. Cost of stale CLAUDE.md claim during sprint is bounded to internal consumers (not user-facing) and mitigated by the evidence files documenting the correction.

Atomic delivery has concrete review-surface value. V2's implementer (AI coding agent) reads SPEC.md + evidence/; separate corrigendum commit requires separate review context. Single PR = single review.

Stay with D6 REVISED LOCKED.

---

## Summary of edits to apply

| Target | Change type | Edits |
|---|---|---|
| SPEC.md §2 Goals | Minor | No changes (G1-G7 remain calibrated) |
| SPEC.md §3 Non-goals | Addition | Add NG8 (cross-tab cache) |
| SPEC.md §6 Functional requirements | Addition + modification | FR3 refined (§S3, §S5, S8 rationale), NEW FR3b (observer cap), NEW FR4b (mark-identity), FR11 refined (§B5, B8, S11, S14), FR12 refined (§S4), NEW SHOULD FR: kill switch (§B10), revise §S15 scope of Toolbar/Breadcrumb |
| SPEC.md §7 Success metrics | Addition | Add new telemetry marks per §9.2 cost model split |
| SPEC.md §9.1 V2 cache contract | Modification | Add scroll persistence + provider-disconnect policy |
| SPEC.md §9.2 InteractionLayer | Modification | Add mark-identity contract, rewrite cost model per §B13 |
| SPEC.md §9.3 Option E | Modification | Add data-source description (per §B1), add Mermaid carve-out details (§B9), add componentMap runtime transformation note (§S14), add pipeline note (§S13), add hydration timeout behavior (§S11) |
| SPEC.md §10 Decision log | Modification | D4 rewrite for walker split (§B2), D7 corrects sub-rule letter (g not h) per §S10 |
| SPEC.md §12 Assumptions | Label correction | A1 verification plan adds probe step (§B12), A5 MED → LOW (§B11) |
| SPEC.md §13 In Scope | Addition | New files (api-extension.ts modify, mark-identity-plugin.ts new, editor-cache.ts kill switch, componentMap.ts), Next actions add Phase 1.0 probe |
| SPEC.md §14 Risks | Addition | TipTap 4 fragility (§F1), kill switch replaces "NONE" (§B10) |
| SPEC.md §15 Future Work | Addition | ComponentMap source-of-truth (§F2) |
| SPEC.md §16 Agent constraints | Modification | SCOPE to include server/ one file + new editor files |
| evidence/precedent-18b-corrigendum.md | Drift fix | 3 locations (§B3) |
| evidence/cm6-reparent-contract.md §11 | Rewrite | Match #18 sub-rule format (§S10); number is (g) not (h) |
| evidence/option-e-utilities-CORRECTIONS.md | Expansion | Add CSS strategy drift + fumadocs-core/link contradiction (§B5) |
| evidence/reference-walker-from-h2.tsx | NEW | Copy of MdToReact2.tsx (§S17) |
| evidence/component-blocks-v2-interweaving.md | Update | FR8 scope refinement (§S15) |
| CLAUDE.md (V2 sprint commit 1) | Addition | New WARN rule (§F3) alongside precedent #18(b) corrigendum |
| meta/_changelog.md | Append | "Audit findings resolved" entry |

---

## Confidence audit (post-triage)

All resolutions grounded in:
- Audit REPORTs' own evidence (citations verified by Auditor)
- Cross-spec prior art (CB-v2 §9.15, precedent #9, precedent #18, precedent #24)
- User directive (greenfield, no deferred tech debt)
- Assessment-protocol-draft.md methodology (merit-based, evidence-cited)

Declined disagreements grounded in: user directive (single sprint, atomic delivery) + pre-existing evidence supporting LOCKED decisions.

Net: 13 BLOCKs + 17 SHOULD-FIXes + 3 FYIs addressed = 33 findings routed to spec edits. 4 disagreements declined with reasoning. Zero findings deferred to Future Work without explicit classification.

Ready to apply edits.
