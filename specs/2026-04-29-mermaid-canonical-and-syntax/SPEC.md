# Mermaid — Canonical Descriptor + ` ```mermaid ` Fence

**Status:** Draft (stub)
**Owner(s):** anubra266
**Last updated:** 2026-04-29
**Baseline commit:** `38368ebc`
**Links:**
- Math sibling spec (this is the same shape, scaled down): [`specs/2026-04-29-math-canonical-and-syntax/SPEC.md`](../2026-04-29-math-canonical-and-syntax/SPEC.md).
- Parent scope (5-pack scope contract this lifts): [`specs/2026-04-23-cb-v2-md-foundation/SPEC.md`](../2026-04-23-cb-v2-md-foundation/SPEC.md) — promotes NG21.
- Mermaid stub-removal context: [`specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`](../2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md) — 2026-04-21 placeholder removal under the greenfield directive.
- Prior research (factual landscape): [`reports/mermaid-rendering-options-for-mdx-editors/REPORT.md`](../../reports/mermaid-rendering-options-for-mdx-editors/REPORT.md).

---

## 1) Problem statement

**Situation.** Mermaid was registered then removed 2026-04-21 because the placeholder rendered chart source as `<pre>` — non-functional. Per the greenfield directive, capability without a working renderer doesn't ship. Authors who need diagrams (system architecture, sequence flows, class diagrams) currently have no first-class path; ` ```mermaid ` fences fall through to plain code blocks, and `<Mermaid />` JSX hits the wildcard fallback chrome.

**Complication.** Two independent surfaces, one canonical store. The canonical/compat split the 7-pack uses (after Math shipped) is the obvious template:
- **Canonical:** `<Mermaid chart="…" />` JSX descriptor — full prop surface (chart, id, theme).
- **Compat:** `MermaidFence` for ` ```mermaid …``` ` fenced code blocks — γ-preserves the fence form on round-trip; convert-to-canonical is identity.

**Resolution.** Single pack of changes, mirrors the math pattern:
- Add canonical `Mermaid` descriptor (`mermaidProps` — chart required+autoFocus, id, theme enum advanced).
- Add `MermaidFence` compat (`rendersAs: 'Mermaid'`); promoter maps `code{lang:'mermaid'}` mdast → `mdxJsxFlowElement(MermaidFence, {chart})`.
- Wire `MermaidView` React component (lazy `import('mermaid')`, `mermaid.render()` async, error chrome on parse failure, no SSR — Mermaid is browser-only per upstream).
- Slash-menu entry via the descriptor registry (icon `Workflow`).

7-pack scope: Callout + Image + Video + Audio + Accordion + Math + Mermaid.

## 2) Goals

