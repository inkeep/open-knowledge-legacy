# Evidence: Rendering Capabilities (D3)

**Dimension:** D3 — Rendering capabilities
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo, fumadocs.dev docs, web search

---

## Key files referenced

- `packages/core/src/mdx-plugins/index.ts` — All exported MDX plugins
- `packages/core/src/mdx-plugins/remark-mdx-mermaid.ts` — Mermaid diagram support
- `packages/core/src/mdx-plugins/rehype-code.ts` — Shiki code highlighting
- `packages/core/src/mdx-plugins/remark-admonition.ts` — Callouts/admonitions
- `packages/core/src/mdx-plugins/remark-steps.ts` — Step components
- `packages/core/src/mdx-plugins/remark-code-tab.ts` — Code tabs
- `packages/radix-ui/src/components/` — UI component library
- `packages/base-ui/src/components/` — Base UI variant

---

## Findings

### Finding: 14+ remark/rehype plugins provide rich rendering out-of-the-box
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/mdx-plugins/index.ts`

Exported plugins:
1. `remarkGfm` — GitHub Flavored Markdown (tables, strikethrough, autolinks, task lists)
2. `rehypeCode` — Shiki-based syntax highlighting with dual-theme support
3. `remarkImage` — Image optimization (static imports for Next.js Image)
4. `remarkStructure` — Structured data extraction for search
5. `remarkHeading` — Heading ID generation + anchors
6. `remarkAdmonition` — Callout/admonition blocks (note, tip, warning, danger, etc.)
7. `remarkDirectiveAdmonition` — Directive-based admonitions
8. `rehypeToc` — Table of contents generation
9. `remarkCodeTab` — Tabbed code blocks
10. `remarkSteps` — Step-by-step component
11. `remarkNpm` — npm/yarn/pnpm/bun command tabs
12. `remarkMdxFiles` — File tree component
13. `remarkMdxMermaid` — Mermaid diagram rendering
14. `remarkFeedbackBlock` — User feedback component
15. `remarkLLMs` — LLM-optimized Markdown output

### Finding: Mermaid diagrams are rendered via MDX component transform
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/mdx-plugins/remark-mdx-mermaid.ts`

```typescript
export function remarkMdxMermaid(): Transformer<Root, Root> {
  return (tree) => {
    visit(tree, 'code', (node) => {
      if (node.lang !== lang || !node.value) return;
      Object.assign(node, toMDX(node.value));  // Converts to <Mermaid chart="..." />
    });
  };
}
```

Mermaid codeblocks (```mermaid) are transformed into `<Mermaid chart="..." />` MDX components at compile time. The actual rendering is done client-side by the Mermaid component.

**Implications:** LLM-generated mermaid diagrams in markdown would be automatically rendered. This is directly relevant to Karpathy's workflow where the LLM generates visualizations.

### Finding: Math/LaTeX supported via remarkMath + rehypeKatex
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev/docs/markdown/math

Math support requires two plugins: `remarkMath` (parses `$...$` and `$$...$$`) and `rehypeKatex` (renders to HTML). Configured in source.config.ts:

```typescript
remarkPlugins: [remarkMath],
rehypePlugins: (v) => [rehypeKatex, ...v]
```

### Finding: UI component library covers all standard doc components
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/` directory listing

Available components: accordion, banner, callout, card, codeblock (RSC + client), dynamic-codeblock, files, github-info, heading, image-zoom, inline-toc, sidebar, steps, tabs, toc, type-table, dialog system, UI utilities.

The Shadcn model means components can be installed locally via `fumadocs add <component>` and fully customized. Two variants exist: Radix-based (fumadocs-ui) and base-ui (lighter weight).

### Finding: Custom MDX components are trivially injectable
**Confidence:** CONFIRMED
**Evidence:** MDX component mapping in Fumadocs

Components are passed via the `components` prop to MDX rendering. Any React component can be used in MDX files. The remarkLLMs plugin's `mdxAsPlaceholder` option can convert custom components to placeholder format for LLM consumption, preserving component semantics in text output.

**Implications:** For LLM-generated output that includes charts (matplotlib images, diagrams), you could create custom components like `<Chart src="..." />`, `<DataViz data={...} />`, etc. These would render in the browser while being representable in the LLM's markdown output.

---

## Gaps / follow-ups

- Mermaid rendering: client-side or SSR? Performance with many diagrams?
- Interactive component support (e.g., chart libraries like Recharts)?
- SVG/image embedding from LLM output (matplotlib -> PNG -> MDX)
