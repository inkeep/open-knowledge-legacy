# Mermaid + Audio Rendering — Deferred (Placeholder Shipped)

**Date:** 2026-04-21
**Status:** Deferred for post-PR #165 scoping
**Related research report:** [`reports/mermaid-rendering-options-for-mdx-editors/REPORT.md`](../../../reports/mermaid-rendering-options-for-mdx-editors/REPORT.md)

---

## What this evidence captures

SPEC.md's D3-LOCKED decision planned `Mermaid` and `Audio` as **shadcn wrappers** at `packages/app/src/components/ui/{mermaid,audio}.tsx`, with visual-regression tests VR13 (Mermaid × light/dark) and VR14 (Audio MP3 × light/dark). PR #165 did **not** ship these wrappers; the `Mermaid` and `Audio` registrations in `componentMap.tsx` point at inline placeholder stubs. This evidence records the divergence, the current rendering reality, and the decision framework for a future un-deferral. It is NOT a recommendation.

## Shipped state audit (2026-04-21)

Grep of `packages/app/src/editor/components/componentMap.tsx`:

| Descriptor | Target in `componentMap` | What actually renders |
|---|---|---|
| `Mermaid` | `MermaidPlaceholder` (inline in `componentMap.tsx:24-31`) | Bordered `<div>` with `<div className="mb-1 font-medium">Mermaid Diagram</div>` + the raw `chart` string inside `<pre className="overflow-x-auto text-xs">`. **No SVG. No Mermaid.js invocation.** |
| `Audio` | `AudioPlaceholder` (inline in `componentMap.tsx:33-46`) | Bordered `<div>` with `<audio controls src={props.src}>` inside. **Real HTML5 `<audio>` element** — the "placeholder" label is misleading; the audio actually plays at the browser level. No shadcn chrome. |
| `ImageZoom` | `ImageZoom` from `fumadocs-ui/components/image-zoom` | **Real fumadocs `ImageZoom` component** (wraps `react-medium-image-zoom`). No placeholder. |
| `Video` | (not in registry) | N/A — the 18-component manifest does not include a `Video` descriptor. |

Grep of `packages/app/src/components/ui/`: `mermaid.tsx` and `audio.tsx` — **not present**. The planned shadcn wrappers were never authored.

Source code comment on the placeholder block:

```tsx
// packages/app/src/editor/components/componentMap.tsx:11
// Mermaid + Audio are placeholder stubs until shadcn wrappers are built.
```

## What the spec said vs what shipped

| SPEC reference | Stated plan | Shipped reality |
|---|---|---|
| FR-8 (line 160) | "16 fumadocs-ui + Mermaid + Audio shadcn wrappers per D3" | 16 fumadocs + 2 inline placeholder stubs |
| §9.15.7 table (line 742) | "2 shadcn wrappers to write (`packages/app/src/components/ui/{mermaid,audio}.tsx`)" | Files absent; rendering inlined in `componentMap.tsx` |
| D3-LOCKED (line 2200) | "Built-ins P0: 18 components (16 fumadocs + Mermaid + Audio shadcn wrappers)" | 18 descriptor count preserved, but 2 of them placeholder-backed |
| VR13 (line 668) | "Mermaid with flowchart fixture × {light, dark} — Diagram renders; colors match" | Test not implemented; diagram would not render |
| VR14 (line 669) | "Audio with test MP3 × {light, dark} — Audio player chrome (shadcn wrapper) matches reference" | Test not implemented; audio element plays but chrome does not match a shadcn reference |

## Why the spec-vs-shipped divergence exists

Not captured in the spec's `_changelog.md`. The implementation decision to ship placeholders was made during the PR #165 build-out, without a corrigendum against the spec. Re-stating plainly: the spec's plan was to author two shadcn wrappers; the shipped code has inline placeholders. Neither source documents the reason for the divergence.

The `Mermaid` placeholder is a functional gap (no rendering). The `Audio` placeholder is a chrome gap (playback works, but the player lacks the shadcn visual treatment specified by VR14). `ImageZoom` is fully shipped.

## Decision framework for un-deferring (from research)

