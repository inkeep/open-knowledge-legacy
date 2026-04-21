---
title: "Component Blocks v2 × V2 Perf Spec — Interweaving Analysis"
description: "How the V2 perf spec interweaves with specs/2026-04-14-component-blocks-v2/SPEC.md (Draft). Identifies conflicts, synergies, and compatibility points. Pinned against CB-v2 commit a0d86fab8cffeb7959cb838ca0ec8bc44cd6c50c."
createdAt: 2026-04-20
updatedAt: 2026-04-20
status: supporting
pinned_commit: a0d86fab8cffeb7959cb838ca0ec8bc44cd6c50c
applies_to: specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/ (this spec) × specs/2026-04-14-component-blocks-v2/ (Draft)
---

# Component Blocks v2 × V2 Perf Spec — Interweaving Analysis

**Purpose.** Component Blocks v2 (CB-v2, `specs/2026-04-14-component-blocks-v2/SPEC.md` at commit `a0d86fab8cffeb7959cb838ca0ec8bc44cd6c50c`) is Draft status, introducing 3 new architectural precedents and widening jsxComponent + jsxInline schemas. This document identifies how V2 perf spec interweaves with CB-v2's scope and delivery.

**Bottom line:**
- No blocking conflicts. Both specs additively extend precedents; no 1-way doors cross them.
- Three critical interactions (C1–C3 below) require V2 perf spec to adapt its scope.
- One accidental synergy: V2 cache's stable editor identity SOLVES a CB-v2 risk (BridgeStore re-publish flicker on nav).
- Alt 5 InteractionLayer scope MUST include `jsxComponent` + `rawMdxFallback` (hard requirement given CB-v2 trajectory).

---

## Critical interactions (require V2 perf to adapt)

### C1. `JsxComponentView` is a heavier React NodeView than `InternalLink` ever was

CB-v2 §9.7 NodeView renders, per block instance:
- A live 3P React component (fumadocs `Callout` / `Tabs` / `Accordion` / `Steps`)
- `ComponentErrorBoundary` (class component)
- `ComponentToolbar` (button + hover outline CSS)
- Conditional `PropPanel` (Radix Popover — on-selection)
- `ContextBridgeProvider` chain (1 `useSyncExternalStore` subscription per NodeView, per-render $pos.node(depth) walk)
- `bridgeIdPlugin` appendTransaction walk on every tx

Per-instance cost is **5–10× an `InternalLink` MarkView**. Per-doc instance counts are smaller (fumadocs docs have dozens of `<Callout>` / `<Tabs>`, not 768 links), but the product lands in the same order of magnitude. **Alt 5's generalized InteractionLayer MUST cover `jsxComponent` or we ship a known-worse NodeView-pattern for a larger surface.**

The port is not mechanical — `InternalLink`'s "plain-DOM chip + shared popover" doesn't fit a NodeView that renders arbitrary React; the InteractionLayer primitive bifurcates:

- **Simple marks** (InternalLink, WikiLink): plain-DOM chip + shared popover trigger
- **Rich NodeViews** (JsxComponent, RawMdxFallback): per-instance live component render + **single** editor-root PropPanel / Toolbar / Breadcrumb keyed by `activeNodeId`

The single-PropPanel-at-root pattern is a net win for CB-v2 too (one ancestor-walk per PropPanel open, not per NodeView render).

### C2. `rawMdxFallback` gains a nested CodeMirror editor (CB-v2 §9.14, Precedent #24)

Each invalid-MDX block embeds a CM6 `EditorView` (~50–100 KB state). Estimated 10–50 instances per page. **V2 Editor cache memory budget must include nested CM state.** Current cold-pool-warm probe estimate of ~400 MB per cached Editor (PROJECT) rises to ~400 MB + ~50–100 MB nested-CM when CB-v2 ships. Size-aware caching policy (V2 perf FR3) stays load-bearing.

### C3. Precedent #24 direct PM dispatch conflicts with nothing, but ties nested CM lifetime to parent Editor

CM-in-PM uses PM-dispatch (not y-codemirror.next), so nested CMs ride the parent Editor's lifetime. If V2 cache uses `Editor.mount/unmount` (preserves identity), nested CMs survive nav. If V2 cache recycles via `Editor.destroy()`, all nested CMs go with it and lose any unsaved state — but since commits are synchronous to PM transactions, "unsaved" here means only pre-commit cursor position + ephemeral CM state. Low risk.

---

## Accidental synergy (V2 perf spec solves a CB-v2 risk)

### S1. V2 Editor cache preserves CB-v2's `bridgeIdPlugin` + `BridgeStore` identity across nav

