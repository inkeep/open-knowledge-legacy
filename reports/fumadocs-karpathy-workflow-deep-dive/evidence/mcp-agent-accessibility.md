# Evidence: MCP / Agent Accessibility (D6)

**Dimension:** D6 — MCP / Agent accessibility
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo, fumadocs.dev/docs/integrations/llms, github.com/k4cper-g/fumadocs-mcp

---

## Key files referenced

- `packages/core/src/mdx-plugins/remark-llms.ts` — remarkLLMs plugin
- `packages/core/src/mdx-plugins/remark-llms.runtime.ts` — LLM placeholder rendering
- `packages/core/src/source/loader/llms.ts` — llms() index generator
- fumadocs.dev/docs/integrations/llms — Official AI/LLM docs

---

## Findings

### Finding: Fumadocs has a purpose-built LLM content pipeline
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/mdx-plugins/remark-llms.ts`, `packages/core/src/source/loader/llms.ts`

Four primitives form the LLM pipeline:

1. **remarkLLMs plugin** — transforms MDX AST into clean markdown for LLM consumption. Strips ESM imports, preserves heading IDs, handles MDX components via `mdxAsPlaceholder`. Outputs as an export (`_markdown` by default).

2. **llms() index generator** — takes a LoaderOutput and generates `llms.txt` content. Walks the page tree, formats as markdown with links and descriptions. Supports i18n (generates per-language).

3. **getLLMText()** — user-defined function that extracts processed markdown from pages. Requires `includeProcessedMarkdown: true` in config.

4. **Content negotiation** — `isMarkdownPreferred(request)` utility checks Accept headers. Middleware can rewrite requests to serve .mdx endpoints.

### Finding: llms.txt generation uses the page tree structure
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/loader/llms.ts`

```typescript
export function llms(loader, config = {}) {
  function index(lang?) {
    const pageTree = loader.getPageTree(lang);
    const out = [];
    out.push(`# ${renderName(pageTree, ctx)}`);
    
    function onNode(node, indent) {
      switch (node.type) {
        case 'page': out.push(item(formatMarkdownLink(name, node.url), description, indent));
        case 'folder': // recurse children
        case 'separator': // section divider
      }
    }
    // ...
  }
  return { index };
}
```

The llms.txt is a hierarchical index of the page tree with markdown links. It preserves the folder structure as indentation. For a wiki, this would produce a categorized index of all articles.

### Finding: Community MCP server exists (fumadocs-mcp)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/k4cper-g/fumadocs-mcp

5 tools: list_topics, search_docs, get_page, get_setup_guide, get_component. TypeScript-based. Targets Fumadocs' own documentation (not arbitrary Fumadocs sites). No auth, early-stage, 0 published releases.

**Implications:** This is a proof-of-concept for Fumadocs' own docs, not a generic "build an MCP server for any Fumadocs site" tool. Building a generic MCP server would require:
1. `search` tool wrapping the SearchAPI
2. `get_page` tool using LoaderOutput.getPage()
3. Optional: `list_pages`, `get_page_tree`

### Finding: Building an MCP server from Fumadocs content source is straightforward
**Confidence:** INFERRED
**Evidence:** LoaderOutput API + SearchAPI interface

The LoaderOutput provides:
- `getPages()` — list all content
- `getPage(slugs)` — get specific page
- `getPageTree()` — hierarchical structure
- Search via any SearchAPI provider

An MCP server needs:
- `search(query)` -> SearchAPI.search()
- `get_page(path)` -> LoaderOutput.getPage()
- `list_pages()` -> LoaderOutput.getPages()

The data model maps cleanly. The llms() function already formats content for LLM consumption. The remarkLLMs plugin already strips MDX artifacts. All the plumbing exists.

### Finding: Content negotiation middleware is a one-liner
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev/docs/integrations/llms

```typescript
if (isMarkdownPreferred(request)) {
  // Rewrite to MDX endpoint
}
```

The `.mdx` endpoint returns page content with `Content-Type: text/markdown`. This means:
- `GET /docs/getting-started` -> HTML (for browsers)
- `GET /docs/getting-started.mdx` -> Markdown (for agents)
- `GET /docs/getting-started` with `Accept: text/markdown` -> Markdown (for agents)

### Finding: No built-in llms.txt auto-hosting
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev docs, web search

Fumadocs provides the `llms()` function to generate llms.txt content, but you must create the route handler yourself. It's not auto-generated like Mintlify. This is consistent with Fumadocs' "building blocks, not managed platform" philosophy.

---

## Gaps / follow-ups

- Could the MCP server be auto-generated from a Fumadocs config? (like Mintlify does)
- skill.md equivalent for Fumadocs?
- Agent analytics (tracking which agents access content)
