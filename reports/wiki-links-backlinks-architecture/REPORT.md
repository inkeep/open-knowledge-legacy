---
title: "Wiki-Links and Backlinks Architecture for Agent-Native Knowledge Platforms"
description: "Comprehensive research on wiki-link format conventions, backlink index architecture (source-code depth across 7 OSS implementations), ProseMirror/TipTap editor integration, AI agent interaction patterns, git compatibility, link graph as knowledge structure, and derived index design for CRDT+git+MCP systems. Covers Obsidian, Logseq, Outline, AFFiNE, Foam, Dendron, Marksman, remark-wiki-link, GraphRAG, and Zettelkasten methodology."
createdAt: 2026-04-04
updatedAt: 2026-04-04
subjects:
  - Obsidian
  - Logseq
  - Outline
  - AFFiNE
  - Foam
  - Dendron
  - Marksman
  - remark-wiki-link
  - TipTap
  - ProseMirror
  - Hocuspocus
  - Yjs
  - GraphRAG
  - Orama
topics:
  - wiki-link formats
  - backlink index architecture
  - knowledge graph navigation
  - CRDT collaboration
  - agent-native knowledge
---

# Wiki-Links and Backlinks Architecture for Agent-Native Knowledge Platforms

**Purpose:** Research the foundational infrastructure that makes a knowledge base more than a folder of files -- wiki-links and backlinks. Covers the full landscape from link format conventions through derived index architectures to AI/agent-aware knowledge graphs, with source-code depth for OSS implementations. Directly informs the design of an agent-native knowledge platform built on CRDT + git + MCP.

---

## Executive Summary

We investigated seven dimensions of wiki-link and backlink infrastructure across 10+ open-source implementations, reading actual source code from Foam, Logseq, Outline, AFFiNE/BlockSuite, Dendron, and Marksman. The findings converge on a clear architectural blueprint for an agent-native knowledge platform.

**The link format question is settled.** Wikilinks (`[[Page Name]]`) are the dominant convention across the knowledge management ecosystem, descending from MediaWiki through Obsidian (millions of users), Logseq, Foam, and Dendron. They produce smaller git diffs on rename, are more agent-friendly (agents reference concepts by name, not path), and work naturally with CRDTs. Standard markdown links remain necessary for portability but should be a derived representation, not the authoring format.

**The backlink index converges on three architectural families.** Source code analysis reveals dual adjacency lists (Foam), EAV triplestores with automatic reverse indexes (Logseq/Datascript), and relational tables with async extraction (Outline). The optimal design for our system combines Foam's dual `Map<target, Set<source>>` data structure, Dendron's incremental diff update strategy, and Logseq/Outline's stable document IDs for rename resilience. AFFiNE/BlockSuite confirms that CRDT editors do not inherently solve backlinks -- the index must be an application-layer concern.

**Editor integration requires a custom TipTap node.** TipTap's `@tiptap/suggestion` plugin provides the `[[` trigger mechanism, but no production-ready wikilink extension exists. The implementation path is clear: a custom ProseMirror inline node with `target` and `alias` attributes, rendered as a clickable chip, serialized via the remark-wiki-link/micromark stack. Both AFFiNE and Outline use ID-based mention nodes that resolve display text at render time -- the same pattern applies to wikilinks.

**The derived index architecture must be branch-aware and CRDT-compatible.** No existing tool handles both. Our design hooks into Hocuspocus `onStoreDocument` (debounced) for CRDT updates and `post-checkout` git hooks for branch switches, using content-addressed deduplication so files identical across branches share index entries. Six decomposed MCP tools expose the link graph to agents following the "orient, discover, consume" navigation pattern.

**Key Findings:**

