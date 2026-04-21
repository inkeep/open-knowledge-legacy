# CLI Packaging: @inkeep/open-knowledge

**Status:** Review
**Baseline commit:** 8da2c10
**Created:** 2026-04-08
**Research:** [reports/npm-global-cli-packaging/REPORT.md](../../reports/npm-global-cli-packaging/REPORT.md)

---

## 1. Problem Statement (SCR)

**Situation:** open-knowledge is a CRDT collaboration server + editor built as a Vite dev plugin spike (`init_spike/`). The server (Hocuspocus + persistence + file watcher + agent APIs) and client (React TipTap/CodeMirror editors + presence) are bundled in one workspace. It works locally via `bun run dev`.

**Complication:**
- No distribution path — users must clone the repo and run the dev server
- AI agents (Claude Code, Cursor) have no MCP integration — only manual HTTP calls
- Server/CLI and React/editor developers work in the same package — no parallel work separation
- Hardcoded paths and spike naming reflect prototyping, not a distributable product

**Resolution:** Restructure to `packages/` monorepo and extract the server into `@inkeep/open-knowledge` — a global npm CLI with Commander.js, hierarchical YAML config, standalone Hocuspocus server (with optional React frontend serving), and MCP tool delivery for AI clients.

---

## 2. Goals

1. **G1:** Users can `npx @inkeep/open-knowledge start` to run a local knowledge base with CRDT collaboration, persistence, and optional browser editor
2. **G2:** AI agents connect via MCP stdio (`open-knowledge mcp`) to read/write/search the knowledge base in real-time, seeing the same CRDT state as human editors
3. **G3:** Team members work in cleanly separated packages — `core` (shared schema/types), `server` (Hocuspocus library), `cli` (Commander.js CLI + MCP), `app` (React editor)
4. **G4:** Configuration via hierarchical YAML in `.open-knowledge/` directories (user-level + workspace-level)

## 3. Non-Goals

- **NEVER:** GUI/Electron packaging, Docker distribution<br>_[Corrected 2026-04-20 post-ship: the GUI/Electron clause is reversed — Electron distribution is now in scope via the parent Electron desktop spec. The Docker-distribution clause remains NEVER. Authoritative reconciliation in specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md D3.]_
- **NOT NOW:** Cloud/remote deployment (Streamable HTTP transport), plugin system, auto-update<br>_[Corrected 2026-04-20 post-ship: the auto-update clause needs scope-split — CLI auto-update stays NOT NOW per specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md D10; desktop app auto-update is LOCKED via electron-updater per the parent Electron desktop spec. Cloud/remote + plugin-system remain NOT NOW as stated.]_
- **NOT UNLESS** user count exceeds single-machine: daemon mode, background process management, multi-server orchestration

---

## 4. Personas

| Persona | Description | Primary journey |
|---------|-------------|----------------|
| **KB Author** | Runs the CLI to start editing locally | `npx @inkeep/open-knowledge init` → `open-knowledge start` → edit in browser |
| **AI Agent** | Claude Code, Cursor — connects via MCP | Spawned by client: `open-knowledge mcp` → read/write docs via tools |
| **Editor Dev** | Team member working on React components | Works in `packages/app/`, imports from `@inkeep/open-knowledge-core` |
| **Server Dev** | Team member working on server/CLI/MCP | Works in `packages/server/` or `packages/cli/`, imports from `@inkeep/open-knowledge-core` |

---

## 5. Architecture

### 5.1 Package Structure (4 packages)

