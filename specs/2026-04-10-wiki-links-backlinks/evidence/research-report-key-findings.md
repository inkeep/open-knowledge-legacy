---
title: Key Findings from Wiki-Links Research Report
description: Synthesized findings from reports/wiki-links-backlinks-architecture/ (2026-04-04) that directly inform S10 design decisions. Covers link format, backlink index architecture, editor integration, agent tools, and git compatibility.
created: 2026-04-10
last-updated: 2026-04-10
---

Source: `reports/wiki-links-backlinks-architecture/REPORT.md` (2026-04-04)
Coverage: 7 dimensions, 10+ OSS implementations read at source-code depth

## D1: Link format — CONFIRMED recommendation

- `[[Page Name]]` is the dominant convention (Obsidian, Foam, Logseq, Dendron)
- Case-insensitive, shortest-path resolution = Obsidian reference implementation
- Alias syntax: `[[Page|display text]]`
- Section links: `[[Page#Heading]]`
- Block references (`[[Page#^blockid]]`) are Obsidian-specific and non-portable — skip for P0
- **Authoring format = wikilink; portability format = derived standard markdown (Foam reference definition pattern)**

## D2: Backlink index architecture

**Recommended: Foam's dual adjacency list + Dendron's incremental diff**

Data structure:
```typescript
interface BacklinkIndex {
  forward: Map<string, Set<string>>;  // source → targets
  backward: Map<string, Set<string>>; // target → sources
}
```

- Foam: dual `Map<string, Connection[]>` — O(1) query, but full rebuild on every change
- Dendron: incremental diff (old links vs new links per doc), strictly superior but harder
- **Start with full rebuild; add incremental diff as optimization** — verified recommendation
- Obsidian: forward-only `resolvedLinks`, backlinks via O(N) linear scan — **the anti-pattern**
- AFFiNE/BlockSuite: 5 forward-link mechanisms, zero backlink infrastructure — **CRDT doesn't solve backlinks**

## D3: Editor integration

**Custom TipTap inline node — no production extension exists**

```typescript
// Recommended schema from research report
Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      target: { default: '' },     // The page name/ID
      alias: { default: null },    // Display text override
      anchor: { default: null },   // #Heading or #^blockid
    };
  }
})
```

**Autocomplete:** `@tiptap/suggestion` with `char: '[['` and `allowSpaces: true`
**Rendering:** clickable chip showing resolved title or `[[target]]` text if unresolved
**Red links:** different CSS class for unresolved targets

## D4: Agent interaction with link graph (MCP tools)

6 MCP tools recommended from research:
1. `get_backlinks(page)` — pages linking TO this page
2. `get_forward_links(page)` — pages this page links TO
3. `get_orphans()` — pages with no incoming links
4. `get_hubs()` — pages with most incoming links
5. `get_link_graph()` — full adjacency list (for agent-side graph traversal)
6. `suggest_links(page)` — pages that mention this page but don't link to it (LLM optional)

**Context:** These 6 tools create the M2' conflict with S4's "10-tool core surface" framing. Decision is deferred to product.

## D5: Git compatibility

- Raw `[[Page Name]]` wikilinks produce minimal git diffs on rename (only the target token changes)
- Standard markdown links `[text](path.md)` produce larger diffs (full path)
- Foam reference definitions (`[Page Name]: ./page-name.md` at file bottom) are a portability bridge
- **Recommendation:** wikilinks in authoring, Foam-style definitions in derived representation
- The reference definitions can be regenerated from the backlink index on every save

## D6: Rename resilience — the hardest problem

Three approaches seen in OSS:
- **Path-based (Foam):** `[[note-name]]` resolves via TrieMap. On rename: must update all source files.
- **UUID-based (Logseq internal):** `[[uuid]]` stored in files. Rename-transparent but unreadable git diffs.
- **Stable urlId (Outline):** 10-char random ID stored in frontmatter. Link stored as `[[Page Name]]` in markdown, resolved via name→ID index at query time.

**Recommended for our system:** Stable `id` field in frontmatter (UUID or short hash). Links are stored by page name in markdown (human-readable). Internal resolution goes: name → frontmatter ID lookup → file path. On rename: only the frontmatter `title` changes; links referencing the old name become red links until user updates them OR we implement auto-update on rename.

## D7: Derived index architecture

- **Trigger:** Hocuspocus `onStoreDocument` (debounced 2-10s) — correct hook, confirmed
- **Server-side JSON extraction:** Walk ProseMirror JSON from `yXmlFragmentToProsemirrorJSON` — no schema needed
- **Branch isolation:** Per-branch index cache in `.openknowledge/cache/<branch>/backlinks.json`
- **Content-addressed dedup:** Files identical across branches share entries (Zoekt pattern)
- **Startup:** Build from disk on server start (parse all .md files for `[[...]]` patterns)
- **Incremental:** On `onStoreDocument` for doc X, diff old links(X) vs new links(X), update index

## Key implementation warnings from research

1. **marked not remark** — the project uses `@tiptap/markdown` v3 with `marked@17`, not remark. The remark-wiki-link plugin is irrelevant. Need a marked custom inline extension.
2. **Inline token path is confirmed** — `markdownTokenName` is not block-only. `@tiptap/markdown` v3 also reads an extension-level `markdownTokenizer` field and registers it with `marked.use({ extensions: [...] })`, which is the correct integration path for inline wiki-links.
3. **`@tiptap/suggestion` regex** — `[[` with `allowSpaces: true` is confirmed working but requires `finalChar: ']]'` equivalent; research confirms the regex.
4. **Page list for autocomplete must be async** — the `items` callback can be async; fetches from server-side document list.
