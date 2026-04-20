---
title: Current state — code-verified findings
type: evidence
sources:
  - packages/server/src/server-lock.ts
  - packages/server/src/standalone.ts
  - packages/app/src/lib/doc-hash.ts
  - packages/app/src/App.tsx
  - packages/cli/src/config/schema.ts
  - packages/cli/src/content/init.ts
  - packages/cli/src/mcp/server.ts
  - packages/cli/src/mcp/tools/exec.ts
  - packages/cli/src/mcp/tools/search.ts
  - packages/cli/src/mcp/tools/read-document.ts
  - packages/cli/src/content/enrichment.ts
---

# Current state

## Server lock (local-only URL source)

- File `server-lock.ts:19` declares `ServerLockMetadata = { pid, hostname, port, startedAt, worktreeRoot }`.
- `server-lock.ts:15` imports `hostname` from `node:os`; `server-lock.ts:94` writes `hostname: hostname()`. Value is the OS hostname (e.g. `Timothys-MacBook-Pro.local`), **never** `localhost`.
- Port may be `0` at startup (documented at `server-lock.ts:23`).
- `standalone.ts:146-149` acquires the lock with `port: options.port ?? 0`, `worktreeRoot: projectDir`.
- Implication: `server.lock` is **not directly usable** as a browser URL — the browser running on the same machine hits `localhost`, not the `.local` mDNS name. We must substitute `localhost` (or `127.0.0.1`) when the lock is on the current machine.

## Hash routing (URL contract)

- `doc-hash.ts:23-25`: `hashFromDocName(docName)` returns `#/${docName}` (anchor optional).
- `doc-hash.ts:7-20`: `docNameFromHash` decodes per-segment via `decodeURIComponent`.
- `App.tsx:16-28`: `NavigationHandler` listens on `hashchange` and calls `openDocument(docName)` exactly once per hash change.
- Contract: `{baseUrl}/#/{encodeURIComponent-per-segment docName}` — `hashFromDocName` is the canonical builder.

## Config schema (where to add `preview.baseUrl`)

- `packages/cli/src/config/schema.ts` is Zod.
- Existing nested optional objects follow a consistent shape (e.g. `server` at ~lines 15–24).
- Adding `preview: z.object({ baseUrl: z.string().url().optional() }).optional()` after the existing blocks fits cleanly.

## Hocuspocus subscriber introspection — *not built in*

- `@hocuspocus/*` 4.0.0-rc.1.
- `standalone.ts:237-246` accesses `hocuspocus.documents.get(docName)` → returns a Document or undefined (whether the room is *loaded*, not whether clients are connected).
- `hocuspocus.closeConnections(docName)` exists (line 435) — internal connection tracking is present but not publicly enumerable.
- **No** `.getConnections()` / `.getSubscribers()` / `.getClients()` on Document or Server.
- To surface subscriber presence we would need to register a Hocuspocus Extension hooking `onConnect` / `onDisconnect` and maintain a room → count map ourselves, then expose it via an internal API (function call or HTTP endpoint).

## `exec` enrichment

- `packages/cli/src/content/enrichment.ts:212` `enrichPath()` is path-agnostic — no config awareness.
- `packages/cli/src/mcp/tools/search.ts:67` is the one place that already filters by `deps.config.content.include` / `exclude`. Pattern to copy.
- `exec.ts` currently enriches every returned path; adding a `previewUrl` would need a content-include check per path inside the tool (or lifted into a shared helper).

## MCP tool inventory

- All six target tools exist: `exec.ts`, `read-document.ts`, `list-documents.ts`, `search.ts`, `write-document.ts`, `edit-document.ts`.
- No `previewUrl` string anywhere in tool sources today. Field is safe to add.

## Two instruction surfaces (both likely need updating)

- `CLAUDE_MD_SECTION` (`content/init.ts:144`): static content injected into `CLAUDE.md` on `open-knowledge init`. Read by Claude Code sessions at conversation start.
- `buildInstructions(config)` (`mcp/server.ts:40`): dynamic, regenerated at MCP server boot, sent in the MCP `instructions` capability. Read by any MCP client (Claude Desktop, other integrations) on connect.
- Same guidance probably needs to live in both; CLAUDE.md is project-persistent, MCP instructions are connection-dynamic.