```
open-knowledge/
  package.json                          # private: true, workspaces: ["packages/*", "docs"]
  packages/
    core/                               # @inkeep/open-knowledge-core (workspace dep, not published)
      package.json                      # private: true
      src/
        extensions/shared.ts            # sharedExtensions — THE schema source of truth
        extensions/frontmatter.ts       # stripFrontmatter, prependFrontmatter
        extensions/jsx-component.ts     # JsxComponent TipTap extension
        types/awareness.ts              # AwarenessState, ActivityEntry
        types/identity.ts               # Identity interface
        constants/activity.ts           # flash timing constants
        utils/markdown.ts               # MarkdownManager factory, getSchema wrapper
        utils/identity.ts               # getIdentity(), color/name generators (pure)
        index.ts                        # barrel export
      tsconfig.json
    server/                             # @inkeep/open-knowledge-server (workspace dep, not published initially)
      package.json                      # private: true (publish when external consumer exists)
      src/
        standalone.ts                   # Hocuspocus Server class setup (extracted from Vite plugin)
        api-extension.ts                # HTTP API endpoints as Hocuspocus onRequest extension
        agent-sessions.ts               # DirectConnection + UndoManager management
        persistence.ts                  # Y.Doc → markdown → disk → git (moved from init_spike)
        file-watcher.ts                 # @parcel/watcher disk bridge (moved from init_spike)
        index.ts                        # programmatic API: createServer(), createPersistenceExtension()
      tsconfig.json
    cli/                                # @inkeep/open-knowledge (published CLI)
      package.json                      # bin, exports, files, publishConfig
      src/
        cli.ts                          # Commander.js entry point (#!/usr/bin/env node)
        commands/start.ts               # start command — wraps server + static assets
        commands/mcp.ts                 # mcp command — stdio MCP adapter (WS client to server)
        mcp/
          server.ts                     # McpServer + StdioServerTransport setup
          tools.ts                      # MCP tool definitions (8 tools)
        config/
          schema.ts                     # Zod config schema with defaults
          loader.ts                     # YAML config hierarchy: user → workspace → env → CLI
        index.ts                        # programmatic API export
      tsdown.config.ts
    app/                                # private — React editor frontend
      package.json                      # private: true
      src/
        main.tsx
        App.tsx
        editor/                         # TiptapEditor, SourceEditor, observers
        presence/                       # PresenceBar, AgentUndoButton, hooks
        components/ui/                  # design system
        lib/utils.ts
      vite.config.ts                    # includes hocuspocus Vite plugin for dev mode
      index.html
  docs/                                 # Next.js docs site (unchanged)
```

### 5.1.1 Package dependency graph

```
@inkeep/open-knowledge (cli)
  ├── @inkeep/open-knowledge-server (workspace)
  │   └── @inkeep/open-knowledge-core (workspace)
  └── @inkeep/open-knowledge-core (workspace)

packages/app (private)
  ├── @inkeep/open-knowledge-core (workspace)
  └── @inkeep/open-knowledge-server (workspace, dev only — Vite plugin)
```

### 5.1.2 Dev mode

**Dev workflow:** `cd packages/app && bun run dev`

The Vite plugin from the current `init_spike/` stays in `packages/app/` for development. It imports the server library from `@inkeep/open-knowledge-server` (workspace link). This preserves the current single-process dev experience: one `bun run dev` starts Vite + Hocuspocus + file watcher on port 5173.

The React app's HocuspocusProvider URL is derived from `window.location` (not hardcoded):
```typescript
const wsUrl = `ws://${window.location.host}/collab`;
```
This makes the app work seamlessly with both Vite dev (port 5173) and standalone CLI (port 3000).

### 5.2 Runtime Architecture

```
┌─────────────────────────────────────────────────────┐
│  open-knowledge start --port 3000                   │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Hocuspocus Server (standalone)              │    │
│  │  ├── WebSocket /collab (CRDT sync)          │    │
│  │  ├── HTTP API (onRequest extension)         │    │
│  │  │   ├── POST /api/agent-write-md           │    │
│  │  │   ├── POST /api/agent-undo               │    │
│  │  │   ├── GET  /api/agent-undo-status        │    │
│  │  │   └── ...                                │    │
│  │  ├── Static assets (sirv — built React app) │    │
│  │  └── Extensions                             │    │
│  │      ├── Persistence (md → disk → git)      │    │
│  │      └── Agent sessions (DC + UndoManager)  │    │
│  └────────┬──────────────────────────┬─────────┘    │
│           │                          │              │
│  ┌────────▼────────┐   ┌────────────▼──────────┐   │
│  │ File Watcher     │   │ Content Directory     │   │
│  │ (@parcel/watcher)│◀──│ .md files + git       │   │
│  └─────────────────┘   └───────────────────────┘   │
└─────────────────────────────────────────────────────┘
        ▲ WS                    ▲ WS
        │                       │