CB-v2 §9.15 keys `BridgeStore` by `WeakMap<Editor, BridgeStore>` and `bridgeIdPlugin` holds `PluginState<WeakMap<Y.XmlElement, string>>`. Both assume editor identity is stable across the doc's life. Current architecture destroys the editor on every nav (TipTap `useEditor.scheduleDestroy(1ms)`) → BridgeStore + bridgeId assignments rebuild on every return to the doc → fumadocs Tabs/Accordion children risk a flash of "missing context" on every nav until bridgeIdPlugin reassigns + publishers re-publish.

**V2 Editor cache using `Editor.mount/unmount` (NOT destroy) preserves editor identity → BridgeStore persists → no re-publish flicker on nav.** This is a concrete UX improvement CB-v2 inherits for free.

---

## Compatibility points (no changes needed)

### K1. `jsxInline` thin shape (CB-v2 §9.8, NG14) is already the Alt-5 ideal

Zero NodeView, plain `<span data-jsx-inline>`, no chrome. Confirms CB-v2 authors already applied the MarkView-avoidance principle for the inline case. V2 perf adds nothing here.

### K2. §8b `content-visibility: hidden` compatible with `jsxComponent` subtrees

Preserves layout + React state for the hidden mode, skips paint. No interaction with fumadocs render.

### K3. Schema widening (`jsxComponent` → `content: 'block*'`) is add-only (Precedent #9 compatible)

V2 perf does no schema work — doesn't conflict.

### K4. Fumadocs CSS integration (CB-v2 §9.7a, ~80 LoC) is independent of V2 perf

No DOM structure change our InteractionLayer refactor would observe.

### K5. Context Bridge ancestor-walk is O(depth), not O(nodes)

Per-render cost is bounded (typical depth 2–3). Doesn't stack with 768-link cost the way per-node MarkView cost does.

---

## Forward-compat contract: what V2 perf commits to for CB-v2

V2 perf's FR8 commits InteractionLayer to the following contract for CB-v2's `JsxComponentView`:

