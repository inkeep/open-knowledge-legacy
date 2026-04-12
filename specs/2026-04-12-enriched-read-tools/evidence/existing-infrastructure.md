---
title: Existing infrastructure — what Andrew and Mike already built
description: Factual findings on MCP tools, config, catalog system, and HTTP API endpoints already implemented in the codebase.
sources:
  - packages/cli/src/mcp/tools/index.ts
  - packages/cli/src/mcp/tools/write-document.ts
  - packages/cli/src/mcp/tools/edit-document.ts
  - packages/cli/src/mcp/tools/list-documents.ts
  - packages/cli/src/mcp/tools/undo-agent-edit.ts
  - packages/cli/src/mcp/tools/redo-agent-edit.ts
  - packages/cli/src/mcp/tools/get-backlinks.ts
  - packages/cli/src/mcp/tools/shared.ts
  - packages/cli/src/mcp/tools/ingest.ts
  - packages/cli/src/mcp/tools/research.ts
  - packages/cli/src/config/schema.ts
  - packages/cli/src/content/mirror-catalog.ts
  - packages/cli/src/utils/frontmatter.ts
---

## Andrew's tools (#50 — feat: multi-file document support)

Routed through Hocuspocus HTTP API. Each tool:
- Errors with `HOCUSPOCUS_NOT_RUNNING_ERROR` when serverUrl is undefined
- Uses shared `httpGet`/`httpPost` helpers
- Returns `textResult` wrapping MCP content

| Tool | HTTP endpoint | Purpose |
|---|---|---|
| `write_document` | POST `/api/agent-write-md` | Write markdown; `position` = append/prepend/replace |
| `edit_document` | POST `/api/agent-patch` | Find-and-replace on live document |
| `list_documents` | GET `/api/documents` | List Hocuspocus docNames, optional dir filter |
| `undo_agent_edit` | POST `/api/agent-undo` | Undo last agent write |
| `redo_agent_edit` | POST `/api/agent-redo` | Redo last undone write |

## Mike's tools (#71 — Wiki links: backlink graph, HTTP + MCP APIs)

All GET requests to Hocuspocus. Return JSON with data fields.

| Tool | HTTP endpoint | Purpose |
|---|---|---|
| `get_backlinks` | GET `/api/backlinks?docName=<name>` | Pages linking TO a given page |
| `get_forward_links` | GET `/api/forward-links?docName=<name>` | Pages a given page links TO |
| `get_orphans` | GET `/api/orphans` | Pages with no incoming links |
| `get_hubs` | GET `/api/hubs` | Most-linked-to pages |

## Andrew's config refactor (#47)

Removed:
- `content.dir: ./content` (single string, fixed path)
- `wiki.roots: [{ path, label }]` (multi-root array)

Replaced with:
```typescript
content: {
  dir: z.string().default('.'),                    // project root by default
  include: z.array(z.string()).min(1).default(['**/*.md']),
  exclude: z.array(z.string()).default([]),
}
```

Mirror-catalog walks from `content.dir` (= project root), scans files matching `include` globs, generates `INDEX.md` files at `.open-knowledge/catalogs/<relpath>/INDEX.md` mirroring the project structure.

## Workflow tool pattern (ingest.ts, research.ts)

All three workflow tools follow this shape:

```typescript
export const DESCRIPTION = [
  'One-line summary',
  '',
  '**Use when:**',
  '- bullet 1',
  '- bullet 2',
  '',
  '**Triggers on:**',
  '- trigger 1',
].join('\n');

export function register(server: ServerInstance): void {
  server.tool(
    'tool_name',
    DESCRIPTION,
    { param: z.string().describe('help text') },
    (args: { param: string }) => textResult(buildInstructionalBody(args.param)),
  );
}
```

Handler returns `textResult(string)` — no server call. Returns instructional text the agent follows.

## Shared helpers

**File:** `packages/cli/src/mcp/tools/shared.ts`

```typescript
async function httpGet(baseUrl, path): Promise<{ ok: boolean; [key: string]: unknown }>
async function httpPost(baseUrl, path, body?): Promise<{ ok: boolean; [key: string]: unknown }>
function textResult(text: string, isError?: boolean): McpTextContent
const HOCUSPOCUS_NOT_RUNNING_ERROR: string
type ServerInstance = McpServer
```

30s timeout on HTTP. Returns `{ ok: false, error: string }` on failure.

## Frontmatter utilities

**File:** `packages/cli/src/utils/frontmatter.ts`

```typescript
function parseFrontmatter<S extends ZodType>(content: string, schema?: S): Resolve<output<S>> | null
function serializeFrontmatter(data: Record<string, unknown>): string
```

Jekyll-style frontmatter (`---\n<yaml>\n---`). Handles both Unix and Windows line endings.

## Mirror-catalog structure

**File:** `packages/cli/src/content/mirror-catalog.ts`

Constants:
- `CATALOGS_DIR = 'catalogs'`
- `CATALOG_FILENAME = 'INDEX.md'` (from constants.ts)

Layout produced:
```
.open-knowledge/catalogs/
  INDEX.md                              ← root catalog
  specs/INDEX.md                        ← mirrors specs/
  specs/2026-04-07-foo/INDEX.md         ← mirrors specs/2026-04-07-foo/
  reports/INDEX.md                      ← mirrors reports/
  .open-knowledge/articles/INDEX.md     ← mirrors .open-knowledge/articles/
```

Each INDEX.md has sticky frontmatter (title, description — preserved across rebuilds) + auto-generated Articles list + Subfolders list with article counts.

## just-bash (external dependency)

**Package:** `just-bash` v2.14.1 from `vercel-labs/just-bash`
**Homepage:** https://justbash.dev/

API shape:
```typescript
import { Bash } from 'just-bash';

const bash = new Bash(options);
await bash.exec(script, execOptions);
```

Supports:
- `defineCommand()` for custom commands
- `InMemoryFs`, `MountableFs` filesystem abstraction
- Persistent FS across calls
- Isolated shell state per exec
- CLI binaries: `just-bash`, `just-bash-shell`

Status: installable as npm dep.
