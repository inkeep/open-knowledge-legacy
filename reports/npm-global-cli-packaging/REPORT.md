---
title: "Packaging open-knowledge as a Global npm CLI"
description: "How to extract the Hocuspocus CRDT server from its Vite dev plugin, package it as @inkeep/open-knowledge with Commander.js, hierarchical YAML config in .open-knowledge/ directories, packages/ monorepo structure, and MCP tool delivery to AI clients."
createdAt: 2026-04-08
updatedAt: 2026-04-08
subjects:
  - open-knowledge
  - npm
  - Commander.js
  - Hocuspocus
  - MCP
topics:
  - CLI packaging
  - npm global packages
  - YAML configuration
  - monorepo publishing
  - MCP tools
---

# Packaging open-knowledge as a Global npm CLI

**Purpose:** Define how to package the existing Hocuspocus CRDT collaboration server as a globally-installable npm package (`npx @inkeep/open-knowledge`) with user-level and workspace-level YAML configuration stored in `.open-knowledge/` directories, `packages/` monorepo structure, and MCP tool delivery to AI clients (Claude Code, Cursor, etc.).

---

## Executive Summary

The open-knowledge server can be extracted from its current Vite plugin embedding into a standalone global npm CLI with moderate effort. The Hocuspocus v4 `Server` class already provides a ready-made standalone HTTP+WebSocket server — the migration eliminates ~25 lines of manual WebSocket plumbing and the Vite dependency for production use.

The recommended architecture: **Commander.js v14** for CLI argument parsing (matching @inkeep/agents-cli), **`yaml` v2 + Zod** for hierarchical YAML config with schema validation, **tsdown** (Rolldown-powered tsup successor) for the build pipeline, **`@inkeep/open-knowledge`** as the npm package name under the existing `@inkeep` scope, and a **`packages/` monorepo structure** separating CLI/server from the React editor app.

**Key Findings:**
- **Server extraction is straightforward.** Hocuspocus v4's `Server` class + `onRequest` hook replaces the Vite plugin entirely. API endpoints migrate as copy-paste — they already use raw `req`/`res`.
- **Config hierarchy follows Git's model.** Two fixed locations (`~/.open-knowledge/config.yml` + `./.open-knowledge/config.yml`) with deep merge. No walk-up-tree discovery needed.
- **Package as `@inkeep/open-knowledge`** with `"bin": { "open-knowledge": "./dist/cli.js" }` — the shell command stays `open-knowledge`. Uses the existing `@inkeep` npm org.
- **tsdown is the recommended build tool.** tsup declared itself unmaintained. tsdown (Rolldown engine) handles shebang auto-detection, native addon externalization, and fast dts generation.
- **MCP tools are a natural fit.** The CLI can expose an MCP server (`open-knowledge mcp`) over stdio, reusing the same Hocuspocus DirectConnection + agent session code. 8 tools cover the full knowledge base surface. Auto-install command configures Claude Code, Cursor, and Claude Desktop.
- **`packages/` structure now.** Separate `packages/open-knowledge/` (CLI + server + MCP) from `packages/app/` (React editor). Team members working on UI never touch the CLI package.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| 1 | npm global package structure | Deep | P0 |
| 2 | CLI structure with Commander.js | Deep | P0 |
| 3 | Hierarchical YAML config resolution | Deep | P0 |
| 4 | Server extraction from Vite | Moderate | P0 |
| 5 | TypeScript build pipeline for CLI distribution | Moderate | P1 |
| 6 | Monorepo publishing patterns | Moderate | P1 |
| 7 | MCP tool delivery to AI clients | Deep | P0 |

**Non-goals:** Windows-specific packaging, GUI/Electron, Docker distribution, auto-update mechanisms, plugin system design, security hardening.

---

## Detailed Findings

### 1. npm Global Package Structure

**Finding:** A scoped package with an unscoped bin command is the standard pattern for CLI tools.

**Evidence:** [evidence/npm-package-structure.md](evidence/npm-package-structure.md)

The recommended `package.json` shape:

```jsonc
{
  "name": "@inkeep/open-knowledge",  // under existing @inkeep npm org
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "open-knowledge": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist"],
  "engines": { "node": ">=22" },
  "publishConfig": { "access": "public" }
}
```

