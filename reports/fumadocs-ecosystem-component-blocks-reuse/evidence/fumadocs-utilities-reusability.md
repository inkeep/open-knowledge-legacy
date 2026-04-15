# Evidence: Fumadocs Core Utilities Reusability for Component Blocks v2

**Dimension:** D2 — Core fumadocs utility assessment
**Date:** 2026-04-14
**Sources:** npm registry, fumadocs source (github.com/fuma-nama/fumadocs), fumadocs-mdx package.json

---

## Key files / pages referenced

- @fumadocs/mdx-remote npm: npmjs.com/package/@fumadocs/mdx-remote (v1.4.8, ~14K/wk)
- fumadocs-core npm: npmjs.com/package/fumadocs-core (v16.6.2, ~150K/mo)
- fumadocs-mdx npm: npmjs.com/package/fumadocs-mdx (v14.2.14)
- fumadocs-core/source: packages/core/src/source/source.ts
- fumadocs-mdx/config/preset.ts: packages/mdx/src/config/preset.ts

---

## Findings

### Finding: @fumadocs/mdx-remote uses Function constructor for runtime MDX, unsuitable for NodeView preview
**Confidence:** CONFIRMED
**Evidence:** npm package page + source analysis

The package wraps `@mdx-js/mdx` with `outputFormat: 'function-body'` and executes via `new AsyncFunction()`. Each `compile()` call runs the full unified pipeline (remark-parse → remark plugins → rehype plugins → code generation → eval).

Component registration via `scope` parameter aligns with our descriptor registry concept. But:
- Each `evaluate()` creates a new function definition — React treats different function types as different component trees, causing full unmount + remount
- Dependencies: `@mdx-js/mdx ^3.1.1` is ~500KB+
- No incremental compilation — full document recompile every time
- Security: "Passed MDX content must be trusted as it allows code execution"

**Implications:** The runtime eval pattern is instructive for understanding how runtime MDX works, but our NodeView rendering (descriptor dispatch at PM render time) is architecturally simpler and more CRDT-friendly.

### Finding: fumadocs-mdx uses strict MDX mode (acorn), incompatible with our agnostic mode
**Confidence:** CONFIRMED
**Evidence:** fumadocs-mdx package.json dependencies

fumadocs-mdx depends on `@mdx-js/mdx ^3.1.1`, which internally uses `micromark-extension-mdxjs` (strict mode with acorn JavaScript validation). Our editor uses `micromark-extension-mdx` (agnostic mode without acorn) via `packages/core/src/markdown/remark-mdx-agnostic.ts`.

The strict mode rejects JSX that our agnostic parser accepts:
- Unvalidated JavaScript expressions
- Non-standard attribute syntax
- Expressions containing syntax acorn cannot parse

**Implications:** fumadocs-mdx's compilation pipeline is incompatible with our editor's parse mode. Documents authored in our editor may contain JSX constructs that fumadocs-mdx would reject at build time. This is a known trade-off documented in CLAUDE.md.

### Finding: fumadocs-core/source is SSG-specific, no overlap with editor component blocks
**Confidence:** CONFIRMED
**Evidence:** Source interface TypeScript types

```typescript
interface Source<Config extends SourceConfig> {
  files: VirtualFile<Config>[];
}
// VirtualPage requires: title, description, body (FC<MDXProps>), toc, structuredData
// VirtualMeta requires: title, icon, pages, defaultOpen, collapsible
```

The `loader()` function produces page trees, URL generation, and SSG static params. These are Next.js routing primitives with zero relevance to editor component block architecture.

### Finding: fumadocs-core/mdx-plugins still export same API, no breaking changes
**Confidence:** CONFIRMED
**Evidence:** npm fumadocs-core 16.6.2 package analysis

Still exports: remarkStructure, remarkLLMs, remarkHeading, remarkAdmonition, remarkSteps, remarkCodeTab, remarkNpm, remarkMdxFiles, remarkMdxMermaid, remarkFeedbackBlock, rehypeCode, rehypeToc.

New since existing report: remarkFeedbackBlock, remarkMdxMermaid. No API breaks.

None relevant to Component Blocks v2 — these operate at the remark pipeline level for docs-site rendering.

---

## Negative searches

* No fumadocs package exports a component descriptor/registry API
* No fumadocs package does runtime TypeScript prop extraction
* No fumadocs package provides CRDT integration utilities

---

## Summary Table

| Utility | Verdict | Reason |
|---------|---------|--------|
| @fumadocs/mdx-remote | PATTERN-COPY (concept only) | Runtime eval pattern instructive; wrong architecture for NodeView |
| fumadocs-core/mdx-plugins | IGNORE | Docs-site remark pipeline; editor has its own |
| fumadocs-core/source | IGNORE | SSG routing primitives; irrelevant to editor |
| fumadocs-mdx compiler | IGNORE | Strict MDX mode incompatible with our agnostic mode |
| fumadocs-core/search | NOTE FOR FUTURE | Tangential; docs site already uses it |