┌───────┴────────┐    ┌────────┴──────────────┐
│ Browser Editor │    │ open-knowledge mcp    │
│ (packages/app) │    │ (stdio ←→ WS client)  │
│ HocuspocusProvider  │ McpServer (SDK v1.28) │
└────────────────┘    │ ├── read_document     │
                      │ ├── write_document    │
                      │ ├── edit_document     │
                      │ ├── list_documents    │
                      │ ├── search_documents  │
                      │ ├── undo_agent_edit   │
                      │ ├── redo_agent_edit   │
                      │ └── update_frontmatter│
                      └───────────────────────┘
                           ▲ stdio
                           │
                      Claude Code / Cursor
```

**Key architectural property:** One Hocuspocus server is the single CRDT source of truth. Browser editors and MCP agents are both WebSocket clients. MCP sees the same CRDT state as humans. Agent writes via MCP trigger the same flash UX and undo tracking as HTTP API writes.

### 5.3 MCP Architecture

The `open-knowledge mcp` command starts a **stdio MCP server** that:
1. Connects to the running Hocuspocus server as a WebSocket client (via `HocuspocusProvider` or `DirectConnection` over WS)
2. Exposes 8 tools to the AI client (read, write, edit, list, search, undo, redo, update_frontmatter)
3. Exposes document resources (`ok://docs/{path}`) with subscription support
4. Supports multiple agents connecting in parallel (each spawns their own `open-knowledge mcp` process, each connects to the same Hocuspocus server)

**MCP → Server connection:**
- The MCP process reads the server URL from config (default: `ws://localhost:3000`)
- Uses `HocuspocusProvider` to sync a Y.Doc per document
- Tool calls translate to Y.Doc mutations with `'agent-write'` origin
- The server's persistence pipeline picks up the mutations normally

**Conflict resolution:** When multiple agents write concurrently, Yjs CRDT handles merge automatically. The MCP server doesn't need special conflict resolution — Yjs is convergent by design. The server's per-origin UndoManager lets any agent undo its own writes without affecting others.

### 5.4 Config System

**Hierarchy (lowest → highest priority):**
```
Zod defaults → ~/.open-knowledge/config.yml → ./.open-knowledge/config.yml → ENV → CLI flags
```

**Schema (Zod with `.default()` on every field):**
```yaml
content:
  dir: ./content
  exclude: []
server:
  port: 3000
  host: localhost
git:
  enabled: true
  autosave: true
  commitDebounceMs: 30000
  wipRef: refs/wip/main
persistence:
  debounceMs: 2000
  maxDebounceMs: 10000
editor:
  defaultMode: wysiwyg
```

**Parsing:** `yaml` v2 (comment preservation) + Zod validation + deep merge (arrays replaced, not concatenated).

### 5.5 CLI Commands

| Command | Description | Phase |
|---------|-------------|-------|
| `open-knowledge` (no args) | Start server (default command via `{ isDefault: true }`) | P0 |
| `open-knowledge start` | Explicit server start — Hocuspocus + static React assets | P0 |
| `open-knowledge init [path]` | Scaffold `.open-knowledge/config.yml` + `content/` | Future (design TBD) |
| `open-knowledge mcp` | Start stdio MCP server (connects to running Hocuspocus) | P0 |
| `open-knowledge mcp install` | Auto-configure Claude Code / Cursor / Claude Desktop | P1 |
| `open-knowledge status` | Server health + document stats | P2 |
| `open-knowledge config` | View/set config values | P2 |

### 5.6 Build Pipeline

**CLI package (`packages/cli/`):**
- tsdown (Rolldown-powered) → ESM output in `dist/`
- Entry points: `src/cli.ts` (bin, shebang), `src/index.ts` (programmatic API)
- Externalize: `@parcel/watcher`, `simple-git` (native addons)
- Bundle: Yjs, Hocuspocus, ws, Commander, yaml, Zod (pure JS)

