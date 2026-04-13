# Enriched Read Tools + `consolidate`

**Status:** Draft
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-12
**Baseline commit:** 39fcd87
**Links:**
- Supersedes: [2026-04-10-enriched-mcp-file-api](../2026-04-10-enriched-mcp-file-api/) (PR #40, closed — overbuilt, duplicated existing work)
- Existing infrastructure: PR #47 (Andrew — content config + mirror-catalog), PR #50 (Andrew — document tools), PR #71 (Mike — backlinks)

---

## 1) Problem statement

**Situation:** The open-knowledge MCP server has a mature set of tools already built. Andrew shipped write/edit/list/undo/redo as Hocuspocus-routed document tools (#50). Mike shipped backlinks (get_backlinks, get_forward_links, get_orphans, get_hubs) + `/api/backlinks` HTTP endpoint (#71). Andrew's #47 refactored config from `wiki.roots` to glob-based `content.include/exclude`, and mirror-catalog auto-generates INDEX.md files at `.open-knowledge/catalogs/` mirroring the whole project tree. Each tracked markdown file owns its inline frontmatter (title, description, tags); catalogs aggregate this into browsable folder views.

**Complication:** Reads and search are unenriched. When an agent wants to read an article, it calls native `Read` and gets raw markdown content — no git history, no backlinks, no catalog context attached. To get those, the agent makes separate tool calls (`get_backlinks`, native Grep against catalog files, `git log` via Bash). For search, the agent uses native `Grep` and gets raw line matches with no article metadata — it can't tell which article each match belongs to or what that article is about without additional reads. Meanwhile, the content lifecycle has a gap: `ingest` captures external sources, `research` analyzes them into provisional findings, but there's no tool to promote research → canonical articles. Agents do this ad-hoc, inconsistently, without the guidance that `ingest` and `research` provide.

**Resolution:** Three new MCP tools — `read_document` (enriched read), `search` (enriched grep), `consolidate` (workflow tool) — that fill the gaps without duplicating existing work. `read_document` bundles file contents + recent git history + backlinks + catalog context in one call. `search` groups grep matches by file and attaches article metadata. `consolidate` gives the agent an instructional workflow for research → article promotion, mirroring the `ingest` and `research` pattern. Two supporting primitives: a shell wrapper that standardizes `cat`/`git log`/`grep`/`runShell` (used by `read_document` and `search`), and a `CatalogStore` read interface that lets a future SQLite backend slot in without touching tool code.

## 2) Goals

- G1: Agents get enriched context on every wiki read — metadata, git history, backlinks, catalog position — in one tool call
- G2: Agents searching the wiki get matches grouped by file with article metadata attached, so they can evaluate relevance before reading
- G3: Research findings have a clear, guided path to canonical articles via `consolidate`
- G4: Shell operations inside our tools use a standardized wrapper — no ad-hoc `child_process` calls scattered across tool files
- G5: Catalog data access is abstracted behind an interface so future SQLite storage is a drop-in replacement
- G6: No duplication of Andrew's or Mike's work — new tools fill orthogonal gaps

## 3) Non-goals

- **[NEVER]** NG1: Replace `write_document`, `edit_document`, `list_documents`, `undo_agent_edit`, `redo_agent_edit` (Andrew #50) — existing tools are stable and correct
- **[NEVER]** NG2: Replace `get_backlinks`, `get_forward_links`, `get_orphans`, `get_hubs` (Mike #71) — `read_document` consumes the backlinks endpoint, not replaces it
- **[NEVER]** NG3: Build CLI subcommands (`open-knowledge read`, `ok` binary) — the shell wrapper is an internal implementation primitive, not an agent-facing surface
- **[NOT NOW]** NG4: `list_files` MCP tool — agents read `.open-knowledge/catalogs/<path>/INDEX.md` directly via native `Read`. Revisit if agents struggle to navigate catalogs.
- **[NOT NOW]** NG5: SQLite catalog backend — interface design only in this spec. Actual SQLite impl is future work.
- **[NOT NOW]** NG6: Multi-root config — Andrew dropped `wiki.roots` in #47. Revisit when a real use case emerges.
- **[NOT NOW]** NG7: Sidecar `.yml` metadata for content files — inline frontmatter is fine; don't over-engineer
- **[NOT NOW]** NG8: Rename `INDEX.md` → `CATALOGUE.md` — T2.6 open question stays open
- **[NOT UNLESS]** NG9: Refactor `mirror-catalog.ts` write path to use `CatalogStore` — leave write path alone this PR

## 4) Personas / consumers

- **P1: AI agent in Claude Code (primary)** — uses `read_document` to load wiki context, `search` to discover relevant articles, `consolidate` to promote research to canonical
- **P2: AI agent in Cursor** — same tools via MCP
- **P3: Developer supervising the agent** — benefits indirectly via better agent output (agent has fuller context on each read)

## 5) User journeys

### Agent reads a wiki article (enriched)

1. Agent wants to reason about SSO migration
2. Calls `read_document({ path: "articles/auth/sso.md" })`
3. Gets back in one response:
   - File's frontmatter (title, description, tags)
   - File contents
   - Last 5 git commits touching the file
   - Backlinks (which articles link TO this one) — from Mike's endpoint
   - Parent folder's catalog context (title, description of the folder)
4. Agent has full context without additional tool calls

### Agent searches the wiki (enriched)

1. Agent searches for "authentication"
2. Calls `search({ query: "authentication" })`
3. Gets back matches grouped by file — each file annotated with its title, description, tags
4. Agent picks the most relevant article based on metadata, not just raw match text
5. Uses `read_document` to load it with full enrichment

### Agent consolidates research into a canonical article

1. Developer says "consolidate the CRDT research into a canonical article"
2. Agent calls `consolidate({ topic: "CRDT alternatives" })`
3. Tool returns instructional text: read `research/crdt-*.md`, read referenced `external-sources/*.md`, synthesize, write to `articles/` via `write_document` with proper frontmatter
4. Agent follows the instructions, produces a canonical article
5. Mirror-catalog picks up the new article, updates INDEX.md automatically

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | `read_document` MCP tool returns content + metadata + git history + backlinks + catalog context | Given a path: returns (1) file contents, (2) frontmatter title/description/tags, (3) last N git log entries, (4) backlinks (if Hocuspocus up), (5) parent folder's catalog title/description | N default 5, configurable |
| Must | `read_document` gracefully degrades when Hocuspocus unavailable | Backlinks section omitted — does NOT error the whole read | Agents get content + history + catalog context regardless |
| Must | `search` MCP tool returns grep matches grouped by file with metadata | Matching lines + line numbers grouped by file, each file annotated with its frontmatter | Case-insensitive by default |
| Must | `search` truncates at configurable max | Default 50 matches; output notes "N more not shown" when truncated | Configurable via `mcp.tools.search.max_results` |
| Must | `consolidate` MCP workflow tool returns instructional text | Handler returns `textResult` with step-by-step guidance, matching `ingest`/`research` pattern | No server call; instructional only |
| Must | Shell wrapper module standardizes shell operations | Exports `runShell`, `cat`, `gitLog`, `grep`, `shellEscape` helpers. Module-level `setProjectDir` scopes all ops to project root. | Used internally by `read_document` and `search`. Implementation: `node:child_process` wrapped with project-root scoping + path guards. |
| Must | `CatalogStore` interface abstracts catalog reads | `getCatalog(relDir)` and `getArticleMeta(relPath)` methods. `IndexMdCatalogStore` impl reads INDEX.md via bash. | `read_document` uses this; future SQLite impl drops in |
| Must | Config schema adds `mcp.tools` section | `mcp.tools.read_document.history_depth` (default 5), `mcp.tools.search.max_results` (default 50) | New section in Zod schema |
| Must | MCP instructions updated | `INSTRUCTIONS` in `server.ts` mentions `read_document`, `search`, `consolidate` as primary tools for enriched reads / search / research promotion | Via `TOOL_DESCRIPTIONS` aggregation |
| Should | `read_document` supports `since` parameter | Optional ISO timestamp; git log filtered to commits after that time | Useful for "what changed since last session" |
| Should | Tools parallelize independent operations | `read_document` runs git log + backlinks fetch in `Promise.all` | Latency optimization |
| Could | `search` supports glob scoping | Optional `include`/`exclude` glob patterns overriding config | Narrow search scope |

### Non-functional requirements

- Performance: `read_document` completes in <200ms typical (shell ops <50ms each, HTTP to localhost <5ms)
- Performance: `search` handles wiki scale (<500 files) in <500ms
- Reliability: `read_document` returns partial results when optional sources fail (e.g., Hocuspocus down → no backlinks, but rest works)
- Security: shell wrapper escapes paths; no shell injection via user-supplied params
- Testability: unit tests co-located with source, use fixture directories for integration

## 7) Proposed solution (vertical slice)

### Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│                   AI Agent                               │
│         (Claude Code / Cursor / Codex)                   │
│                                                          │
│  New tools:                                              │
│    read_document    — enriched read                          │
│    search       — enriched grep                          │
│    consolidate — research → article workflow            │
│                                                          │
│  Existing tools (unchanged):                             │
│    write_document, edit_document, list_documents,        │
│    undo_agent_edit, redo_agent_edit,                     │
│    get_backlinks, get_forward_links,                     │
│    get_orphans, get_hubs,                                │
│    init-content, ingest, research                        │
└──────────────────────────┬──────────────────────────────┘
                           │ MCP stdio
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   MCP Server                             │
│                (open-knowledge mcp)                      │
│                                                          │
│  read_document ── shell ────► cat, git log                │
│       │                                                  │
│       ├── CatalogStore ──► .open-knowledge/catalogs/    │
│       │                                                  │
│       └── httpGet ──► /api/backlinks (if Hocuspocus up) │
│                                                          │
│  search ── shell ────► grep/rg                        │
│       │                                                  │
│       └── parseFrontmatter ──► article metadata         │
│                                                          │
│  consolidate ── textResult(instructional text)         │
└─────────────────────────────────────────────────────────┘
```

### Tool 1: `read_document`

**File:** `packages/cli/src/mcp/tools/read-document.ts` (new)

**Input:**
```typescript
{
  path: string;     // project-root-relative (e.g., "articles/auth/sso.md")
  since?: string;   // optional ISO timestamp for git log filtering
}
```

**Operations (parallelized where independent):**
1. Resolve + validate path against project root (via `content.dir` config)
2. `cat <path>` via shell wrapper → file contents
3. `git log -N --format='%h|%ai|%s' -- <path>` via shell wrapper → recent history (N from config)
4. `parseFrontmatter(content)` → article's own metadata
5. `CatalogStore.getCatalog(dirname(path))` → parent folder's title/description
6. `httpGet(serverUrl, '/api/backlinks?docName=<path-without-.md>')` → backlinks (optional)

**Dependency graph:**
- Step 4 (`parseFrontmatter`) depends on Step 2 (`cat`) — needs content first
- Steps 2, 3, 5, 6 are independent → run in `Promise.all`
- Step 4 runs after Step 2 resolves

**Output:**
```
## SSO Migration
**Description:** How SSO authentication works in our system
**Tags:** auth, infrastructure, sso
**Path:** articles/auth/sso.md
**Folder:** Authentication — How auth and authorization work

### Recent changes (last 5)
- a1b2c3d 2026-04-10 Update SSO flow for SAML 2.0
- d4e5f6a 2026-04-08 Initial SSO migration article

### Backlinks (3)
- articles/auth/oauth.md — OAuth Integration
- articles/architecture.md — System Architecture Overview
- specs/2026-04-08-auth-rework/SPEC.md — Auth Rework Spec

### Content
<full file contents>
```

When Hocuspocus is unavailable, the `### Backlinks` section is omitted entirely (no placeholder, no error).

### Tool 2: `search`

**File:** `packages/cli/src/mcp/tools/search.ts` (new)

**Input:**
```typescript
{
  query: string;
  case_sensitive?: boolean;  // default false
}
```

**Operations:**
1. Build grep command via shell wrapper — scoped to project root, respects `content.include`/`content.exclude` globs
2. Parse grep output into `{ path, line, text }[]`
3. Group by path
4. For each path with matches: `parseFrontmatter` to get title/description/tags
5. Truncate at `mcp.tools.search.maxResults`

**Output:**
```
## Search results for "authentication" (7 matches in 3 files)

### SSO Migration (articles/auth/sso.md)
Tags: auth, infrastructure
- Line 12: The authentication flow uses SAML 2.0...
- Line 45: Authentication tokens are rotated every 24h...

### Auth Architecture (articles/auth/auth-architecture.md)
Tags: auth, architecture
- Line 8: Core authentication middleware handles...
```

### Tool 3: `consolidate`

**File:** `packages/cli/src/mcp/tools/consolidate.ts` (new)

**Input:**
```typescript
{
  topic: string;
}
```

**Handler:** Returns `textResult(instructional text)` — same pattern as `research.ts`/`ingest.ts`. No server call.

**Instructional text outline:**
1. Read `.open-knowledge/research/` articles on the topic (use `search` to find them, `read_document` to load with metadata + history)
2. Read `.open-knowledge/external-sources/` materials referenced by those research notes
3. Synthesize findings into a canonical article — definitive, not provisional
4. Write to `.open-knowledge/articles/<topic-folder>/<slug>.md` via `write_document` with frontmatter: `title`, `description`, `tags`, `status: canonical`
5. Mirror-catalog will pick it up automatically

### Supporting primitive 1: shell wrapper

**File:** `packages/cli/src/bash/index.ts` (new)

```typescript
import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export function setProjectDir(dir: string): void { ... }   // module-level scope
export function shellEscape(arg: string): string { ... }   // POSIX shell escape

export async function runShell(cmd: string, opts?: ExecShellOptions): Promise<string> { ... }
export async function cat(path: string): Promise<string> { ... }  // fs.readFile + path guard

export interface GitLogEntry { hash: string; date: string; subject: string; }
export async function gitLog(path: string, count: number, since?: string): Promise<GitLogEntry[]> { ... }

export interface GrepMatch { path: string; line: number; text: string; }
export interface GrepOptions { caseInsensitive?: boolean; include?: string[]; exclude?: string[]; paths?: string[]; maxResults?: number; }
export async function grep(pattern: string, opts?: GrepOptions): Promise<GrepMatch[]> { ... }
```

All helpers use module-level `projectDir` state (set once via `setProjectDir` at server startup). Paths shell-escaped. `cat` uses `fs.readFile` directly for speed and includes a path-guard that rejects paths escaping the project root. `gitLog` returns an empty array for non-git directories; unexpected errors are logged to stderr. `runShell` wraps `child_process.exec` with a 30s default timeout and 16MB max buffer.

**Note on D1:** The spec originally proposed Vercel's `just-bash` for this layer. See D1 for why the shipped implementation uses `node:child_process` instead. The wrapper interface is identical to what just-bash would have exposed, so a future swap is contained to this file.

### Supporting primitive 2: CatalogStore

**File:** `packages/cli/src/content/catalog-store.ts` (new)

```typescript
export interface ArticleMeta {
  title: string;
  description: string;
  tags: string[];
}

export interface CatalogData {
  title: string;
  description: string;
  articles: Array<{ path: string } & ArticleMeta>;
  subfolders: Array<{ name: string; title: string; description: string; articleCount: number }>;
}

export interface CatalogStore {
  getCatalog(relDir: string): Promise<CatalogData | null>;
  getArticleMeta(relPath: string): Promise<ArticleMeta | null>;
}

export class IndexMdCatalogStore implements CatalogStore {
  // Reads .open-knowledge/catalogs/<relDir>/INDEX.md via bash cat
  // Parses frontmatter + article/subfolder sections
}
```

Used by `read_document` for catalog context. Future SQLite impl satisfies the same interface.

### Config schema changes

**File:** `packages/cli/src/config/schema.ts` (modify)

Add:
```typescript
mcp: z.object({
  tools: z.object({
    read_document: z.object({
      history_depth: z.number().int().min(0).default(5),
    }).default({ history_depth: 5 }),
    search: z.object({
      max_results: z.number().int().min(1).default(50),
    }).default({ max_results: 50 }),
  }).default({}),
}).default({}),
```

### MCP instructions update

**File:** `packages/cli/src/mcp/server.ts` (modify)

Update `INSTRUCTIONS` to direct agents to new tools:
- `read_document` — preferred over native `Read` for wiki files (enriched metadata)
- `search` — preferred over native `Grep` for wiki search (article-aware)
- `consolidate` — workflow for promoting research to canonical articles

## 8) Decision log

| ID | Decision | Status | Rationale |
|---|---|---|---|
| D1 | Use a shell wrapper as internal primitive (originally proposed just-bash; shipped with `node:child_process`) | DIRECTED | **Updated during implementation.** The spec originally proposed Vercel's `just-bash` for sandboxing + cloud compatibility. Investigation found: (a) just-bash does not ship a `git` command, which `read_document` needs for history enrichment; (b) just-bash uses a virtual filesystem (needs `ReadWriteFs` mounted); (c) in our controlled-command, controlled-args path from inside our own MCP server, the interpreter overhead is real cost with no security benefit. Per R1 (mitigation was explicitly accepted in the spec), shipped using `node:child_process` instead. The wrapper interface is identical; if cloud deployment later wants sandboxed execution, swap the wrapper internals without touching tool code. |
| D2 | Backlinks always-on in `read_document`, graceful degrade if Hocuspocus unavailable | LOCKED | Tim explicitly directed always-on. When Hocuspocus down, omit backlinks section — don't error the whole read. |
| D3 | `CatalogStore` interface for read-side abstraction | DIRECTED | Future SQLite backend drops in without touching tool code. Leave `mirror-catalog.ts` write path alone this PR. |
| D4 | No replacement of existing Andrew/Mike tools | LOCKED | `write_document`, `list_documents`, `get_backlinks` etc. are stable. New tools fill orthogonal gaps. |
| D5 | Per-tool config under `mcp.tools.<tool_name>.<setting>` | DIRECTED | Separation of "what to track" (`content`) vs "how tools behave" (`mcp`). |
| D6 | No CLI subcommands; no `ok` binary | DIRECTED | just-bash is internal primitive only. Agents access via MCP. |
| D7 | `consolidate` follows `research`/`ingest` pattern — returns instructional text | DIRECTED | Consistent with existing workflow tools. No server call. |
| D8 | `read_document` parallelizes independent operations via `Promise.all` | DIRECTED | Latency optimization. 3-4 shell ops + HTTP call otherwise serial. |

## 9) Open questions

None. All P0 questions resolved through iterative discussion. P2 items folded into Future Work.

## 10) Assumptions

| ID | Assumption | Confidence | Verification |
|---|---|---|---|
| A1 | `node:child_process` latency is acceptable for shell ops | HIGH | Node builtin, no extra dep, no interpreter overhead. Shell commands complete in <50ms typical at wiki scale. Verified during implementation. |
| A2 | Backlinks endpoint (`/api/backlinks`) response shape is stable | HIGH | Shipped in Mike #71, used by `get_backlinks` tool |
| A3 | Mirror-catalog INDEX.md format is stable | HIGH | Shipped in Andrew #47, used by existing catalog browsing |
| A4 | Wiki scale stays under ~500 files | HIGH | Current usage; revisit if adoption grows |
| A5 | `git log` per-file is fast at wiki scale | MEDIUM | Needs measurement. At 500 files, individual git log should be <50ms. |

## 11) Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | ~~just-bash adds runtime dep for trivial shell ops~~ | — | **Resolved during implementation.** Shipped with `node:child_process` (see D1). No extra dep. If cloud deployment later wants sandboxed execution, swap the wrapper internals (~50 LOC) without touching tool code. |
| R2 | `read_document` latency from multiple ops | Medium | Parallelize independent ops (`Promise.all`). Target <200ms typical. |
| R3 | Agent keeps using native `Read` instead of `read_document` | Medium | Update MCP `INSTRUCTIONS` to direct agents to enriched tools for wiki ops. |
| R4 | `CatalogStore` interface proves wrong shape when SQLite impl is built | Low | Interface is minimal (2 methods). Can evolve before SQLite ships. |
| R5 | Shell escaping bugs cause injection via path params | Medium | `shellEscape` wraps all interpolated args; `cat` uses `fs.readFile` directly (no shell); unit tests cover embedded quotes, empty strings, safe-char fast path. |

## 12) Future work

| Item | Maturity | Trigger to revisit |
|---|---|---|
| SQLite `CatalogStore` implementation | Identified | `.open-knowledge/catalogs/` INDEX.md generation becomes a bottleneck or structured queries are needed |
| `list_files` MCP tool (enriched directory browsing) | Noted | If agents struggle to navigate catalog INDEX.md files natively |
| CLI subcommands (`open-knowledge read`, etc.) | Noted | If a cloud deployment or non-MCP surface needs the same functionality |
| Multi-root config | Noted | If a real use case emerges for tracking files outside `content.dir` |
| `CATALOGUE.md` rename (T2.6) | Identified | Naming decision deferred; revisit with team |
| `read_document` includes inbound section anchors | Noted | When section-link resolution (`[[Page#Heading]]`) ships |
| `search` semantic/vector search | Noted | When wiki grows beyond grep-feasible scale |

## 13) Agent constraints

- **SCOPE:**
  - `packages/cli/src/bash/` — new (shell wrapper)
  - `packages/cli/src/mcp/tools/read-document.ts` — new
  - `packages/cli/src/mcp/tools/search.ts` — new
  - `packages/cli/src/mcp/tools/consolidate.ts` — new
  - `packages/cli/src/mcp/tools/index.ts` — modify (register new tools)
  - `packages/cli/src/content/catalog-store.ts` — new
  - `packages/cli/src/config/schema.ts` — modify (add `mcp.tools` section)
  - `packages/cli/src/mcp/server.ts` — modify (update INSTRUCTIONS)
  - ~~`packages/cli/package.json` — modify (add `just-bash` dep)~~ No new deps (see D1)
- **EXCLUDE:**
  - `packages/server/` — Hocuspocus API stable, no changes needed
  - `packages/app/` — editor frontend, not affected
  - `packages/core/` — shared extensions, not affected
  - `packages/cli/src/content/mirror-catalog.ts` — write path stays as-is (don't refactor to use `CatalogStore`)
  - Existing MCP tool files (`write-document.ts`, `edit-document.ts`, `list-documents.ts`, `undo-agent-edit.ts`, `redo-agent-edit.ts`, `get-backlinks.ts`, `get-forward-links.ts`, `get-orphans.ts`, `get-hubs.ts`, `init-content.ts`, `ingest.ts`, `research.ts`)
- **STOP_IF:**
  - ~~just-bash benchmark shows unacceptable overhead — return to spec to re-evaluate D1~~ (resolved pre-implementation)
  - `CatalogStore` interface shape requires changes to `mirror-catalog.ts` — return to scope discussion
  - Mike's backlinks endpoint response shape differs from what `get-backlinks.ts` shows
- **ASK_FIRST:**
  - Deprecating any existing tool
  - Changing MCP `INSTRUCTIONS` structure (not just content)
  - Adding new runtime dependencies
