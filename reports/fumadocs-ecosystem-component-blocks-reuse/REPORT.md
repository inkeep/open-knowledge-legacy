---
title: "Fumadocs Ecosystem Survey for Component Blocks v2 Reuse Assessment"
description: "End-to-end survey of the fumadocs ecosystem (core, mdx, ui, mdx-remote, community plugins, adjacent tools) mapped against Component Blocks v2 spec primitives. Identifies what to reuse, what to learn from, and what to build from scratch — with concrete spec amendment recommendations."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - Fumadocs
  - MDXEditor
  - TinaCMS
  - Keystatic
  - Plate
  - BlockNote
  - Storybook
  - mdast-util-mdx-jsx
topics:
  - MDX component editing
  - descriptor registry patterns
  - source fidelity preservation
  - CRDT collaboration
  - ecosystem reuse assessment
---

# Fumadocs Ecosystem Survey for Component Blocks v2 Reuse Assessment

**Purpose:** Map the fumadocs ecosystem — core packages, community plugins, and adjacent MDX-editing tools — against the specific primitives in the Component Blocks v2 spec (FR-1..FR-23, sections 9.1–9.13) to determine what to reuse, what to learn from, and what must be built from scratch.

**Grounded in:** Six existing reports ([fumadocs-full-pipeline](../fumadocs-full-pipeline/REPORT.md), [fumadocs-stack-reusability-deep-analysis](../fumadocs-stack-reusability-deep-analysis/REPORT.md), [fumadocs-karpathy-workflow-deep-dive](../fumadocs-karpathy-workflow-deep-dive/REPORT.md), [obsidian-vs-fumadocs-component-inventory](../obsidian-vs-fumadocs-component-inventory/REPORT.md), [mdx-text-editor-preview-approach](../mdx-text-editor-preview-approach/REPORT.md), [react-types-as-editor-schema](../react-types-as-editor-schema/REPORT.md)). Findings from those reports are cited, not re-derived.

---

## Executive Summary

