# Enriched MCP File API

**Status:** Complete
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-10
**Baseline commit:** e5bfff4
**Links:**
- Prior spec: [Project Wiki — MCP Surface](../2026-04-08-project-wiki-mcp-surface/SPEC.md) (this spec extends D1-deferred and D2-rejected decisions)
- Deferred tools reference: `packages/cli/src/mcp/tools.ts` (commented, ~300 lines)

---

## 1) Problem statement

**Situation:** The open-knowledge system maintains a metadata sidecar in `.open-knowledge/` for project knowledge. Content files can live anywhere on disk — `wiki.roots` in `config.yml` maps arbitrary directories (inside or outside the repo) into the wiki. A file watcher keeps catalogs current. A collaboration server (Hocuspocus) provides CRDT sync, authorship tracking, and per-agent undo for real-time editing.

**Complication:** Agents interact with wiki files through raw, unstructured tools — `cat` to read, `ls` to list, `grep` to search, native `Write` to create/edit. These return raw text with no awareness of the wiki structure. An agent reading an article gets raw markdown but not its catalog context, change history, or relationship to other articles. An agent listing a directory gets filenames but not titles, descriptions, tags, or article counts. An agent searching gets line matches with no article context. All this metadata could exist in `.open-knowledge/` — but today it's embedded as frontmatter inside content files, which breaks down for external files the wiki doesn't own.

Meanwhile, writes bypass the collaboration server entirely. Agent edits via native `Write` are anonymous (no authorship), have no undo, and if the editor is open, changes appear with a 2-10 second delay via the disk bridge.

**Resolution:** Four new MCP tools (`read_file`, `list_files`, `search`, `write_file`) that operate on content files across all configured wiki roots and enrich responses with metadata from `.open-knowledge/`. Metadata is fully separated from content — stored as `.yml` sidecar files in a shadow directory tree (`.open-knowledge/metadata/`) that mirrors the structure of each wiki root. Content files are pure content with no frontmatter required. The `write_file` tool accepts content and metadata as separate parameters, writing content to the `.md` and metadata to the `.yml`. Writes route through Hocuspocus when available for CRDT sync, authorship, and undo — falling back to disk when not.

## 2) Goals

- G1: Agents get enriched context on every file read — metadata, recent git history, and catalog context — without extra tool calls
- G2: Agents browsing the wiki see the catalog view (titles, descriptions, tags, article counts) instead of raw filenames
- G3: Agents searching the wiki get results enriched with article metadata to evaluate relevance before reading
- G4: Agent writes route through Hocuspocus when available — CRDT sync, authorship, undo — with disk fallback
- G5: The enriched tools are the natural way agents interact with wiki content; MCP instructions guide agents to these tools
- G6: Content files are pure content — no frontmatter injection. All metadata lives in `.open-knowledge/metadata/` as `.yml` sidecar files
- G7: External files (roots pointing outside `.open-knowledge/`) can be annotated with metadata without modifying them

## 3) Non-goals

- **[NEVER]** NG1: Replace the agent's native Read/Write/Edit tools for files outside wiki roots — these tools are wiki-scoped only
- **[NEVER]** NG2: Inject metadata into external content files — external files get content writes (via `write_file`) but never frontmatter/metadata injection. Metadata lives exclusively in `.yml` sidecars.
- **[NOT NOW]** NG3: Backlinks. Revisit when wiki grows beyond ~50 articles. (Wiki links & backlinks spec: `440dbf7`)
- **[NOT NOW]** NG4: MCP server spawns Hocuspocus as subprocess — expect `open-knowledge start` running separately. Revisit when adoption friction appears.
- **[NOT NOW]** NG5: Vector/semantic search — catalog + enriched grep sufficient at current scale
- **[NOT NOW]** NG6: Per-agent identity beyond default — currently hardcoded to `claude-1`
- **[NOT NOW]** NG7: SQLite catalog storage — `.yml` files are the v1 metadata format. SQLite as an alternative backend is a future extension.
- **[NOT UNLESS]** NG8: Streaming writes — MCP doesn't support streaming; agents write complete chunks

## 4) Personas / consumers