**Server package (`packages/server/`):**
- Plain `tsc` → ESM output in `dist/`
- Workspace dependency only (bundled into CLI by tsdown)

**App package (`packages/app/`):**
- Vite build → static assets in `dist/`
- CLI's `start` command locates these via a configured or conventional path

**Core package (`packages/core/`):**
- Plain `tsc` → ESM output in `dist/`
- Workspace dependency only (bundled into CLI by tsdown, imported by app)

---

## 6. In Scope

| # | Item | Type | Acceptance Criteria |
|---|------|------|---------------------|
| S1 | Monorepo restructure to `packages/` | Technical | Four packages exist: `core`, `server`, `cli`, `app`. All existing tests pass. `bun run dev` works from `packages/app/`. |
| S2 | Extract server from Vite plugin | Technical | `packages/server/src/standalone.ts` starts Hocuspocus without Vite. All 6 HTTP API endpoints work. WebSocket collab works. File watcher works. |
| S3 | Commander.js CLI entry point | Technical | `open-knowledge start` starts the server. `--port`, `--host`, `--help`, `--version` work. Config loaded via preAction hook. |
| S4 | YAML config system | Technical | User config (`~/.open-knowledge/config.yml`) and workspace config (`./.open-knowledge/config.yml`) load and deep-merge correctly. Zod validates with helpful errors. |
| ~~S5~~ | ~~`open-knowledge init` command~~ | ~~Product~~ | ~~Deferred — design TBD~~ |
| S6 | Static React app serving | Technical | `open-knowledge start` serves built React app from `packages/app/dist/`. Browser editor connects to WS and works. |
| S7 | MCP stdio server | Product | `open-knowledge mcp` starts stdio MCP server. Connects to running Hocuspocus. 8 tools work (read, write, edit, list, search, undo, redo, update_frontmatter). |
| S8 | tsdown build pipeline | Technical | `bun run build` in `packages/cli/` produces `dist/cli.js` (with shebang) + `dist/index.js` + `.d.ts` files. |
| S9 | Package publishing setup | Technical | `npm pack --dry-run` produces clean tarball. `npx .` runs the CLI. `publishConfig.access: public`. |
| S10 | Split CLAUDE.md | Technical | Each package has its own CLAUDE.md with relevant commands, architecture, and file listing. |

## 7. Future Work

| # | Item | Maturity | Trigger to revisit |
|---|------|----------|-------------------|
| F0 | `open-knowledge init` command | Identified | Design TBD — scaffolding config + content directory |
| F1 | `open-knowledge mcp install` | Explored | After MCP server is stable and tested with Claude Code |
| F2 | Streamable HTTP transport for cloud MCP | Identified | When NEXT (team) phase begins, remote access needed |
| F3 | `open-knowledge status` command | Noted | When monitoring/observability needs arise |
| F4 | `open-knowledge config` command | Noted | When config editing outside file editors is needed |
| F5 | Changesets CI automation | Explored | When release cadence warrants automation or 2nd package published |
| F6 | MCP document resources with subscriptions | Identified | When clients support resource subscriptions well |

---

## 8. Requirements

### R1: Monorepo Restructure (S1)

**R1.1** Root `package.json` declares `"workspaces": ["packages/*", "docs"]`

**R1.2** `packages/core/` contains shared extensions, types, constants, and pure utility functions. No React dependencies. No Node.js server dependencies. Browser + Node compatible. `private: true`.

**R1.3** `packages/server/` contains Hocuspocus standalone server, persistence, file-watcher, agent sessions, API extension. Depends on `@inkeep/open-knowledge-core`. `private: true` (publish later when external consumer exists).

**R1.4** `packages/cli/` contains Commander.js CLI, config loading, MCP adapter. Depends on `@inkeep/open-knowledge-server` and `@inkeep/open-knowledge-core`. `private: false`, publishable as `@inkeep/open-knowledge`.

