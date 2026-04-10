# Derived Index Architecture for an Agent-Native Knowledge Platform

**Dimension**: D7 — Derived Index Architecture  
**Priority**: P0 (Deep)  
**Date**: 2026-04-04  
**Parent**: Wiki-Links and Backlinks Architecture

---

## Executive Summary

This report designs the backlink index architecture for an agent-native knowledge platform built on CRDT collaboration (Yjs/Hocuspocus), git-backed storage, MCP server for agent access, and a TipTap WYSIWYG editor. The design is grounded in analysis of four existing implementations (Obsidian, Logseq, Foam, Outline) and synthesizes their patterns into a dual-index architecture — an in-memory link graph plus a search index — driven by a unified event pipeline from both CRDT operations and git changes.

**Key architectural decisions:**
1. **Build at startup + incremental update** — full index build on server start from persisted cache, incremental updates on every document change
2. **Debounced CRDT updates** — backlink index updates triggered by Hocuspocus `onStoreDocument` hook (debounced 2-10s), not on every keystroke
3. **Branch-aware via content-addressed deduplication** — index entries keyed by `(filepath, content-hash)`, branches share identical entries
4. **In-memory primary, persisted to disk** — adjacency lists in memory for sub-millisecond queries, JSON/SQLite on disk for fast restart
5. **Six MCP tools** — decomposed interface following the "explore → narrow → follow" agent navigation pattern
6. **Dual-index complement** — link graph for structural queries, Orama for full-text/semantic search

---

## 1. Prior Art Synthesis

### How Existing Tools Build Their Indexes

| Tool | Storage | Build Strategy | Update Trigger | CRDT-Aware | Branch-Aware |
|------|---------|---------------|----------------|------------|--------------|
| **Obsidian** | In-memory (MetadataCache) | Full parse at vault open | File change event | No | No |
| **Logseq** | DataScript in-memory + SQLite | Full parse at graph open | File watcher + auto-commit | No | No |
| **Foam** | In-memory (FoamGraph) | Full parse at extension activation | VS Code file watcher | No | No |
| **Outline** | PostgreSQL | BacklinksProcessor queue | Document save event | Partial (Yjs) | No |

**Key observations:**