The `bin` field controls the shell command independently of the package name. [Biome](https://biomejs.dev/) (`@biomejs/biome` installs as `biome`) and [Changesets](https://github.com/changesets/changesets) (`@changesets/cli` installs as `changeset`) establish this pattern. Using `@inkeep/open-knowledge` under the existing `@inkeep` npm org avoids scope registration.

The `exports` map exposes a programmatic API for embedding the server. The `bin` entry handles CLI invocation. These are independent — no conflict.

`"files": ["dist"]` is the dominant pattern (used by tsx, taze, citty). Always verify with `npm pack --dry-run`.

**Remaining uncertainty:** None.

---

### 2. CLI Structure with Commander.js

**Finding:** Commander v14 with `start` as the default command, `preAction` hooks for config loading, and `parseAsync()` for the async server lifecycle.

**Evidence:** [evidence/commander-cli-patterns.md](evidence/commander-cli-patterns.md)

The CLI command tree:

```
open-knowledge                    # No args → start server (default command)
open-knowledge start              # Explicit server start
open-knowledge init [path]        # Scaffold .open-knowledge/ + content/
open-knowledge status             # Server health + document stats
open-knowledge config             # View/set config (future)
open-knowledge mcp                # Start MCP stdio server (for Claude Code, Cursor, etc.)
open-knowledge mcp install        # Auto-configure MCP in Claude Code / Cursor / Claude Desktop
```

Commander's `{ isDefault: true }` on the `start` command makes `npx @inkeep/open-knowledge` and `npx @inkeep/open-knowledge start` equivalent — matching the U6.2 story in STORIES.md.

Key patterns from @inkeep/agents-cli to replicate:
- **`.addOption(new Option(...).env('PORT'))`** for environment variable integration with source tracking
- **`preAction` hook** for loading YAML config before any command runs, merging with Commander's built-in precedence tracking (`setOptionValueWithSource()`)
- **`@commander-js/extra-typings`** for inferred TypeScript types from option declarations
- **`showSuggestionAfterError(true)`** for "Did you mean...?" on typos

Server lifecycle: **foreground only at P0**. Hocuspocus's `destroy()` method handles graceful shutdown (flushes documents, closes connections). The CLI just adds `SIGINT`/`SIGTERM` handlers that call `await server.destroy()`.

**Decision triggers:**
- If subcommand count grows beyond ~6, consider Commander's `commandsGroup()` (new in v14) for organized help output.
- Daemon mode (background process) is unnecessary for a local tool with <10 connections. Reconsider only if remote/team deployment scenarios emerge.

**Remaining uncertainty:** None.

---

### 3. Hierarchical YAML Config Resolution

**Finding:** Two fixed config locations with deep merge, `yaml` v2 for parsing, Zod for schema validation. No walk-up-tree discovery.

**Evidence:** [evidence/yaml-config-resolution.md](evidence/yaml-config-resolution.md)

**Config hierarchy (lowest to highest priority):**

```
Zod schema defaults → ~/.open-knowledge/config.yml → ./.open-knowledge/config.yml → ENV vars → CLI flags
```

This matches Git's config mental model that developers already understand. Fixed locations (not cosmiconfig walk-up-tree) because a server process always knows its project root.

**User-level config** (`~/.open-knowledge/config.yml`) — personal defaults:
```yaml
server:
  port: 4000
  host: 0.0.0.0
editor:
  defaultMode: source
```

**Workspace-level config** (`./.open-knowledge/config.yml`) — project-specific, committed to git:
```yaml
content:
  dir: ./docs/knowledge-base
  exclude:
    - "_drafts/**"
server:
  port: 3000
git:
  wipRef: refs/wip/main
  commitDebounceMs: 15000
```

**Merge semantics:** Deep merge where workspace leaf values override user leaf values. Arrays are **replaced** (not concatenated) — workspace `exclude` patterns are authoritative.

**Technology choices:**
- **`yaml` v2** (eemeli): YAML 1.2, zero deps, comment preservation (critical for generated templates and programmatic updates). Already used by @inkeep/agents-cli.
- **Zod**: Schema validation with `.default()` on every field — `ConfigSchema.parse({})` produces a complete valid config. `safeParse()` gives structured errors with path + message. `z.coerce.number()` handles YAML string-to-number.

The `.open-knowledge/` directory (not a single file) follows `.vscode/`, `.claude/` convention — room for `credentials.yml`, `cache/`, `plugins/` later.

**Decision triggers:**
- If config complexity grows, consider `c12` (Nuxt ecosystem) for `$development`/`$production` environment keys.
- The `init` command should generate a fully-commented YAML template from Zod schema defaults — all options present but commented out, serving as self-documentation.

**Remaining uncertainty:** Exact env var prefix (`OK_` vs `OPENKNOWLEDGE_`) is a naming decision.

---

### 4. Server Extraction from Vite

**Finding:** Hocuspocus v4's `Server` class provides a ready-made standalone HTTP+WebSocket server. API endpoints migrate via the `onRequest` extension hook with zero new dependencies.

**Evidence:** [evidence/server-extraction.md](evidence/server-extraction.md)

**Current state:** The server is embedded as a Vite plugin in `hocuspocus-plugin.ts`. It manually creates a `WebSocketServer`, wires `handleUpgrade`, and registers HTTP middleware on the Vite dev server.

**Target state:** The `Server` class from `@hocuspocus/server` handles all of this natively via `crossws`:

```typescript
import { Server } from '@hocuspocus/server';

const server = new Server({
  port: config.server.port,
  debounce: config.persistence.debounceMs,
  maxDebounce: config.persistence.maxDebounceMs,
  extensions: [
    createApiExtension(),          // HTTP API routes via onRequest hook
    createPersistenceExtension(),  // Y.Doc → disk → git
  ],
});

await server.listen();
```

**API endpoint migration:** The `Server` routes all HTTP requests through the `onRequest` extension hook. An extension that handles a request throws an empty string to signal "handled, skip default response." Current handlers already use raw `IncomingMessage`/`ServerResponse` — migration is nearly copy-paste.

**Refactoring needed in `hocuspocus-plugin.ts`:**
1. Extract API handlers (lines 170-413) → `api-extension.ts` (Hocuspocus extension with `onRequest`)
2. Extract agent session management (UndoManager, DirectConnection) → `agent-sessions.ts`
3. File watcher integration is already in `file-watcher.ts` — no changes needed
4. `persistence.ts` — no changes needed

**Dev vs. production split** (Next.js pattern):
- `open-knowledge dev` — keeps Vite plugin (HMR, TypeScript on-the-fly, source maps)
- `open-knowledge start` — standalone `Server` + pre-built assets via `sirv` (2KB, zero deps)

**Decision triggers:**
- `import.meta.dirname` is fragile in bundled builds. Content directory MUST come from config/CLI args, not relative path resolution.
- If the API surface grows beyond ~10 endpoints, consider Hono (14KB, zero deps) instead of raw `onRequest`.

**Remaining uncertainty:** None for the core extraction. Static asset serving pattern depends on whether the frontend ships with the CLI package or is a separate concern.

---

### 5. TypeScript Build Pipeline for CLI Distribution

**Finding:** tsdown (Rolldown-powered tsup successor) is the recommended build tool. tsup declared itself unmaintained.

**Evidence:** [evidence/build-pipeline.md](evidence/build-pipeline.md)

**Why tsdown over tsup:**
- tsup's own README recommends tsdown as its successor
- Rolldown engine: faster than esbuild, better tree-shaking
- Automatic shebang detection from source file (`#!/usr/bin/env node`) + chmod 755
- `deps.neverBundle` for native addon externalization
- Fast dts via oxc with `isolatedDeclarations`
- Production use by nuxi (Nuxt CLI) and taze

```typescript
// tsdown.config.ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  format: 'esm',
  dts: true,
  deps: { neverBundle: ['@parcel/watcher', 'simple-git'] },
})
```

**Bundling strategy:** Partial bundle. Bundle pure-JS dependencies (Yjs, Hocuspocus, ws). Externalize native addons (`@parcel/watcher` — platform-specific binaries) and subprocess-spawning dependencies (`simple-git`).

**Multiple entry points:** `src/cli.ts` (CLI entry with shebang, no dts) and `src/index.ts` (programmatic API with dts). Both produce ESM output in `dist/`.

**Decision triggers:**
- If tsdown's beta status causes issues, tsup is a drop-in fallback with identical config patterns.
- If you need to bundle React/editor code for the frontend build, that's a separate Vite build — not the CLI build.

**Remaining uncertainty:** tsdown is beta. The fallback (tsup) works today.

---

### 6. Monorepo Structure — `packages/` Directory

**Finding:** Restructure to `packages/` now to cleanly separate CLI/server from the React editor app. Team members working on UI components work in `packages/app/` without touching the CLI package.

**Evidence:** [evidence/monorepo-publishing.md](evidence/monorepo-publishing.md)

**Target structure:**

```
open-knowledge/
  package.json                    # private: true, workspaces: ["packages/*", "docs"]
  packages/
    open-knowledge/               # @inkeep/open-knowledge — publishable CLI + server + MCP
      package.json                # name: @inkeep/open-knowledge, bin, exports
      src/
        cli.ts                    # CLI entry (Commander.js)
        index.ts                  # Programmatic API export
        server/                   # Hocuspocus server, persistence, file-watcher
        mcp/                      # MCP server, tools, resources
        config/                   # YAML config loader, Zod schema
      tsdown.config.ts
      dist/                       # built output (gitignored)
    app/                          # React frontend — private, not published
      package.json                # private: true
      src/
        main.tsx                  # React entry
        editor/                   # TipTap, CodeMirror, observers
        presence/                 # PresenceBar, identity, AgentUndoButton
        components/               # Design system
      vite.config.ts
      index.html
  docs/                           # Docs site (stays at root)
```

**Migration from `init_spike/`:**
1. Create `packages/open-knowledge/` — extract server, config, CLI, MCP code
2. Create `packages/app/` — move React editor, presence, components, Vite config
3. Shared code (Yjs types, frontmatter extensions) either lives in a `packages/shared/` workspace or is duplicated minimally
4. Update root `package.json`: `"workspaces": ["packages/*", "docs"]`
5. Remove `init_spike/` once migration is verified

**Publishing:**
```bash
cd packages/open-knowledge
npm pack --dry-run     # verify included files
npm publish            # or: bun publish
```

`"prepublishOnly": "bun run build && bun run test"` ensures build + test gate before every publish.

**Local testing:** `npm pack` → install from tarball, `npx .` from package dir, or `bun run src/cli.ts` for source-level iteration.

**Decision triggers:**
- Adopt [Changesets](https://github.com/changesets/changesets) when you want CI-automated releases with changelog generation. Already configured in `init_spike/CLAUDE.md`.

**Remaining uncertainty:** Exact boundary for shared code between `packages/open-knowledge/` and `packages/app/` (frontmatter extensions, Yjs types).

---

### 7. MCP Tool Delivery to AI Clients

**Finding:** The CLI can expose an MCP server over stdio (`open-knowledge mcp`) that embeds a Hocuspocus instance and reuses the existing DirectConnection + agent session code. 8 tools + document resources cover the full knowledge base surface. An `mcp install` subcommand auto-configures Claude Code, Cursor, and Claude Desktop.

**Evidence:** [evidence/mcp-tool-delivery.md](evidence/mcp-tool-delivery.md)

**Transport:** stdio via `StdioServerTransport` from `@modelcontextprotocol/sdk`. This is the standard for local CLI tools — Claude Code, Cursor, Windsurf, and Claude Desktop all connect this way. Zero network/port/auth setup. Streamable HTTP for cloud deployment is a LATER concern.

**Client configuration (Claude Code):**
```jsonc
// .claude/settings.json
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp", "--content-dir", "./content"]
    }
  }
}
```

**Tools (8 total):**

| Tool | Maps to | Annotations |
|------|---------|-------------|
| `read_document` | DirectConnection → Y.Text('source') + Y.Map('metadata') | readOnly |
| `write_document` | Existing `/api/agent-write-md` logic | destructive: false |
| `edit_document` | Surgical find-replace in Y.Text | idempotent |
| `list_documents` | Content directory enumeration + frontmatter parsing | readOnly |
| `search_documents` | Grep through .md files | readOnly |
| `undo_agent_edit` | Existing `/api/agent-undo` logic | — |
| `redo_agent_edit` | Existing `/api/agent-redo` logic | — |
| `update_frontmatter` | Y.Map('metadata') mutation | idempotent |

All tools use Zod schemas for input validation (same as @inkeep/agents-cli). Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) follow the filesystem-server reference implementation.

**Resources:** Each .md document exposed as `ok://docs/{path}` with subscription support. When a Y.Doc changes (via Hocuspocus `afterStoreDocument` hook), the MCP server sends `notifications/resources/updated` to the client.

**Architecture:** The MCP server embeds its own Hocuspocus instance accessing the same content directory — it's not a proxy to the HTTP API. The agent session management (`getAgentSession`, `getAgentUndoManager`, `AGENT_WRITE_ORIGIN`) is extracted into a shared module used by both the MCP server and the Vite plugin.

```
open-knowledge mcp (stdio process)
  ├── McpServer (SDK v1.28)
  │   ├── 8 tools (Zod schemas)
  │   └── document resources (ok://docs/*)
  ├── Hocuspocus (embedded, no HTTP)
  │   ├── DirectConnection per document
  │   ├── Agent sessions + UndoManager
  │   └── Persistence pipeline (.md → git)
  └── StdioServerTransport (stdin/stdout)
```

**Easy setup — `open-knowledge mcp install`:** Detects Claude Code (`.claude/settings.json`), Cursor (`.cursor/mcp.json`), and Claude Desktop (`~/Library/.../claude_desktop_config.json`), reads existing config, merges the MCP server entry, writes back. One command, all clients configured.

**Decision triggers:**
- If remote access is needed (team/cloud scenarios), add Streamable HTTP transport alongside stdio.
- If tool count grows beyond ~15, consider grouping tools by namespace or splitting into multiple MCP servers.

**Remaining uncertainty:** Streamable HTTP transport for cloud deployment (LATER phase). Claude Code plugin packaging (`.claude-plugin/`) as an additional distribution channel.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Static asset serving pattern:** Whether the pre-built React frontend ships inside the npm package or is a separate deployment concern. If bundled, it adds significant package size. If separate, `open-knowledge start` needs a way to locate the built assets.

### Out of Scope (per Rubric)
- Windows-specific packaging edge cases
- GUI/Electron distribution
- Docker containerization
- Auto-update mechanisms (e.g., update-notifier)
- Plugin/extension system design

---

## Architecture Summary

```
                    ┌──────────────────────────────────────────────┐
                    │         @inkeep/open-knowledge CLI           │
                    │         Commander.js v14                      │
                    └──────┬──────────────┬───────────────┬────────┘
                           │              │               │
                    ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
                    │    start    │ │    mcp     │ │    init     │
                    │  (default)  │ │  (stdio)   │ │  mcp install│
                    └──────┬──────┘ └─────┬─────┘ └─────────────┘
                           │              │
              ┌────────────▼──────────────▼────────────┐
              │        Config Loader                    │
              │   ~/.open-knowledge/config.yml          │
              │   ./.open-knowledge/config.yml          │
              │   yaml v2 + Zod deep merge              │
              └────────────┬──────────────┬────────────┘
                           │              │
              ┌────────────▼────┐  ┌──────▼──────────┐
              │  Hocuspocus     │  │  McpServer       │
              │  Server class   │  │  (SDK v1.28)     │
              │  HTTP + WS      │  │  stdio transport  │
              └───┬────┬────┬───┘  └───┬──────────────┘
                  │    │    │          │
              ┌───▼┐ ┌─▼──┐ ┌▼────┐   │  ┌──────────────────┐
              │API │ │ WS │ │sirv │   └──▶ Shared Core       │
              │ext │ │CRDT│ │    │       │ - Agent Sessions  │
              └──┬─┘ └─┬──┘ └────┘       │ - DirectConnection│
                 │     │                  │ - Persistence     │
                 └──┬──┘                  │ - File Watcher    │
                    └─────────────────────┘
```

**Two entry points, shared core:** `open-knowledge start` runs the full HTTP+WS server (for browser editors). `open-knowledge mcp` runs a headless Hocuspocus with stdio transport (for AI clients). Both use the same agent session management, persistence pipeline, and file watcher.

---

## References

### Evidence Files
- [evidence/npm-package-structure.md](evidence/npm-package-structure.md) — bin, exports, files, naming, ESM gotchas
- [evidence/commander-cli-patterns.md](evidence/commander-cli-patterns.md) — command structure, lifecycle, config integration
- [evidence/yaml-config-resolution.md](evidence/yaml-config-resolution.md) — config hierarchy, merge semantics, YAML/Zod
- [evidence/server-extraction.md](evidence/server-extraction.md) — Hocuspocus Server class, onRequest hook, refactoring plan
- [evidence/build-pipeline.md](evidence/build-pipeline.md) — tsdown vs tsup, bundling strategy, shebang handling
- [evidence/monorepo-publishing.md](evidence/monorepo-publishing.md) — publishing patterns, scope, local testing
- [evidence/mcp-tool-delivery.md](evidence/mcp-tool-delivery.md) — MCP transport, tools, resources, auto-install

### External Sources
- [Commander.js v14](https://github.com/tj/commander.js) — CLI framework
- [yaml v2](https://github.com/eemeli/yaml) — YAML parser with comment preservation
- [Zod](https://zod.dev/) — TypeScript-first schema validation
- [tsdown](https://github.com/nicolo-ribaudo/tsdown) — Rolldown-powered TypeScript build tool
- [Hocuspocus](https://tiptap.dev/hocuspocus/) — CRDT collaboration server
- [sirv](https://github.com/lukeed/sirv) — Lightweight static file server
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) — Model Context Protocol TypeScript SDK

### Project Sources
- `evidence/runtime-decision-bun-node.md` — Prior decision: Node.js for distribution, Bun for development
- `STORIES.md` lines 228-263 — Bucket 6 CLI stories (T6.1, T6.2)
- `PROJECT.md` lines 259-277 — CLI integration requirements