The standalone research report at `reports/mermaid-rendering-options-for-mdx-editors/` covers the full factual landscape. Before picking a direction, these decisions must be made (collated from the report's "what more information would we need" recap):

### Product scope

1. **Which Mermaid diagram types must be supported?** Gate between `mermaid@11.14.0` (20+ types, 21 transitive deps, ~153 KB first-insert gzipped per bundlephobia) and `beautiful-mermaid@1.1.3` (6 types, 2 deps, ~68-482 KB depending on elkjs inclusion). See REPORT §D1, §D2.
2. **Who authors Mermaid in this product?** DSL-fluent power users or casual authors needing a visual builder? (No surveyed editor ships a visual Mermaid builder.)
3. **Bundle budget?** First-insert cost vs. cold-start cost vs. per-diagram incremental.

### UX pattern

4. **Live-render-while-typing, render-on-commit, or explicit-toggle?** Constrains cache strategy + debounce + error UX all at once. See REPORT §D3 summary grid and §D4.3.
5. **Source-vs-render toggle shape?** Five prior-art shapes: tri-state (Notion), cursor-based edit mode (Outline), split view always-visible (MDXEditor), click-to-edit (Lexical community), `rawMdxFallback` nested-CM drop-down (our Precedent #24 pattern).
6. **Error fallback?** Per Precedent #26 (all user content visible and editable): inline error text, dim-last-render, drop-to-nested-CM, or re-raise to wildcard?

### Architectural fit (requires codebase source-read)

7. **NodeView vs Decoration.widget vs fenced-code-rewrite?**
   - NodeView (matches our current componentMap registry dispatch — `<Mermaid chart="..." />` JSX)
   - Decoration.widget on a `code_fence` node with `language="mermaid"` (Outline's pattern; preserves source as PM text content)
   - Fenced code + `remarkMdxMermaid` rewrite to `<Mermaid />` at parse time (fumadocs pattern; already shipped in our installed `fumadocs-core@16.1.0`)
8. **Activity-pool cache interaction.** `ACTIVITY_MOUNT_LIMIT = 3` unmounts NodeViews; a pool recycle resets React state. Module-level promise cache (fumadocs-style) survives; component-level `useMemo` does not. Trade-off depends on expected chart-change cardinality per session.
9. **CRDT bridge story for live Mermaid source editing.** Typing in source mode flows through Observer B. Does the observer need to know about Mermaid's JSX shape? Precedent #10 vs Precedent #24 considerations.

### Operational

10. **Mermaid `securityLevel`:** `'strict'` (sanitize), `'loose'` (allow click-handlers + links), `'sandbox'` (iframe isolation).
11. **Theme coupling** to `next-themes` `resolvedTheme` — REPORT §D3 shows no editor auto-derives from CSS variables; all use explicit named themes.
12. **Desktop (Electron) constraints** — CSP / file:// / Chromium-version pinning may narrow renderer options.

### What the research already rules out

- **No WASM port** — mermaid-js team explicit (Issue #3650, Discussion #4789).
- **Server-side rendering** (mermaid-cli, mermaid.ink, Kroki) is orthogonal to the live-editor question — useful for build-time static docs only.
- **No cross-React-mount shared cache** pattern in prior art — any such design would be novel.
- **Open #7094** — `@mermaid-js/parser` langium deep-imports fail in Webpack/Turbopack; Vite/Rollup status at `@mermaid-js/parser@1.1.0` (11.14.0's pin) UNCERTAIN.

### Sub-investigations available before picking a direction

Listed in REPORT.md §Research Recap as potential Path-C follow-ups:

- `@mermaid-js/parser@1.1.0` langium-bundler verification against Vite (targeted spike)
- Adaptive-debounce pattern survey beyond mermaid-live-editor
- `@toeverything/mermaid-wasm` lineage + diagram-coverage attestation (if worker+WASM is on the table)
- Visual diagram-builder products (Excalidraw, tldraw, Whimsical) — out of research scope but may reframe the core question ("should we ship Mermaid, or a visual tool?")

## Audio gap (separate from Mermaid)

Audio is a narrower question. `AudioPlaceholder` already renders a working HTML5 `<audio controls src={src}>` element — audio playback works end-to-end. The gap vs spec is:

- No shadcn chrome (VR14 specifies "audio player chrome — shadcn wrapper")
- No `title` rendering beyond "Audio" fallback
- Placeholder component inline in `componentMap.tsx` rather than extracted to `packages/app/src/components/ui/audio.tsx`

A shadcn Audio wrapper scope is well-contained: one component file, replacing the inline placeholder with a labeled player + shadcn styling. No research report needed.

## Video gap (not in registry at all)

The 18-component manifest (`packages/core/src/registry/built-ins.ts:374-578`) has no `Video` descriptor. Fumadocs ships no Video component either — raw HTML5 `<video>` is the only first-class path in the fumadocs ecosystem (and even there, only a Tailwind typography margin rule, not a component). Adding `Video` would be a greenfield registry addition following the `Audio` pattern.

## Related spec non-goals (existing deferrals)

- `evidence/custom-components-deferred.md` — NG13 user-authored components
- `evidence/inline-component-editing-deferred.md` — NG14 live-rendered inline MDX
- `evidence/deferred-invariants-and-perf.md` — I-series invariants and perf tests deferred

This deferral joins that list at the D3-implementation level: the shadcn wrappers were LOCKED as in-scope but were not implemented, shipping placeholders instead. The spec text (line 160, 669, 670, 742, 2200) remains the moment-in-time source of truth for the plan; this evidence file records the shipped divergence and the un-deferral decision framework.

## When to revisit

Trigger conditions (any one warrants un-deferring):

1. Product spec or user research confirms Mermaid is a required authoring surface for the target audience
2. A customer-facing doc author requests diagram rendering and the raw-source fallback is not adequate
3. A visual-regression test suite regression (if VR13/VR14 are ever implemented) forces the decision
4. The `mermaid@11.14.0` → later-version gap becomes large enough that adoption-path research staleness warrants a rerun

Until then: `MermaidPlaceholder` and `AudioPlaceholder` live in `componentMap.tsx` as-is. Research is preserved at `reports/mermaid-rendering-options-for-mdx-editors/` for whoever picks this up.
