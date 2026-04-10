# Backlink Index Architecture — Source Code Depth

**Dimension:** D2: Backlink Index Architecture (P0, Deep)
**Method:** Source code analysis of 7 OSS implementations
**Date:** 2026-04-04
**Parent report:** Wiki-Links & Backlinks Architecture for Agent-Native Knowledge Platform

---

## Executive Summary

We read the actual source code of 7 knowledge management tools to understand how backlink indexes are built, maintained, and queried. The findings reveal **three distinct architectural families**, each with clear tradeoffs for an agent-native platform built on CRDT + git + MCP:

| Family | Representatives | Core Pattern | Update Strategy |
|---|---|---|---|
| **Dual adjacency list** | Foam, Dendron | `Map<target, Connection[]>` maintained alongside `Map<source, Connection[]>` | Full rebuild (Foam) or incremental diff (Dendron) |
| **EAV triplestore with auto-reverse index** | Logseq | Datascript `:block/refs` with automatic VAET index for `:block/_refs` | Incremental per-transaction |
| **Relational DB with async extraction** | Outline | PostgreSQL `relationships` table populated by async queue processor | Incremental per-document-save |

Two additional tools provide partial evidence: **Marksman LSP** (sophisticated incremental graph with three-layer symbol abstraction) and **AFFiNE/BlockSuite** (forward links only, no backlink index — proving that CRDT editors don't inherently solve backlinks). **Obsidian** (closed-source) exposes a forward-only `resolvedLinks` map with no precomputed reverse index, requiring O(n) iteration for backlink queries.

---

## 1. The Canonical Data Structure

Every implementation converges on the same logical abstraction, regardless of physical representation:

```
Forward:   Map<sourceDoc, Set<targetDoc>>   — "what does this doc link to?"
Backward:  Map<targetDoc, Set<sourceDoc>>   — "what links to this doc?"  (THE BACKLINK INDEX)
```

The variation is in **how and when** the backward map is computed:

### 1a. Explicit dual maps (Foam)

Foam maintains two parallel `Map<string, Connection[]>` — one keyed by source (`links`), one keyed by target (`backlinks`). Both are populated simultaneously in a single `connect()` call.

```typescript
// foam/packages/foam-vscode/src/core/model/graph.ts:130-147
connect(source, target, link) {
  this.links.get(source.path).push(connection);
  this.backlinks.get(target.path).push(connection);  // simultaneous write
}
```

**Query cost:** O(1) — `graph.getBacklinks(uri)` is a direct map lookup.
**Update cost:** O(N×L) — full rebuild on every change (clears both maps, re-walks all resources).
**Evidence:** [foam-graph.md](evidence/foam-graph.md)

### 1b. Embedded in note metadata (Dendron)

Dendron stores backlinks directly in each note's `links: DLink[]` array, co-mingled with forward links. A backlink is a `DLink` with `type: "backlink"`. There is no separate graph data structure.

```typescript
// dendron/packages/common-all/src/types/foundation.ts:148-151
interface NoteProps {
  links: DLink[];  // contains BOTH forward links AND backlinks
  // ...
}
```

**Query cost:** O(L) — filter `note.links.filter(l => l.type === "backlink")`.
**Update cost:** O(delta) — incremental diff of old vs new link sets on each save.
**Evidence:** [dendron-backlinks.md](evidence/dendron-backlinks.md)

### 1c. Automatic reverse index via Datascript (Logseq)

Logseq uses Datascript (an in-memory Datalog database) where `:block/refs` is a ref-typed attribute. Datascript's VAET index automatically maintains the reverse mapping, accessible via the `_` prefix convention.

```clojure
;; logseq/deps/db/src/logseq/db/common/reference.cljs:261
;; Forward: (:block/refs block-entity) → set of target entities
;; Backward: (:block/_refs page-entity) → set of source blocks (automatic!)
(mapcat (fn [pid] (:block/_refs (d/entity db pid))) ids)
```

**Query cost:** O(1) amortized — VAET index lookup.
**Update cost:** O(delta) — per-transaction ref recomputation produces `:db/add`/`:db/retract` datoms that atomically update both forward and reverse indexes.
**Evidence:** [logseq-datascript.md](evidence/logseq-datascript.md)

### 1d. Undirected symbol graph (Marksman LSP)

Marksman takes a unique approach: an **undirected graph** where `Sym.Ref` nodes are connected to `Sym.Def` nodes. "Find all references" (the backlink query) is simply "find all edges incident to this definition vertex."

```fsharp
// marksman/Marksman/Conn.fs:122-130
type Conn = {
    resolved: Graph<ScopedSym>  // undirected graph: ref <-> def edges
    // ...
}

// marksman/Marksman/Conn.fs:519-523
let resolve (scopedSym: ScopedSym) (conn: Conn) : Set<ScopedSym> =
    conn.resolved.edges |> MMap.tryFind scopedSym |> Option.defaultValue Set.empty
```

**Query cost:** O(1) — multimap lookup.
**Update cost:** O(delta) with optional full rebuild. Incremental update is implemented but disabled by default.
**Evidence:** [marksman-lsp.md](evidence/marksman-lsp.md)

### 1e. Relational table with async population (Outline)

Outline stores backlinks in a PostgreSQL `relationships` table. A `BacklinksProcessor` queue processor reacts to document events, parses ProseMirror AST for internal links, and upserts/deletes rows.

```
relationships table:
  documentId        → target doc (the doc being linked TO)
  reverseDocumentId → source doc (the doc containing the link)
  type              → 'backlink' | 'similar'
```

**Query cost:** O(1) with index — `SELECT WHERE documentId = ?`.
**Update cost:** O(L) per document — re-extract all links, diff against existing rows.
**Evidence:** [outline-backlinks.md](evidence/outline-backlinks.md)

### 1f. Forward-only with no reverse index (Obsidian)

Obsidian's `resolvedLinks` is `Record<sourcePath, Record<destPath, count>>` — forward only. The undocumented `getBacklinksForFile()` iterates all entries on every call. A community plugin ([obsidian-backlink-cache](https://github.com/mnaoumov/obsidian-backlink-cache)) exists to address this.

**Query cost:** O(N) — linear scan of all files.
**Evidence:** [obsidian-metadata-cache.md](evidence/obsidian-metadata-cache.md)

### 1g. No backlink infrastructure (AFFiNE/BlockSuite)

BlockSuite has 5 forward-link mechanisms (inline references, embed blocks, footnotes, etc.) but zero reverse-link tracking. The backlink index must live in the application layer above the editor framework.

**Evidence:** [affine-blocksuite.md](evidence/affine-blocksuite.md)

---

## 2. Incremental vs Full Rebuild

This is the most consequential design decision for performance at scale.

| Tool | Strategy | Trigger | Complexity | Notes |
|---|---|---|---|---|
| **Foam** | Full rebuild | Every workspace event | O(N×L) | Clears all 3 maps, re-walks all resources. Parser results cached (LRU 10K, checksum). |
| **Logseq** | Incremental per-tx | Every block edit | O(delta) | Datascript transactions atomically update forward + reverse indexes. Batch mode for import. |
| **Dendron** | Incremental diff | Note save | O(delta) | Diffs old vs new link sets via `DLinkUtils.isEquivalent`. Batch at startup. |
| **Marksman** | Both (configurable) | File change | O(delta) or O(N×L) | Incremental `Conn.update` implemented but disabled by default. Paranoid mode validates. |
| **Outline** | Incremental per-doc | Async on publish/update/delete | O(L) per doc | Queue processor extracts links, diffs against DB rows. |
| **Obsidian** | Incremental per-file | File mtime change | O(L) per file | Only the changed file is re-parsed. But backlink query is O(N). |

### Key insight: Incremental is strictly superior but harder to get right

Foam's full-rebuild approach is the simplest to implement (clear everything, re-walk) but creates O(N×L) work on every keystroke-save cycle. For workspaces with thousands of notes, this is a performance cliff.

Logseq and Dendron demonstrate the incremental pattern: compute the **delta** (added/removed links) and apply targeted mutations. Logseq does this at the database transaction level (inherently correct via Datascript's ACID guarantees). Dendron does it at the application level (comparing old/new link arrays with an equivalence function).

Marksman's approach is the most sophisticated: a full incremental graph update algorithm (`Conn.update`, 240 lines of F#) with a "paranoid mode" that validates incremental results against full rebuilds. The fact that incremental mode is disabled by default suggests confidence in the algorithm is still being built.

**Recommendation for agent-native platform:** Start with full rebuild (simple, correct), add incremental as an optimization once the link model stabilizes. The Dendron pattern (diff old vs new link sets per document) is the right level of complexity for a file-backed system.

---

## 3. Performance Characteristics

### 3a. Startup / Full Index Build

| Tool | Method | Warm Start Mitigation |
|---|---|---|
| **Foam** | Parse all files via `Promise.all`, then full graph build | LRU parser cache (10K entries, SHA checksum, persisted to VS Code workspaceState) |
| **Logseq** | Batch Datascript transactions | DB serialized to disk, loaded on restart |
| **Dendron** | Two-phase: parse all notes (Phase 1), batch backlink computation (Phase 2) | SHA-256 content hash cache persisted to filesystem |
| **Marksman** | Parse all files, build Conn graph | None documented (LSP is session-scoped) |
| **Obsidian** | Full file scan on first open | IndexedDB persistence, mtime-based incremental on subsequent starts |
| **Outline** | DB already populated (persisted) | PostgreSQL indexes on `(documentId, type)` |

### 3b. Per-File Update

| Tool | Parse Cost | Graph Update Cost |
|---|---|---|
| **Foam** | Remark pipeline (cached) | O(N×L) full rebuild |
| **Logseq** | Regex-based content ref extraction | O(delta) Datascript transaction |
| **Dendron** | Unified AST walk | O(delta) link diff |
| **Marksman** | Custom markdown parser → 3-layer model | O(delta) or O(N×L) |
| **Outline** | ProseMirror AST walk | O(L) DB upsert/delete |

### 3c. Backlink Query

| Tool | Query Cost | Data Access Pattern |
|---|---|---|
| **Foam** | O(1) map lookup | `graph.backlinks.get(uri.path)` |
| **Logseq** | O(1) VAET index | `(:block/_refs entity)` |
| **Dendron** | O(L) filter | `note.links.filter(l => l.type === "backlink")` |
| **Marksman** | O(1) multimap lookup | `Conn.Query.resolve(scopedSym)` |
| **Outline** | O(1) with DB index | `SELECT WHERE documentId = ? AND type = 'backlink'` |
| **Obsidian** | O(N) linear scan | Iterate all `resolvedLinks` entries |

---

## 4. Link Parsing Approaches

Every tool must answer: "given a markdown file, what links does it contain?" The approaches diverge significantly:

| Tool | Parser | Link Types | Output |
|---|---|---|---|
| **Foam** | `remark-parse` + `remark-wiki-link` plugin (unified pipeline) | `[[wikilinks]]`, `[md](links)`, `[ref][style]` | `ResourceLink[]` with type, range, embed flag |
| **Logseq** | Regex on block content (`[[uuid]]` patterns) + structural attributes | Page refs, block refs, tags, properties | `:block/refs` entity references |
| **Dendron** | `remark` + custom Dendron AST plugins | `[[wiki]]`, `![[refs]]`, `#hashtags`, `@usertags`, frontmatter tags | `DLink[]` with type, from, to, position |
| **Marksman** | Custom FParsec-based markdown parser | `[[wiki]]`, `[md](links)`, `[ref][style]`, `#tags` | 3-layer CST→AST→Sym with bidirectional mappings |
| **Outline** | ProseMirror AST walk | Mention nodes, link marks on text | Document UUID array |
| **Obsidian** | Proprietary parser | `[[wiki]]`, `![[embeds]]`, `[md](links)`, `#tags`, frontmatter | `CachedMetadata` with `LinkCache[]`, `EmbedCache[]`, etc. |

### Foam's regex decomposition (notable)
```typescript
// foam/packages/foam-vscode/src/core/services/markdown-link.ts:6-11
private static wikilinkRegex = /\[\[([^#|]+)?#?([^|]+)?\|?(.*)?\]\]/;
private static directLinkRegex = /\[(.*)\]\(<?([^#>]*?)(?:#([^>\s"'()]*))?(?:\s+(?:"[^"]*"|'[^']*'))?>?\)/;
```

### Logseq's UUID-based internal storage (notable)
Logseq stores page references internally as `[[uuid]]` rather than `[[page name]]`. The function `title-ref->id-ref` converts human-readable names to UUIDs for storage, and `id-ref->title-ref` converts back for display. This makes rename-safe linking trivial — the UUID never changes.

### Outline's stable URL strategy (notable)
Outline assigns a permanent 10-char `urlId` at document creation. URLs are `/doc/{slugified-title}-{urlId}`. Resolution keys on `urlId`, ignoring the title slug. Renames are transparent — existing links continue to work without rewriting.

---

## 5. Link Resolution and Rename Handling

| Tool | Link Target Identity | Rename Handling |
|---|---|---|
| **Foam** | File path (relative, suffix-matched via TrieMap) | Requires link rewriting |
| **Logseq** | Entity `:db/id` (UUID internally) | Transparent — UUID is stable |
| **Dendron** | `fname` (dot-separated hierarchy) | Requires link rewriting + `hydrate` to preserve backlinks |
| **Marksman** | Document slug or file path (suffix tree lookup) | Incremental graph update handles resolution changes |
| **Outline** | Document `urlId` (stable, random, 10-char) | Transparent — `urlId` is permanent |
| **Obsidian** | File path (shortest-path matching) | Automatic update of `resolvedLinks` |

**Implication for agent-native platform:** UUID-based or stable-ID-based link targets (Logseq, Outline) are strictly superior for rename resilience. Path-based targets (Foam, Obsidian) require link rewriting on rename, which is error-prone in distributed/CRDT systems where renames may conflict.

---

## 6. Architectural Comparison Matrix

| Dimension | Foam | Logseq | Dendron | Marksman | Outline | Obsidian | AFFiNE |
|---|---|---|---|---|---|---|---|
| **Language** | TypeScript | ClojureScript | TypeScript | F# | TypeScript | Proprietary | TypeScript |
| **Storage** | In-memory maps | In-memory Datascript DB | In-memory note objects | In-memory immutable records | PostgreSQL | In-memory + IndexedDB | CRDT (Yjs) |
| **Graph structure** | Dual adjacency lists | EAV triplestore (VAET) | Embedded in notes | Undirected symbol graph | Relational table | Forward-only map | None |
| **Backlink query** | O(1) map | O(1) VAET | O(L) filter | O(1) multimap | O(1) DB index | O(N) scan | N/A |
| **Update strategy** | Full rebuild | Incremental per-tx | Incremental diff | Both (configurable) | Incremental per-doc | Incremental per-file | N/A |
| **Persistence** | VS Code workspaceState | Serialized DB | Filesystem cache | None (LSP session) | PostgreSQL | IndexedDB | CRDT sync |
| **Git-friendly** | Yes (in-memory derived) | No (binary DB) | Yes (filesystem cache) | Yes (derived from files) | No (DB) | No (IndexedDB) | No (CRDT) |
| **Agent-queryable** | Via VS Code API | Via Datalog queries | Via engine API | Via LSP protocol | Via REST API | Via plugin API | No backlink API |

---

## 7. Implications for Agent-Native Platform

### 7a. Recommended Architecture

Based on source code analysis, the optimal backlink index for a CRDT + git + MCP platform should combine:

1. **Derived index, not source of truth.** The index is computed from markdown files (the git-stored source of truth). Like Foam and Marksman, the index is rebuilt from files — never the other way around. This ensures git compatibility and allows the index to be discarded and rebuilt.

2. **Dual adjacency list (Foam pattern) as the core data structure.** `Map<targetId, Set<{sourceId, link}>>` for backlinks, `Map<sourceId, Set<{targetId, link}>>` for forward links. This gives O(1) backlink queries and is simple to implement.

3. **Incremental updates (Dendron pattern) for performance.** On file change: re-parse the single file, diff old vs new link sets, apply targeted mutations. This avoids Foam's O(N×L) full-rebuild penalty.

4. **Stable document IDs for link targets (Logseq/Outline pattern).** Use UUIDs or stable IDs in frontmatter rather than file paths. This makes links rename-safe and eliminates the link-rewriting problem in distributed systems.

5. **Persisted index cache with content hash (Dendron/Obsidian pattern).** Cache parsed link data with SHA-256 content hashes. On startup, only re-parse files whose hashes have changed. This makes warm starts fast.

6. **MCP-queryable API surface.** Expose backlink queries as MCP tools: `getBacklinks(docId) → Set<{sourceId, link}>`, `getForwardLinks(docId) → Set<{targetId, link}>`, `getGraph() → adjacency list`. This enables AI agents to navigate the knowledge graph.

### 7b. What NOT to do

- **Don't use Obsidian's pattern** of forward-only links with O(N) backlink queries. The community has already built caching plugins to work around this limitation.
- **Don't embed backlinks in note metadata** (Dendron pattern) for a CRDT system. Co-mingling forward and backward links in the same array creates merge conflicts when two agents edit linking relationships concurrently.
- **Don't rely on the editor framework** to provide backlinks (AFFiNE lesson). The backlink index must be an application-layer concern, separate from the CRDT editor.
- **Don't use a binary database** (Logseq's Datascript) if git compatibility is a requirement. The index should be derivable from plain-text files.

### 7c. Proposed Data Structure

```typescript
interface BacklinkIndex {
  // Core maps
  forward: Map<DocId, Set<LinkRecord>>;   // outgoing links per doc
  backward: Map<DocId, Set<LinkRecord>>;  // incoming links per doc (BACKLINKS)
  
  // Metadata
  parseCache: Map<DocId, { hash: string; links: LinkRecord[] }>;
  
  // Operations
  rebuild(): void;                         // full rebuild from all files
  updateDoc(docId: DocId, content: string): void;  // incremental update
  getBacklinks(docId: DocId): Set<LinkRecord>;     // O(1) query
  getForwardLinks(docId: DocId): Set<LinkRecord>;  // O(1) query
}

interface LinkRecord {
  sourceDoc: DocId;
  targetDoc: DocId;
  linkType: 'wikilink' | 'markdown' | 'embed' | 'tag';
  position: { line: number; col: number };
  rawText: string;       // original link text
  anchor?: string;       // heading or block anchor
  alias?: string;        // display text
}
```

### 7d. Persistence Strategy

The index is a **derived artifact** — it can always be rebuilt from the source markdown files. But for performance:

1. **In-memory during runtime** — fast O(1) queries
2. **Serialized to `.index/backlinks.json`** on shutdown / periodically
3. **Content-hash validated on startup** — only re-parse files whose SHA-256 has changed
4. **`.gitignore`d** — the index is derived, not versioned
5. **Rebuilable via MCP tool** — `rebuildIndex()` for recovery

This mirrors the Foam/Dendron caching pattern but adapted for a git-native workflow.

---

## 8. Evidence Index

| Evidence File | Tool | Key Findings |
|---|---|---|
| [foam-graph.md](evidence/foam-graph.md) | Foam | Dual adjacency lists, full rebuild, LRU parser cache, TrieMap workspace |
| [logseq-datascript.md](evidence/logseq-datascript.md) | Logseq | EAV triplestore, automatic VAET reverse index, incremental per-transaction, Datalog queries |
| [outline-backlinks.md](evidence/outline-backlinks.md) | Outline | PostgreSQL relationships table, ProseMirror AST extraction, async queue processor, stable urlId |
| [marksman-lsp.md](evidence/marksman-lsp.md) | Marksman | Three-layer symbol model (CST→AST→Sym), undirected graph, configurable incremental, Oracle resolution |
| [dendron-backlinks.md](evidence/dendron-backlinks.md) | Dendron | DLink type with backlink discriminant, embedded in notes, two-phase startup, incremental diff on save |
| [affine-blocksuite.md](evidence/affine-blocksuite.md) | AFFiNE/BlockSuite | 5 forward-link types, NO backlink infrastructure, CRDT editor doesn't solve backlinks |
| [obsidian-metadata-cache.md](evidence/obsidian-metadata-cache.md) | Obsidian | Forward-only resolvedLinks, O(N) backlink query, IndexedDB persistence, incremental per-file parse |

---

## Primary Sources

| Source | URL | What it provided |
|---|---|---|
| Foam GitHub | https://github.com/foambubble/foam | Graph data structure, index building, link parsing, caching |
| Logseq GitHub | https://github.com/logseq/logseq | Datascript schema, ref computation, backlink queries, reactive invalidation |
| Outline GitHub | https://github.com/outline/outline | Relationship model, BacklinksProcessor, ProseMirror parsing, API surface |
| Marksman GitHub | https://github.com/artempyanykh/marksman | Conn graph, three-layer symbols, incremental update algorithm, LSP handlers |
| Dendron GitHub | https://github.com/dendronhq/dendron | DLink model, BacklinkUtils, two-phase init, incremental diff, hydrate pattern |
| BlockSuite GitHub | https://github.com/toeverything/blocksuite | ReferenceInfo schema, forward-link mechanisms, absence of backlink infrastructure |
| Obsidian API | https://github.com/obsidianmd/obsidian-api | MetadataCache types, CachedMetadata interface, resolvedLinks structure |
| Obsidian Docs | https://docs.obsidian.md/ | Official MetadataCache documentation |
| Obsidian Forum | https://forum.obsidian.md/ | Performance reports, backlink query patterns, IndexedDB details |
| Backlink Cache Plugin | https://github.com/mnaoumov/obsidian-backlink-cache | Confirms O(N) native backlink cost, caching approach |