**Reuse (import or pattern-copy):** Nothing from fumadocs should be imported as a dependency for Component Blocks v2. The fumadocs ecosystem is exclusively a docs-site rendering pipeline — no package provides editor-time primitives. Pattern-copy the 16 fumadocs-ui component implementations (~350 lines total for Callout, Steps, Card, Tabs) as built-in NodeView renderers, as already recommended by [fumadocs-stack-reusability-deep-analysis](../fumadocs-stack-reusability-deep-analysis/REPORT.md). Pattern-copy [MDXEditor](https://github.com/mdx-editor/editor)'s `JsxComponentDescriptor` structure as API inspiration for our descriptor registry (our PropDef is a strict superset).

**Learn from:** Three external systems provide load-bearing architectural validation: (1) MDXEditor's runtime descriptor lookup with wildcard fallback validates our FR-8/FR-9/FR-10 dispatch pattern. (2) [Keystatic](https://keystatic.com/docs/content-components)'s five-kind content-components taxonomy (wrapper/block/inline/mark/repeating) maps cleanly to our jsxComponent + jsxInline + container split. (3) [Storybook](https://storybook.js.org/docs/api/arg-types)'s ArgTypes → Controls pipeline validates the PropDef → auto-generated PropPanel pattern at scale.

**Do NOT reuse:** (1) `@fumadocs/mdx-remote` — runtime MDX compilation via Function constructor is architecturally wrong for NodeView preview (per-call overhead, full unmount/remount, 500KB+ dependency). (2) `fumadocs-mdx` compiler — uses strict MDX mode (acorn) incompatible with our agnostic parser. (3) `fumadocs-core/source` — SSG routing primitives irrelevant to editor. (4) `fumadocs-core/mdx-plugins` — docs-site remark pipeline; our editor has its own.

**Novel contributions (no ecosystem analogue):** Four of our six core primitives have no analogue in the ecosystem: gamma dirty-tracking (sourceDirty/sourceRaw), single-pass findFallbackRegion structural enumeration, bidirectional CRDT observer bridge, and flush-left JSX serialization override. These are architecturally novel.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| D1 | Spec-primitive analogues in ecosystem | P0 | Deep |
| D2 | Core fumadocs utility reusability | P0 | Deep |
| D3 | Community ecosystem survey | P0 | Moderate |
| D4 | fumadocs-in-editor patterns | P0 | Deep |
| D5 | Adjacent projects (2026 status) | P1 | Moderate |
| D6 | Gap inventory | P0 | Light |

**Non-goals:** Performance benchmarking, deployment patterns, SSG/ISR internals, fumadocs documentation site UX.

---

## Section 1: Executive Summary

See above.

---

## Section 2: Per-Primitive Mapping Table

| Spec Primitive | FR/Section | Fumadocs Equivalent | Closest Ecosystem Analogue | Verdict | Confidence |
|---|---|---|---|---|---|
| gamma dirty-tracking (`sourceDirty` + `sourceRaw`) | FR-5, §9.4 | None | TinaCMS `invalid_markdown` (parse-failure fallback only) | **BUILD** | HIGH |
| Descriptor registry (`Map<string, Descriptor>`) | FR-8, §9.2 | `defaultMdxComponents` (plain object, no prop introspection) | MDXEditor `JsxComponentDescriptor` (3-type prop model) | **LEARN-FROM** MDXEditor structure; build our PropDef superset | HIGH |
| PropDef extraction (react-docgen-typescript) | §9.2 | None | Storybook ArgTypes → Controls; Webstudio two-layer model | **LEARN-FROM** Storybook + Webstudio | HIGH |
| findFallbackRegion (single-pass enumeration) | FR-23, §9.13 | None | None (ecosystem is binary: parses or source-mode) | **BUILD** | HIGH |
| NodeView dispatch (runtime registry lookup) | FR-9/FR-10, §9.7/§9.8 | None | MDXEditor `JsxEditorContainer` (wildcard fallback); Keystatic `reactNodeView` | **LEARN-FROM** both; build auto-generated PropPanel | HIGH |
| Observer B always-live (parseWithFallback) | FR-22, §9.13 | None | None (no tool does per-block degradation within broken MDX) | **BUILD** | HIGH |
| Flush-left JSX serialization | FR-6, §9.4 | None | mdast-util-mdx-jsx (CAUSES the problem with depth-aware indentation) | **BUILD** (override library) | HIGH |
| Source-dirty observer plugin | FR-7, §9.6 | None | None | **BUILD** | HIGH |
| PropPanel (auto-generated from PropDef) | FR-11/FR-12, §9.7/§9.8 | None | Keystatic schema-driven forms; Storybook Controls | **LEARN-FROM** pattern; build our implementation | HIGH |
| Slash menu component insertion | FR-14 | None | MDXEditor JSX insertion via toolbar + nested editor | **BUILD** (use existing TipTap Suggestion API) | HIGH |
| Empty-container placeholder | FR-16a | None | Keystatic `repeating` kind (closest structural analogue) | **BUILD** | MEDIUM |
| ComponentErrorBoundary | FR-19 | None | MDXEditor: unregistered components crash editor (pre-v2.3.3) | **BUILD** (port from pr23-rebase) | HIGH |
| reconstructAttrs merge semantics | FR-21, §9.4 | None | None (no tool preserves unknown attrs through dirty-path serialization) | **BUILD** | HIGH |
| Keyboard nav for component blocks | FR-18 | None | MDXEditor: Lexical handles selection natively; Keystatic: PM-native | **BUILD** (PM selection primitives) | MEDIUM |

**Evidence:** [evidence/spec-primitive-analogues.md](evidence/spec-primitive-analogues.md)

### Detailed Analysis of Key Primitives

**gamma dirty-tracking (FR-5, §9.4):** No surveyed tool tracks edit-state at the PM-node level to switch between source-preservation and reconstruction serialization paths. MDXEditor always reconstructs from structured state. TinaCMS's `invalid_markdown` preserves original source for parse failures — a structural cousin (opaque source preservation) but operates at a different level (parse failure vs. per-node edit tracking). Plate's `memoize` option (stores raw markdown on Slate nodes) is the closest functional analogue — it adds a `_rawMarkdown` field for serialization fidelity — but it's a one-way cache, not a two-path serialization gate controlled by a dirty bit.

**Descriptor registry (FR-8, §9.2):** MDXEditor's `JsxComponentDescriptor` is the strongest structural analogue. Our PropDef discriminated union (`string | boolean | number | enum | reactnode`) is a strict superset of MDXEditor's 3-type model (`string | number | expression`). Key additions: typed `defaultValue` per variant, wildcard `'*'` as a first-class registry member, auto-generated controls from PropDef (MDXEditor delegates to user-provided `Editor` components). Keystatic's five-kind taxonomy (wrapper/block/inline/mark/repeating) provides richer structural semantics. Storybook's ArgTypes → Controls pipeline validates the PropDef → auto-generated-UI pattern at production scale.

**findFallbackRegion (FR-23, §9.13):** The ecosystem's standard approach to MDX syntax errors is binary: entire-document-parses-or-fallback-to-source-mode (MDXEditor), entire-node-valid-or-invalid (TinaCMS), or build-fails (fumadocs). Our single-pass stack-based enumeration that maps error offsets to the tightest containing JSX region, preserving structured siblings, has no analogue. micromark-extension-mdx/mdxjs hard-fail on syntax errors with no error recovery path.

**Flush-left serialization (FR-6):** The problem is well-documented across the ecosystem: [mdx-js/mdx#993](https://github.com/mdx-js/mdx/issues/993), [mdx-js/mdx#1283](https://github.com/mdx-js/mdx/issues/1283), [facebook/docusaurus#10220](https://github.com/facebook/docusaurus/issues/10220), [prettier/prettier#16925](https://github.com/prettier/prettier/issues/16925). The `mdast-util-mdx-jsx` library's depth-aware indentation via `inferDepth(state)` + `state.indentLines()` is architecturally sound but produces the 4-space CommonMark code-block hazard at nesting depth >= 2. Its `fences: true` setting is a partial mitigation. No tool has shipped a serializer-level fix. Our flush-left handler is the first.

---

## Section 3: Ecosystem Survey

### Official Fumadocs Packages (12+)

| Package | Version | Weekly DL | Status | CB-v2 Relevance |
|---------|---------|-----------|--------|-----------------|
| fumadocs-core | 16.6.2 | ~37K | Active (daily) | IGNORE — docs pipeline |
| fumadocs-ui | 16.7.14 | ~37K | Active (daily) | PATTERN-COPY components |
| fumadocs-mdx | 14.2.14 | ~30K | Active | IGNORE — strict MDX mode |
| @fumadocs/mdx-remote | 1.4.8 | ~14K | Active | IGNORE — wrong architecture |
| @fumadocs/cli | 1.2.6 | ~5.7K | Active | N/A |
| fumadocs-openapi | 10.4.1 | Moderate | Active | N/A |
| fumadocs-typescript | 5.2.0 | Moderate | Active | N/A |
| @fumadocs/content-collections | 1.2.2 | Low | Active | N/A |
| @fumadocs/base-ui | 16.6.16 | Low | Active | N/A |
| create-fumadocs-app | 16.0.38 | ~867 | Active | N/A |

**Evidence:** [evidence/fumadocs-utilities-reusability.md](evidence/fumadocs-utilities-reusability.md)

### Community Integrations

| Project | Stars | Status | Type | CB-v2 Relevance |
|---------|-------|--------|------|-----------------|
| [fumadocs-payloadcms](https://github.com/MFarabi619/fumadocs-payloadcms) | 67 | Active | Payload CMS source adapter | LOW — uses Lexical editor, not fumadocs |
| [fumadocs-payload-template](https://github.com/bapspatil/fumadocs-payload-template) | N/A | Active | Full Payload + fumadocs template | LOW — most advanced CMS+fumadocs combo |
| [fumadocs-sanity](https://github.com/fuma-nama/fumadocs-sanity) | 39 | Maintained | Sanity source adapter | NONE |
| [fumadocs-basehub](https://github.com/fuma-nama/fumadocs-basehub) | 38 | Maintained | BaseHub source adapter | NONE |
| [fumadocs-notion](https://github.com/fuma-nama/fumadocs-notion) | 27 | Low activity | Notion source adapter | NONE |
| [graphql-markdown](https://github.com/graphql-markdown/graphql-markdown) | 174 | Active | GraphQL → fumadocs custom source | LOW — shows component registration pattern |
| [unmint](https://github.com/gregce/unmint) | 41 | Active | "Mintlify alternative" using fumadocs | NONE |

**NOT found** (exhaustive search): TinaCMS + fumadocs, Keystatic + fumadocs, Velite + fumadocs, any visual/WYSIWYG MDX editor in the ecosystem, any component palette tool, any alternative fumadocs-ui library, any fumadocs-specific CRDT integration.

**Evidence:** [evidence/community-ecosystem-survey.md](evidence/community-ecosystem-survey.md)

### Adjacent MDX Editing Projects (2026 Status)

| Project | Foundation | Collab | MDX | Version | Downloads/wk | CB-v2 Relevance |
|---------|-----------|--------|-----|---------|-------------|-----------------|
| [MDXEditor](https://github.com/mdx-editor/editor) | Lexical | None | Full | 3.54.0 | ~493K | HIGH — descriptor pattern |
| [TinaCMS](https://github.com/tinacms/tinacms) | Slate | Git only | Template-based | 3.7.2 | Moderate | MEDIUM — template serialization |
| [Keystatic](https://github.com/Thinkmill/keystatic) | ProseMirror | None | Content-components | 0.5.50 | Moderate | HIGH — PM component taxonomy |
| [Plate](https://platejs.org/) | Slate + Yjs | Yjs | remarkMdx | v48+ | High | HIGH — closest MDX+Yjs competitor |
| [BlockNote](https://www.blocknotejs.org/) | PM + TipTap + Yjs | Yjs | None | 0.47.3 | High | LOW — no MDX |
| [fuma-editor](https://github.com/fuma-nama/fuma-editor) | TipTap + Hocuspocus | Yjs | None | WIP | N/A | MEDIUM — validates stack choice |

**Evidence:** [evidence/adjacent-projects-2026.md](evidence/adjacent-projects-2026.md)

### Upcoming: fuma-content

The fumadocs author has announced `fuma-content` — a framework-agnostic content processing layer that will subsume fumadocs-mdx internals. Not yet on npm. When shipped, it could become a downstream consumer of Open Knowledge's serialized MDX output (framework-agnostic, plugin-based). Not a Component Blocks v2 dependency. **Confidence: INFERRED** (from blog announcements, not shipped code).

---

## Section 4: fumadocs-in-Editor Patterns

### Core Finding: Nobody Has Done This

No public evidence exists of anyone rendering fumadocs-ui components inside a rich-text editor — not in fumadocs's own issue tracker (zero results for "editor", "wysiwyg", "tiptap", "prosemirror"), not in MDXEditor's issue tracker, not in any community project. **Confidence: HIGH.**

The fumadocs author himself, when building an editor ([fuma-editor](https://github.com/fuma-nama/fuma-editor), created March 29, 2026), chose to start from scratch with a new component system using Base UI (not Radix, which fumadocs-ui uses). He did not attempt to reuse fumadocs-ui components. This is the strongest available signal that fumadocs-ui components are not designed for editor embedding.

**Evidence:** [evidence/fumadocs-in-editor-patterns.md](evidence/fumadocs-in-editor-patterns.md)

### Component Embeddability Assessment

Based on source analysis of `node_modules/fumadocs-ui@16.1.0/dist/components/`:

| Component | Server/Client | Complexity | NodeView Embeddability | Issues |
|-----------|--------------|------------|----------------------|--------|
| Callout | Server | Low | Trivial | lucide-react icons only |
| Steps/Step | Server | Trivial | Trivial | Pure CSS, ~10 lines |
| Card | Server | Low | Easy (with shim) | `fumadocs-core/link` → needs `<a>` shim |
| Heading | Server | Low | Trivial | Anchor links may conflict with editor |
| Accordion | Client | Medium | Medium | Radix Accordion, hash-reading on mount |
| Files/File | Client | Medium | Medium | Radix Collapsible, useState |
| CodeBlock | Client | High | Hard | DOM queries, assumes pre-highlighted HTML, clipboard API |
| Tabs/Tab | Client | Very High | Hard | Radix Tabs, useId(), module-level listener sync, sessionStorage, hash sync |

### Concrete Problems for NodeView Embedding

1. **CSS variable dependency:** All components require `--color-fd-*` variables. Without fumadocs-ui's `style.css`, colors break. **Solution:** CSS variable bridge mapping editor theme → `fd-*` variables, or load fumadocs CSS globally.

2. **`fumadocs-core/link` import:** Card imports `Link` which wraps `next/link`. **Solution:** Bundler alias to plain `<a>` wrapper.

3. **Tabs `groupId` cross-instance sync:** Module-level `listeners` Map synchronizes all Tabs with the same `groupId` across the entire page. In an editor, two NodeViews rendering `<Tabs groupId="pm">` would unexpectedly synchronize. **Solution:** Scope or disable `groupId` sync in editor mode.

4. **Tabs `useId()` collection pattern:** Works in React portals (in the React tree) but fails with `ReactDOM.createRoot()` on disconnected DOM nodes. **Solution:** Use TipTap's `ReactNodeViewRenderer` which renders via portals.

5. **CodeBlock pre-highlighted HTML assumption:** Expects children to contain Shiki-highlighted HTML from build pipeline. **Solution:** Use `dynamic-codeblock.js` variant for runtime Shiki, or simpler code fallback.

6. **`React.Children` filtering:** NOT used by fumadocs Tabs (uses Headless UI collection pattern via `useCollectionIndex()` + context). This is actually more compatible with portal-mounted NodeView children than `React.Children` filtering would be.

### Recommended Adapter Strategy

The spec's approach of pattern-copying fumadocs components as built-in renderers (already recommended by [fumadocs-stack-reusability-deep-analysis §8.2](../fumadocs-stack-reusability-deep-analysis/REPORT.md)) is validated. Concretely:

- **Tier 1 (direct copy, <20 lines each):** Callout, Steps/Step — pure JSX, zero dependencies beyond className utilities
- **Tier 2 (copy with shimming, <100 lines each):** Card (shim Link), Accordion (strip hash-reading), Files (strip collapsible or use our own)
- **Tier 3 (significant adaptation, ~200 lines each):** Tabs/Tab (rewrite without Radix, without groupId sync, without sessionStorage/localStorage), CodeBlock (rewrite with runtime Shiki or simpler fallback)

Total: ~350-500 lines of editor-specific component implementations, not imports.

---

## Section 5: Concrete Spec Amendments Recommended

### Actionable Amendments

**5.1 — Add CSS variable bridge to §9.7 NodeView block (JsxComponentView.tsx)**

The spec does not address how fumadocs-ui components receive their CSS variables inside a NodeView. Since the editor and fumadocs-ui share Tailwind but use different variable namespaces, a bridge is needed.

**Proposed addition to §9.7:**

> **CSS variable bridge:** JsxComponentView wraps the rendered component in a `<div className="fd-theme-bridge">` that maps editor theme variables to fumadocs `--color-fd-*` equivalents. This `<div>` applies at the NodeView boundary — no global fumadocs CSS import required. For unregistered components (wildcard path), the bridge div is omitted.

**Confidence: HIGH.** Every fumadocs-ui component references `--color-fd-*` variables. Without a bridge, colors break.

**5.2 — Add Tabs `groupId` isolation note to built-ins registry (§9.2)**

The spec's built-ins manifest includes Tabs. The Tabs component has a `groupId` prop that synchronizes tab selection across instances via a module-level Map. In the editor, this causes unintended cross-NodeView state sync.

**Proposed addition to §9.2 built-ins manifest (Tabs entry):**

> **`groupId` isolation:** The editor-mode Tabs implementation MUST NOT use module-level synchronization. Each Tabs NodeView operates independently. The `groupId` prop is serialized to MDX for docs-site rendering (where cross-instance sync is desired) but has no editor-time effect.

**Confidence: HIGH.** Verified from fumadocs-ui source: module-level `listeners` Map is shared globally.

**5.3 — Add `fumadocs-core/link` shim to implementation notes**

The Card component imports `Link` from `fumadocs-core/link`. This is a Next.js-specific import that fails in the Vite-bundled editor.

**Proposed addition to implementation notes (wherever the built-in renderers are specced):**

> **Link shim:** Built-in renderers that originated from fumadocs-ui replace `fumadocs-core/link` imports with a plain `<a>` wrapper. The editor operates in a browser context without Next.js routing.

**Confidence: HIGH.** Verified from Card component source.

### Nice-to-Know (Not Actionable for This Spec)

**5.4 — Plate's `memoize` as a simpler gamma alternative (for future reference)**

Plate's `@platejs/markdown` offers a `memoize` option that stores raw markdown on Slate nodes and uses it during serialization. This is a simpler but less precise version of gamma dirty-tracking: it caches the original markdown but doesn't track whether the node was edited. It's worth noting as a potential simplification if gamma's two-path serialization proves too complex — but for the current spec, gamma is the correct design because it handles the edited-node case correctly (reconstruction from structured state).

**5.5 — fuma-content as future downstream consumer**

When `fuma-content` ships as a framework-agnostic content layer, it could become a natural consumer of Open Knowledge's serialized MDX output for docs-site rendering. This doesn't affect Component Blocks v2 implementation but should inform serialization compatibility testing.

---

## Section 6: What This Research Did NOT Cover (Gap Honesty)

1. **Source-code-level analysis of MDXEditor internals.** We examined the public API, documentation, and key file signatures but did not do a line-by-line audit of MDXEditor's Lexical node implementation. A deeper dive could reveal additional patterns for managing component state in an AST-based editor.

2. **Runtime performance benchmarking of fumadocs components in NodeViews.** We assessed embeddability qualitatively (source analysis of hooks, state, dependencies) but did not measure actual render performance of fumadocs components inside ProseMirror portals. Tabs in particular may have measurable overhead from its collection-tracking pattern.

3. **fumadocs-ui Tailwind v4 migration status.** fumadocs-ui uses Tailwind with `fd-` prefixed variables. We did not check whether it has migrated to Tailwind v4's new CSS-first config model, which could affect the CSS variable bridge strategy.

4. **BlockSuite/AFFiNE adapter patterns.** BlockSuite uses Yjs natively with adapter-based markdown import/export. A deeper analysis of its mdast↔BlockSuite conversion system could reveal additional patterns for CRDT bridge design. We noted it as "closest architectural cousin" but did not read its adapter source code.

5. **Plate `memoize` implementation details.** We noted Plate's `memoize` option as the closest gamma analogue but did not read its implementation to understand exactly how it uses cached markdown during serialization.

6. **Community MDXEditor plugins.** MDXEditor has a plugin ecosystem that we did not exhaustively survey. Community plugins that extend MDXEditor's JSX handling could contain patterns relevant to our descriptor dispatch.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D5 (Adjacent projects):** fuma-editor (WIP, 7 commits) had limited public code to analyze. Its architecture may evolve significantly.
- **D3 (Community):** GitHub search limited to repos tagged "fumadocs". Community projects without this tag are invisible.

### Out of Scope (per Rubric)

- Performance benchmarking of fumadocs utilities
- SSG/ISR rendering patterns
- fumadocs documentation site UX
- Deployment and hosting patterns

---

## References

### Evidence Files
- [evidence/spec-primitive-analogues.md](evidence/spec-primitive-analogues.md) — Ecosystem analogues for all six CB-v2 spec primitives
- [evidence/fumadocs-utilities-reusability.md](evidence/fumadocs-utilities-reusability.md) — Import/pattern-copy/ignore verdicts for core fumadocs packages
- [evidence/community-ecosystem-survey.md](evidence/community-ecosystem-survey.md) — npm + GitHub ecosystem inventory
- [evidence/fumadocs-in-editor-patterns.md](evidence/fumadocs-in-editor-patterns.md) — Component embeddability analysis + fuma-editor discovery
- [evidence/adjacent-projects-2026.md](evidence/adjacent-projects-2026.md) — 2026 status of MDXEditor, TinaCMS, Keystatic, Plate, BlockNote

### External Sources
- [MDXEditor](https://github.com/mdx-editor/editor) — Lexical-based MDX WYSIWYG editor
- [Keystatic content-components](https://keystatic.com/docs/content-components) — ProseMirror-based component taxonomy
- [Storybook ArgTypes](https://storybook.js.org/docs/api/arg-types) — TypeScript prop → UI control mapping
- [mdx-js/mdx#993](https://github.com/mdx-js/mdx/issues/993) — Indented code block hazard in JSX
- [mdx-js/mdx#1283](https://github.com/mdx-js/mdx/issues/1283) — Fenced code blocks within indented JSX
- [fuma-editor](https://github.com/fuma-nama/fuma-editor) — fumadocs author's WIP TipTap+Hocuspocus editor
- [Plate markdown](https://platejs.org/docs/markdown) — Slate-based MDX serialization with memoize
- [Milkdown MDX discussion](https://github.com/orgs/Milkdown/discussions/772) — ProseMirror MDX integration failures

### Related Research
- [fumadocs-full-pipeline](../fumadocs-full-pipeline/REPORT.md) — Architecture, Source interface, component registration, MDX compilation modes
- [fumadocs-stack-reusability-deep-analysis](../fumadocs-stack-reusability-deep-analysis/REPORT.md) — Import-as-dependency vs pattern-copy per package
- [react-types-as-editor-schema](../react-types-as-editor-schema/REPORT.md) — react-docgen-typescript extraction patterns, Webstudio two-layer model
- [cms-custom-components-landscape](../cms-custom-components-landscape/REPORT.md) — Cross-CMS component editing patterns, universal discriminator
- [mdx-text-editor-preview-approach](../mdx-text-editor-preview-approach/REPORT.md) — MDX live-preview architecture prior art