- **P1: AI agent in Claude Code** — primary. Uses MCP tools via `.mcp.json` auto-discovery.
- **P2: AI agent in Cursor** — same MCP tools, different host.
- **P3: Developer supervising the agent** — benefits indirectly via better agent output. Sees authorship in editor when Hocuspocus is running.

## 5) User journeys

### Agent reads a wiki article (enriched)

1. Agent needs context on SSO migration
2. Calls `read_file` with path
3. Gets back: file contents (pure markdown, no frontmatter) + metadata from `.yml` sidecar (title, description, tags) + recent git history + catalog context (which root, which folder)
4. Full context in one tool call

### Agent browses the wiki (enriched list)

1. Agent wants to see what knowledge is available
2. Calls `list_files` (no args = root view)
3. Gets back: merged view across all configured wiki roots — each root with its label, article counts, entries with titles/descriptions/tags. Roots may point to `./articles`, `../docs`, anywhere — the catalog view unifies them.
4. Drills into a folder with `list_files(path)` for the detailed catalog view

### Agent searches the wiki (enriched grep)

1. Agent searches for "authentication"
2. Calls `search` with query
3. Gets back: matching lines grouped by file, each file annotated with metadata from its `.yml` sidecar (title, description, tags)

### Agent writes a wiki article

1. Agent creates or updates an article
2. Calls `write_file` with path + content + metadata:
   ```
   write_file({
     path: "articles/auth/sso.md",
     content: "# SSO Migration\n...",
     metadata: { title: "SSO Migration", description: "How SSO auth works", tags: ["auth"] }
   })
   ```
3. Tool writes content → `.md` file, metadata → `.open-knowledge/metadata/articles/auth/sso.yml`
4. If Hocuspocus running: routes through CRDT (instant in editor, authorship, undo)
5. If not: direct disk write, watcher catches it
6. `_catalog.yml` chain rebuilds automatically

### Agent annotates an external file (metadata only)