- **G1** — Ship `<Mermaid>` as the 7th canonical descriptor with a working mermaid-js renderer (no stub, no placeholder, no `<pre>` fallback).
- **G2** — ` ```mermaid ` fenced code parses to a compat descriptor that γ round-trips byte-identical when un-edited.
- **G3** — Single render path (`<Mermaid>` React → `mermaid.render()`) serves canonical + compat. Mermaid lib is lazy-imported (~150 KB gzipped at first diagram).
- **G4** — Inherit CB-v2 architectural decisions verbatim (canonical/compat split, γ pristine path, descriptor-driven slash menu). No relitigation.
- **G5** — Promote NG21 (cb-v2-md-foundation) — annotate the predecessor spec per the post-ship corrigendum convention.

## 3) Non-goals

Inherited from cb-v2-md-foundation §3 (verbatim, not re-derived here).

Added by this spec:

- **[NEVER]** NG-Mer1: Server-side / build-time mermaid render. Mermaid is browser-only per upstream (issue #3650). Storage layer holds the chart source string; rendering is a pure render-time concern.
- **[NEVER]** NG-Mer2: Mermaid as an inline atom. Diagrams are inherently flow-level — no inline-math-equivalent for mermaid.
- **[NOT NOW]** NG-Mer3: Per-document theme override. Theme prop ships as forward-compat; the actual switch wires up alongside theme-switching infrastructure (dark mode toggle, etc.). Default-theme-only at ship.
- **[NOT NOW]** NG-Mer4: Custom mermaid configuration (look-and-feel: securityLevel, sequence diagram actor styling, gantt date format). Single `mermaid.initialize()` call with `securityLevel: 'strict'`. Authors who need richer config can write a config block in their host repo's wrapper code; not surfaced as a per-instance prop.
- **[NOT NOW]** NG-Mer5: Custom CodeMirror grammar for ` ```mermaid ` fence highlight. Mermaid has its own DSL; no CodeMirror-compatible grammar exists in the legacy-modes set we already consume. Source mode shows the fence body as plain text (no nested highlight). Acceptable — mermaid charts read fine in mono-color, and authors typically iterate via WYSIWYG render anyway.
- **[NOT NOW]** NG-Mer6: Beautiful-mermaid / Rust-WASM forks / mermaid.ink URL substrate. Stick with the canonical mermaid-js library; the alternatives are tracked in `reports/mermaid-rendering-options-for-mdx-editors/REPORT.md` for future re-evaluation if bundle cost becomes a binding constraint.
- **[NOT NOW]** NG-Mer7: PropPanel custom editor for the `chart` prop (multi-line CodeMirror with mermaid syntax assist). Plain `<Input>` ships per the existing NG16-deferred PropPanel UX (same shape as Callout's `type` and Math's `formula`). Authors author multi-line via the fence form.

## 4) Functional requirements

- **FR-Mer1 — Canonical `<Mermaid>` descriptor.** 7th `JsxComponentMeta` in `builtInComponents`:
  - `name: 'Mermaid'`, `surface: 'canonical'`, `category: 'content'`, `icon: 'Workflow'`, `displayName: 'Mermaid'`.
  - `hasChildren: false`, `isSelfClosing: true`. Block.
  - Props: `chart: string` (required, autoFocus); `id?: string`; `theme?: 'default' | 'dark' | 'forest' | 'neutral'` (advanced, default `'default'`).
  - `serialize: (node, ctx) => emitMdxJsx('Mermaid', node, ctx)`.

- **FR-Mer2 — Render component.** `packages/app/src/editor/components/Mermaid.tsx`:
  - Lazy-imports `mermaid` on first mount via a module-cached `Promise`.
  - Single `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', suppressErrorRendering: true })` call (idempotent).
  - `useEffect` on `[chart, renderId]`: `mermaid.render(renderId, chart)` async → SVG string injected via `dangerouslySetInnerHTML`.
  - On parse error: error chrome with chart source visible inside `<pre>` (no editor crash, source stays editable in source mode).
  - Cancels in-flight render on unmount/chart change to avoid setState-after-unmount.

- **FR-Mer3 — `MermaidFence` compat descriptor.** `packages/core/src/markdown/mermaid-promoter.ts` walks the tree, replaces `code` mdast nodes with `lang === 'mermaid'` with `mdxJsxFlowElement(MermaidFence, {chart})`, copies position. Compat surface: read-only in slash menu; `surface: 'compat'`, `rendersAs: 'Mermaid'`. Dirty-path serialize emits `code` mdast with `lang: 'mermaid'` so remark-stringify produces ` ```mermaid …``` ` fence.

- **FR-Mer4 — Slash-menu entry.** `<Mermaid>` exposed via slash menu under `content` with searchTerms covering common diagram types (`mermaid`, `diagram`, `flowchart`, `graph`, `sequence`, `class`, `state`, `er`, `gantt`, `pie`).

- **FR-Mer5 — Storage shape conformance.** Mermaid descriptor names round-trip through Y.XmlFragment ↔ Y.Text identically to the existing 7-pack (no new bridge primitives). The bridge invariant holds for Mermaid nodes.

## 5) Decisions