**R1.5** `packages/app/` contains React editor, presence, design system, Vite plugin (for dev mode). Depends on `@inkeep/open-knowledge-core` and `@inkeep/open-knowledge-server` (dev). `private: true`.

**R1.6** All existing tests pass after restructure — unit tests in each package, E2E tests from `packages/app/`.

**R1.7** Each package has its own CLAUDE.md, tsconfig.json, and biome config (or extends root).

**R1.8** React app's HocuspocusProvider URL derived from `window.location.host` (not hardcoded to port 5173).

### R2: Server Extraction (S2)

**R2.1** `packages/server/src/standalone.ts` uses Hocuspocus `Server` class (not manual `ws` + `handleUpgrade`). Single port for HTTP + WebSocket.

**R2.2** API endpoints extracted into `api-extension.ts` using Hocuspocus `onRequest` hook. Same endpoints, same behavior as current Vite plugin.

**R2.3** Agent session management extracted into `agent-sessions.ts` — `getAgentSession()`, `closeAgentSession()`, per-origin UndoManager. Used by API extension (server) and Vite plugin (app dev mode).

**R2.4** Content directory path comes from config (not `import.meta.dirname` relative path).

**R2.5** Graceful shutdown: `SIGINT`/`SIGTERM` → `server.destroy()` (flushes documents, closes connections).

### R3: CLI (S3)

**R3.1** Commander.js v14. `start` is the default command (`{ isDefault: true }`).

**R3.2** `preAction` hook loads YAML config and merges with Commander's source tracking: CLI > ENV > workspace config > user config > Zod defaults.

**R3.3** Global options: `--cwd`, `--log-level`. Start options: `--port`, `--host`, `--open`.

**R3.4** `await program.parseAsync()` for async action handlers.

**R3.5** Startup banner shows version, local URL, network URL, keybinding hint.

### R4: Config System (S4)

**R4.1** Two fixed locations: `~/.open-knowledge/config.yml` (user), `./.open-knowledge/config.yml` (workspace).

**R4.2** Deep merge with array replacement. Workspace leaf values override user leaf values.

**R4.3** `yaml` v2 for parsing (comment preservation). Zod for validation with `.default()` on every field.

**R4.4** Invalid config produces structured error messages with path + issue per field.

### ~~R5: Init Command (S5) — Deferred (design TBD)~~

### R6: Static Asset Serving (S6)

**R6.1** `open-knowledge start` serves pre-built React app from a known location (relative to CLI package or configured path).

**R6.2** Uses `sirv` with SPA fallback (`single: true`), gzip, immutable caching for hashed Vite assets.

**R6.3** Static serving is an `onRequest` extension with lower priority than the API extension — API routes take precedence.

### R7: MCP Server (S7)

**R7.1** `open-knowledge mcp` starts a stdio MCP server using `@modelcontextprotocol/sdk` v1.28+.

**R7.2** MCP server connects to running Hocuspocus as a WebSocket client (URL from config, default `ws://localhost:3000`).

**R7.3** 8 tools registered with Zod schemas and tool annotations:
- `read_document` (readOnly)
- `write_document` (modes: append, prepend, replace)
- `edit_document` (surgical find-replace, supports dry_run)
- `list_documents` (directory listing with frontmatter)
- `search_documents` (grep-like text search)
- `undo_agent_edit` (per-origin undo via server API)
- `redo_agent_edit` (per-origin redo via server API)
- `update_frontmatter` (Y.Map mutation)

**R7.4** Multiple MCP processes can connect in parallel. Each uses `'agent-write'` transaction origin. Yjs CRDT handles concurrent mutations.

**R7.5** All diagnostic logging goes to `stderr` (stdout is the MCP protocol wire).

**R7.6** Undo/redo tools invoke the server's HTTP API (`POST /api/agent-undo`, `POST /api/agent-redo`) — simplest path since the server already exposes these endpoints.

**R7.7** When the server is not running, MCP exits immediately with a clear error on stderr: `"Server not running at ws://localhost:3000. Start it with: open-knowledge start"`. No retry/backoff — the client (Claude Code) handles respawning.

