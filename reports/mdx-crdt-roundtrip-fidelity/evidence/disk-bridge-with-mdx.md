# Evidence: Disk Bridge (Expl 3) with MDX

**Dimension:** D4 — @parcel/watcher + remark-mdx for .mdx file changes
**Date:** 2026-04-07
**Sources:** @parcel/watcher source, remark-mdx docs, persistence.ts, crdt-mcp-filesystem-bridge report

---

## Key files referenced

- `~/.claude/oss-repos/parcel-watcher/index.d.ts` — @parcel/watcher API
- `init_spike/src/server/persistence.ts` — current persistence extension
- `~/.claude/oss-repos/mdast-util-mdx/lib/index.js` — MDX MDAST utilities

---

## Findings

### Finding: remark-mdx works in Node.js server context
**Confidence:** CONFIRMED
**Evidence:** remark-mdx npm docs, package.json (ESM only, Node 16+)

remark-mdx is ESM-only (requires `"type": "module"` in package.json or `.mjs` extension). It has no browser-specific dependencies. The parse chain is:
1. micromark-extension-mdxjs (tokenizer)
2. mdast-util-mdx (AST construction)
3. Both run synchronously in Node.js

**Implication for file watcher:** When @parcel/watcher detects a .mdx file change, the watcher callback can synchronously parse the file with remark-mdx. No async compilation needed (unlike @mdx-js/mdx which compiles to JavaScript).

### Finding: Current persistence uses marked-based @tiptap/markdown — cannot parse MDX
**Confidence:** CONFIRMED
**Evidence:** persistence.ts:27-28, persistence.ts:156

```typescript
const mdManager = new MarkdownManager({ extensions: sharedExtensions });
// ...
const json = mdManager.parse(body); // marked-based
```

The persistence layer uses @tiptap/markdown's MarkdownManager for both load (parse) and save (serialize). For .md files, this works. For .mdx files, import statements would be parsed as paragraph text and JSX components would be partially mangled.

### Finding: Dual-format persistence requires two parse paths
**Confidence:** INFERRED
**Evidence:** Architecture analysis

For the disk bridge to handle both .md and .mdx files:

**Option A:** Use @tiptap/markdown (marked) for both, treating MDX constructs as void nodes via fenced code blocks. This works if the .mdx file on disk uses the `\`\`\`jsx-component` encoding. But raw .mdx files from external sources do NOT use this encoding — they use native JSX syntax.

**Option B:** Use remark-mdx for .mdx files, @tiptap/markdown for .md files. This requires:
1. A remark-based MDAST → ProseMirror JSON converter
2. A ProseMirror JSON → MDX serializer
3. Different parse/serialize logic selected by file extension

**Option C:** Convert all .mdx files to the internal encoding on first load (imports → cached, JSX → fenced code blocks with `jsx-component` info string). Then use @tiptap/markdown for all subsequent operations. On save, reverse the conversion.

### Finding: Performance for remark-mdx parsing is adequate for file watcher use
**Confidence:** INFERRED
**Evidence:** micromark architecture (streaming, linear-time), typical MDX file sizes (1-50KB)

micromark (the tokenizer under remark) is designed for streaming, linear-time parsing. A 10KB MDX file with 5-10 JSX components should parse in <5ms. The main performance concern is the file I/O, not the parsing.

Files with many JSX components (50+) would still parse quickly but would generate more MDAST nodes. The bottleneck would shift to the MDAST → ProseMirror conversion if using Option B.

### Finding: @parcel/watcher provides no file-type filtering
**Confidence:** CONFIRMED
**Evidence:** parcel-watcher/index.d.ts (Event type has only `path` and `type`)

@parcel/watcher fires events for all file changes in the watched directory. The callback receives `{ path: string, type: 'create' | 'update' | 'delete' }`. File extension checking must be done in the callback:

```typescript
if (event.path.endsWith('.mdx')) {
  // Use remark-mdx parser
} else if (event.path.endsWith('.md')) {
  // Use marked/@tiptap/markdown parser
}
```

---

## Gaps / follow-ups

* The MDAST → ProseMirror JSON conversion for MDX nodes is uncharted territory — no library does this
* Performance profiling of remark-mdx on real-world MDX files would strengthen the estimate
