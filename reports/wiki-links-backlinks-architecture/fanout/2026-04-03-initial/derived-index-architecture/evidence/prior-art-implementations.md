# Evidence: Prior Art — Backlink Index Implementations

## Obsidian MetadataCache

**Source**: [obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) | [Obsidian Developer Docs](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache)

### Architecture
- **In-memory index** built at vault open, incrementally updated on file change
- `MetadataCache` class is the core indexing subsystem
- Pre-parses all markdown files and maintains structured cache of links, embeds, tags, headings, sections, frontmatter
- Two key data structures:
  - `resolvedLinks: Record<string, Record<string, number>>` — maps source file path → {dest path → link count}
  - `unresolvedLinks: Record<string, Record<string, number>>` — same shape for unresolved links
- `CachedMetadata` interface per file: `{ links?: LinkCache[], embeds?: EmbedCache[], tags?: TagCache[], headings?: HeadingCache[], ... }`

### Key API Methods
```typescript
getFileCache(file: TFile): CachedMetadata | null
getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null
fileToLinktext(file: TFile, sourcePath: string, omitMdExtension?: boolean): string
```

### Events
- `'changed'` — fires when a file's cached metadata changes
- `'deleted'` — fires when a file is removed from cache
- `'resolve'` — fires when a file's links are resolved
- `'resolved'` — fires when ALL files have been initially resolved (vault-wide readiness signal)