- Every tool builds its full index at startup, then maintains it incrementally. None use lazy computation for the primary index.
- Obsidian achieves sub-500ms startup for 17K notes through aggressive optimization of its in-memory MetadataCache ([kepano, 2025](https://www.threads.com/@kepano/post/DSq3zxXETy7)).
- Outline is the only tool with real-time collaboration (Yjs), but its backlink processing is decoupled — a `BacklinksProcessor` runs asynchronously in a queue after document save, not on every CRDT operation ([outline/outline BacklinksProcessor.ts](https://github.com/outline/outline/blob/main/server/queues/processors/BacklinksProcessor.ts)).
- None of the surveyed tools maintain branch-aware indexes. This is a novel design challenge.
- Foam's experience with graph update bugs ([foambubble/foam#393](https://github.com/foambubble/foam/issues/393) — saving removes graph edges) teaches that incremental updates must be carefully designed: clear only forward links on update, never delete the node itself, so inbound links from other documents survive.

**What we should adopt:**
- Obsidian's pattern: in-memory adjacency structures with event-driven incremental updates
- Outline's pattern: async queue processing for backlink computation, decoupled from the editor
- Foam's lesson: separate forward-link and backlink management in the update path

**What we must add:**
- CRDT-aware update pipeline (Hocuspocus hooks)
- Branch-aware index management (git integration)
- MCP tool exposure for agent access

---

## 2. Build Strategy: Startup + Incremental

### Startup Sequence

```
Server starts
  ├─ 1. Load persisted index from disk (JSON or SQLite)
  │     └─ Validate against current commit SHA
  │        ├─ If SHA matches: index is current → ready in <100ms
  │        └─ If SHA differs: compute git diff → incremental update
  ├─ 2. If no persisted index: full rebuild
  │     ├─ List all markdown files (git ls-files or isomorphic-git listFiles)
  │     ├─ Parse each file for links (remark + remark-wiki-link or ProseMirror AST)
  │     ├─ Build forward link map: Map<source, Set<target>>
  │     └─ Derive backlink map: Map<target, Set<source>> (transpose of forward map)
  └─ 3. Persist index + commit SHA to disk
```

### Incremental Update (Hot Path)

Two event sources feed the same update pipeline:

**CRDT path** (real-time edits):
```
Hocuspocus onStoreDocument fires (debounced 2-10s)
  → yDocToProsemirrorJSON(document, field) extracts ProseMirror JSON
  → Walk JSON tree for link nodes (type === 'mention', type === 'wikiLink')
  → Compute new_links = extracted link targets
  → Compute diff: added = new_links - old_links, removed = old_links - new_links
  → Update forward map and backlink map
  → Update search index (Orama insert/update)
```

**Git path** (branch switch, pull, commit):
```
post-checkout hook fires with (oldSHA, newSHA, branchFlag)
  → git diff --name-status oldSHA newSHA
  → For each changed file:
    ├─ Deleted: remove from forward map, remove from all backlink sets
    ├─ Added/Modified: re-parse file, update forward map, update backlinks
    └─ Renamed: remove old path, add new path
  → Persist updated index + new commit SHA
```

### Why Not Lazy Computation?

Lazy computation (compute backlinks only when queried) is viable for small corpora but fails our requirements:

1. **Agent latency**: MCP tool calls must return in <100ms. Computing backlinks on-demand requires scanning all documents — O(N) per query.
2. **CRDT consistency**: With lazy computation, the index state is undefined between queries. With eager computation, we always know the index's freshness (within the debounce window).
3. **Prior art consensus**: All four surveyed tools use eager computation. Obsidian tried and validated this at 17K notes.

---

## 3. CRDT Interaction Design

### The Hocuspocus Hook Pipeline

Hocuspocus provides the event hooks needed to bridge CRDT edits and index updates:

```
onChange(data)              — fires on EVERY document change
                             NOT per-connection: once per document per update
                             "can be fired up to multiple times a second"
                             ↓
onStoreDocument(data)      — fires AFTER onChange
                             DEBOUNCED by default (configurable)
                             Same payload: { document: Y.Doc, documentName, ... }
```

Source: [Hocuspocus hooks docs](https://tiptap.dev/docs/hocuspocus/server/hooks)

**Critical design choice**: Hook the backlink index update to `onStoreDocument`, NOT `onChange`. Reasons:
- `onStoreDocument` is already debounced (configurable `debounce: 2000, maxDebounce: 10000`)
- It represents the "document has settled" moment, not "user is mid-keystroke"
- It fires once per document regardless of how many users are editing simultaneously
- The same hook that persists to disk also triggers index updates — consistent timing

### Server-Side Link Extraction from Y.Doc

The [y-prosemirror](https://github.com/yjs/y-prosemirror) library provides `yDocToProsemirrorJSON(ydoc, field)` which converts a Y.Doc to ProseMirror JSON **without requiring the ProseMirror schema**. This is the key to server-side link extraction:

```typescript
// In Hocuspocus extension
async onStoreDocument({ document, documentName }) {
  const json = yDocToProsemirrorJSON(document, 'default')
  const links = extractLinksFromProsemirrorJSON(json)
  backlinkIndex.updateDocument(documentName, links)
  searchIndex.updateDocument(documentName, json)
}
```

### Concurrent Editing: Why It's Not a Problem

When two users edit the same document simultaneously:
1. Yjs CRDT merges their operations into a single converged document state (YATA algorithm, [Nicolaescu et al., GROUP 2016](https://dl.acm.org/doi/10.1145/2957276.2957310))
2. Hocuspocus sees one merged Y.Doc, fires `onStoreDocument` once
3. The backlink index sees the converged result — no conflicts possible

When two users edit *different* documents that both link to the same target:
1. Each document gets its own `onStoreDocument` event
2. Each event updates only that document's entry in the forward map
3. Backlinks are derived from the forward map — automatically consistent

### Consistency Window

Between a CRDT edit and the index reflecting it: **2-10 seconds** (configurable debounce).

This is **eventual consistency**, which is acceptable because:
- Backlinks are navigational aids, not transactional data
- A 5-second delay before a new backlink appears is imperceptible to human users
- For agents: if they query immediately after creating a link, they may not see it in backlinks. This is a known tradeoff documented in the MCP tool descriptions.

---

## 4. Branch-Aware Indexes

### The Challenge

Different git branches have different file content → different link graphs. When a user switches branches, the index must reflect the new branch's state.

**No existing tool solves this.** Obsidian, Logseq, Foam, and Outline all operate on a single branch. Sourcegraph/Zoekt is the closest prior art — it indexes up to 64 branches with bitmask deduplication ([Zoekt architecture](https://deepwiki.com/sourcegraph/zoekt/4-indexing-system)).

### Recommended Design: Content-Addressed Entries with Branch Pointers

```
Index Structure:
  entries: Map<ContentHash, { links: Set<target>, metadata: {...} }>
  branches: Map<BranchName, Map<FilePath, ContentHash>>
  active_branch: string
```

- Each unique file version gets one entry in `entries`, keyed by content hash
- Each branch maintains a mapping from file paths to content hashes
- Files identical across branches share the same entry (Zoekt bitmask pattern)
- Memory grows proportional to **unique file versions**, not branches × files

### Branch Switch Protocol

Using the `post-checkout` hook (which provides both old and new HEAD SHAs):

```
post-checkout(oldSHA, newSHA, branchFlag=1):
  1. Determine new branch name: git branch --show-current
  2. Check if branches[newBranch] exists in cache
     ├─ Yes + SHA matches: swap active_branch pointer → done (O(1))
     └─ No or stale:
        3. git diff --name-status oldSHA newSHA → changed files
        4. For each changed file:
           ├─ Compute new content hash
           ├─ If entries[newHash] exists: reuse (dedup!)
           └─ If not: parse file, create entry, store in entries
        5. Update branches[newBranch] with new filepath→hash mapping
        6. Swap active_branch pointer
        7. Persist to disk
```

### Link Graph Diffing Between Branches

To show "what links changed in this branch vs main":

```
branch_diff(branch_a, branch_b):
  graph_a = resolve(branches[branch_a])  // filepath → links
  graph_b = resolve(branches[branch_b])
  added_links = graph_b.edges - graph_a.edges
  removed_links = graph_a.edges - graph_b.edges
  return { added_links, removed_links }
```

This is O(changed_files × avg_links_per_file) since you only need to compare entries where the content hash differs between branches.

---

## 5. Storage Architecture

### Three-Tier Storage

| Tier | Technology | Data | Lifecycle |
|------|-----------|------|-----------|
| **Hot** (query path) | In-memory Maps | Forward links, backlinks, adjacency | Always loaded |
| **Warm** (persistence) | JSON file or SQLite | Serialized index + branch state | Written on index change, loaded on startup |
| **Cold** (rebuild source) | Git repo files | Raw markdown / Y.Doc content | Used only for full rebuild |

### Why In-Memory Primary

- **Query latency**: Map lookups are O(1). `getBacklinks("article-slug")` must return in <1ms for MCP tool responsiveness.
- **Memory budget**: At 10,000 articles with avg 5 links each = 50K edges. Each edge is ~200 bytes = ~10MB. Well within server memory.
- **Prior art**: Obsidian (17K notes), Logseq (DataScript), and Foam all use in-memory primary with sub-second access.

### Persistence Format

```typescript
interface PersistedIndex {
  version: number
  commitSHA: string
  branch: string
  timestamp: number
  entries: Record<string, {
    contentHash: string
    outgoingLinks: string[]     // target slugs
    title: string
    tags: string[]
  }>
}
```

Persisted as JSON for simplicity, or SQLite if the index exceeds ~50MB (unlikely below 100K articles).

### Not a Derived File in the Repo

The index should NOT be committed to git because:
- It's derived data (can be rebuilt from source files)
- It changes on every edit (noisy git history)
- Branch-specific state doesn't belong in the branch itself
- Store in a side-channel: `~/.cache/platform-name/indexes/` or a server-local database

---

## 6. MCP Tool Integration

### Tool Signatures

Based on analysis of 8+ existing MCP knowledge graph servers (see [evidence/mcp-tool-design.md](evidence/mcp-tool-design.md)), the recommended decomposition:

#### `search_articles`
```json
{
  "name": "search_articles",
  "description": "Search articles by text, tags, or semantic similarity. Returns ranked summaries.",
  "inputSchema": {
    "properties": {
      "query": { "type": "string", "description": "Search query (text or semantic)" },
      "tags": { "type": "array", "items": { "type": "string" } },
      "limit": { "type": "integer", "default": 10, "maximum": 50 }
    },
    "required": ["query"]
  },
  "annotations": { "readOnlyHint": true, "idempotentHint": true }
}
```

#### `get_backlinks`
```json
{
  "name": "get_backlinks",
  "description": "Get all articles that contain wiki-links TO the specified article.",
  "inputSchema": {
    "properties": {
      "slug": { "type": "string", "description": "Target article slug" },
      "limit": { "type": "integer", "default": 20 }
    },
    "required": ["slug"]
  },
  "annotations": { "readOnlyHint": true, "idempotentHint": true }
}
```

#### `get_link_graph`
```json
{
  "name": "get_link_graph",
  "description": "Get the link neighborhood around an article via BFS traversal. Returns nodes and edges.",
  "inputSchema": {
    "properties": {
      "slug": { "type": "string" },
      "depth": { "type": "integer", "default": 2, "minimum": 1, "maximum": 5 },
      "max_per_level": { "type": "integer", "default": 10, "maximum": 50 }
    },
    "required": ["slug"]
  },
  "annotations": { "readOnlyHint": true, "idempotentHint": true }
}
```

#### `suggest_links`
```json
{
  "name": "suggest_links",
  "description": "Suggest articles that should be linked from the specified article based on semantic similarity, excluding existing links.",
  "inputSchema": {
    "properties": {
      "slug": { "type": "string" },
      "threshold": { "type": "number", "default": 0.7, "minimum": 0.0, "maximum": 1.0 },
      "limit": { "type": "integer", "default": 5 }
    },
    "required": ["slug"]
  },
  "annotations": { "readOnlyHint": true }
}
```

### Agent Navigation Pattern

The tools are designed for composable "explore → narrow → follow" workflows:

```
Agent wants to understand "authentication" in the knowledge base:
  1. search_articles("authentication") → 8 results with snippets
  2. get_article("oauth2-pkce-flow") → full article content
  3. get_backlinks("oauth2-pkce-flow") → 3 articles reference this
  4. get_link_graph("oauth2-pkce-flow", depth=2) → 12 nodes, 18 edges
  5. suggest_links("oauth2-pkce-flow") → 2 articles should link here but don't
```

### Context Window Management

- **Default response tier**: Index (~50 tokens/item) — slug + title + link count
- **Full content**: Only via explicit `get_article` call
- **Pagination**: Cursor-based for results >20 items
- **Graph responses**: Nodes + edges format with `max_per_level` cap to prevent explosion

---

## 7. Semantic Search + Link Graph Complement

### Dual-Index Architecture

Two indexes, same source of truth, different query patterns:

| Index | Technology | Strengths | Query Examples |
|-------|-----------|-----------|---------------|
| **Link Graph** | In-memory adjacency lists | Structural queries, traversal, hub detection | "What links to X?", "2-hop neighborhood of X" |
| **Search Index** | Orama (in-memory) | Full-text search, faceted filtering, ranking | "Find articles about auth", "Articles tagged 'security'" |

### Cross-Index Integration

**Link proximity as ranking signal**: When searching, boost results that are closer in the link graph to the user's current context:

```
final_score = bm25_score × (1 + link_proximity_bonus)
  direct_link:   +0.5
  2_hops:        +0.2
  same_cluster:  +0.1
  no_connection:  0.0
```

**Semantic similarity for link suggestions**: Use Orama's vector search to find semantically similar articles, then filter out existing links. The remainder are high-quality link suggestions.

**Link metadata in search index**: Store `backlink_count` and `outgoing_links[]` as Orama fields, enabling queries like "highly-connected articles about topic X."

### Orama Configuration for Our Use Case

```typescript
const searchIndex = await create({
  schema: {
    slug: 'string',
    title: 'string',
    content: 'string',
    tags: 'enum[]',
    outgoing_links: 'enum[]',
    backlink_count: 'number',
    updated_at: 'number',
  }
})
```

Orama supports incremental updates (`insert`, `update`, `remove`) without full rebuilds, and delivers sub-50ms search with filtering ([Orama docs](https://docs.orama.com/open-source/usage/search/introduction/)).

---

## 8. Performance Targets

### Index Build Time

| Corpus Size | Full Build | Incremental (1 file) | Branch Switch (50 files changed) |
|-------------|-----------|---------------------|----------------------------------|
| 100 articles | <500ms | <10ms | <100ms |
| 1,000 articles | <2s | <10ms | <200ms |
| 10,000 articles | <10s | <20ms | <1s |

Grounded in: Obsidian achieves <500ms for 17K notes ([source](https://www.threads.com/@kepano/post/DSq3zxXETy7)). Our system is server-side (faster I/O) but also maintains search index (overhead).

### Query Time

| Query | Target Latency | Implementation |
|-------|---------------|----------------|
| `get_backlinks(slug)` | <1ms | Map lookup: O(1) |
| `get_outgoing_links(slug)` | <1ms | Map lookup: O(1) |
| `get_link_graph(slug, depth=2)` | <10ms | BFS on adjacency list |
| `search_articles(query)` | <50ms | Orama full-text + filter |
| `suggest_links(slug)` | <100ms | Orama vector search + graph filter |

### Memory Usage

| Corpus Size | Link Graph | Search Index (Orama) | Total |
|-------------|-----------|---------------------|-------|
| 100 articles | ~100KB | ~2MB | ~2MB |
| 1,000 articles | ~1MB | ~20MB | ~21MB |
| 10,000 articles | ~10MB | ~200MB | ~210MB |

Estimates based on: ~200 bytes/edge in link graph, ~20KB/document in Orama (including full text).

---

## 9. Event-Driven Architecture

### Event Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        EVENT SOURCES                             │
├──────────────┬─────────────────┬─────────────────────────────────┤
│   TipTap     │   Git Hooks     │   File Watcher                 │
│   Editor     │   (post-*)      │   (chokidar)                   │
│              │                 │                                  │
│  Y.Doc edit  │  post-checkout  │  .git/HEAD change              │
│      │       │  post-merge     │  manual file edit               │
│      ▼       │  post-commit    │                                  │
│  Hocuspocus  │      │          │                                  │
│  onChange    ─┤      │          │                                  │
│      │       │      │          │                                  │
│  [debounce]  │      │          │                                  │
│      │       │      │          │                                  │
│  onStore     │      │          │                                  │
│  Document    │      │          │                                  │
└──────┬───────┴──────┼──────────┴──────────────────────────────────┘
       │              │
       ▼              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     UPDATE PIPELINE                               │
│                                                                    │
│  1. Identify changed documents (from event payload)               │
│  2. Extract links from document content                           │
│     ├─ CRDT path: yDocToProsemirrorJSON → walk AST                │
│     └─ Git path: read file → parse markdown → extract links       │
│  3. Compute diff: added_links, removed_links                     │
│  4. Update forward link map                                       │
│  5. Update backlink map (transpose)                               │
│  6. Update Orama search index                                     │
│  7. Persist to disk (with branch + commit SHA)                    │
│  8. Emit 'index:updated' event for subscribers                    │
└──────────────────────────────────────────────────────────────────┘
```

### Conflict Resolution: CRDT vs. Git Events

When both sources fire for the same document (e.g., user edits in editor AND another user pushes via git):

1. CRDT is authoritative for real-time state (the Y.Doc is the source of truth while the document is open)
2. Git is authoritative for persisted state (the markdown file is the source of truth for closed documents)
3. When both fire, the later event wins — eventual consistency ensures convergence
4. Version stamps (content hash) prevent duplicate processing

---

## 10. Consistency Guarantees

### What We Guarantee

- **Eventual consistency**: The backlink index will reflect all changes within `maxDebounce` milliseconds (default 10s)
- **Rebuild correctness**: A full rebuild from source files always produces the correct index
- **Convergence**: Multiple concurrent editors produce a converged CRDT state → a single correct index

### What We Don't Guarantee

- **Instant consistency**: A link created at time T may not appear in backlink queries until T + debounce_window
- **Cross-branch consistency**: Switching branches may briefly show stale data while the index updates

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| Server crash during index update | Index may be partially updated | Rebuild from persisted state + git diff since last known commit |
| Stale persisted index (old commit SHA) | Startup reads stale data | Detect via SHA mismatch → incremental update from git diff |
| CRDT update lost (network partition) | Yjs handles reconnection and resync | Hocuspocus re-fires onStoreDocument after reconnection |
| Corrupted persisted index | Query returns wrong results | Delete persisted index → full rebuild on next startup |
| Branch switch during active editing | Index may briefly reflect wrong branch | post-checkout hook triggers immediate update; CRDT state for open docs is unaffected |

### The "Stale Index" Tradeoff

A stale backlink index is far less harmful than, say, a stale database index:
- **Worst case**: Agent sees one fewer backlink for a few seconds
- **No data loss**: The source documents are unaffected
- **Self-healing**: The debounce window guarantees eventual update
- **Cheap recovery**: Full rebuild takes <10s for 10K articles

---

## 11. Recommended Implementation Order

### Phase 1: Minimal Viable Index
1. In-memory forward + backlink maps (Map<string, Set<string>>)
2. Full build on server startup by parsing all markdown files
3. Incremental update on Hocuspocus `onStoreDocument` via `yDocToProsemirrorJSON`
4. Persist to JSON file with commit SHA
5. MCP tools: `get_backlinks`, `get_outgoing_links`, `search_articles` (via Orama)

### Phase 2: Git-Aware
6. `post-checkout` hook for branch switch detection
7. `git diff --name-status` for incremental update on branch switch
8. Per-branch cache with content-addressed deduplication
9. MCP tool: `get_link_graph` (BFS traversal)

### Phase 3: Intelligence
10. Orama vector search integration
11. MCP tool: `suggest_links` (semantic similarity - existing links)
12. Link proximity ranking signal in search
13. Hub detection and orphan detection tools

---

## Evidence Files

- [evidence/prior-art-implementations.md](evidence/prior-art-implementations.md) — Detailed analysis of Obsidian MetadataCache, Logseq Datascript, Foam FoamGraph, Outline BacklinksProcessor
- [evidence/crdt-index-interaction.md](evidence/crdt-index-interaction.md) — Yjs observation API, Hocuspocus hooks, debouncing strategies, event flow
- [evidence/git-branch-aware-indexing.md](evidence/git-branch-aware-indexing.md) — Git hooks, isomorphic-git, Zoekt bitmask pattern, file watcher strategies
- [evidence/mcp-tool-design.md](evidence/mcp-tool-design.md) — MCP tool schema, existing knowledge graph servers, tool decomposition, agent navigation
- [evidence/semantic-search-integration.md](evidence/semantic-search-integration.md) — Orama architecture, link graph + search complement, suggestion patterns

## Key External Sources

- [obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api) — Obsidian TypeScript API definitions
- [outline/outline](https://github.com/outline/outline) — Outline wiki source (BacklinksProcessor, ProsemirrorHelper)
- [foambubble/foam](https://github.com/foambubble/foam) — Foam VS Code extension (FoamGraph, workspace watcher)
- [logseq/logseq](https://github.com/logseq/logseq) — Logseq graph parser and Datascript schema
- [ueberdosis/hocuspocus](https://github.com/ueberdosis/hocuspocus) — Hocuspocus CRDT server hooks
- [yjs/y-prosemirror](https://github.com/yjs/y-prosemirror) — ProseMirror ↔ Yjs binding (yDocToProsemirrorJSON)
- [oramasearch/orama](https://github.com/oramasearch/orama) — Orama in-memory search engine
- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — Official MCP server implementations
- [isomorphic-git/isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) — Pure JS git implementation
- [sourcegraph/zoekt](https://deepwiki.com/sourcegraph/zoekt/4-indexing-system) — Branch-aware code search indexing
- [MCP Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) — Tool and resource definitions