- **D-Mer1 [LOCKED]** — Single canonical block descriptor `<Mermaid>`. Every existing canonical is block; mermaid charts are inherently flow-level. No inline mermaid (NG-Mer2).
- **D-Mer2 [LOCKED]** — Single compat descriptor `MermaidFence`. There's only one source form (the fence) — no JSX-equivalent compat needed.
- **D-Mer3 [LOCKED]** — `chart` prop name (not `code`, not `source`). Matches Mintlify and fumadocs convention; matches the screenshot the user referenced when scoping. Schema-add-only contract makes any future field rename additive.
- **D-Mer4 [LOCKED]** — `securityLevel: 'strict'` for `mermaid.initialize()`. Mermaid's stricter default disables click handlers, scripts, and dangerous HTML in chart labels. Storage shape is unchanged regardless; this is a render-time guard against malformed-input attack vectors.
- **D-Mer5 [LOCKED]** — Mermaid library lazy-imported. Documents without diagrams pay 0 KB; first diagram costs ~150 KB gzipped (entry + 2-3 lazy diagram-type chunks). The Mermaid-removal precedent (built-ins.ts:43-45) sets the bar — ship with a real renderer.
- **D-Mer6 [OPEN]** — Theme switching wiring. Phase 1 ships `theme: 'default'` only; the prop reads but the renderer doesn't reinitialize. Promoting requires per-instance `mermaid.initialize` calls (which mutate global config) or a per-render override (`mermaid.render` doesn't accept theme directly). Defer to alongside dark-mode toggle work.
- **D-Mer7 [OPEN]** — Source-mode CodeMirror highlight for ` ```mermaid `. No Mermaid grammar in `@codemirror/legacy-modes`; would need to ship a custom stream-parser or accept plain-text rendering. Accept plain-text for now (NG-Mer5).

## 6) Risks

- **R-Mer1 — Bundle drift.** Mermaid is a 21-runtime-dep package with code-split chunks. Drift in the eager chunks could push first-diagram cost beyond the 150 KB target. Mitigation: pin to `mermaid@^11` for now; revisit on minor bumps.
- **R-Mer2 — Async render race conditions.** `mermaid.render()` is async; rapid edits could land setState calls out of order. Mitigated by the `cancelled` flag in `useEffect` cleanup.
- **R-Mer3 — Mermaid SVG opacity.** Mermaid's HTML output structure shifts across minor versions; the `Mermaid.tsx` renderer treats it as opaque, so structural shifts only affect rendering not storage. Pin major; bump only with a manual visual check.
- **R-Mer4 — Stub re-introduction temptation.** The team explicitly removed the prior stub. If this PR ships and Mermaid breaks in a future bump, the cheap fix is to replace with a stub — that's a precedent regression. Mitigation: keep the error chrome in `Mermaid.tsx` non-trivial (visible source + tooltip) so a broken state surfaces clearly.

## 7) Success metrics

- **Adoption.** Documents containing at least one Mermaid descriptor (`Mermaid` or `MermaidFence`) — sample after 2 weeks post-ship.
- **Fidelity.** Mermaid fence precision tests pass; existing fidelity suite unchanged.
- **Bundle.** First-load JS unchanged on diagram-free documents (within ±5 KB noise floor). First-mermaid-mount adds ~150 KB transferred.
- **Round-trip stability.** ` ```mermaid `…``` ` round-trips byte-identical when un-edited (compat γ source-form preservation). 100% on the corpus.

## 8) See also

- [`built-ins.ts`](../../packages/core/src/registry/built-ins.ts) — descriptor manifest (target of FR-Mer1, FR-Mer3).
- [`pipeline.ts`](../../packages/core/src/markdown/pipeline.ts) — pipeline assembly (target of `mermaidPromoterPlugin` wiring).
- Math sibling spec — same shape; this is roughly half the surface (no inline form, no remark plugin, no equivalent of `singleDollarTextMath`).