### Performance
- 17,000 notes: <500ms cold start on iPhone 15 Pro (as of 2025)
- 15,000 notes improved from ~5s to ~1s cold start
- Search made "nearly instantaneous" in v1.9
- Source: [kepano on Threads](https://www.threads.com/@kepano/post/DSq3zxXETy7), [kepano on X](https://x.com/kepano/status/2004008730720194759)

### Undocumented Methods
- `getLinks()` — returns complete link information including header tags, not in TypeScript definitions
- `getBacklinksForFile()` — available at runtime, not in public types
- Source: [Obsidian Forum discussion](https://forum.obsidian.md/t/why-are-some-properties-of-metadatacache-only-available-in-js-and-not-ts/83438)

---

## Logseq Datascript Graph

**Source**: [logseq/logseq](https://github.com/logseq/logseq) | [logseq/mldoc](https://github.com/logseq/mldoc)

### Architecture
- **Two-database approach**: DataScript (in-memory Datalog DB) + SQLite WASM (persistent storage)
- DataScript provides reactive queries and fast access patterns
- SQLite in OPFS (browser) or local filesystem (Electron) for persistence
- Worker thread manages both connections, auto-persists DataScript transactions to SQLite

### Link/Reference Schema (Datascript entities)
- `:block/refs` — references from a block to pages/other blocks
- `:block/path-ref-pages` — transitive page references (including ancestors)
- `:page/tags` — page-level tags as references
- Queries use Datalog: `[?b :block/refs ?ref]`, `[?b :block/page ?p]`

### Graph Build Process
1. `restore-and-setup-repo!` sets `db-restoring` flag
2. Worker rebuilds DataScript DB from SQLite
3. For each file: `gp-mldoc/->edn` parses content → AST (using mldoc, an OCaml parser)
4. `extract-blocks` processes AST → datascript entities
5. `with-ref-pages` merges referenced pages into the page collection
6. Source: [graph-parser/extract.cljc](https://github.com/logseq/logseq/blob/master/deps/graph-parser/src/logseq/graph_parser/extract.cljc)

### Parser: mldoc
- Written in **OCaml** (71.4%) with Standard ML (26.9%)
- Uses Angstrom parsing library
- Supports Org-mode and Markdown
- Output: JSON AST or HTML
- Source: [logseq/mldoc](https://github.com/logseq/mldoc)

### Git Integration
- Auto-commit mechanism (configurable interval)
- File watcher detects changes and triggers re-parse
- No branch-aware indexing — index reflects current working directory state

---

## Foam (VS Code Extension)

**Source**: [foambubble/foam](https://github.com/foambubble/foam)

### Architecture
- **FoamGraph**: In-memory adjacency list graph
  - `getBacklinks(uri)` — returns array of `{ source: URI }`
  - `getLinks(uri)` — returns array of `{ target: URI }`
  - `getAllNodes()` — returns all node URIs
  - `getAllConnections()` — returns all edges
  - `FoamGraph.fromWorkspace(workspace)` — static factory from workspace
  - Source: [foam-vscode/src/core/model/graph.ts](https://github.com/foambubble/foam/blob/master/packages/foam-vscode/src/core/model/graph.ts)

### Parsing Pipeline
- Uses `remark-parse` (v8) + `remark-wiki-link` (v0.0.4) + `unified` (v9)
- `remark-frontmatter` for YAML metadata
- `mnemonist` for data structures
- Source: [package.json dependencies](https://github.com/foambubble/foam/blob/master/packages/foam-vscode/package.json)

### Incremental Updates (File Watcher)
```typescript
// foam-vscode/src/core/model/foam.ts
watcher?.onDidChange(async uri => { /* re-parse file, update graph */ });
watcher?.onDidCreate(async uri => { /* parse new file, add to graph */ });
watcher?.onDidDelete(uri => { /* remove from graph */ });
```

### Graph Visualization
- Uses force-graph library (WebView panel)
- Listens to `foam.graph.onDidUpdate` for live updates
- Generates `{ nodeInfo: {}, edges: Set }` from workspace + graph
- Source: [foam-vscode/src/features/panels/dataviz/index.ts](https://github.com/foambubble/foam/blob/master/packages/foam-vscode/src/features/panels/dataviz/index.ts)

### Known Issues
- [#965](https://github.com/foambubble/foam/issues/965): Search very slow with Foam enabled in large workspaces
- [#347](https://github.com/foambubble/foam/issues/347): Graph uses inappropriate CPU (~65-75% for 330 notes)
- [#393](https://github.com/foambubble/foam/issues/393): Saving file removes graph edges (fix: don't delete nodes on update, only clear forward links)
- [#130](https://github.com/foambubble/foam/issues/130): Need directory exclusions for crawling performance
- **No git branch awareness**: Graph reflects current filesystem state only

---

## Outline (Wiki Platform)

**Source**: [outline/outline](https://github.com/outline/outline) (commit 81ef635)

### Architecture
- **PostgreSQL** with Sequelize ORM for persistent storage
- Real-time collaboration via **Yjs/Hocuspocus**
- ProseMirror editor with custom mention nodes for document links

### Link Extraction
- Links stored as ProseMirror `mention` nodes with `MentionType.Document`
- `MentionType` enum: `User`, `Document`, `Collection`, `Group`, `Issue`, `PullRequest`, `Project`, `URL`
- `ProsemirrorHelper.getDocumentMentions(doc)` traverses ProseMirror AST to find `mention` nodes where `attrs.type === MentionType.Document`
- Source: [server/models/helpers/ProsemirrorHelper.tsx](https://github.com/outline/outline/blob/main/server/models/helpers/ProsemirrorHelper.tsx)

### Backlink Processing
- **Queue-based async processing**: `BacklinksProcessor` in `server/queues/processors/`
- Triggered on document save/update events
- Computes backlinks asynchronously, not blocking the editor
- Source: [server/queues/processors/BacklinksProcessor.ts](https://github.com/outline/outline/blob/main/server/queues/processors/BacklinksProcessor.ts)

### Backlink Storage & Query
- Frontend: `DocumentsStore.backlinks: Map<string, string[]>` (MobX observable)
- API: `POST /relationships.list` returns `{ documents, relationships: [{ type: "backlink"|"similar", reverseDocumentId }] }`
- `fetchRelationships(documentId)` populates both `backlinks` and `similar` maps
- `getBacklinkedDocuments(documentId)` returns ordered Document[] from the map
- Source: [app/stores/DocumentsStore.ts](https://github.com/outline/outline/blob/main/app/stores/DocumentsStore.ts)

### Search Integration
- PostgreSQL `tsvector` with weighted fields: title (A), previousTitles (C), text content (D, first 1M chars)
- `documents_search_trigger()` SQL function auto-updates search vectors on insert/update
- `popularityScore: FLOAT` column for engagement-based ranking
- Source: [server/migrations/20231227040129-update-tsvector-trigger.js](https://github.com/outline/outline/blob/main/server/migrations/20231227040129-update-tsvector-trigger.js)

### Public/Private Backlinks
- For authenticated users: store's backlink data via `fetchRelationships`
- For publicly shared documents: `backlinkIds?: string[]` on Document model, provided by server
- Source: [app/models/Document.ts](https://github.com/outline/outline/blob/main/app/models/Document.ts) lines 226-361
