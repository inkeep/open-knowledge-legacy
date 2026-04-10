# Evidence: Infrastructure Fitness for Our Product (D9)

**Dimension:** D9 — Could Fumadocs serve as infrastructure for our product?
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo architecture analysis, all prior dimension evidence

---

## Findings

### Finding: The loader() API COULD load from a CRDT/Hocuspocus source
**Confidence:** INFERRED
**Evidence:** Source interface design (packages/core/src/source/source.ts)

The loader() takes a Source<Config>, which is just `{ files: VirtualFile[] }`. VirtualFile requires only `path`, `type`, and `data`. No filesystem dependency. You could:

```typescript
// Hypothetical CRDT source
function crdtSource(ydoc: Y.Doc): Source {
  return {
    files: ydoc.getArray('pages').map(page => ({
      type: 'page',
      path: page.get('path'),
      data: { title: page.get('title'), ...frontmatter },
    })),
  };
}

const output = loader(crdtSource(ydoc), { baseUrl: '/wiki' });
```

The challenge: loader() is designed to be called once and produce a static LoaderOutput. It doesn't react to source changes. For real-time updates, you'd need to either:
- Re-run loader() on every change (expensive for large wikis)
- Build an incremental update layer on top
- Use mdx-remote for per-page compilation instead of loader()

### Finding: Fumadocs component library is reusable for rendering
**Confidence:** CONFIRMED
**Evidence:** packages/radix-ui, packages/base-ui

The UI component library (Accordion, Callout, Card, CodeBlock, Steps, Tabs, TOC, Files, ImageZoom, etc.) is:
- React components with Radix UI or base-ui primitives
- Tailwind CSS styled
- Installable locally via `fumadocs add`
- No dependency on Fumadocs Core's content layer

You could use these components in any React app for rendering MDX content, regardless of how that content is sourced. The components are the visual layer; they don't care about the content pipeline.

### Finding: The three-layer architecture allows selective adoption
**Confidence:** CONFIRMED
**Evidence:** Package structure analysis

| Layer | Package | Could we reuse? | What for? |
|-------|---------|----------------|-----------|
| Content processing | fumadocs-mdx / fuma-content | Partially | MDX compilation pipeline, remarkPlugins, schema validation |
| Core logic | fumadocs-core | Partially | Page tree generation, search indexing, content negotiation, llms.txt |
| UI components | fumadocs-ui / base-ui | Yes | Rendering MDX output (callouts, code blocks, tabs, etc.) |
| Obsidian adapter | fumadocs-obsidian | Yes | Wiki-link resolution, vault conversion |

### Finding: What we would build from scratch vs reuse
**Confidence:** INFERRED
**Evidence:** Architecture analysis against Karpathy workflow requirements

**Reuse from Fumadocs:**
- MDX remark/rehype plugin pipeline (remarkStructure, remarkMermaid, rehypeCode, remarkLLMs)
- UI component library for rendering
- Search indexing via StructuredData extraction
- llms.txt generation
- Content negotiation middleware
- Obsidian wikilink resolver
- Zod schema validation for frontmatter

**Build from scratch:**
- Real-time CRDT editing layer
- Backlink computation
- LLM compilation pipeline (raw sources -> structured wiki)
- Wiki linting engine (inconsistencies, missing data, connections)
- Custom search combining BM25 + vector + reranking
- Agent analytics
- MCP server (though scaffolding from Fumadocs primitives)
- Bi-directional sync (editor <-> filesystem <-> git)
- File ingestion pipeline (PDF, images, repos -> raw/)
- Output pipeline (markdown, Marp slides, matplotlib images)

### Finding: Fumadocs architecture IS compatible with CRDT, but requires a bridge layer
**Confidence:** INFERRED
**Evidence:** All dimension analysis

The bridge layer would need to:
1. Convert Y.Doc state to VirtualFile[] (Source interface)
2. Trigger incremental rebuilds on Y.Doc updates
3. Handle MDX compilation (mdx-remote for on-demand)
4. Map CRDT operations to filesystem operations (for git persistence)
5. Resolve wiki-links within the CRDT state

This bridge is the core engineering challenge. Fumadocs provides both endpoints (content processing + rendering) but not the bridge.

---

## Gaps / follow-ups

- Fuma Content's plugin architecture: could it support CRDT input natively?
- Performance of re-running loader() on every content change
- Could we use Next.js ISR to avoid full rebuilds?
