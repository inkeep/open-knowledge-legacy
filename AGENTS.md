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
cd docs && bun run dev               # Start docs dev server (Next.js + Fumadocs)
bun run build                        # Build all packages via turbo (cli, app, docs)
```

### Quality gates

```bash
bun run check                        # Full gate: typecheck (turbo) + lint (biome) + test (turbo)
bun run check:fast                   # Typecheck + lint only (skips tests)
bun run typecheck                    # Typecheck all packages via turbo
bun run lint                         # Biome check (lint + format + imports) across workspace
bun run format                       # Biome check --write (auto-fix lint + format + imports)
bun run test                         # Run tests across workspace via turbo
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

### Resolving `bun.lock` merge conflicts

`bun.lock` is a binary-ish file that cannot be merged textually. When rebasing or merging produces a conflict in `bun.lock`, do **not** attempt to hand-edit it. Instead:

```bash
git checkout main -- bun.lock   # accept the target branch's lockfile
bun install                     # regenerate with your branch's dependency changes
git add bun.lock
git rebase --continue           # (or git merge --continue)
```

Bun does not yet auto-resolve lockfile conflicts (tracked in [oven-sh/bun#17717](https://github.com/oven-sh/bun/issues/17717)), so this manual step is required.

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
├── API Extension (onRequest hook for HTTP endpoints)
├── Agent Sessions (DirectConnection + UndoManager per agent)
└── File Watcher (@parcel/watcher disk bridge)
```

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
- `src/file-watcher.ts` — `startWatcher()` + writeTracker
- `src/agent-sessions.ts` — `AgentSessionManager` class
- `src/api-extension.ts` — HTTP API as Hocuspocus onRequest extension

## Package: cli

Commander.js v14 CLI published as `@inkeep/open-knowledge`.

### CLI Commands

| Command | Description |
|---------|-------------|
| `open-knowledge` / `open-knowledge start` | Start Hocuspocus server + serve React app |
| `open-knowledge mcp` | Start MCP stdio server (connects to running server) |

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

## Research references

See `reports/CATALOGUE.md` for the full index. Key reports:

- `reports/npm-global-cli-packaging/` — CLI packaging research (7 dimensions)
- `reports/auto-persistence-version-history-patterns/` — Auto-persistence and version history
- `reports/bun-module-resolution-extensions/` — Bun module resolution extensions
- `reports/onboarding-multiproject-ux/` — Onboarding multiproject UX

## Changesets

```bash
bun run changeset        # Create a new changeset
bun run version          # Apply pending changesets
bun run release          # Publish to npm
```
## Code Style

- React Compiler is enabled for this repo. Do not add `forwardRef`, `memo`, `useMemo`, or `useCallback`; rely on the compiler unless a maintainer explicitly requests an exception
- Use `use()` instead of `useContext()` (React 19 pattern)
