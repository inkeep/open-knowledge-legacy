# Evidence: D1 — MDX Plugins Source-Level Analysis

**Dimension:** fumadocs-core/mdx-plugins — all remark/rehype plugins
**Date:** 2026-04-02
**Sources:** fumadocs monorepo packages/core/src/mdx-plugins/

---

## Key files referenced

- `packages/core/src/mdx-plugins/remark-structure.ts` (258 lines) — StructuredData extraction
- `packages/core/src/mdx-plugins/remark-llms.ts` (130 lines) — LLM-optimized markdown output
- `packages/core/src/mdx-plugins/remark-llms.runtime.ts` (44 lines) — Placeholder renderer
- `packages/core/src/mdx-plugins/stringifier.ts` (201 lines) — Shared AST-to-markdown engine
- `packages/core/src/mdx-plugins/remark-heading.ts` (99 lines) — Heading IDs + TOC extraction
- `packages/core/src/mdx-plugins/remark-image.ts` (336 lines) — Image size + Next.js import
- `packages/core/src/mdx-plugins/rehype-code.ts` (37 lines) — Shiki highlighter wrapper
- `packages/core/src/mdx-plugins/rehype-code.core.ts` (191 lines) — Shiki core with transformers
- `packages/core/src/mdx-plugins/remark-admonition.ts` (98 lines) — Docusaurus-style admonitions (deprecated)
- `packages/core/src/mdx-plugins/remark-steps.ts` (139 lines) — Numbered heading to steps
- `packages/core/src/mdx-plugins/remark-code-tab.ts` (284 lines) — Code block tabbing
- `packages/core/src/mdx-plugins/remark-npm.ts` (92 lines) — npm/pnpm/yarn/bun tabs
- `packages/core/src/mdx-plugins/remark-mdx-mermaid.ts` (42 lines) — Mermaid code to MDX
- `packages/core/src/mdx-plugins/remark-feedback-block.ts` (110 lines) — Block-level feedback IDs
- `packages/core/src/mdx-plugins/remark-gfm.ts` (3 lines) — Re-export of remark-gfm
- `packages/core/src/mdx-plugins/index.ts` (17 lines) — Public exports

---

## Findings

### Finding: remarkStructure is standalone-capable with one dependency (remarkHeading)
**Confidence:** CONFIRMED
**Evidence:** remark-structure.ts lines 1-14, 215-229

The `structure()` convenience function creates its own remark processor:
```typescript
export function structure(content: string, remarkPlugins: PluggableList = [], options: StructureOptions = {}): StructuredData {
  const result = remark().use(remarkGfm).use(remarkPlugins).use(remarkHeading).use(remarkStructure, options).processSync(content);
  return result.data.structuredData!;
}
```

Dependencies: `remark`, `remark-gfm`, `unist-util-visit`, `mdast-util-mdx` (types only), the local `remarkHeading` (for heading IDs), and the local `stringifier.ts`. No Fumadocs-specific types needed for standalone use. The `StructuredData` output type is self-contained: `{ headings: {id, content}[], contents: {heading, content}[] }`.

The configurable stringifier handles MDX components via `filterElement`: by default, `File`, `TypeTable`, `Callout`, `Card` are preserved with attributes; everything else gets `children-only` treatment (unwrapped to text content).

### Finding: remarkLLMs converts MDX AST to clean markdown with placeholder support
**Confidence:** CONFIRMED
**Evidence:** remark-llms.ts lines 60-107

`remarkLLMs` uses the shared `defaultStringifier` to convert AST back to markdown. It:
1. Strips ESM imports/exports (`mdxjsEsm` -> return false)
2. Preserves heading IDs in `[#id]` format
3. Supports `mdxAsPlaceholder` — named MDX components serialized as `\0JSON\0` tokens that can be rendered back at runtime via `renderPlaceholder()`

The placeholder system encodes: `{ name, children (stringified), attributes }`. The runtime (`remark-llms.runtime.ts`) has a 44-line `renderPlaceholder()` that regex-matches these tokens and calls registered renderers.

No Fumadocs coupling. Pure remark plugin with unified/mdast types only.

### Finding: remarkHeading generates slugs and extracts TOC, standalone
**Confidence:** CONFIRMED
**Evidence:** remark-heading.ts lines 48-99

Uses `github-slugger` for ID generation. Supports custom `[#slug]` syntax in headings. Outputs `TOCItemType[]` to `file.data.toc`. The `TOCItemType` import is from `@/toc` (fumadocs-core internal type), but it's a trivial interface: `{ title: string, url: string, depth: number }`.

Can run standalone in any remark pipeline. Only coupling: the `@/toc` type import, which could be inlined as a 3-field interface.

### Finding: remarkImage is Next.js-coupled via static import generation
**Confidence:** CONFIRMED
**Evidence:** remark-image.ts lines 82-88, 110-164

When `useImport: true` (default), it generates ESM import statements for images and uses `src={variable}` expressions. This is designed for Next.js Image component / bundler-processed static imports. When `useImport: false`, it fetches image dimensions and sets width/height attributes — this mode is framework-agnostic.

Hard dependency on `image-size` npm package. Uses Node.js APIs (`node:path`, `node:url`).

### Finding: rehypeCode is a thin Shiki wrapper, framework-agnostic
**Confidence:** CONFIRMED
**Evidence:** rehype-code.ts (37 lines), rehype-code.core.ts (191 lines)

Wraps `@shikijs/rehype` with Fumadocs defaults (notation highlight, diff, focus transformers). The `createRehypeCode` factory accepts a Shiki highlighter factory. Only Fumadocs coupling: imports `@/highlight/shiki` for the default factory and `@/highlight/utils` for theme config. These are thin wrappers around Shiki APIs.

### Finding: The stringifier is the shared extraction engine, zero Fumadocs coupling
**Confidence:** CONFIRMED  
**Evidence:** stringifier.ts (201 lines)

Generic AST-to-markdown converter using `mdast-util-to-markdown` with `mdxToMarkdown()` extension. Provides `filterElement` (include/exclude/children-only), `filterMdxAttributes`, and custom `stringify` callback. Used by both remarkStructure and remarkLLMs.

Dependencies: `mdast-util-mdx`, `mdast-util-to-markdown`, `unified` types. Zero Fumadocs types.

### Finding: Most syntax plugins are standalone remark/rehype transformers
**Confidence:** CONFIRMED

- `remarkSteps` (139 lines): converts `1. Heading` patterns to `<div className="fd-steps">` wrappers. Pure AST transform, no Fumadocs imports.
- `remarkCodeTab` (284 lines): groups consecutive code blocks with `tab="name"` meta into `<Tabs>/<Tab>` or `<CodeBlockTabs>` components. Imports only from local `codeblock-utils.ts`.
- `remarkNpm` (92 lines): converts `npm` language code blocks to multi-PM tabs. Depends on `npm-to-yarn`.
- `remarkMdxMermaid` (42 lines): converts mermaid code blocks to `<Mermaid chart="..." />`. Zero dependencies beyond unified types.
- `remarkFeedbackBlock` (110 lines): wraps block elements in `<FeedbackBlock id="hash" />`. Uses Node.js `crypto` for MD5.
- `remarkGfm` (3 lines): pure re-export of `remark-gfm`.
- `remarkAdmonition` (98 lines): Docusaurus `:::` syntax to `<Callout>`. Deprecated in favor of `remarkDirectiveAdmonition`.

---

## Gaps / follow-ups

- `remark-directive-admonition.ts` not read (replacement for remarkAdmonition)
- `remark-mdx-files.ts` not read (file embedding plugin)
- `rehype-toc.ts` not read