- **Wikilinks with case-insensitive, shortest-path resolution** are the recommended primary format, with Foam-style link reference definitions for standard-markdown portability
- **Backlink query must be O(1)** -- Obsidian's O(N) linear scan is the anti-pattern; Foam's dual map and Logseq's VAET index are the models
- **Incremental update (diff old vs new links per document)** is strictly superior to full rebuild but harder to implement correctly; start with full rebuild, add incremental as optimization
- **Stable document IDs in frontmatter** eliminate the rename-propagation problem that plagues path-based linking systems
- **The `@tiptap/suggestion` plugin detects `[[` via regex** on the text node before the cursor; the wikilink node should be an inline ProseMirror node, not a mark
- **Hocuspocus `onStoreDocument` (debounced 2-10s)** is the correct hook for backlink index updates from CRDT operations -- not `onChange` which fires on every keystroke
- **Content-addressed branch indexing** (inspired by Zoekt's bitmask deduplication) makes branch switching O(changed_files) rather than O(all_files)

---

## Research Rubric

**Report Type:** Technology Deep-Dive / Architecture Research
**Primary Question:** How should wiki-links and backlinks be implemented in an agent-native knowledge platform built on CRDT + git + MCP?
**Audience:** Product/engineering team building the platform
**Stance:** Factual with architectural synthesis

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Link format conventions across tools | Deep | P0 |
| D2 | Backlink index architecture (source-code depth) | Deep | P0 |
| D3 | Wiki-links in the editor (ProseMirror/TipTap) | Deep | P0 |
| D4 | Backlinks + AI agents | Deep | P0 |
| D5 | Git-compatibility of link formats | Deep | P0 |
| D6 | Link graph as knowledge structure | Deep | P0 |
| D7 | Derived index architecture for our system | Deep | P0 |

**Non-goals:** General knowledge management tool comparison (covered in openknowledge-competitive-landscape report), Obsidian overall capability assessment (covered in obsidian-karpathy-workflow-deep-dive), full knowledge graph implementation (covered in knowledge-graph-incremental-updates), agent navigation patterns (covered in kb-index-navigation-patterns-for-agents).

---

## D1: Link Format Conventions Across Tools

**Finding:** Wikilinks (`[[Page Name]]`) are the de facto standard for internal linking in knowledge management, with Obsidian's case-insensitive, shortest-path resolution becoming the reference implementation. Standard markdown links remain universal for portability but encode too much path information for agent-friendly authoring.

**Evidence:** [fanout/2026-04-03-initial/link-formats-git-compat/evidence/](fanout/2026-04-03-initial/link-formats-git-compat/evidence/)

### The Format Landscape

| Tool | Primary Format | Alias Syntax | Heading Links | Block Links |
|------|---------------|-------------|---------------|-------------|
| **MediaWiki** | `[[Page]]` | `[[Page\|display]]` | `[[Page#Section]]` | N/A |
| **Obsidian** | `[[Page]]` | `[[Page\|display]]` | `[[Page#Heading]]` | `[[Page#^blockid]]` |
| **Logseq** | `[[page]]` | N/A | N/A | `((block-uuid))` |
| **Foam** | `[[note-name]]` | N/A | `[[note#Section]]` | `[[note#^blockid]]` |
| **Notion** | UUID-based blocks | N/A | UUID-based | UUID-based |
| **Confluence** | XML `<ac:link>` | `<ac:link-body>` | Anchor macros | N/A |
| **GitHub** | `[text](path.md)` | N/A | `[text](path.md#heading)` | N/A |
| **Docusaurus** | `[text](./path.mdx)` | N/A | `[text](./path.mdx#heading)` | N/A |

### Obsidian: The Reference Implementation

Obsidian has become the reference for modern wikilink behavior:
- **Case-insensitive resolution:** `[[project alpha]]` equals `[[Project Alpha]]`
- **Three resolution modes:** shortest path (default), relative path, absolute path in vault
- **Block references:** `[[Page#^blockid]]` -- Obsidian-specific, not portable
- **Embed syntax:** `![[Page]]` for inline content embedding

Obsidian's own docs warn that block references "won't work outside of Obsidian."

### Logseq: Block-Centric Linking

Logseq introduces block-level references via opaque UUIDs: `((64a1b2c3-...))`. These UUIDs are stored as properties in markdown (`id:: 64a1b2c3-...`) and are not human-readable. Internally, Logseq stores page references as `[[uuid]]` rather than `[[page name]]`, using `title-ref->id-ref` conversion. This makes rename-safe linking trivial but sacrifices readability.

### The Parsing Ecosystem

The JavaScript/TypeScript ecosystem has mature wikilink parsing via the unified/remark/micromark stack:

| Layer | Package | Function |
|-------|---------|----------|
| Tokenizer | [micromark-extension-wiki-link](https://github.com/landakram/micromark-extension-wiki-link) | Character-level `[[`/`]]` state machine |
| AST Utility | [mdast-util-wiki-link](https://github.com/landakram/mdast-util-wiki-link) | Tokens to `wikiLink` AST nodes |
| Plugin | [remark-wiki-link](https://github.com/landakram/remark-wiki-link) | Top-level remark integration |

The AST node structure includes `value` (target), `data.alias` (display text), `data.permalink` (resolved path), and `data.exists` (broken-link flag). Critical extension points: `pageResolver` (custom name-to-file mapping) and `permalinks` (valid page list for validation).

### The Core Tradeoff: Names vs Paths

| Axis | Name-Based (`[[Name]]`) | Path-Based (`[text](path.md)`) |
|------|------------------------|-------------------------------|
| Resolution | Requires lookup index | Direct filesystem path |
| Rename behavior | Only name token changes | Full path changes propagate |
| Ambiguity | Possible (two files, same name) | None (paths unique) |
| Agent ergonomics | Reference by concept name | Must know exact file path |
| CRDT compatibility | Natural (semantic reference) | Paths may diverge from CRDT state |
| Git diff size | Minimal | Larger (path information) |

**Architectural recommendation:** Wikilinks as authoring format, standard markdown as derived portable representation (Foam's link reference definition pattern).

---

## D2: Backlink Index Architecture (Source-Code Depth)

**Finding:** Source code analysis of 7 OSS implementations reveals three architectural families for backlink indexes. The canonical data structure is always `Map<target, Set<source>>` regardless of physical representation. The critical variation is in update strategy (full rebuild vs incremental) and whether the reverse index is explicit, derived, or automatic.

**Evidence:** [fanout/2026-04-03-initial/backlink-index-source-code/evidence/](fanout/2026-04-03-initial/backlink-index-source-code/evidence/)

### Architectural Families

**Family 1: Dual Adjacency Lists (Foam, Dendron)**

Foam maintains two parallel `Map<string, Connection[]>` -- one keyed by source (`links`), one by target (`backlinks`). Both populated simultaneously in a single `connect()` call. Query cost: O(1). Update: full rebuild on every change (Foam) or incremental diff (Dendron).

```typescript
// foam/packages/foam-vscode/src/core/model/graph.ts:130-147
connect(source, target, link) {
  this.links.get(source.path).push(connection);
  this.backlinks.get(target.path).push(connection);
}
```

Dendron embeds backlinks directly in note metadata (`DLink[]` with `type: "backlink"`). No separate graph structure. Update via old/new link set diffing with `DLinkUtils.isEquivalent`.

**Family 2: EAV Triplestore with Auto-Reverse Index (Logseq)**

Logseq uses [Datascript](https://github.com/tonsky/datascript) (in-memory Datalog database). `:block/refs` is a ref-typed attribute; Datascript's VAET index automatically maintains the reverse mapping, accessible via `(:block/_refs entity)`. Query: O(1). Update: O(delta) per transaction.

```clojure
;; logseq/deps/db/src/logseq/db/common/reference.cljs:261
(mapcat (fn [pid] (:block/_refs (d/entity db pid))) ids)
```

**Family 3: Relational DB with Async Extraction (Outline)**

Outline stores backlinks in a PostgreSQL `relationships` table. A `BacklinksProcessor` queue processor reacts to document events, walks the ProseMirror AST for internal links, and upserts/deletes rows. Uses stable `urlId` (10-char random) for rename-transparent link resolution.

### Performance Comparison

| Tool | Backlink Query | Update Cost | Startup |
|------|---------------|-------------|---------|
| **Foam** | O(1) map lookup | O(N x L) full rebuild | Parse all files |
| **Logseq** | O(1) VAET index | O(delta) per-tx | Batch Datascript load |
| **Dendron** | O(L) filter | O(delta) diff | Two-phase: parse + backlinks |
| **Marksman** | O(1) multimap | O(delta) configurable | Parse all files |
| **Outline** | O(1) DB index | O(L) per doc | DB already populated |
| **Obsidian** | O(N) linear scan | O(L) per file | Full scan + IndexedDB |

### Critical Architectural Lessons

- **Obsidian's forward-only `resolvedLinks` map is the anti-pattern.** The community built [obsidian-backlink-cache](https://github.com/mnaoumov/obsidian-backlink-cache) to work around O(N) backlink queries.
- **AFFiNE/BlockSuite has 5 forward-link mechanisms but zero backlink infrastructure.** CRDT editors do not inherently solve backlinks -- the index must be application-layer.
- **Logseq's UUID-based internal storage** makes renames transparent but sacrifices git readability.
- **Outline's stable `urlId`** is the best compromise: human-readable URLs that never break on rename.

---

## D3: Wiki-Links in the Editor (ProseMirror/TipTap)

**Finding:** No production-ready TipTap wikilink extension exists, but the implementation path is well-defined. TipTap's `@tiptap/suggestion` plugin provides the `[[` trigger mechanism. The wikilink should be an inline ProseMirror node (not a mark) with ID-based resolution, following the patterns established by AFFiNE's linked-doc widget and Outline's mention node.

**Evidence:** [fanout/2026-04-03-initial/wikilinks-prosemirror-tiptap/evidence/](fanout/2026-04-03-initial/wikilinks-prosemirror-tiptap/evidence/)

### `[[` Autocomplete via @tiptap/suggestion

TipTap's suggestion plugin detects trigger characters via regex on the text node before the cursor position:

```typescript
// @tiptap/suggestion/src/findSuggestionMatch.ts
const regexp = allowSpaces
  ? new RegExp(`${prefix}${escapedChar}.*?(?=\\s${finalEscapedChar}|$)`, 'gm')
  : new RegExp(`${prefix}(?:^)?${escapedChar}[^\\s${finalEscapedChar}]*`, 'gm')
```

For `char: '[['`, this produces `/(?:^)?\[\[[^\s\[\[]*/gm`. The query is extracted as `match[0].slice(char.length)`. The plugin provides `onStart`, `onUpdate`, `onExit`, and `onKeyDown` callbacks for managing the popup UI.

### ProseMirror Node Spec for Wikilinks

Based on how AFFiNE and Outline implement their internal link nodes:

```typescript
const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,  // non-editable atomic unit
  
  addAttributes() {
    return {
      target: { default: null },        // document ID or slug
      alias: { default: null },         // optional display text
      anchor: { default: null },        // #heading or #^blockid
    }
  },
  
  renderHTML({ node }) {
    return ['span', { 
      class: 'wiki-link',
      'data-target': node.attrs.target,
      'data-alias': node.attrs.alias,
    }, node.attrs.alias || node.attrs.target]
  },
})
```

### Rendering in WYSIWYG Mode

Both AFFiNE and Outline render internal links as **clickable chips/pills** that display resolved title text:

- **AFFiNE:** Stores only `pageId` (UUID) in the reference node. Display text resolved at render time from the document store. Custom `ReferencePopup` shows title + icon.
- **Outline:** Stores `modelId` (UUID) + cached `label` (creation-time snapshot). Renders as a mention chip. Label is a cache hint -- the authoritative title comes from the document model.

For our system: store the document ID in the node, resolve display text reactively from the CRDT document store. This means renames automatically update display text without modifying link nodes.

### Markdown Serialization via tiptap-markdown

tiptap-markdown uses an HTML intermediary (markdown-it render to HTML, then ProseMirror DOMParser). Wikilink integration requires:

1. **Parse direction:** Register a markdown-it plugin (via `parse.setup(md)`) that recognizes `[[...]]` and produces an HTML element that ProseMirror's DOMParser can map to the wikiLink node
2. **Serialize direction:** Add a custom serializer that outputs `[[target]]` or `[[target|alias]]`

Alternatively, bypass tiptap-markdown and use the remark-wiki-link/micromark stack for a direct AST-to-ProseMirror pipeline.

### Missing Target Handling

When a wikilink points to a non-existent article:
- **Red link pattern (Wikipedia):** Render in red/different color, clicking creates the article
- **Create-on-click (Obsidian):** Click creates a new file with the linked name
- **Tooltip warning:** Show "This article doesn't exist yet" on hover

The `exists` flag from remark-wiki-link's `pageResolver` enables all three patterns.

---

## D4: Backlinks + AI Agents

**Finding:** The link graph is a first-class navigation tool for AI agents. Six decomposed MCP tools expose structural queries (backlinks, forward links, orphans, hubs, clusters) that complement text-based search. Agents can also maintain the link graph by identifying missing links, but this requires guardrails against link spam.

### MCP Tool Design for Link Graphs

Based on the "orient, discover, consume" agent navigation pattern (documented in our prior kb-index-navigation-patterns-for-agents report):

| Tool | Purpose | Returns | Agent Use Case |
|------|---------|---------|---------------|
| `get_backlinks(docId)` | What links TO this article? | `Set<{sourceId, context}>` | Find related context, understand article importance |
| `get_forward_links(docId)` | What does this article link TO? | `Set<{targetId, context}>` | Follow the knowledge chain |
| `get_orphans()` | Articles with no incoming links | `Set<docId>` | Find disconnected knowledge |
| `get_hubs(limit)` | Most-linked articles | `Array<{docId, count}>` | Identify key concepts |
| `get_link_graph(docId, depth)` | Local neighborhood graph | Adjacency list | Topic cluster detection |
| `suggest_links(docId)` | Articles that mention this topic but don't link | `Array<{sourceId, snippet}>` | "Agent as librarian" pattern |

### The Agent-as-Librarian Pattern

An agent can read the link graph and identify structural gaps:
1. Search for articles mentioning a concept by name (text search)
2. Compare against backlinks for that concept's article
3. Articles that mention the concept but don't link = suggested new links
4. Agent can propose the links (with human review) or auto-create them

**Guardrails needed:** Agents should not create links without relevance validation. A quality threshold (semantic similarity > 0.7 between the linking context and the target article) prevents link spam.

### How Existing Tools Expose Link Graphs to Agents

- **Obsidian MCP plugins** (obsidian-mcp, mcp-obsidian) expose vault search and file read/write but do not expose the link graph directly. Backlink queries require the agent to parse markdown files themselves.
- **GraphRAG** builds entity graphs from documents via LLM extraction, then uses community detection (Leiden algorithm) for hierarchical summarization. The entity graph is structurally different from a wiki-link graph -- it represents extracted relationships, not explicit authorial links.
- **Cognee** and **Graphiti** represent entity relationships as knowledge graph triples. Applicable pattern: treating wiki-links as a lightweight, human-authored knowledge graph where each `[[link]]` is an explicit edge.

### Link Graph as Retrieval Signal

Link proximity can serve as a ranking signal for search:
- Articles linked from the same source are likely topically related
- Articles with many shared backlinks are in the same conceptual cluster
- An article with high backlink count is more "important" (analogous to PageRank)
- Combining semantic search scores with link-graph distance produces better retrieval than either alone

---

## D5: Git Compatibility of Link Formats

**Finding:** Wikilinks and markdown links are equally compatible with git's core operations. Both are plain text. Wikilinks produce smaller, cleaner diffs on rename operations because they encode less path information. The primary gap: GitHub does not render wikilinks, requiring a portability layer.

**Evidence:** [fanout/2026-04-03-initial/link-formats-git-compat/evidence/git-compatibility.md](fanout/2026-04-03-initial/link-formats-git-compat/evidence/git-compatibility.md)

### Rename Diff Comparison

**Wikilink rename:**
```diff
- Some text referencing [[old-name]].
+ Some text referencing [[new-name]].
```

**Markdown link rename:**
```diff
- Some text referencing [Old Name](../../articles/old-name.md).
+ Some text referencing [New Name](../../articles/new-name.md).
```

Wikilinks change one token. Markdown links change both display text and path. If the file moved directories, every relative path differs based on the referencing file's location.

### Merge Conflict Readability

Wikilink conflicts are more readable:
```
<<<<<<< HEAD
References [[updated-concept]] in the text.
=======
References [[original-concept]] in the text.
>>>>>>> feature-branch
```

vs markdown link conflicts where you must also understand relative path differences.

### GitHub Rendering Gap

GitHub renders wikilinks as literal text. Solutions: Foam-style link reference definitions (makes files valid standard markdown), build-time preprocessing, or GitHub Actions auto-generation. For a platform that primarily accesses content through its own UI, this gap is manageable.

---

## D6: Link Graph as Knowledge Structure

**Finding:** The link graph is the knowledge structure -- it transforms a collection of files into an interconnected knowledge base. The practical value comes from backlinks (discovering unexpected connections), not from graph visualization (which is largely decorative at scale). The Zettelkasten methodology validates that link-based knowledge organization scales better than hierarchical classification.

### Graph Visualization: Useful vs Gimmicky

Obsidian's graph view uses force-directed layout (d3-force or similar). At small scales (under 100 nodes), it can reveal clusters and orphans. At larger scales (500+ nodes), it becomes a hairball that looks impressive but provides little navigational value. The practical use is **local graph** -- showing the immediate neighborhood of the current article, not the entire vault.

Roam Research pioneered bidirectional linking as a default behavior: every `[[reference]]` automatically creates a backlink, and backlinks are displayed inline below each page. This "automatic context" pattern proved more useful than graph visualization for daily knowledge work.

### The Zettelkasten Pattern

Niklas Luhmann's Zettelkasten (slip-box) methodology validates link-based organization:
- Each "note" is a self-contained idea (not a topic summary)
- Notes are linked to related notes, forming a web
- The structure emerges from links, not from pre-defined categories
- New knowledge is integrated by finding where it connects to existing knowledge

Digital implementations (Obsidian, Roam, Logseq) confirm that this works when: (1) links are cheap to create (wikilinks), (2) backlinks are visible (automatic context), and (3) the system encourages small, linked notes over large, standalone documents.

### Scale Properties

Link graphs in knowledge bases follow power-law distributions:
- A few "hub" articles accumulate many backlinks (key concepts, indexes)
- Most articles have 1-3 incoming links
- Orphaned articles (zero incoming links) accumulate over time without maintenance
- At 100 articles: the graph is navigable by humans
- At 1,000 articles: search becomes essential; graph view becomes noise
- At 10,000 articles: automated graph maintenance (orphan detection, cluster analysis) becomes necessary

### Wikipedia's Success Pattern

Wikipedia works at massive scale because:
- Every article is expected to link to related articles (cultural norm)
- Backlinks (What Links Here) are a first-class navigation tool
- Orphaned articles are flagged for integration
- Disambiguation pages handle name collisions
- Red links (links to non-existent articles) invite contribution

These patterns apply directly to an agent-native platform: agents can enforce linking norms, detect orphans, and propose new links.

---

## D7: Derived Index Architecture for Our System

**Finding:** The backlink index for a CRDT+git+MCP system should be an in-memory dual adjacency list, built at startup from a persisted cache, updated incrementally via a unified event pipeline from both CRDT operations (Hocuspocus hooks) and git changes (post-checkout hooks), with content-addressed deduplication for branch awareness.

**Evidence:** [fanout/2026-04-03-initial/derived-index-architecture/evidence/](fanout/2026-04-03-initial/derived-index-architecture/evidence/)

### Architecture Overview

```
+------------------+      +-------------------+
|   TipTap Editor  |      |    Git Operations  |
|   (CRDT/Yjs)     |      |    (branch, pull)  |
+--------+---------+      +---------+---------+
         |                           |
         v                           v
+--------+---------+      +---------+---------+
| Hocuspocus       |      | post-checkout     |
| onStoreDocument  |      | hook              |
| (debounced 2-10s)|      | (oldSHA, newSHA)  |
+--------+---------+      +---------+---------+
         |                           |
         +----------+  +------------+
                    |  |
                    v  v
           +--------+--+--------+
           |  Unified Update    |
           |  Pipeline          |
           |                    |
           |  1. Parse file for |
           |     link nodes     |
           |  2. Diff old vs    |
           |     new links      |
           |  3. Update forward |
           |     + backward maps|
           |  4. Update search  |
           |     index (Orama)  |
           +--------+----------+
                    |
           +--------v----------+
           |  In-Memory Index  |
           |                   |
           |  forward: Map<    |
           |    docId,         |
           |    Set<LinkRecord>|
           |  >                |
           |                   |
           |  backward: Map<   |
           |    docId,         |
           |    Set<LinkRecord>|
           |  >                |
           +--------+----------+
                    |
           +--------v----------+
           |  MCP Tools        |
           |                   |
           |  get_backlinks    |
           |  get_forward_links|
           |  get_orphans      |
           |  get_hubs         |
           |  get_link_graph   |
           |  suggest_links    |
           +-------------------+
```

### CRDT Integration

Hocuspocus `onStoreDocument` is the correct hook -- debounced (2-10s configurable), fires once per document regardless of concurrent editors, and represents the "document has settled" moment. Server-side link extraction uses `yDocToProsemirrorJSON(ydoc, field)` from y-prosemirror, which converts a Y.Doc to ProseMirror JSON without requiring the schema.

Concurrent editing is not a problem: Yjs CRDT merges operations into a single converged state, Hocuspocus sees one merged document, the index sees the converged result.

Consistency window: 2-10 seconds (debounce). This is eventual consistency, acceptable because backlinks are navigational aids, not transactional data.

### Branch-Aware Indexing

No existing tool handles this. Our design uses content-addressed deduplication (inspired by Zoekt):

```
entries: Map<ContentHash, { links: Set<target>, metadata }>
branches: Map<BranchName, Map<FilePath, ContentHash>>
active_branch: string
```

Files identical across branches share entries. Branch switching: if the target branch is cached and the SHA matches, swap the pointer in O(1). Otherwise, compute git diff and update only changed files.

### Storage Tiers

| Tier | Technology | Data | Lifecycle |
|------|-----------|------|-----------|
| Hot (query) | In-memory Maps | Forward/backward links | Always loaded |
| Warm (persist) | JSON or SQLite | Serialized index + branch state | On change, on startup |
| Cold (rebuild) | Git repo files | Raw markdown content | Full rebuild only |

Memory budget: 10,000 articles x 5 links avg = 50K edges x ~200 bytes = ~10MB. Well within server memory.

### Data Structure

```typescript
interface BacklinkIndex {
  forward: Map<DocId, Set<LinkRecord>>;
  backward: Map<DocId, Set<LinkRecord>>;
  parseCache: Map<DocId, { hash: string; links: LinkRecord[] }>;
  
  rebuild(): void;
  updateDoc(docId: DocId, content: string): void;
  getBacklinks(docId: DocId): Set<LinkRecord>;
  getForwardLinks(docId: DocId): Set<LinkRecord>;
}

interface LinkRecord {
  sourceDoc: DocId;
  targetDoc: DocId;
  linkType: 'wikilink' | 'markdown' | 'embed' | 'tag';
  position: { line: number; col: number };
  rawText: string;
  anchor?: string;
  alias?: string;
}
```

### Dual-Index Complement: Link Graph + Search

The backlink index and Orama search index are complementary:
- **Link graph:** structural queries (backlinks, forward links, clusters, orphans)
- **Orama:** content queries (full-text search, semantic similarity, tag filtering)
- **Combined:** "find articles about X that are linked from Y" = Orama search filtered by graph neighborhood

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D4+D6 (Agents + Link Graph):** Web-sourced and synthesized from prior research rather than deep source-code analysis of AI agent implementations. Evidence is more INFERRED than CONFIRMED for specific agent interaction patterns.
- **Block-level references:** The report covers page-level linking in depth but only touches on block-level references (Obsidian `#^blockid`, Logseq `((uuid))`). A deeper investigation of block-level backlinks and their index implications would be valuable.
- **Performance benchmarks:** The report cites Obsidian's sub-500ms startup for 17K notes but lacks benchmarks for our proposed architecture. Prototype benchmarking is needed.

### Open Design Questions

1. **ID-based vs name-based link targets:** The evidence favors stable IDs (Logseq, Outline) for rename resilience, but IDs sacrifice the human readability that makes wikilinks valuable. How to reconcile? One option: store IDs internally, display names in the editor, keep names in markdown for git readability.
2. **Branch index memory budget:** With 10+ branches active, does the content-addressed deduplication keep memory reasonable? Needs measurement.
3. **Orama + link graph co-indexing:** Can a single Orama index hold both text content and link graph edges, or should they remain separate indexes?

---

## References

### Evidence Files (via Sub-Reports)

- [fanout/2026-04-03-initial/link-formats-git-compat/](fanout/2026-04-03-initial/link-formats-git-compat/) -- 7 evidence files on link format conventions and git compatibility
- [fanout/2026-04-03-initial/backlink-index-source-code/](fanout/2026-04-03-initial/backlink-index-source-code/) -- 7 evidence files from source code analysis of Foam, Logseq, Outline, Marksman, Dendron, AFFiNE, Obsidian
- [fanout/2026-04-03-initial/wikilinks-prosemirror-tiptap/](fanout/2026-04-03-initial/wikilinks-prosemirror-tiptap/) -- 5 evidence files on TipTap suggestion plugin, tiptap-markdown, remark-wiki-link tokenizer, AFFiNE linked-doc widget, Outline mention node
- [fanout/2026-04-03-initial/derived-index-architecture/](fanout/2026-04-03-initial/derived-index-architecture/) -- 5 evidence files on CRDT integration, branch-aware indexing, MCP tool design, performance modeling

### External Sources

- [Obsidian Internal Links](https://help.obsidian.md/links) -- Official link format documentation
- [remark-wiki-link](https://github.com/landakram/remark-wiki-link) -- Remark plugin for wikilink parsing
- [micromark-extension-wiki-link](https://github.com/landakram/micromark-extension-wiki-link) -- Character-level wikilink tokenizer
- [Foam](https://github.com/foambubble/foam) -- VS Code extension with wikilink graph
- [Logseq](https://github.com/logseq/logseq) -- Datascript-powered knowledge graph
- [Outline](https://github.com/outline/outline) -- Wiki with ProseMirror editor and backlinks
- [BlockSuite](https://github.com/toeverything/blocksuite) -- AFFiNE's CRDT editor framework
- [Dendron](https://github.com/dendronhq/dendron) -- VS Code extension with hierarchical linking
- [Marksman](https://github.com/artempyanykh/marksman) -- Markdown LSP with wikilink support
- [@tiptap/suggestion](https://tiptap.dev/docs/editor/extensions/functionality/suggestion) -- TipTap suggestion/autocomplete plugin
- [tiptap-markdown](https://github.com/aguingand/tiptap-markdown) -- TipTap markdown serialization
- [Hocuspocus](https://tiptap.dev/docs/hocuspocus/server/hooks) -- CRDT collaboration server hooks
- [y-prosemirror](https://github.com/yjs/y-prosemirror) -- Yjs ProseMirror binding (yDocToProsemirrorJSON)

### Related Research

- [kb-index-navigation-patterns-for-agents/](../kb-index-navigation-patterns-for-agents/) -- How agents navigate knowledge bases (progressive disclosure, three-layer architecture)
- [knowledge-graph-incremental-updates/](../knowledge-graph-incremental-updates/) -- Temporal versioning and incremental entity resolution for knowledge graphs
- [obsidian-karpathy-workflow-deep-dive/](../obsidian-karpathy-workflow-deep-dive/) -- Obsidian capability assessment including MCP integration
- [openknowledge-competitive-landscape/](../openknowledge-competitive-landscape/) -- Competitive landscape for agent-native knowledge platforms