### R8: Build Pipeline (S8)

**R8.1** tsdown config with ESM output, `deps.neverBundle` for native addons.

**R8.2** CLI entry has `#!/usr/bin/env node` shebang (auto-detected by tsdown from source).

**R8.3** `dist/cli.js` (bin entry) + `dist/index.js` (programmatic API) + `.d.ts` declarations.

**R8.4** `engines: { "node": ">=22" }` in package.json.

### R9: Publishing (S9)

**R9.1** `package.json` with `name: @inkeep/open-knowledge`, `bin`, `exports`, `files: ["dist"]`, `publishConfig: { access: "public" }`.

**R9.2** `prepublishOnly: "bun run build && bun run test"` gate.

**R9.3** `npm pack --dry-run` produces clean tarball with only `dist/` + standard files.

---

## 9. Proposed Implementation Order

| Phase | Items | Rationale |
|-------|-------|-----------|
| **Phase 1: Structure** | S1 (monorepo), S10 (CLAUDE.md) | Foundation — unblocks parallel work immediately |
| **Phase 2: Server** | S2 (extraction), S3 (CLI), S4 (config) | Core functionality — server runs standalone |
| **Phase 3: Distribution** | S6 (static assets), S8 (build), S9 (publish) | Publishable package |
| **Phase 4: MCP** | S7 (MCP server) | Agent integration — depends on running server |

---

## 10. Decision Log

| # | Decision | Type | Status | Confidence | Rationale |
|---|----------|------|--------|------------|-----------|
| D1 | Package name: `@inkeep/open-knowledge` | Product | LOCKED | HIGH | User decision. Uses existing `@inkeep` npm org. Shell command: `open-knowledge`. |
| D2 | Four-package structure: core, server, cli, app | Technical | LOCKED | HIGH | User decision. Server is a reusable library; CLI is a thin wrapper. Core prevents schema drift. Server stays private until external consumer exists. |
| D3 | CLI framework: Commander.js v14 | Technical | LOCKED | HIGH | User decision. Matches @inkeep/agents-cli. |
| D4 | Config format: YAML in `.open-knowledge/` dirs | Product | LOCKED | HIGH | User decision. Two fixed locations + deep merge. |
| D5 | Build tool: tsdown | Technical | DIRECTED | HIGH | Research finding — tsup unmaintained. Implementer may fall back to tsup if tsdown beta causes issues. |
| D6 | MCP connects to running server (not embedded) | Technical | LOCKED | HIGH | User decision. Single Hocuspocus = single CRDT truth. MCP is a thin WS client adapter. |
| D7 | CLI serves React frontend in production | Product | LOCKED | HIGH | User decision. `open-knowledge start` serves built app via sirv. |
| D8 | MCP transport: stdio | Technical | LOCKED | HIGH | Standard for local CLI MCP servers. Claude Code, Cursor, Windsurf all use this. |
| D9 | YAML parser: yaml v2 (eemeli) | Technical | DELEGATED | HIGH | Comment preservation, YAML 1.2, zero deps. Implementer may choose js-yaml if yaml v2 causes issues. |
| D10 | Schema validation: Zod | Technical | LOCKED | HIGH | Already in ecosystem (@inkeep/agents-cli). `.default()` + `safeParse()` pattern. |
| D11 | `dev` command is local-only | Product | LOCKED | HIGH | User decision. Not part of the distributed CLI. Dev workflow is `cd packages/app && bun run dev`. |
| D12 | Dev mode keeps Vite plugin in packages/app/ | Technical | LOCKED | HIGH | Preserves single-process dev experience. Plugin imports server library from workspace. |
| D13 | MCP undo/redo calls server HTTP API | Technical | DIRECTED | HIGH | Simplest path — server already exposes the endpoints. Implementer may switch to WS-based if HTTP is problematic. |
| D14 | MCP errors immediately if server not running | Product | LOCKED | HIGH | Clear error message on stderr. No retry — client handles respawning. |
| D15 | WS URL derived from window.location | Technical | LOCKED | HIGH | Enables app to work with both Vite dev (5173) and standalone CLI (3000). One-line fix. |

