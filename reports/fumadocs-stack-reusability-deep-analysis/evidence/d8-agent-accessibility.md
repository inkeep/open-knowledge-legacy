# Evidence: D8 — Agent Accessibility (llms, content negotiation, .mdx endpoints)

**Dimension:** Agent/LLM accessibility primitives
**Date:** 2026-04-02
**Sources:** fumadocs monorepo packages/core/src/source/loader/llms.ts, packages/core/src/negotiation/

---

## Key files referenced

- `packages/core/src/source/loader/llms.ts` (100 lines) — llms.txt index generator
- `packages/core/src/negotiation/index.ts` (46 lines) — Content negotiation + path rewriting

---

## Findings

### Finding: llms() generates a page tree index, tightly coupled to LoaderOutput
**Confidence:** CONFIRMED
**Evidence:** llms.ts lines 14-93

```typescript
export function llms<C extends LoaderConfig>(loader: LoaderOutput<C>, config: LLMsConfig = {}) {
```

Takes a `LoaderOutput` and generates a markdown-formatted page tree index. Walks `loader.getPageTree()` and renders each node as a markdown list item with optional links. Supports i18n (generates separate indices per language).

The coupling is structural: it reads `loader.getPageTree()`, `loader.getNodePage()`, and uses the page tree's `name`, `description`, `url`, and `children` properties. Cannot be used without a LoaderOutput.

However, the output format (markdown list with links) is trivial to replicate: ~50 lines of code to walk a flat page list and produce `llms.txt` content.

### Finding: isMarkdownPreferred() is a 12-line standalone function
**Confidence:** CONFIRMED
**Evidence:** negotiation/index.ts lines 35-46

```typescript
export function isMarkdownPreferred(request: Request, options?) {
  const { markdownMediaTypes = ['text/plain', 'text/markdown', 'text/x-markdown'] } = options ?? {};
  const mediaTypes = getNegotiator(request).mediaTypes();
  return markdownMediaTypes.some(type => mediaTypes.includes(type));
}
```

Uses the `negotiator` npm package to parse `Accept` headers. Zero Fumadocs coupling. Could be copied as a standalone utility.

### Finding: rewritePath is a generic URL rewriting utility
**Confidence:** CONFIRMED
**Evidence:** negotiation/index.ts lines 21-33

Uses `path-to-regexp` for pattern matching and compilation. Generic path rewriting unrelated to Fumadocs specifically.

### Finding: All three primitives can run standalone or in a Vite server
**Confidence:** CONFIRMED

- `isMarkdownPreferred()` — uses standard `Request` API, works anywhere
- `rewritePath()` — pure function with `path-to-regexp`, works anywhere
- `llms()` — needs LoaderOutput, but the output format can be replicated without it

For our MCP server: we would implement llms.txt generation ourselves (walk our page list, output markdown), use `isMarkdownPreferred()` directly (or reimplement in 12 lines), and serve `.mdx` endpoints via our own route handlers.

---

## Gaps / follow-ups

- The .mdx endpoint handler implementation not found in core (likely in framework-specific adapters)
- Content negotiation middleware integration patterns not traced
