# Open Knowledge

Bun monorepo (`bun@1.3.11`) — CRDT collaboration server + editor, packaged as `@inkeep/open-knowledge` CLI.

## Monorepo Structure

```
packages/
  core/    — @inkeep/open-knowledge-core (shared extensions, types, utils)
  server/  — @inkeep/open-knowledge-server (Hocuspocus server library)
  cli/     — @inkeep/open-knowledge (published CLI + MCP)
  app/     — React editor frontend (private)
docs/      — Next.js docs site (Fumadocs)
```

## Commands

```bash
bun install                          # Install all workspace dependencies
cd packages/app && bun run dev       # Start dev server (Vite + Hocuspocus on port 5173)
cd packages/cli && bun run build     # Build CLI (tsdown → dist/)
```

### Quality gates

```bash
bun run lint                         # Biome lint across all packages
bun run format                       # Biome format across all packages
cd packages/<pkg> && bunx tsc --noEmit  # Typecheck per package
cd packages/<pkg> && bun test           # Unit tests per package
```

### Agent simulator (requires dev server running)

```bash
cd packages/app
bun run src/server/agent-sim.ts                      # Single agent write
bun run src/server/agent-sim.ts --rapid 5            # 5 writes, 100ms apart
bun run src/server/agent-sim.ts --markdown           # Markdown write
bun run src/server/agent-sim.ts --markdown --rapid 5 # 5 markdown writes
```

## Conventions

- ESM everywhere (`"type": "module"`)
- Biome for lint/format (config at root `biome.jsonc`)
- Tests co-located with source: `foo.test.ts` next to `foo.ts`
- TypeScript strict mode, `verbatimModuleSyntax: true`
- Workspace deps use `"workspace:*"` in package.json

## Package: core

Shared extensions, types, constants, and pure utility functions. **No React or Node.js server dependencies** — browser + Node compatible.

- `src/extensions/shared.ts` — sharedExtensions array (THE schema source of truth)
- `src/extensions/frontmatter.ts` — strip/prepend frontmatter for markdown round-trip
- `src/extensions/jsx-component.ts` — JsxComponent TipTap extension (schema + markdown, no React NodeView)
- `src/types/awareness.ts` — AwarenessState, AwarenessUser, ActivityEntry
- `src/constants/activity.ts` — Flash timing constants + eviction utils
- `src/utils/identity.ts` — getIdentity, generateRandomName, generateRandomColor

**Key constraint:** `sharedExtensions` MUST stay in sync between core, server, and app — drift causes silent data corruption.

## Package: server

Hocuspocus CRDT server library — persistence, file-watcher, agent sessions, and HTTP API.

```
Hocuspocus Server
├── Persistence Extension (CRDT → markdown → disk → git)
├── API Extension (onRequest hook — reads file index from watcher)
├── Agent Sessions (DirectConnection + UndoManager per agent)
├── Content Filter (gitignore + config exclude/include filtering)
└── File Watcher (@parcel/watcher — owns in-memory file index)
```

**File discovery:** The file watcher is the single source of truth for "what content files exist." It maintains a filtered in-memory index populated at startup and kept in sync via watcher events. The documents API reads from this index (no independent filesystem walk). Filtering uses `ContentFilter` which unions `.gitignore` rules with `config.content.exclude` patterns; exclusion supersedes inclusion.

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/agent-write` | Agent write via Y.Text |
| POST | `/api/agent-write-md` | Agent markdown write via Y.Text |
| POST | `/api/agent-undo` | Undo last agent edit |
| POST | `/api/agent-redo` | Redo last undone agent edit |
| GET | `/api/agent-undo-status` | Check canUndo/canRedo |
| POST | `/api/test-reset` | Reset document (E2E test isolation) |

### Key files

- `src/standalone.ts` — `createServer()` factory
- `src/persistence.ts` — `createPersistenceExtension()` with configurable contentDir/projectDir
- `src/content-filter.ts` — `createContentFilter()` — unified gitignore + config exclude/include filtering
- `src/file-watcher.ts` — `startWatcher()` + in-memory file index (`WatcherHandle` with `getFileIndex()`)
- `src/agent-sessions.ts` — `AgentSessionManager` class
- `src/api-extension.ts` — HTTP API as Hocuspocus onRequest extension (reads file index from watcher)

## Package: cli

Commander.js v14 CLI published as `@inkeep/open-knowledge`.

### CLI Commands

| Command | Description |
|---------|-------------|
| `open-knowledge` / `open-knowledge start` | Start Hocuspocus server + serve React app |
| `open-knowledge init` | Scaffold `.open-knowledge/` and register MCP server in `.mcp.json` |
| `open-knowledge mcp` | Start MCP stdio server (disk-only or with optional Hocuspocus) |

### Config system

Hierarchical YAML in `.open-knowledge/` directories:
- `~/.open-knowledge/config.yml` — user-level defaults
- `./.open-knowledge/config.yml` — workspace-level overrides
- Precedence: CLI flags > ENV > workspace > user > Zod defaults

### Key files

- `src/cli.ts` — Commander.js entry point (shebang)
- `src/commands/start.ts` — start command (Hocuspocus + static assets)
- `src/commands/mcp.ts` — MCP stdio server command
- `src/config/schema.ts` — Zod config schema with defaults
- `src/config/loader.ts` — YAML config hierarchy loader

## Package: app

React editor frontend — TipTap WYSIWYG + CodeMirror source mode with real-time CRDT collaboration.

### Editor architecture

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here
├── Y.Text('source')          ← CodeMirror binds here via y-codemirror.next
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution side-channel

Observer A: XmlFragment → Text (incremental diff, origin: 'sync-from-tree')
Observer B: Text → XmlFragment (parse + updateYFragment, origin: 'sync-from-text')
```

### Presence & awareness

- Human cursors via CollaborationCursor (WYSIWYG) + yCollab (Source)
- Agent activity flash via Y.Map('activity') → CSS @keyframes
- Per-origin undo via server-side UndoManager
- Agent writes use `dc.document.transact(fn, 'agent-write')` (not `conn.transact()`)

### Dev mode

The Vite plugin (`src/server/hocuspocus-plugin.ts`) imports from `@inkeep/open-knowledge-server` — single `bun run dev` starts Vite + Hocuspocus + file watcher on port 5173.

### Key files

- `src/editor/TiptapEditor.tsx` — WYSIWYG editor, HocuspocusProvider
- `src/editor/SourceEditor.tsx` — CodeMirror 6 with y-codemirror.next
- `src/editor/observers.ts` — Bidirectional observer sync
- `src/presence/PresenceBar.tsx` — Presence bar component
- `src/presence/AgentUndoButton.tsx` — Undo agent edit button

## Research reports

`reports/` contains ~55 prior-art research reports on the tech stack, editor architecture, CRDT collaboration, search engines, MCP tool design, competitive landscape, and related topics. Each report has a `REPORT.md` synthesis and `evidence/` files. See `reports/CATALOGUE.md` for the full index.

## Changesets

```bash
bun run changeset        # Create a new changeset
bun run version          # Apply pending changesets
bun run release          # Publish to npm
```