---

## 11. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ1 | How does `packages/app/` Vite dev mode connect to the server? | Technical | P0 | **RESOLVED → D12.** Vite plugin stays in packages/app/ for dev. Single-process dev experience preserved. |
| OQ2 | Should `packages/core/` be published to npm? | Technical | P0 | **RESOLVED → D2.** Workspace-only dep. Private. No npm publishing until external consumer exists. |
| OQ3 | How does the CLI locate built React assets? | Technical | P0 | **RESOLVED.** Conventional path relative to monorepo root (e.g., `../app/dist/`). Configurable via `config.yml` for non-monorepo installs. Implementer determines exact resolution. |
| OQ4 | How does MCP invoke agent undo/redo? | Technical | P0 | **RESOLVED → D13.** HTTP call to server's existing `/api/agent-undo` and `/api/agent-redo` endpoints. |
| OQ5 | MCP behavior when server isn't running? | Product | P0 | **RESOLVED → D14.** Error immediately with clear message on stderr. No retry. |
| OQ6 | Should `@modelcontextprotocol/sdk` be a direct or peer dependency? | Technical | P2 | **RESOLVED.** Direct dependency — MCP is a core feature, not optional. |

---

## 12. Assumptions

| # | Assumption | Confidence | Verification plan | Expiry |
|---|-----------|------------|-------------------|--------|
| A1 | Hocuspocus `Server` class works as documented in v4.0.0-rc.1 | MEDIUM | Build S2 and verify. RC may have undocumented gaps. | Phase 2 start |
| A2 | tsdown handles the project's dependency graph correctly | MEDIUM | Build S8 and verify. Beta tool — may need fallback to tsup. | Phase 3 start |
| A3 | HocuspocusProvider can connect MCP process to running server over WS | HIGH | Standard usage pattern. Verify at S7 start. | Phase 4 start |
| A4 | Bun workspaces resolve cross-package imports correctly for dev | HIGH | Bun 1.3.11 supports workspaces. Verify at S1 completion. | Phase 1 end |

---

## 13. Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|-----------|
| K1 | Hocuspocus v4 RC has undocumented Server class gaps | Medium | Fallback: manual `node:http` + `ws` setup (current approach, just extracted) |
| K2 | tsdown beta produces broken output for this dep graph | Low | Fallback: tsup (identical config patterns) |
| K3 | Shared extensions in core diverge from app/server usage | High | Single `sharedExtensions` array in core — both packages import it. CI test catches drift. |
| K4 | Static asset serving adds significant CLI package size | Medium | Built React assets may be 5-15MB. Acceptable for a local tool. Monitor with `npm pack --dry-run`. |
| K5 | MCP ↔ Hocuspocus WS connection drops during long agent sessions | Low | HocuspocusProvider has built-in reconnection. MCP tools should handle disconnected state gracefully. |

---

## 14. Agent Constraints

### SCOPE
- `packages/core/` — new package, shared extensions + types + utils
- `packages/server/` — new package, Hocuspocus standalone + persistence + file-watcher + agent sessions
- `packages/cli/` — new package, Commander.js CLI + config + MCP adapter (published as @inkeep/open-knowledge)
- `packages/app/` — new package, React editor + presence + design system + Vite plugin (moved from init_spike)
- `package.json` (root) — add workspaces
- `init_spike/` — source of migration, removed after complete

### EXCLUDE
- `docs/` — unchanged
- `reports/` — unchanged
- `.github/` — unchanged (CI updates are future work)
- `evidence/` (root) — unchanged project-level evidence

### STOP_IF
- Hocuspocus `Server` class doesn't support `onRequest` hook as documented → investigate alternative HTTP server approach
- Cross-package import resolution fails in Bun workspaces → investigate tsconfig paths or package.json exports
- Built React assets exceed 50MB → investigate code splitting or separate distribution

### ASK_FIRST
- Any change to the MCP tool surface (adding/removing/renaming tools)
- Any change to the config schema shape
- Any change to the package naming or scope