1. **Per-instance live component render stays in the NodeView** (no way around this — fumadocs components are React). `<NodeViewContent />` continues to render children inline.
2. **InteractionLayer PRIMITIVE ships with V2** — registration, activeNodeId routing, singleton PropPanel slot. V2's own extensions (InternalLink, WikiLink, RawMdxFallback) wire to PropPanel only.
3. **Toolbar + Breadcrumb slots are EXTENSION POINTS** of the primitive. V2 does NOT wire them — CB-v2 wires them for `JsxComponentView` when CB-v2 ships. Primitive supports additional controls via the same `register({ type, nodeId, ...controls })` shape. (Refined per Audit finding S15; see `audit-findings-resolution.md` §Part 2.)
4. **ContextBridgeProvider chain wraps the per-instance render** as CB-v2 §9.15 specifies — unchanged.
5. **bridgeIdPlugin PluginState continues to live in the editor** (V2 cache preserves editor → PluginState persists naturally).
6. **BridgeStore WeakMap<Editor, BridgeStore> persists across nav** because V2 cache preserves Editor identity.
7. **Invalid-state nested CM (Precedent #26)** uses the same `createNestedCMExtensions` factory as `rawMdxFallback` — both render through InteractionLayer when invalid, through per-instance NodeView when healthy.

CB-v2 authors should review this contract when integrating V2 perf. If any point conflicts with CB-v2's implementation plan, surface the conflict during Audit phase of V2 perf (the phase has a dedicated challenger subprocess).

---

## Scope implications for V2 perf

### Before this analysis

InteractionLayer scope was ambiguous between "InternalLink + WikiLink only" (the simple case) and "all 4 React-view extensions." Evidence on the size-spectrum scaling curve + NodeView density findings tentatively favored the larger scope.

### After this analysis

**InteractionLayer MUST include all 4 extensions** (FR5–FR8) because CB-v2's `JsxComponentView` is a harder instance of exactly the problem InternalLink has. Shipping InteractionLayer for InternalLink+WikiLink only would mean:
1. CB-v2 ships its `JsxComponentView` with per-instance PropPanel/Toolbar (the pattern V2 is replacing)
2. A migration story later to port `JsxComponentView` onto InteractionLayer — duplicate work
3. Interim UX where fumadocs components perform worse than the 768-MarkView case V2 just fixed

Greenfield directive + "no deferred tech debt" rule out the interim period. Scope calibration locked to all 4.

---

## Open coordination items

- **CB-v2 Draft status.** CB-v2 is currently Draft; V2 perf is Scaffold. If CB-v2 finalizes before V2 perf Iterate phase, V2 perf integrates CB-v2's locked decisions. If V2 perf ships first, CB-v2 inherits InteractionLayer as a primitive.
- **Precedent coordination.** CB-v2 introduces Precedents #24, #25, #26. V2 perf introduces candidate #18(b) corrigendum + candidate #18(h) (CM6 reparent). No numbering conflict. Both specs' precedent additions should be reviewed together at CLAUDE.md update time.
- **Fumadocs dependency.** CB-v2 adds `fumadocs-ui` / `fumadocs-core` to `packages/app/package.json` (18-component built-in manifest). V2 perf's Option E (FR11) also needs fumadocs-ui. If CB-v2 ships first, V2 perf reuses its dependency. If V2 perf ships first, V2 perf adds the dependency — CB-v2 inherits.
- **ComponentMap.** CB-v2 §9.2 defines a registry + descriptor pattern. V2 perf's Option E componentMap (FR11) is a portable copy of `docs/src/mdx-components.tsx:11-26`. **At CB-v2 ship, V2 perf's Option E should switch to consuming CB-v2's `built-ins.ts` registry** — single source of truth for the component map across editor + docs-site + fallback. Flag in V2 perf Phase 4.1.

---

## Timing coordination — RESOLVED as "V2 ships independently"

**Decision (2026-04-20, user directive):** V2 perf spec ships without waiting for CB-v2, irrespective of CB-v2's delivery timeline.

**Implications:**
- FR8 (InteractionLayer for `jsxComponent`) is a forward-compat primitive. V2 ships the primitive; CB-v2 wires its `JsxComponentView` to it at CB-v2's delivery time.
- **If CB-v2 ships BEFORE V2 perf:** CB-v2 ships its own per-instance PropPanel/Toolbar for JsxComponentView (the pattern V2 is replacing). V2 perf's Phase 2.4 port is then a second-pass migration, not a primary implementation. Acceptable but not preferred.
- **If V2 perf ships BEFORE CB-v2:** CB-v2 inherits the InteractionLayer primitive from day 1, uses it for JsxComponentView. Cleanest ordering.
- **If concurrent:** coordinate at integration time only — CB-v2 reads V2 perf's `InteractionLayer` contract from the shipped code.

**No blocking coordination.** V2 perf spec does NOT gate on CB-v2 status. CB-v2 spec is in Draft; V2 perf spec is ready for Audit → Verify → Implementation without waiting.

**Fumadocs dependency:** If CB-v2 hasn't added `fumadocs-ui` / `fumadocs-core` to `packages/app/package.json` by V2 impl sprint, V2 adds them. If CB-v2 added them first, V2 inherits. Same dependency list either way; trivial merge.

**ComponentMap:** V2 perf uses a portable copy of `docs/src/mdx-components.tsx:11-26` as its initial componentMap. When CB-v2 ships its registry (`packages/core/src/registry/built-ins.ts` per CB-v2 FR-8), V2's Option E fallback switches to consuming that registry — single-file change, tracked as post-CB-v2-ship work in V2's Future Work section.

**Precedents:** V2's precedent candidates (#18(b) corrigendum, #18(h) CM6 reparent) do not conflict with CB-v2's precedent candidates (#24 direct PM dispatch, #25 Context Bridge Registry, #26 always-visible content). Different numbering ranges. Both specs' precedent additions can land independently in CLAUDE.md.

**Bottom line:** V2 perf is engineered to work standalone. Coordination surface with CB-v2 is documented above so whichever ships second has a clear integration path.

---

## Verification

This analysis was produced by directly reading `specs/2026-04-14-component-blocks-v2/SPEC.md` at commit `a0d86fab8cffeb7959cb838ca0ec8bc44cd6c50c` (before session compaction, then re-grounded post-compaction). Sections read:
- §3 Non-goals (NG1–NG14)
- §5 User journeys (P1 block editing, P3 maintainer flow)
- §9.1 Architecture (schema widening, γ serialization pattern)
- §9.7 NodeView (JsxComponentView — 3 render branches)
- §9.7a Fumadocs CSS Integration (~80 LoC globals.css)
- §9.8 jsxInline thin shape (NG14)
- §9.14 Nested Editor Architecture (Precedent #24)
- §9.15 Context Bridge Registry (§9.15.1–9.15.9)
- §10 Decision log (D0 — D3)
- §13 In Scope

**Confidence labels on findings above:** HIGH for architectural claims (directly read from CB-v2 SPEC), MEDIUM for cost-extrapolations (per-instance cost × estimated instance count).
