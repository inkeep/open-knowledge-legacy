# Document List API

**Status:** Final
**Created:** 2026-04-10
**Baseline commit:** 748f63e
**Parent spec:** `specs/2026-04-10-multi-file-documents/SPEC.md`
**Parallel with:** `specs/2026-04-10-provider-pool/`, `specs/2026-04-10-mcp-write-tools/`

---

## Problem

There is no API to discover available documents. The file tree sidebar (future PR) and MCP `list_documents` tool (parallel spec) both need a server-side endpoint to enumerate files in `contentDir`.

## Goal

Add a `GET /api/documents` endpoint that lists files matching the configured content glob patterns.

## Non-Goals

- File tree UI (separate PR, consumes this API)
- MCP `list_documents` tool (parallel spec — will call this endpoint)
- Document read/write APIs (already exist)

## Package boundary

**This spec touches `packages/server/` only.** No app or CLI changes.

---

## Design

### Endpoint

```
GET /api/documents?dir=<optional-subdir>

Response: {
  ok: true,
  documents: [
    { docName: "test-doc", size: 1234, modified: "2026-04-10T12:00:00.000Z" },
    { docName: "articles/architecture", size: 5678, modified: "2026-04-09T..." },
    ...
  ]
}
```

- Recursively lists files under `contentDir` (or subdirectory if `dir` is specified)
- Filters to files matching `config.content.include` / `config.content.exclude` glob patterns
- Returns flat list — tree structure derived client-side
- `docName` = path relative to `contentDir`, without `.md` extension
- Sorted by `docName` alphabetically

### Path validation

Dedicated `safeSubdir` helper for the `dir` parameter (not reusing `safeContentPath` which appends `.md`):

```typescript
function safeSubdir(subdir: string, contentDir: string): string {
  const resolved = resolve(contentDir, subdir);
  if (!resolved.startsWith(contentDir)) {
    throw new Error(`Invalid directory: ${subdir}`);
  }
  return resolved;
}
```

### Config integration

The `ApiExtensionOptions` already receives `contentDir`. The server package currently has no knowledge of content glob patterns (`include`/`exclude`) — those live in the CLI config schema (`packages/cli/src/config/schema.ts`).

Two approaches:
- **A (minimal):** List all `.md` files recursively. This matches the default config (`include: ['**/*.md']`). Glob filtering deferred until a user actually configures custom patterns.
- **B (full):** Add `contentInclude?: string[]` and `contentExclude?: string[]` to `ServerOptions` and `ApiExtensionOptions`. Pass them from the CLI's `start` command where config is available. Filter the listing using the same `isTrackedContent()` function from `packages/cli/src/content/mirror-catalog.ts` (or a similar glob matcher).

Recommendation: **A for this PR.** The default glob is `**/*.md` — listing all `.md` files is identical behavior. Custom glob support can be added when needed without API changes (the response shape stays the same).

### Location

Handler added to `packages/server/src/api-extension.ts`. Route: `'/api/documents': handleDocumentList`.

---

## Acceptance Criteria

1. `GET /api/documents` returns all matching files with `docName`, `size`, and `modified`
2. `GET /api/documents?dir=articles` returns only files under `articles/`
3. Response lists all `.md` files (matching default `**/*.md` pattern)
4. `dir=../` returns 400 (path traversal blocked by `safeSubdir`)
5. Empty content directory returns `{ ok: true, documents: [] }`

## Agent Constraints

**SCOPE:**
- `packages/server/src/api-extension.ts` — new handler + route
- `packages/server/src/standalone.ts` — pass config globs to API extension if needed

**EXCLUDE:**
- `packages/app/` (parallel spec)
- `packages/cli/` (parallel spec)