1. User has `../docs/api-guide.md` mapped as a wiki root
2. Agent calls `write_file` with metadata only — no content (don't touch their file):
   ```
   write_file({
     path: "../docs/api-guide.md",
     metadata: { title: "API Guide", description: "REST API reference", tags: ["api"] }
   })
   ```
3. Tool writes metadata → `.open-knowledge/metadata/docs/api-guide.yml`
4. Content file untouched. Catalog rebuilds with the new annotation.

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | `read_file` returns content + metadata + git history | Given a path in any wiki root: (1) file content (pure markdown), (2) metadata from `.yml` sidecar, (3) last 5 git log entries, (4) wiki root label. Error for paths outside all roots. | Metadata comes from `.open-knowledge/metadata/`, not from the file |
| Must | `list_files` returns catalog-enriched directory view | No args → merged view across all roots (label, article count, entries with title/desc/tags). With path → catalog view for that directory. | Reads `_catalog.yml` files from `.open-knowledge/metadata/` |
| Must | `search` returns grep results enriched with metadata | Searches content files across all roots. Results include matching lines + file's `.yml` metadata (title, desc, tags). | Case-insensitive default |
| Must | `write_file` writes content and/or metadata separately | Content (optional) → `.md` file. Metadata (optional) → `.yml` sidecar. At least one required. When Hocuspocus available, content writes route through CRDT. | External files: metadata-only writes (content omitted) |
| Must | Shadow metadata tree mirrors wiki root structure | `.open-knowledge/metadata/` contains a `.yml` for each content file and a `_catalog.yml` for each directory, mirroring the directory structure of all configured roots. | Tree built on startup scan, maintained by watcher |
| Must | `_catalog.yml` cascade on metadata change | When a `.yml` updates, parent `_catalog.yml` rebuilds up to root. | Same cascade pattern as current INDEX.md, but in YAML |
| Must | Watcher syncs external file changes to metadata | When a content file in an external root changes: update computed fields in `.yml` (last_modified, content_hash). On rename: rename `.yml`. On delete: delete `.yml`. Rebuild `_catalog.yml` chain. | Agent-set metadata (title, description, tags) preserved on content change |
| Must | `edit_file` tool for surgical find-and-replace | Given path + find + replace: performs find-and-replace on content. Routes through Hocuspocus `/api/agent-patch` when available. Optionally updates metadata alongside. | Token-efficient for small edits |
| Must | Update workflow tools to new metadata model | `init-wiki`, `ingest`, `research` instructions updated to use `write_file` with metadata parameter instead of inline frontmatter. | In scope (D12) |
| Must | Update MCP instructions to guide agents to enriched tools | Instructions reference the five file API tools as primary wiki interface. | In scope (D10) |
| Must | `undo` and `redo` MCP tools | Undo/redo the last agent write. Only agent-originated edits (origin: `agent-write`) are affected. Returns `canUndo`/`canRedo` status. Error with clear message when Hocuspocus unavailable. | Server endpoints exist: `/api/agent-undo`, `/api/agent-redo` |
| Must | Hocuspocus detection at startup | Probe for Hocuspocus, store availability flag, re-check on write failure. | Existing mechanism at `/api/agent-undo-status` |
| Must | Path validation against wiki roots | All tools validate paths fall within a configured `wiki.roots` entry. | |
| Should | `write_file` supports `mode` parameter for content | `replace` (default), `append`, `prepend`. | Only applies when `content` is provided |
| Should | `read_file` supports `changes_since` filter | ISO timestamp — git log filtered to commits after that time. | |
| Should | Initial root scan extracts metadata from existing frontmatter | On first scan of a root, if `.md` files have YAML frontmatter, extract it to seed the `.yml` sidecar. Map common fields (`summary` → `description`). | One-time migration; after seeding, `.yml` is source of truth |
| Could | `write_file` returns undo capability | Response includes `canUndo: true/false` (Hocuspocus only). | |
| Could | `search` supports glob file filtering | `include`/`exclude` patterns to narrow scope. | |

### Non-functional requirements

- Performance: `list_files` reads pre-generated `_catalog.yml` — sub-100ms.
- Performance: `search` scans content files directly — acceptable at wiki scale (<500 files).
- Reliability: Disk fallback for writes — tools always work without Hocuspocus.
- Security: Path validation — tools only operate within configured wiki roots.

## 7) Proposed solution (vertical slice)

### Core architecture: content ↔ metadata separation

```
Content (anywhere on disk)               Metadata sidecar (.open-knowledge/)
─────────────────────────                ──────────────────────────────────
./articles/                              .open-knowledge/
  auth/                                    config.yml
    sso-migration.md    ← pure content     metadata/
    oauth.md                                 articles/
  architecture.md                              _catalog.yml
                                               auth/
../docs/                                         _catalog.yml
  api-guide.md          ← not ours              sso-migration.yml  ← metadata
  onboarding.md                                  oauth.yml
                                               architecture.yml
                                             docs/
                                               _catalog.yml
                                               api-guide.yml      ← annotation
                                               onboarding.yml
                                           _catalog.yml            ← root catalog
```

**Invariants:**
- Content files never contain wiki metadata (no frontmatter)
- External content files are never modified by the wiki
- Every `.md` in a wiki root has a corresponding `.yml` in the metadata tree
- Every directory in a wiki root has a `_catalog.yml` in the metadata tree
- `.yml` is the single source of truth for metadata
- `_catalog.yml` is derived from child `.yml` files — rebuilt on change

### Metadata `.yml` schema

```yaml
# .open-knowledge/metadata/articles/auth/sso-migration.yml
title: SSO Migration
description: How SSO authentication works in our system
tags: [auth, infrastructure, sso]

# Computed fields (maintained by watcher, not agent-set)
content_hash: a1b2c3d4...     # sha256 of content file
last_modified: 2026-04-10T14:30:00Z
```

### Catalog `_catalog.yml` schema

```yaml
# .open-knowledge/metadata/articles/_catalog.yml
articles:
  - path: architecture.md
    title: Architecture Overview
    description: System architecture and key decisions
    tags: [architecture]
  - path: auth/sso-migration.md
    title: SSO Migration
    description: How SSO auth works
    tags: [auth, infrastructure, sso]

subfolders:
  - name: auth
    title: Authentication          # from auth/_catalog.yml title or first child
    description: Auth and authorization
    article_count: 2

total_articles: 3
```

### Root `_catalog.yml`

```yaml
# .open-knowledge/metadata/_catalog.yml
roots:
  - label: Knowledge Articles
    path: ./articles
    article_count: 12
  - label: Team Docs
    path: ../docs
    article_count: 8
    external: true                  # flag: content not owned by wiki

total_articles: 20
```

### Tool 1: `read_file`

**Input:**
```typescript
{
  path: string;           // relative to project root or absolute
  changes_since?: string; // ISO timestamp
}
```

**Output:**
```
## SSO Migration
**Description:** How SSO authentication works in our system
**Tags:** auth, infrastructure, sso
**Path:** articles/auth/sso-migration.md
**Root:** Knowledge Articles
**Last modified:** 2026-04-10

### Recent changes
- a1b2c3d 2026-04-10 Update SSO flow for SAML 2.0
- d4e5f6a 2026-04-08 Initial SSO migration article

### Content
# SSO Migration

The authentication flow uses SAML 2.0...
```

**Implementation:**
1. Resolve path, validate within a wiki root
2. Read content from the `.md` file
3. Read metadata from corresponding `.yml` in `.open-knowledge/metadata/`
4. Run `git log -5` for the content file (graceful if outside git repo)
5. Compose enriched response

### Tool 2: `list_files`

**Input:**
```typescript
{
  path?: string;  // omit for root view
}
```

**Output (root view):**
```
# Project Wiki

## Knowledge Articles (12 articles) — ./articles
- **Architecture Overview** — System architecture and key decisions. Tags: architecture
- **auth/** (2 articles) — Authentication and authorization

## Team Docs (8 articles) — ../docs [external]
- **API Guide** — REST API reference. Tags: api, rest
- **Onboarding** — New engineer setup. Tags: onboarding

Total: 20 articles across 2 roots
```

**Implementation:**
1. No path → read `.open-knowledge/metadata/_catalog.yml`, compose merged view
2. With path → find corresponding `_catalog.yml`, compose directory view

### Tool 3: `search`

**Input:**
```typescript
{
  query: string;
  case_sensitive?: boolean;  // default false
}
```

**Output:**
```
## Search results for "authentication" (7 matches in 3 files)

### SSO Migration (articles/auth/sso-migration.md)
Tags: auth, infrastructure
- Line 12: The authentication flow uses SAML 2.0...
- Line 45: Authentication tokens are rotated every 24h...

### API Guide (../docs/api-guide.md) [external]
Tags: api, rest
- Line 8: Authentication is required for all endpoints...
```

**Implementation:**
1. Resolve all wiki root directories from config
2. Find all `.md` files (respecting include/exclude globs)
3. Search content files for matches
4. For each file with matches, read metadata from `.yml` sidecar
5. Group by file, annotate with metadata

### Tool 4: `write_file`

**Input:**
```typescript
{
  path: string;
  content?: string;   // optional — write to .md file
  metadata?: {        // optional — write to .yml sidecar
    title?: string;
    description?: string;
    tags?: string[];
    [key: string]: unknown;  // open schema
  };
  mode?: 'replace' | 'append' | 'prepend';  // default: replace (content only)
}
```

**Validation:** At least one of `content` or `metadata` must be provided.

**Output:**
```
Written successfully.
Content: written (replace) via hocuspocus
Metadata: updated .open-knowledge/metadata/articles/auth/sso.yml
Title: SSO Migration
Tags: auth
Root: Knowledge Articles
Undo: available
```

**Implementation:**
1. Validate path within wiki roots
2. If `content` provided:
   - Hocuspocus available → POST `/api/agent-write-md` (CRDT sync, origin tagging, undo)
   - Not available → atomic disk write
3. If `metadata` provided:
   - Write/merge to `.open-knowledge/metadata/<path>.yml`
   - Watcher catches `.yml` change → rebuild `_catalog.yml` chain
4. Return confirmation with merged metadata view

### Tool 5: `edit_file`

**Input:**
```typescript
{
  path: string;
  find: string;       // text to find in content
  replace: string;    // replacement text
  metadata?: {        // optional metadata update alongside edit
    title?: string;
    description?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}
```

**Output:**
```
Edit applied successfully.
Title: SSO Migration
Root: Knowledge Articles
Mode: hocuspocus (CRDT sync, undo available)
```

**Implementation:**
1. Validate path within wiki roots
2. Hocuspocus available → POST `/api/agent-patch` with `{ docName, find, replace }`
3. Not available → read file, find-and-replace in memory, atomic disk write
4. If `metadata` provided → merge into `.yml` sidecar
5. Return confirmation

### Tool 6: `undo`

**Input:**
```typescript
{}  // no parameters
```

**Output (success):**
```
Undo performed.
canUndo: true
canRedo: true
```

**Output (unavailable):**
```
Undo unavailable — Hocuspocus is not running. Writes made via disk fallback cannot be undone.
```

**Implementation:**
1. POST to `/api/agent-undo`
2. If Hocuspocus unavailable, return clear error
3. Return `canUndo`/`canRedo` status

### Tool 7: `redo`

**Input:**
```typescript
{}  // no parameters
```

**Output (success):**
```
Redo performed.
canUndo: true
canRedo: false
```

**Output (unavailable):**
```
Redo unavailable — Hocuspocus is not running.
```

**Implementation:**
1. POST to `/api/agent-redo`
2. If Hocuspocus unavailable, return clear error
3. Return `canUndo`/`canRedo` status

### Adaptive write path

```
write_file({ path, content?, metadata?, mode })
  │
  ├─ Validate path within wiki roots
  │
  ├─ content provided?
  │   ├─ Yes:
  │   │   ├─ Hocuspocus available?
  │   │   │   ├─ Yes → POST /api/agent-write-md (CRDT, undo, attribution)
  │   │   │   └─ No  → atomic disk write
  │   │   └─ On failure → fallback to disk + warn
  │   └─ No: skip content write (metadata-only annotation)
  │
  ├─ metadata provided?
  │   ├─ Yes → merge into .open-knowledge/metadata/<path>.yml
  │   └─ No: skip metadata write
  │
  └─ _catalog.yml chain rebuilds automatically via watcher
```

### Watcher behavior

```
Watches:
  1. .md files in all wiki roots (content changes)
  2. .yml files in .open-knowledge/metadata/ (metadata changes)

On .md change in wiki root:
  → Update computed fields in corresponding .yml (content_hash, last_modified)
  → Do NOT overwrite agent-set fields (title, description, tags)
  → Rebuild _catalog.yml chain

On .md rename:
  → Rename corresponding .yml
  → Rebuild affected _catalog.yml files

On .md delete:
  → Delete corresponding .yml
  → Clean up empty parent dirs in metadata tree
  → Rebuild _catalog.yml chain

On .yml change (direct edit or write_file metadata):
  → Rebuild _catalog.yml chain upward to root

On startup (initial scan):
  → Walk all wiki roots
  → For each .md without a .yml: create .yml with derived title (from filename)
  → If .md has existing frontmatter: extract to seed .yml (one-time migration)
  → Full _catalog.yml rebuild
```

### System architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AI Agent                                    │
│                (Claude Code / Cursor / Codex)                        │
│                                                                      │
│  write_file({ content, metadata })                                   │
│    → content goes to .md (via Hocuspocus or disk)                    │
│    → metadata goes to .yml sidecar                                   │
│                                                                      │
│  read_file(path) → content (.md) + metadata (.yml) + git history     │
│  list_files()    → catalog view from _catalog.yml                    │
│  search(query)   → grep .md files + annotate with .yml metadata      │
└──────────┬──────────────────────┬───────────────────────────────────┘
           │                      │
           │ MCP stdio            │ HTTP (when available)
           ▼                      ▼
┌─────────────────────────┐   ┌──────────────────────────────┐
│  MCP Server              │   │  Hocuspocus Server            │
│  (open-knowledge mcp)    │   │  (open-knowledge start)       │
│                          │   │                               │
│  • File API tools (5)    │   │  • DirectConnection           │
│  • Workflow tools (3)    │   │  • Origin tagging             │
│  • Metadata watcher      │   │  • Per-agent UndoManager      │
│  • Catalog builder       │   │  • Persistence → disk → git   │
│  • Hocuspocus probe      │   │  • Shadow repo (attribution)  │
└──────────┬───────────────┘   └──────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  .open-knowledge/ (metadata sidecar — all metadata here)     │
│                                                              │
│  config.yml          ← wiki roots config                     │
│  metadata/           ← shadow tree (mirrors all roots)       │
│    _catalog.yml      ← root catalog                          │
│    articles/         ← mirrors ./articles                    │
│      _catalog.yml                                            │
│      auth/                                                   │
│        _catalog.yml                                          │
│        sso.yml       ← metadata for articles/auth/sso.md     │
│    docs/             ← mirrors ../docs (external root)       │
│      _catalog.yml                                            │
│      api-guide.yml   ← annotation for ../docs/api-guide.md   │
│  cache/              ← gitignored derived data               │
│                                                              │
│  Content files live wherever wiki.roots point:               │
│    ./articles/auth/sso.md          (wiki-owned, pure content) │
│    ../docs/api-guide.md            (external, never modified) │
└──────────────────────────────────────────────────────────────┘
```

## 8) Decision log

| ID | Decision | Status | Rationale |
|---|---|---|---|
| D1 | Revive read tools as enriched MCP tools (reverses D2-rejected from prior spec) | DIRECTED | Prior spec rejected reads because "agents have native tools." This spec: native tools return raw data; enriched tools attach metadata and history. The enrichment is the value. |
| D2 | Writes route through Hocuspocus when available, disk fallback | DIRECTED | Gets CRDT sync, authorship, undo for free. Disk fallback ensures tools work without editor. |
| D3 | MCP server does NOT spawn Hocuspocus — expects external start | DIRECTED | Reduces complexity. Users run `open-knowledge start` separately or get disk-only mode. |
| D4 | Five file API tools + three existing workflow tools = eight total MCP tools | DIRECTED | Complete surface: read, list, search, write, edit + init-wiki, ingest, research. |
| D5 | All metadata lives in `.open-knowledge/metadata/` as `.yml` sidecars — no frontmatter in content files | LOCKED | Core architectural invariant. Content is pure content. External files are never modified. `.yml` is the single source of truth for metadata. Eliminates frontmatter round-trip complexity. |
| D6 | Metadata tree mirrors wiki root directory structure | LOCKED | `.open-knowledge/metadata/` shadows each root. Every `.md` has a `.yml`; every directory has a `_catalog.yml`. Structure is derived from roots config. |
| D7 | `write_file` accepts content and metadata as separate parameters | LOCKED | Agent passes content + metadata in one call. Tool writes content → `.md`, metadata → `.yml`. For external files, metadata-only writes annotate without modifying content. |
| D8 | Watcher aggressively syncs external file changes | DIRECTED | On rename → rename `.yml`. On delete → delete `.yml`. On content change → update computed fields, preserve agent-set metadata. Metadata tree is a live mirror. |
| D9 | On initial scan, extract existing frontmatter to seed `.yml` sidecars | DIRECTED | One-time migration. After seeding, `.yml` is authoritative. |
| D10 | MCP instructions guide agents to use enriched file API tools for wiki operations | DIRECTED | The whole point of the API. Instructions will reference the five file tools as the primary interface for wiki content. Resolves OQ4. |
| D11 | Separate `edit_file` tool for surgical find-and-replace | DIRECTED | Token-efficient for small edits to large files. Maps to agent edit patterns. Server-side `/api/agent-patch` already exists. Resolves OQ6. |
| D12 | Update existing workflow tools (init-wiki, ingest, research) to use new metadata model | DIRECTED | Workflow tools currently instruct agents to write inline frontmatter. Must be updated to use `write_file` with separate metadata parameter, or instruct agents to create `.yml` sidecars. In scope. Resolves OQ9. |
| D13 | `_catalog.yml` uses flat list with full metadata inline | DIRECTED | Each entry includes title, description, tags, path. Single file read for `list_files`. Resolves OQ1. |
| D14 | `write_file` auto-creates parent directories and `_catalog.yml` for new folders | DIRECTED | Agent writes to `articles/auth/sso.md` — if `auth/` doesn't exist, tool creates the directory, the `.yml` sidecar, and the `_catalog.yml`. Resolves OQ5. |
| D15 | Overlapping wiki roots disallowed at config validation | LOCKED | If root B is a subdirectory of root A, reject with clear error. No use case for overlapping; prevents ambiguous metadata ownership. Resolves OQ7. |
| D16 | Frontmatter extraction extracts ALL fields | DIRECTED | On initial scan, extract all frontmatter fields to `.yml` sidecar — not just `title`/`description`/`tags`. Existing workflow tools write `source_url`, `status`, `date`, `sources`, etc. Open schema in `.yml` accommodates arbitrary fields. Derive title from filename if `title` field not found. Resolves OQ8. Revised after design challenge (original: exact matches only). |
| D17 | `read_file` git history: 5 entries default, configurable | DIRECTED | `git log -N --format="%h %ai %s"`. Default N=5 via `mcp.tools.read_file.history_depth` in config.yml. Graceful omission if file outside git repo. Resolves OQ2. |
| D18 | `search` truncation: 50 matches default, configurable | DIRECTED | Truncate at N matches, show "M more not shown." Default N=50 via `mcp.tools.search.max_results` in config.yml. Resolves OQ3. |
| D19 | Config schema: new `mcp.tools` section for per-tool settings | DIRECTED | Wiki section defines what to track. MCP section defines how tools behave. Per-tool nesting: `mcp.tools.read_file.history_depth`, `mcp.tools.search.max_results`. |
| D20 | Optimistic Hocuspocus writes — try first, disk fallback on failure | DIRECTED | Every write attempts Hocuspocus first (<5ms localhost). Falls back to disk on failure. No polling, no availability state to manage. Startup probe becomes optional optimization hint. Resolves OQ10. Note: agent cannot predict or control which path is taken — `write_file` response clearly states mode used and available capabilities (undo, attribution). Agent adapts to what happened, not what will happen. |
| D21 | Add `undo` and `redo` MCP tools | DIRECTED | Completes the Hocuspocus integration story. Agent can undo/redo agent-originated writes when Hocuspocus is available. Reference implementation exists (~15 lines each, server endpoints at `/api/agent-undo` and `/api/agent-redo`). Total MCP tools: 10 (5 file API + 2 undo/redo + 3 workflow). |
| D22 | Universal sidecar model (D5) flagged for further review | DIRECTED | Design challenger raised valid costs (file count, split-brain risk, git noise). Decision stands but flagged for review — hybrid model (frontmatter for wiki-owned, sidecars for external) is the alternative if universal sidecars create friction. |
| D23 | Persistence layer extended to understand wiki roots (Option B) | DIRECTED | `write_file` writes content to external files (e.g., `../docs/api-guide.md`) through Hocuspocus for CRDT/attribution. Persistence must resolve docNames against wiki roots, not just `contentDir`. Brings `packages/server/src/persistence.ts` into scope. Resolves Challenge 6. |

## 9) Open questions

| ID | Question | Type | Priority | Status |
|---|---|---|---|---|
| OQ1 | `_catalog.yml` schema — flat list or nested? Should it include full article metadata or just references? | Technical | P0 | **Resolved → flat list with full metadata inline.** Keeps `list_files` fast (single file read). See D13. |
| OQ2 | Git log format/depth for `read_file` — performance at scale? Graceful handling for files outside git repo? | Technical | P0 | **Resolved.** `git log -N --format="%h %ai %s"`, N defaults to 5. Configurable via `mcp.tools.read_file.history_depth`. Omit section gracefully if file outside git repo. See D17. |
| OQ3 | How should `search` handle large result sets? Truncation with count? | Technical | P0 | **Resolved.** Truncate at 50 matches (default), show "N more matches not shown." Configurable via `mcp.tools.search.max_results`. See D18. |
| OQ4 | Should MCP instructions guide agents to use enriched tools exclusively for wiki files? | Product | P0 | **Resolved → yes.** See D10. |
| OQ5 | Should `write_file` auto-create parent directories + `_catalog.yml` for new topic folders? | Technical | P0 | **Resolved → yes.** Auto-create dirs and catalog entries for new folders. See D14. |
| OQ6 | Should there be an `edit_file` tool (find-and-replace) separate from `write_file`? | Cross-cutting | P0 | **Resolved → yes.** See D11. |
| OQ7 | How does the shadow metadata tree handle wiki roots that overlap? (e.g., `./articles` and `./articles/auth` both as roots) | Technical | P0 | **Resolved → disallow.** Config validation rejects overlapping roots. See D15. |
| OQ8 | Frontmatter extraction on initial scan — what field mappings? How to handle non-standard schemas? | Technical | P0 | **Resolved → extract all fields.** Extract all frontmatter fields to `.yml` sidecar. No variant mapping. Derive title from filename if `title` not found. See D16 (revised). |
| OQ9 | Should the existing workflow tools (init-wiki, ingest, research) be updated to use `write_file` + metadata instead of writing frontmatter directly? | Technical | P0 | **Resolved → yes, in scope.** See D12. |
| OQ10 | Hocuspocus re-check strategy — periodic? On failure only? | Technical | P2 | **Resolved → optimistic.** Try Hocuspocus first on every write, fall back to disk on failure. <5ms localhost overhead. No polling, no state. See D20. |

## 10) Assumptions

| ID | Assumption | Confidence | Verification |
|---|---|---|---|
| A1 | Wiki scale under ~500 files | HIGH | Current usage; revisit if adoption grows |
| A2 | Watcher is reliable for change detection | HIGH | Existing @parcel/watcher infrastructure tested |
| A3 | `git log` per-file fast enough for read_file | MEDIUM | Needs measurement at scale |
| A4 | Hocuspocus HTTP API (`/api/agent-*`) is stable | HIGH | Used by editor, defined in api-extension.ts |
| A5 | Wiki roots typically within same git repo | MEDIUM | Cross-repo roots: git history gracefully omitted |

## 11) Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Migration from frontmatter → `.yml` sidecars breaks existing wikis | High | Initial scan extracts frontmatter and seeds `.yml` (D9). Existing content preserved. |
| R2 | Agent uses native Write instead of `write_file`, no metadata created | Medium | MCP instructions guide to enriched tools. Watcher creates stub `.yml` (title from filename) for any `.md` without one. |
| R3 | External file renames/moves create orphaned `.yml` files | Medium | Watcher aggressively mirrors changes (D8). Rename detection via content hash matching. |
| R4 | Metadata tree drift from content tree (bugs, race conditions) | Medium | Startup scan reconciles — ensures 1:1 correspondence. Log warnings for orphans. |
| R5 | Roots outside git repo — no history enrichment | Low | Graceful degradation — omit git history section. |
| R6 | INDEX.md → `_catalog.yml` migration | Medium | This spec replaces the entire current catalog system (INDEX.md markdown → `_catalog.yml` YAML). Existing wikis have INDEX.md files that will become orphaned. Watcher currently only watches `.md` files — must be updated for `.yml`. Migration: generate `_catalog.yml` from existing INDEX.md data on first run, then stop generating INDEX.md. Old INDEX.md files can be cleaned up manually or by a migration command. |

## 12) Future work

| Item | Maturity | Trigger to revisit |
|---|---|---|
| **Backlinks in `read_file`** | Identified | Wiki links & backlinks spec (440dbf7). |
| **MCP server spawns Hocuspocus** | Identified | User friction with two-command startup. |
| **SQLite metadata storage** | Identified | `.yml` files become bottleneck. SQLite in `.open-knowledge/cache/` as alternative to `.yml` + `_catalog.yml`. Same data, different storage. |
| **Per-agent identity** | Noted | Multi-agent scenarios. |
| **`consolidate` workflow tool** | Identified | Research → article promotion. |
| **Frontmatter re-projection** | Noted | If disk-only portability becomes important, system could optionally write frontmatter back into wiki-owned `.md` files as a derived projection of `.yml`. |

## 13) Agent constraints

- **SCOPE:** `packages/cli/src/mcp/tools/` (new tool files), `packages/cli/src/mcp/server.ts` (registration, instructions update), `packages/cli/src/wiki/` (catalog system refactor: `.yml` metadata, `_catalog.yml`, watcher updates), `packages/cli/src/config/schema.ts` + `loader.ts` (add `mcp.tools` section per D19), `packages/server/src/persistence.ts` (extend path resolution to understand wiki roots per D23)
- **EXCLUDE:** `packages/server/src/api-extension.ts` (HTTP API endpoints are stable), `packages/app/` (editor frontend), `packages/core/` (shared extensions — frontmatter utils may be deprecated but not removed in this scope)
- **STOP_IF:** Changes needed to Hocuspocus HTTP API shape (`/api/agent-*` endpoints), changes to config.yml schema beyond the `mcp.tools` section defined in D19
- **ASK_FIRST:** Adding dependencies, deprecating frontmatter utilities in core
