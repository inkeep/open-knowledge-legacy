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
cd packages/cli && bun run build     # Build CLI only (tsdown → dist/)
```

### Quality gates

```bash
bun run check                        # THE gate — lint + typecheck + unit + integration + fidelity (~20-30s warm)
bun run check:full:parallel          # Full suite: check + stress + fuzz + e2e (turbo parallel, ~2 min warm)
bun run lint                         # Biome check (lint + format + imports) across workspace
bun run format                       # Biome check --write (auto-fix lint + format + imports)
cd packages/<pkg> && bunx tsc --noEmit  # Typecheck per package
cd packages/<pkg> && bun test           # Unit tests per package
```

`bun run check`** is the canonical quality gate for agents and developers.** Run it after every implementation iteration. It composes `biome check .` + `turbo run typecheck test test:integration test:conversion test:fidelity` — lint, typecheck, unit tests, integration (bridge-matrix), conversion fidelity, and round-trip fidelity invariants. Each tier has its own turbo task with independent cache keys — editing one test file re-runs only its tier, not the entire gate. Warm replay when nothing changed is \\<50ms.

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

### Architectural precedents (greenfield directive, 2026-04-13)

These are patterns that ALL work in the repo should follow. Established during the collaboration-capabilities audit (`stories/collaboration-capabilities-audit/STORY.md §13`).

1. **Typed transaction origins.** All Y.Doc transaction origins use `LocalTransactionOrigin` objects, never raw strings. One convention. Applies to: observer origin guards, agent-write origins, rollback origins, any future origin.
2. **Generic primitives over specific ones.** Name primitives for extensibility: `safetyCheckpoint({ action, context })` not `emitPreRollbackSnapshot()`. The first caller is one use case; the primitive serves many.
3. **Structured event schemas.** Activity-map entries carry `{ actor, timestamp, action: {kind, metadata}, visibility }` — any coarse collaborative action fits the shape. Don't grow ad-hoc fields.
4. **Shared computation, per-surface rendering.** Logic that determines *what* to render (e.g., which lines to flash) lives in one shared module. Per-surface code (WYSIWYG decorations, CodeMirror decorations) only applies the result. Prevents divergence-by-copy-paste.
5. **Contract-first MCP tools.** We define the MCP protocol; clients conform. Required parameters are required, not optional-with-fallback. Document the contract.
6. **Mode state as enums.** Editor state machines use enums (`'wysiwyg' | 'source' | 'diff'`), not boolean flags that implicitly encode state. Booleans don't scale past 2 states.
7. **Remove broken capabilities rather than shipping them.** A confidently-broken UI is worse than the absence of capability. If a feature scaffold is known to malfunction, remove it; don't ship it alongside the product.
8. **Separate long-lived identity from short-lived session concerns.** Agent identity (who is this?) is long-lived — stable across conversations, derived from MCP connection primitives. Pass boundaries (what did they do in this burst?) are short-lived — derived from the product's own edit-history model (user-action-bounded grouping). Don't conflate them. See `stories/collaboration-capabilities-audit/ §14`.

### Resolving `bun.lock` merge conflicts

`bun.lock` is a binary-ish file that cannot be merged textually. When rebasing or merging produces a conflict in `bun.lock`, do **not** attempt to hand-edit it. Instead:

```bash
git checkout <base-branch> -- bun.lock   # accept the base branch's lockfile
bun install                              # regenerate with your branch's dependency changes
git add bun.lock
git rebase --continue                    # (or git merge --continue)
```

Where `<base-branch>` is whichever branch you're rebasing onto or merging from (e.g. `main`, `feat/init-spike`).

Bun does not yet auto-resolve lockfile conflicts (tracked in [oven-sh/bun#17717](https://github.com/oven-sh/bun/issues/17717)), so this manual step is required.

## Package: core

Shared extensions, types, constants, and pure utility functions. **No React or Node.js server dependencies** — browser + Node compatible.

- `src/markdown/` — unified + remark pipeline (see "Markdown Pipeline" below)
- `src/extensions/shared.ts` — sharedExtensions array (THE schema source of truth)
- `src/extensions/frontmatter.ts` — strip/prepend frontmatter utilities for observer sync (Y.Text ↔ Y.Map bridge)
- `src/extensions/jsx-component.ts` — JsxComponent TipTap extension (schema only; markdown dispatch via `markdown/handlers.ts`)
- `src/extensions/list.ts` — Unified list + listItem extension wrapping prosemirror-flat-list (D15)
- `src/extensions/escape-mark.ts` — EscapeMark PM mark for backslash-escape preservation (D20)
- `src/extensions/*-fidelity.ts` — Source-text fidelity extensions preserving markers, delimiters, styles, and raw forms (schema + attrs only; markdown dispatch moved to `markdown/handlers.ts`)
- `src/types/awareness.ts` — AwarenessState, AwarenessUser, ActivityEntry
- `src/constants/activity.ts` — Flash timing constants + eviction utils
- `src/utils/identity.ts` — getIdentity, generateRandomName, generateRandomColor

**Key constraint:** `sharedExtensions` MUST stay in sync between core, server, and app — drift causes silent data corruption.

## Package: server

Hocuspocus CRDT server library — persistence, file-watcher, agent sessions, shadow repo, and HTTP API.

```
Hocuspocus Server
├── Persistence Extension (CRDT → markdown → disk → shadow git)
├── API Extension (onRequest hook — reads file index from watcher)
├── Agent Sessions (DirectConnection + UndoManager per agent)
├── Content Filter (gitignore + config exclude/include filtering)
├── File Watcher (@parcel/watcher → chokidar fallback — owns in-memory file index)
├── HEAD Watcher (.git/HEAD → BatchBegin/BatchEnd lifecycle)
├── Shadow Repo (.git/openknowledge/ — attribution journal)
├── Reconciliation (three-way merge for external writes)
├── Shadow Branch GC (orphaned ref cleanup)
└── CC1 Broadcaster (pure-signal push over __system__ Y.Doc — derived-view invalidation)
```

### CC1 push-over-awareness (derived-view invalidation)

The CC1 broadcaster is the shared push primitive for derived views (file list, backlinks, future graph panels). Rather than each consumer polling its own REST endpoint, the server emits a pure signal (`{v:1, ch, seq}`) when the underlying data changes, and clients re-fetch the channel's canonical endpoint.

**Transport.** A dedicated `__system__` Y.Doc. The server pre-materializes it at startup via `hocuspocus.openDirectConnection('__system__')` so DiskEvents that arrive before any browser connects have a broadcast target. Every client opens `__system__` via `ProviderPool` on app mount; the signal is delivered via `Document#broadcastStateless(payload)`.

**Contract (v1).** `{v:1, ch:string, seq:number}`. `ch` is a flat kebab-case string (`'files'`, `'backlinks'`, `'graph'`); `seq` is per-channel monotonic from server startup. No event kind, no path, no docName — clients respond by re-fetching the channel's REST endpoint. Unknown `v` or unparseable payload: log at WARN + skip; never disconnect. See `packages/server/README.md` for the one-page contract reference.

**Coalescing.** 100 ms trailing-edge debounce per channel. A burst (e.g. `git checkout` of 200 files) collapses to a single signal.

**Channel ownership.** `ch:'files'` fires on `create | delete | rename` DiskEvents only (`update` / `conflict` do not change the file list). V0-3 will emit `ch:'backlinks'` from the backlink-index update path inside `persistence.ts`. Each channel's semantics are owned by its emitter.

**Cross-cutting skip surface.** `__system__` is not a content doc. Every subsystem that keys off `documentName` short-circuits via the single `isSystemDoc()` helper in `cc1-broadcast.ts`: persistence, file-watcher, content-filter, reconciliation, backlink-index, agent-sessions, external-change, frontmatter cache. Reserved-name policy: `ContentFilter` rejects `__system__.md` at admit time, and `POST /api/create-page` returns 400 on that name.

**Status.** Server-side primitive landed (PR #106). Client-side consumer (ProviderPool pin, `main.tsx` mount, `FileSidebar` subscriber, Playwright L2 test) lands in a follow-up.

**File discovery:** The file watcher is the single source of truth for "what content files exist." It maintains a filtered in-memory index populated at startup and kept in sync via watcher events. The documents API reads from this index (no independent filesystem walk). Filtering uses `ContentFilter` which unions `.gitignore` rules with `config.content.exclude` patterns; exclusion supersedes inclusion.

### Shadow repo & branch runtime

The shadow repo is a bare git repo at `.git/openknowledge/` (integrated mode) or `.openknowledge/` (standalone mode, no project `.git/`). It stores per-writer WIP refs, upstream-import commits, and checkpoint refs — never touches the project repo's ref namespace or object store.

**Branch-scoped state:** `reconciledBase` (the three-way merge base) is `Map<branch, Map<docName, string>>`. On branch switch, the active scope switches to the target branch's map. WIP refs are namespaced as `refs/wip/<branch>/<writer-id>`.

**Branch switch protocol:** On `BatchBegin` the server parks current Y.Doc in-memory state to shadow refs via `parkBranch()`. On `BatchEnd` with `cross-branch` kind, Y.Docs reset from disk, `reconciledBase` scope switches, and parked WIP from a prior visit is restored via three-way merge (`restoreBranchWIP`).

**Writer lock:** Only one active writer instance may mutate a given shadow root. The lock file at `<shadowDir>/lock` contains pid, hostname, startedAt, worktreeRoot. Stale locks from dead processes are auto-replaced.

### Server process lock

One `createServer()` instance at a time per content directory. The lock file at `<contentDir>/.open-knowledge/server.lock` contains `{ pid, hostname, port, startedAt, worktreeRoot }`. `acquireServerLock()` runs at the top of `createServer()` before any side effects; a live same-host PID holding the lock throws `ServerLockCollisionError`, stale locks (dead PID, different host, corrupt JSON) are replaced with a warning.

`port: 0` is the sentinel for "starting, not yet bound." CLI/Vite callers invoke `updateServerLockPort(lockDir, realPort)` after `http.listen()` resolves so MCP discovery reads the real port. The mutation is ownership-guarded — a process whose pid does not match refuses to rewrite.

`bun run dev` (Vite plugin) and `open-knowledge start` share this lock, so running both against the same content directory fails the second invocation fast. Different content directories are unaffected.

**CC8 shutdown ordering.** The server lock is the LAST thing released in `destroy()`. Phase ordering: (1) stop watchers, (2) drain agent sessions, (3) L1 flush, (4) L2 flush, (5) release shadow lock, (6) release server lock. Phase 6 runs inside a `try/finally` so a mid-shutdown throw still releases the lock — otherwise the next start would see a stale lock from a process that cleanly exited.

### Symlinks

Symlinks inside the content directory are fully supported. Design rationale and edge-case catalog: [reports/symlink-handling-file-sync-crdt/REPORT.md](reports/symlink-handling-file-sync-crdt/REPORT.md).

**Realpath-based identity.** The file watcher indexes by canonical path (`realpathSync`). Two paths resolving to the same inode (e.g. `CLAUDE.md` → `AGENTS.md`) share a single Y.Doc. The `aliasMap` on `WatcherHandle` maps alias docNames to their canonical counterpart.

**Symlink-preserving atomic writes.** Persistence resolves `realpath(requestedPath)` before writing, then places the tmp file next to the canonical target. `rename(tmp, canonical)` replaces content without touching symlinks along the chain (port of the `write-file-atomic` pattern).

**Escape-safe default.** If `realpath` resolves outside `contentDir`, the write is refused with a `symlink-escape` error. No allowlist config in this iteration.

**Broken symlink fallback.** If `realpath` throws `ENOENT` (target missing), persistence falls back to a direct write at the original path, creating a regular file.

**Cyclic symlink rejection.** `ELOOP` from `realpath` is propagated as an error. The startup walk uses a `visitedInodes` set to prevent infinite directory traversal.

**UI.** Alias entries in the file sidebar show a Link2 icon badge. Hovering displays a tooltip with the target path and canonical docName.

**Windows caveat.** Symlinks on Windows require Developer Mode, but the server only reads/traverses symlinks (never creates them), so no elevated privilege is needed.

**Known non-goals:** hardlink detection, UI for creating symlinks, cross-filesystem EXDEV handling, retroactive drift scanning, git-level symlink preservation.

### API Endpoints

| Method | Path                          | Purpose                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/document`               | Read live Y.Text state (bypasses persistence debounce; `?docName=` param) |
| POST   | `/api/agent-write`            | Agent write via Y.Text                                                    |
| POST   | `/api/agent-write-md`         | Agent markdown write via Y.Text (append/prepend/replace)                  |
| POST   | `/api/agent-patch`            | Targeted find/replace on live Y.Text — only matched span mutated          |
| POST   | `/api/agent-undo`             | Undo last agent edit (agent-write origin only)                            |
| POST   | `/api/agent-redo`             | Redo last undone agent edit                                               |
| GET    | `/api/agent-undo-status`      | Check canUndo/canRedo                                                     |
| POST   | `/api/test-reset`             | Reset document (E2E test isolation, `?docName=` param)                    |
| POST   | `/api/save-version`           | Save Version — project repo commit + shadow checkpoint                    |
| GET    | `/api/metrics/reconciliation` | Reconciliation counters (reconcile, conflict, batch, branch switch, park) |
| GET    | `/api/rescue`                 | List rescue buffers (dirty docs from deleted/branch-switched files)       |
| GET    | `/api/rescue/:docName`        | Retrieve a specific rescue buffer (text/markdown)                         |

### Key files

- `src/standalone.ts` — `createServer()` factory; wires HEAD watcher callbacks (park on BatchBegin, reconcile/restore on BatchEnd)
- `src/persistence.ts` — `createPersistenceExtension()`; branch-scoped `reconciledBase` (`Map<branch, Map<docName, string>>`), batch-in-progress gating
- `src/shadow-repo.ts` — `initShadowRepo()`, `commitWip()`, `commitUpstreamImport()`, `parkBranch()`, `readParkedState()`, `saveVersion()`
- `src/shadow-lock.ts` — `acquireLock()` / `releaseLock()` for exclusive shadow-root writer access
- `src/server-lock.ts` — `acquireServerLock()` / `updateServerLockPort()` / `readServerLock()` / `releaseServerLock()` + `ServerLockCollisionError`. One server per contentDir; advertises real port for MCP discovery
- `src/process-alive.ts` — `isProcessAlive(pid)` shared between shadow-lock and server-lock
- `src/head-watcher.ts` — `startHeadWatcher()`; tracks `lastKnownBranch`, classifies `BatchKind` (within-branch / cross-branch / detached-head)
- `src/shadow-branch-gc.ts` — `gcShadowBranches()` — orphaned WIP ref cleanup with 24h grace period, branch rename detection
- `src/reconciliation.ts` — `reconcile()` — three-way merge dispatcher (noop / clean / merged / conflicts / refused)
- `src/file-watcher.ts` — `startWatcher()` + writeTracker; emits `DiskEvent` unions (create / update / delete / rename / conflict)
- `src/metrics.ts` — in-memory counters: reconcile, conflict, batch, upstreamImport, rescueBuffer, branchSwitch, park
- `src/external-change.ts` — `applyExternalChange()` (throwing) + `createExternalChangeHandler()` (error-swallowing wrapper); unified disk→CRDT bridge for both CLI and dev plugin
- `src/agent-sessions.ts` — `AgentSessionManager` class
- `src/api-extension.ts` — HTTP API; includes save-version, rescue buffer, and metrics endpoints
- `src/cc1-broadcast.ts` — `CC1Broadcaster` + `isSystemDoc()` helper; pure-signal push over `__system__` Y.Doc (contract v1, 100 ms debounce)

## Package: cli

Commander.js v14 CLI published as `@inkeep/open-knowledge`.

### CLI Commands

| Command | Description |
|---------|-------------|
| `open-knowledge` / `open-knowledge start` | Start Hocuspocus server + serve React app |
| `open-knowledge init` | Scaffold `.open-knowledge/` and register MCP server in `.mcp.json` |
| `open-knowledge mcp` | Start MCP stdio server (disk-only or connects to running Hocuspocus — port auto-discovered via `server.lock`) |

### Config system

Hierarchical YAML in `.open-knowledge/` directories:

- `~/.open-knowledge/config.yml` — user-level defaults
- `./.open-knowledge/config.yml` — workspace-level overrides
- Precedence: CLI flags > ENV > workspace > user > Zod defaults

### Output & color system

- `src/ui/colors.ts` — Semantic color helpers wrapping picocolors (error, warning, success, info, dim, accent)
- `src/ui/banner.ts` — Vite-style boxed startup banner (cli-boxes + picocolors)
- Respects `NO_COLOR`, `FORCE_COLOR` env vars and `--no-color`/`--color` CLI flags per no-color.org
- Color helpers import picocolors directly; `cli.ts` propagates `--no-color`/`--color` to env vars for other libraries in the dependency tree

### Key files

- `src/cli.ts` — Commander.js entry point (shebang), early color detection
- `src/commands/start.ts` — start command (Hocuspocus + static assets + colored output); calls `updateServerLockPort` post-listen; idempotent SIGINT/SIGTERM shutdown routed through `destroy()`
- `src/commands/mcp.ts` — MCP stdio server command; `discoverServerUrl()` reads `<contentDir>/.open-knowledge/server.lock` for zero-config port discovery. Precedence: `--port` override > live lock with port > 0 > disk-only fallback
- `src/config/paths.ts` — Shared `resolveContentDir(config, cwd)` / `resolveLockDir(contentDir)` so `start.ts` and `mcp.ts` cannot disagree on where the lock lives
- `src/ui/colors.ts` — Color scheme + semantic helpers
- `src/ui/banner.ts` — Startup banner rendering
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

### Theming

Dark/light/system theme via `next-themes` (class strategy). Key pieces:

- `index.html` inline script reads `localStorage('ok-theme-v1')` and sets `.dark` before React hydrates (FOUC prevention)
- `main.tsx` wraps the app in `<ThemeProvider>` (attribute `class`, default `system`)
- `src/components/ThemeToggle.tsx` — dropdown toggle in the editor header
- `SourceEditor.tsx` uses a CodeMirror `Compartment` to hot-swap `oneDark` theme on `resolvedTheme` change
- `globals.css` defines dark overrides via Tailwind's `.dark` selector for ProseMirror content, callouts, and custom components

### Dev mode

The Vite plugin (`src/server/hocuspocus-plugin.ts`) imports from `@inkeep/open-knowledge-server` — single `bun run dev` starts Vite + Hocuspocus + file watcher on port 5173. The plugin participates in the same `server.lock` as the published CLI, so `bun run dev` and `open-knowledge start` against the same content directory are mutually exclusive — the second invocation fails fast with `ServerLockCollisionError`.

### Key files

- `src/editor/TiptapEditor.tsx` — WYSIWYG editor, HocuspocusProvider
- `src/editor/SourceEditor.tsx` — CodeMirror 6 with y-codemirror.next
- `src/editor/observers.ts` — Bidirectional observer sync
- `src/components/ThemeToggle.tsx` — Dark/light/system theme toggle
- `src/presence/PresenceBar.tsx` — Presence bar component
- `src/presence/AgentUndoButton.tsx` — Undo agent edit button

## CRDT Bridge Architecture

The editor uses a **dual-representation** CRDT model: Y.XmlFragment (WYSIWYG via TipTap) and Y.Text (source mode via CodeMirror), connected by bidirectional observers.

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here (tree structure)
├── Y.Text('source')          ← CodeMirror binds here (flat string)
│
│  Observer A: XmlFragment → Y.Text  (origin: 'sync-from-tree')
│  Observer B: Y.Text → XmlFragment  (origin: 'sync-from-text')
│
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution
```

### Two invariants

1. **Bridge invariant:** `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` — must hold after every propagation path settles.
2. **Baseline invariant:** Observer A's `lastSyncedXmlMd` must match the current XmlFragment state. Staleness causes incorrect diffs. (See `observers.ts:244`)

### Propagation matrix (4 write surfaces x 3 read targets)

| Write Surface             | → Y.Text                         | → XmlFragment                | → Disk               |
| ------------------------- | -------------------------------- | ---------------------------- | -------------------- |
| W1: WYSIWYG (XmlFragment) | Observer A                       | (direct)                     | Persistence debounce |
| W2: Source (Y.Text)       | (direct)                         | Observer B                   | Persistence debounce |
| W3: Agent API             | CRDT sync (WebSocket)            | syncTextToFragment on server | Persistence debounce |
| W4: Disk (file watcher)   | applyExternalChange              | applyExternalChange          | (direct)             |
| Undo/Redo                 | UndoManager + syncTextToFragment | syncTextToFragment           | Persistence debounce |

### transaction.local semantics

- **Local transactions** (`transaction.local === true`): Mutations on the same Y.Doc instance. Observers fire for everything.
- **Remote transactions** (`transaction.local === false`): Arrive via HocuspocusProvider WebSocket sync. Observers SKIP these (origin guards prevent double-sync).
- **Critical:** Layer A unit tests use `transaction.local=true` — NOT the same code path as production.

### Observer A (XmlFragment → Y.Text)

- File: `packages/app/src/editor/observers.ts:247`
- Origin: `'sync-from-tree'`
- Uses `diffLines` to compute incremental delta between `lastSyncedXmlMd` and current XmlFragment markdown
- Debounced (DEBOUNCE\_MS=50ms) to coalesce rapid keystrokes
- Skips entirely for remote (non-local) transactions; refreshes `lastSyncedXmlMd` baseline only
- Updates `lastSyncedXmlMd` after every successful sync

### Observer B (Y.Text → XmlFragment)

- File: `packages/app/src/editor/observers.ts:342`
- Origin: `'sync-from-text'`
- Parses Y.Text markdown via `mdManager.parse()`, applies to XmlFragment via `updateYFragment()`
- Deferred while user is typing in WYSIWYG (TYPING\_DEFER\_MS=300ms)
- Early-exits if XmlFragment already serializes to the same markdown as Y.Text

### syncTextToFragment

- File: `packages/server/src/agent-sessions.ts`
- Called after every `um.undo()`, `um.redo()`, and agent write
- Parses Y.Text → ProseMirror JSON → `updateYFragment()` on the server doc
- **STOP:** Never write to Y.Text without calling `syncTextToFragment` afterward

### Origin-guard truth table

| Transaction Origin      | Observer A (tree→text)          | Observer B (text→tree) |
| ----------------------- | ------------------------------- | ---------------------- |
| `'sync-from-tree'`      | — (self)                        | SKIP                   |
| `'sync-from-text'`      | SKIP                            | — (self)               |
| `'agent-write'`         | Skip (remote; refresh baseline) | Sync normally          |
| `'file-watcher'`        | Sync normally                   | Sync normally          |
| `undefined` (WebSocket) | Sync normally                   | Sync normally          |

## Testing

### Test file naming convention

- `*.test.ts` — Bun test runner (unit, integration, stress). Auto-discovered by `bun test`.
- `*.e2e.ts` — Playwright E2E tests. Auto-discovered by `playwright.config.ts` (`testMatch: /.*\.e2e\.ts$/`). Run via `bun run test:stress:e2e`.
- **Do not use **`*.spec.ts` — Bun auto-discovers both `.test.ts` and `.spec.ts`, which causes collisions when Playwright files use `.spec.ts` (`@playwright/test`'s `test()` throws outside the Playwright runner).

### Test layers

| Layer       | Type                                                              | Location                                                                                                    | Command                                                    |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A           | Unit + stress                                                     | `packages/app/src/editor/observers.test.ts`, `tests/stress/observers.stress.{s1-s8-s9,s2,s4,s5-s6}.test.ts` | `bun run test` (unit), `bun run test:stress:*` (per-shard) |
| B           | HTTP + server-side CRDT                                           | `packages/app/tests/stress/stress-api.ts`                                                                   | `bun run tests/stress/stress-api.ts` (needs dev server)    |
| C           | Playwright E2E                                                    | `packages/app/tests/stress/crdt-stress.e2e.ts`, `tests/stress/ux-interactions.e2e.ts`                       | `bunx playwright test`                                     |
| D           | Fuzz                                                              | `packages/app/tests/stress/observers.fuzz.test.ts`                                                          | `STRESS_FUZZ_SEED=<seed> bun run test`                     |
| Integration | Tier 1 bridge matrix                                              | `packages/app/tests/integration/bridge-matrix.test.ts`                                                      | `bun run test`                                             |
| Fidelity    | PBT invariants (I1-I7) + CommonMark/GFM corpus + P0 entity/escape | `packages/app/tests/fidelity/`                                                                              | `bun run test:fidelity` (also in `bun run check`)          |

### Tier 1 integration harness

File: `packages/app/tests/integration/test-harness.ts`

- `createTestServer()` → spins up real Hocuspocus with HTTP/WebSocket on OS-assigned random port
- `createTestClient(port)` → connects HocuspocusProvider + wires `setupObservers()`
- `getFreePort()` → kernel-allocated port (Hocuspocus `Server.listen(0)` fails due to falsy guard)
- Server uses `debounce: 200` (not production 2s) for fast disk tests

### Writing a new integration test

```typescript
import { createTestServer, createTestClient, agentWriteMd, assertBridgeInvariant, wait } from './test-harness';

let server: TestServer;
beforeAll(async () => { server = await createTestServer(); });
afterAll(async () => { await server.cleanup(); });

test('my propagation test', async () => {
  await testReset(server.port);
  await wait(300);
  const client = await createTestClient(server.port);
  try {
    // Write via one surface, verify another
    await agentWriteMd(server.port, '# Test');
    await wait(500);
    expect(client.ytext.toString()).toContain('Test');
    assertBridgeInvariant(client.ytext, client.fragment);
  } finally {
    client.cleanup();
  }
});
```

### Per-test docName isolation

Integration tests use per-test docNames via `createTestClient(port)` which auto-generates `test-${randomUUID()}`. Tests are safe to run concurrently (`test.concurrent()`, multiple `bun test` processes in the same worktree) because:

1. Each test's Y.Doc is uniquely named and independent.
2. Observer A's typing-defer state is per-doc (`WeakMap<Y.Doc, TypingState>`).
3. `/api/test-reset` is scoped to a specific docName via `?docName=` query param.

**Exception:** tests that verify shared-state behavior (initial sync, test-reset semantics) explicitly pass `'test-doc'` and do not run concurrently with each other.

Client lifecycle is inside the test body via `try/finally` — NOT via `beforeEach/afterEach`. This is required for `test.concurrent()` correctness (the shared `let client` pattern races under concurrent mode).

### Observer bridge coverage

Changes to `observers.ts` (Observer A / Observer B / `applyUserDelta`) require **multi-client test coverage**, not just single-client tests. A remote peer's WYSIWYG edit can arrive as a Y.Text-only transaction during a local user's mid-sync on XmlFragment — this creates divergence states that single-client tests cannot reproduce. PR #43's multi-client test matrix proved this is a real production trigger. See the `applyUserDelta` JSDoc in `observers.ts` for the full explanation.

### Playwright policy

Playwright E2E tests run on every PR. The Playwright suite covers DOM-binding and user-interaction regressions that unit/integration tests cannot reach (e.g., TipTap NodeView rendering, CodeMirror key bindings, presence UI). Do not skip Playwright in CI; do not add Playwright tests for pure bridge-logic changes — those belong in `bridge-matrix.test.ts` and `observers.test.ts`.

### Fuzz replay

```bash
STRESS_FUZZ_SEED=42 bun test packages/app/tests/stress/observers.fuzz.test.ts
```

Fuzz tests write snapshots to `/tmp/fuzz-*` on failure for deterministic reproduction.

## Concurrent Development

### VITE_PORT for custom port

```bash
VITE_PORT=9999 bun run dev        # Dev server on port 9999 (strict: fails if taken)
bun run dev                        # Default port 5173 (not strict)
```

### Port isolation for tests

- **Tier 1 integration tests:** `getFreePort()` allocates kernel-assigned random ports. Zero coordination needed.
- **Playwright tests:** `VITE_PORT` env var passed via `playwright.config.ts` webServer command. Set `VITE_PORT=<random>` for concurrent runs.
- `reuseExistingServer: false` in playwright.config.ts prevents stale server contamination.

### Detecting stale dev servers

```bash
ps aux | grep vite                 # Find running Vite processes
lsof -i :5173                     # Check what's using default port
```

### Worktree isolation

Each worktree has its own content directory. The test harness creates a fresh `tmpDir` per test run — no shared state between worktrees.

**ProseMirror-model duplication in nested worktrees:** Worktrees at `.claude/worktrees/X/` are nested inside the parent repo directory. Bun resolves workspace packages (e.g., `@inkeep/open-knowledge-core`) by walking up the directory tree — finding the parent repo's `packages/core/` and its `node_modules/` first, not the worktree's. When the parent's `prosemirror-model` instance differs from the worktree's, `PmNode.fromJSON()` fails with "looks like multiple versions of prosemirror-model were loaded."

**Fix:** Run `bun install` from the worktree root to create worktree-local `node_modules/`. The dev server is unaffected (Vite `resolve.dedupe` handles it). For test files, prefer direct relative imports (`../../packages/core/src/...`) over workspace imports (`@inkeep/open-knowledge-core`). See `reports/bun-prosemirror-model-dedup/REPORT.md`.

### Multi-agent local workflows

This repo supports multiple agents (or agents + manual dev servers) running concurrently without coordination:

- **Two agents, same worktree:** Each bun process gets its own port (`getFreePort`), its own Hocuspocus tmpdir (`mkdtempSync`), its own Y.Docs, and its own module state.
- **Two agents, separate worktrees:** Stronger isolation via filesystem separation.
- **Agent running Playwright + developer running **`bun run dev`**:** Playwright config sets `OK_TEST_CONTENT_DIR` to an isolated tmpdir; the manual dev server uses the default `packages/content/`. No contention.

No environment variables must be set by hand for any of these scenarios.

## Known Pitfalls

### STOP rules

- **STOP:** Never write raw markdown to Y.Text without calling `syncTextToFragment()` afterward. The XmlFragment will be stale, breaking the bridge invariant.
- **STOP:** Always call `syncTextToFragment()` after `um.undo()` / `um.redo()`. Without it, Y.Text reverts but XmlFragment stays stale.
- **STOP:** Don't bypass `writeTracker` or `skipStoreHooks`. The write tracker prevents self-write feedback loops between persistence and file watcher. `skipStoreHooks` prevents persistence from re-saving a file we just loaded.
- **STOP:** Any new server-side subsystem that keys off `documentName` MUST call `isSystemDoc()` at its entry point (see `cc1-broadcast.ts`). Forgetting leaks state into the `__system__` pseudo-doc — e.g. a `.__system__.md` file on disk, a backlink-index entry, a reconciledBase entry. The L1 integration test (`packages/app/tests/integration/cc1-broadcast.test.ts`) asserts zero `__system__` state across every audited subsystem after broadcasts.

### WARN rules

- **WARN:** Markdown round-trip is not always stable. E.g., `## H\nP` normalizes to `## H\n\nP` (paragraph after heading gets a blank line). Test with `serialize(parse(md)) !== md` to find constructs that normalize.
- **WARN:** Observer A's `lastSyncedXmlMd` must be refreshed on ALL XmlFragment changes, not just user edits. A stale baseline produces incorrect diffs that destroy content.
- **WARN:** Layer A tests use `transaction.local=true`. This does NOT exercise the same code path as production where WebSocket updates arrive with `transaction.local=false`.
- **WARN:** `hocuspocus.configure({ extensions: [...] })` REPLACES the extensions array (object spread). Use `hocuspocus.configuration.extensions.push()` to add extensions without losing existing ones.

## Debug Tooling

### Observer instrumentation

Add logging to `observers.ts` to trace sync behavior:

```typescript
// In Observer A callback:
console.log('[Observer A]', { ytextLen: ytext.toString().length, fragLen: serializeFragment(fragment).length, lastSyncedLen: lastSyncedXmlMd.length });
```

### Round-trip stability check

```typescript
const roundTripped = mdManager.serialize(mdManager.parse(md));
if (roundTripped !== md) console.warn('Non-canonical markdown:', { original: md.length, roundTripped: roundTripped.length });
```

### Bridge invariant check

```typescript
const textNorm = stripTrailingWhitespace(ytext.toString());
const fragNorm = stripTrailingWhitespace(serializeFragment(fragment));
console.assert(textNorm === fragNorm, 'Bridge invariant violated');
```

### Fuzz replay for deterministic reproduction

```bash
STRESS_FUZZ_SEED=<seed-from-failure> bun test packages/app/tests/stress/observers.fuzz.test.ts
```

Check `/tmp/fuzz-*` for the snapshot of the failing state.

## Research references

`reports/` contains \~55 prior-art research reports on the tech stack, editor architecture, CRDT collaboration, search engines, MCP tool design, competitive landscape, and related topics. Each report has a `REPORT.md` synthesis and `evidence/` files. See `reports/CATALOGUE.md` for the full index. Key reports:

- `reports/npm-global-cli-packaging/` — CLI packaging research (7 dimensions)
- `reports/auto-persistence-version-history-patterns/` — Auto-persistence and version history
- `reports/bun-module-resolution-extensions/` — Bun module resolution extensions
- `reports/onboarding-multiproject-ux/` — Onboarding multiproject UX
- `reports/crdt-observer-bridge-latency-analysis/` — CRDT observer bridge latency analysis

## Storage-layer fidelity contract

**Storage never sanitizes; render-time layers do.** Raw HTML, backslash escapes, and all literal characters pass through the storage layer unchanged. XSS mitigation is a render-layer concern (DOMPurify in docs site, not in the CRDT/persistence pipeline).

### Seven fidelity invariants

| ID | Invariant                  | Description                                                        |
| -- | -------------------------- | ------------------------------------------------------------------ |
| I1 | Identity                   | `serialize(parse(md)) === md` for supported constructs             |
| I2 | Character preservation     | Every literal char in input appears in output — no entity encoding |
| I3 | Normalization canonicality | `f(f(x)) === f(x)` — double round-trip equals single round-trip    |
| I4 | Idempotence                | `serialize(parse(X))` applied twice produces identical output      |
| I5 | Layer A === Layer B        | mdManager path and Y.Doc path produce the same output              |
| I6 | Multi-client preservation  | Content survives Y.Doc state sync between clients                  |
| I7 | Cross-path consistency     | All write paths produce equivalent serialized output               |

### Irreducible gaps (by design)

- **NG1:** Blank-line count between blocks normalizes (ProseMirror schema limitation)
- **NG2:** GFM table column widths normalize
- **NG3:** Constructs outside our extension set (math `$$`, footnotes, alerts) are NOT semantically preserved
- **NG4:** No storage-layer HTML sanitization — raw HTML passes through unchanged
- **NG5:** HTML entity references (`&amp;` `&lt;` `&gt;`) in source markdown are decoded to literal characters on first parse and remain as literals — the entity form is not preserved
- **NG6:** Non-ambiguous backslash escapes (e.g., `\foo`) lose the backslash on round-trip — only CommonMark §2.4 structurally-ambiguous escapes are preserved via `escapeMark`
- **NG7:** MDX `---` inside a JSX block parses as `thematicBreak` — escape to `\---` or wrap in code fence
- **NG8:** Block-level GFM (tables, tasklists) inside inline `<Note>...</Note>` flattens to inline text — use `<Note>\n\n...\n\n</Note>` form for block children
- **NG9:** Unicode Private Use Area characters U+E000–U+E004 in source content are reserved as internal sentinels by `autolink-void-html-guard.ts` (R23 guard). U+E000 replaces `<` in protected patterns, U+E001 replaces `>`, U+E002 replaces `:` inside autolink URLs (defeats remark-gfm autolink-literal), U+E003 replaces `@` inside autolink URLs (defeats remark-gfm email autolink), U+E004 replaces `{` in unmatched brace positions (defeats remark-mdx expression parser). Source content containing these codepoints may be corrupted by the guard's restoration pass. These PUA characters are not assigned by Unicode and are rare in legitimate content; if encountered in real documents, the guard's sentinel bytes must be remapped to a less-contested PUA range.
- **NG10:** A thematicBreak at document start is normalized from `---` to `***` on serialize. `---` at document position 0 is indistinguishable from empty YAML frontmatter under `remark-frontmatter`; re-parsing `---\n\n<content>` tokenizes differently than `***\n\n<content>`, breaking idempotence (I3/I4/I5/I7). Non-doc-start thematicBreaks preserve `sourceRaw` faithfully. Implemented in `packages/core/src/markdown/to-markdown-handlers.ts:thematicBreak`.
- **NG11:** Documents consisting only of ignore-typed mdast nodes (yaml frontmatter, toml frontmatter, footnoteDefinition) receive a synthesized empty paragraph so the PM doc satisfies `doc.content: 'block+'`. Observed input like `---\n\n---` (empty YAML frontmatter) or a file containing only `[label]: url` reference definitions without body content round-trips to an empty document. Implemented in `packages/core/src/markdown/pipeline.ts:ensureNonEmptyDoc`.

### Markdown pipeline dependency discipline

- `@handlewithcare/remark-prosemirror` pinned to exact version `0.1.5` (no caret). A `bun patch` in `patches/` applies PR #3 fix (empty-text-node + NBSP whitespace preservation)
- `remark-mdx` trio (`remark-mdx`, `mdast-util-mdx`, `micromark-extension-mdxjs`) pinned as a coupled unit — bump all three together
- **Upgrade protocol:** Before bumping any dependency, re-run the 118-case fidelity probe (`tech-probes/r1-preflight-gate/`) and full invariant suite (`bun run test:fidelity`). Verify the remark-prosemirror patch still applies cleanly
- Failed patch surfaces at install time (fail-loud via `patchedDependencies`)
- **Pre-flight probe baseline:** 97/118 whitespace-only, 13/13 P0 entity/escape — see `tech-probes/r1-preflight-gate/REPORT.md`

### Markdown Pipeline — System Design

The markdown pipeline uses `unified + remark` for parsing and serialization, with `@handlewithcare/remark-prosemirror` bridging mdast ↔ ProseMirror.

**Parse direction:**

```
remark-parse → remark-frontmatter → remark-mdx → remark-directive →
remark-gfm → wiki-link micromark ext → [R23 autolink/void-HTML guard] →
position-slice walker → remarkProseMirror (handlers map mdast → PM JSON)
```

**Serialize direction:**

```
fromProseMirror (PM JSON → mdast) → remark-stringify + custom mdast-util-to-markdown handlers
```

**Handler tiers:**

- **Tier A (passthrough):** root, paragraph, text, blockquote, table/row/cell, image, inlineCode, delete, directives
- **Tier B (fidelity):** emphasis, strong, heading, code, thematicBreak, break, list, listItem — reads `node.data.*` from position-slice walker
- **Tier C (custom):** link/linkReference, definition (R12 override), html, MDX nodes, wikiLink

**Position-slice walker** (`position-slice.ts`): runs after all syntax extensions produce mdast, slices original source at `node.position.start.offset` to recover authoring-form delimiters (emphasis `*`/`_`, fence char, bullet marker, etc.). Attaches `node.data.sourceDelimiter`, `node.data.sourceFenceChar`, etc.

**D20 escapeMark:** PM-level mark applied to text runs whose source contained a backslash escape of a structurally-ambiguous char (`\#`, `\*`, `\_`, etc. per CommonMark §2.4). Position-slice walker tags, serialization handler re-emits the backslash.

**Key files:**

- `packages/core/src/markdown/pipeline.ts` — unified pipeline factory
- `packages/core/src/markdown/index.ts` — MarkdownManager wrapper (parse/serialize)
- `packages/core/src/markdown/handlers.ts` → `index.ts` — mdast→PM + PM→mdast handler tables
- `packages/core/src/markdown/to-markdown-handlers.ts` — fidelity-aware serialization overrides
- `packages/core/src/markdown/position-slice.ts` — source-form recovery walker
- `packages/core/src/markdown/wiki-link-micromark.ts` — micromark tokenizer for `[[Page]]` syntax
- `packages/core/src/markdown/autolink-void-html-guard.ts` — R23 regression fix
- `packages/core/src/markdown/mdast-augmentation.ts` — TypeScript type augmentation for custom mdast types

**Schema names (mdast-canonical, D16/D17):** `strong` (not bold), `emphasis` (not italic), `thematicBreak` (not horizontalRule). Unified `list` + `listItem` (not separate bulletList/orderedList/listItem).

## Changesets

```bash
bun run changeset        # Create a new changeset
bun run version          # Apply pending changesets
bun run release          # Publish to npm
```

## Code Style

- React Compiler is enabled for this repo. Do not add `forwardRef`, `memo`, `useMemo`, or `useCallback`; rely on the compiler unless a maintainer explicitly requests an exception
- Use `use()` instead of `useContext()` (React 19 pattern)
- In React components, prefer Tailwind CSS utility classes via `className` instead of inline `style` props. Only use inline styles when there is no practical Tailwind expression for the requirement
- Prefer existing shadcn components before building custom UI primitives. If the needed shadcn component is not installed yet, suggest installing it rather than reimplementing it from scratch



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
cd packages/cli && bun run build     # Build CLI only (tsdown → dist/)
```

### Quality gates

```bash
bun run check                        # THE gate — lint + typecheck + unit + integration + fidelity (~20-30s warm)
bun run check:full:parallel          # Full suite: check + stress + fuzz + e2e (turbo parallel, ~2 min warm)
bun run lint                         # Biome check (lint + format + imports) across workspace
bun run format                       # Biome check --write (auto-fix lint + format + imports)
cd packages/<pkg> && bunx tsc --noEmit  # Typecheck per package
cd packages/<pkg> && bun test           # Unit tests per package
```

`bun run check`\*\* is the canonical quality gate for agents and developers.\*\* Run it after every implementation iteration. It composes `biome check .` + `turbo run typecheck test test:integration test:conversion test:fidelity` — lint, typecheck, unit tests, integration (bridge-matrix), conversion fidelity, and round-trip fidelity invariants. Each tier has its own turbo task with independent cache keys — editing one test file re-runs only its tier, not the entire gate. Warm replay when nothing changed is \\<50ms.

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

### Architectural precedents (greenfield directive, 2026-04-13)

These are patterns that ALL work in the repo should follow. Established during the collaboration-capabilities audit (`stories/collaboration-capabilities-audit/STORY.md §13`).

1. **Typed transaction origins.** All Y.Doc transaction origins use `LocalTransactionOrigin` objects, never raw strings. One convention. Applies to: observer origin guards, agent-write origins, rollback origins, any future origin.
2. **Generic primitives over specific ones.** Name primitives for extensibility: `safetyCheckpoint({ action, context })` not `emitPreRollbackSnapshot()`. The first caller is one use case; the primitive serves many.
3. **Structured event schemas.** Activity-map entries carry `{ actor, timestamp, action: {kind, metadata}, visibility }` — any coarse collaborative action fits the shape. Don't grow ad-hoc fields.
4. **Shared computation, per-surface rendering.** Logic that determines *what* to render (e.g., which lines to flash) lives in one shared module. Per-surface code (WYSIWYG decorations, CodeMirror decorations) only applies the result. Prevents divergence-by-copy-paste.
5. **Contract-first MCP tools.** We define the MCP protocol; clients conform. Required parameters are required, not optional-with-fallback. Document the contract.
6. **Mode state as enums.** Editor state machines use enums (`'wysiwyg' | 'source' | 'diff'`), not boolean flags that implicitly encode state. Booleans don't scale past 2 states.
7. **Remove broken capabilities rather than shipping them.** A confidently-broken UI is worse than the absence of capability. If a feature scaffold is known to malfunction, remove it; don't ship it alongside the product.
8. **Separate long-lived identity from short-lived session concerns.** Agent identity (who is this?) is long-lived — stable across conversations, derived from MCP connection primitives. Pass boundaries (what did they do in this burst?) are short-lived — derived from the product's own edit-history model (user-action-bounded grouping). Don't conflate them. See `stories/collaboration-capabilities-audit/ §14`.

### Resolving `bun.lock` merge conflicts

`bun.lock` is a binary-ish file that cannot be merged textually. When rebasing or merging produces a conflict in `bun.lock`, do **not** attempt to hand-edit it. Instead:

```bash
git checkout <base-branch> -- bun.lock   # accept the base branch's lockfile
bun install                              # regenerate with your branch's dependency changes
git add bun.lock
git rebase --continue                    # (or git merge --continue)
```

Where `<base-branch>` is whichever branch you're rebasing onto or merging from (e.g. `main`, `feat/init-spike`).

Bun does not yet auto-resolve lockfile conflicts (tracked in [oven-sh/bun#17717](https://github.com/oven-sh/bun/issues/17717)), so this manual step is required.

## Package: core

Shared extensions, types, constants, and pure utility functions. **No React or Node.js server dependencies** — browser + Node compatible.

- `src/markdown/` — unified + remark pipeline (see "Markdown Pipeline" below)
- `src/extensions/shared.ts` — sharedExtensions array (THE schema source of truth)
- `src/extensions/frontmatter.ts` — strip/prepend frontmatter utilities for observer sync (Y.Text ↔ Y.Map bridge)
- `src/extensions/jsx-component.ts` — JsxComponent TipTap extension (schema only; markdown dispatch via `markdown/handlers.ts`)
- `src/extensions/list.ts` — Unified list + listItem extension wrapping prosemirror-flat-list (D15)
- `src/extensions/escape-mark.ts` — EscapeMark PM mark for backslash-escape preservation (D20)
- `src/extensions/*-fidelity.ts` — Source-text fidelity extensions preserving markers, delimiters, styles, and raw forms (schema + attrs only; markdown dispatch moved to `markdown/handlers.ts`)
- `src/types/awareness.ts` — AwarenessState, AwarenessUser, ActivityEntry
- `src/constants/activity.ts` — Flash timing constants + eviction utils
- `src/utils/identity.ts` — getIdentity, generateRandomName, generateRandomColor

**Key constraint:** `sharedExtensions` MUST stay in sync between core, server, and app — drift causes silent data corruption.

## Package: server

Hocuspocus CRDT server library — persistence, file-watcher, agent sessions, shadow repo, and HTTP API.

```
Hocuspocus Server
├── Persistence Extension (CRDT → markdown → disk → shadow git)
├── API Extension (onRequest hook — reads file index from watcher)
├── Agent Sessions (DirectConnection + UndoManager per agent)
├── Content Filter (gitignore + config exclude/include filtering)
├── File Watcher (@parcel/watcher → chokidar fallback — owns in-memory file index)
├── HEAD Watcher (.git/HEAD → BatchBegin/BatchEnd lifecycle)
├── Shadow Repo (.git/openknowledge/ — attribution journal)
├── Reconciliation (three-way merge for external writes)
└── Shadow Branch GC (orphaned ref cleanup)
```

**File discovery:** The file watcher is the single source of truth for "what content files exist." It maintains a filtered in-memory index populated at startup and kept in sync via watcher events. The documents API reads from this index (no independent filesystem walk). Filtering uses `ContentFilter` which unions `.gitignore` rules with `config.content.exclude` patterns; exclusion supersedes inclusion.

### Shadow repo & branch runtime

The shadow repo is a bare git repo at `.git/openknowledge/` (integrated mode) or `.openknowledge/` (standalone mode, no project `.git/`). It stores per-writer WIP refs, upstream-import commits, and checkpoint refs — never touches the project repo's ref namespace or object store.

**Branch-scoped state:** `reconciledBase` (the three-way merge base) is `Map<branch, Map<docName, string>>`. On branch switch, the active scope switches to the target branch's map. WIP refs are namespaced as `refs/wip/<branch>/<writer-id>`.

**Branch switch protocol:** On `BatchBegin` the server parks current Y.Doc in-memory state to shadow refs via `parkBranch()`. On `BatchEnd` with `cross-branch` kind, Y.Docs reset from disk, `reconciledBase` scope switches, and parked WIP from a prior visit is restored via three-way merge (`restoreBranchWIP`).

**Writer lock:** Only one active writer instance may mutate a given shadow root. The lock file at `<shadowDir>/lock` contains pid, hostname, startedAt, worktreeRoot. Stale locks from dead processes are auto-replaced.

### Symlinks

Symlinks inside the content directory are fully supported. Design rationale and edge-case catalog: [reports/symlink-handling-file-sync-crdt/REPORT.md](reports/symlink-handling-file-sync-crdt/REPORT.md).

**Realpath-based identity.** The file watcher indexes by canonical path (`realpathSync`). Two paths resolving to the same inode (e.g. `CLAUDE.md` → `AGENTS.md`) share a single Y.Doc. The `aliasMap` on `WatcherHandle` maps alias docNames to their canonical counterpart.

**Symlink-preserving atomic writes.** Persistence resolves `realpath(requestedPath)` before writing, then places the tmp file next to the canonical target. `rename(tmp, canonical)` replaces content without touching symlinks along the chain (port of the `write-file-atomic` pattern).

**Escape-safe default.** If `realpath` resolves outside `contentDir`, the write is refused with a `symlink-escape` error. No allowlist config in this iteration.

**Broken symlink fallback.** If `realpath` throws `ENOENT` (target missing), persistence falls back to a direct write at the original path, creating a regular file.

**Cyclic symlink rejection.** `ELOOP` from `realpath` is propagated as an error. The startup walk uses a `visitedInodes` set to prevent infinite directory traversal.

**UI.** Alias entries in the file sidebar show a Link2 icon badge. Hovering displays a tooltip with the target path and canonical docName.

**Windows caveat.** Symlinks on Windows require Developer Mode, but the server only reads/traverses symlinks (never creates them), so no elevated privilege is needed.

**Known non-goals:** hardlink detection, UI for creating symlinks, cross-filesystem EXDEV handling, retroactive drift scanning, git-level symlink preservation.

### API Endpoints

| Method | Path                          | Purpose                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/document`               | Read live Y.Text state (bypasses persistence debounce; `?docName=` param) |
| POST   | `/api/agent-write`            | Agent write via Y.Text                                                    |
| POST   | `/api/agent-write-md`         | Agent markdown write via Y.Text (append/prepend/replace)                  |
| POST   | `/api/agent-patch`            | Targeted find/replace on live Y.Text — only matched span mutated          |
| POST   | `/api/agent-undo`             | Undo last agent edit (agent-write origin only)                            |
| POST   | `/api/agent-redo`             | Redo last undone agent edit                                               |
| GET    | `/api/agent-undo-status`      | Check canUndo/canRedo                                                     |
| POST   | `/api/test-reset`             | Reset document (E2E test isolation, `?docName=` param)                    |
| POST   | `/api/save-version`           | Save Version — project repo commit + shadow checkpoint                    |
| GET    | `/api/metrics/reconciliation` | Reconciliation counters (reconcile, conflict, batch, branch switch, park) |
| GET    | `/api/rescue`                 | List rescue buffers (dirty docs from deleted/branch-switched files)       |
| GET    | `/api/rescue/:docName`        | Retrieve a specific rescue buffer (text/markdown)                         |

### Key files

- `src/standalone.ts` — `createServer()` factory; wires HEAD watcher callbacks (park on BatchBegin, reconcile/restore on BatchEnd)
- `src/persistence.ts` — `createPersistenceExtension()`; branch-scoped `reconciledBase` (`Map<branch, Map<docName, string>>`), batch-in-progress gating
- `src/shadow-repo.ts` — `initShadowRepo()`, `commitWip()`, `commitUpstreamImport()`, `parkBranch()`, `readParkedState()`, `saveVersion()`
- `src/shadow-lock.ts` — `acquireLock()` / `releaseLock()` for exclusive shadow-root writer access
- `src/head-watcher.ts` — `startHeadWatcher()`; tracks `lastKnownBranch`, classifies `BatchKind` (within-branch / cross-branch / detached-head)
- `src/shadow-branch-gc.ts` — `gcShadowBranches()` — orphaned WIP ref cleanup with 24h grace period, branch rename detection
- `src/reconciliation.ts` — `reconcile()` — three-way merge dispatcher (noop / clean / merged / conflicts / refused)
- `src/file-watcher.ts` — `startWatcher()` + writeTracker; emits `DiskEvent` unions (create / update / delete / rename / conflict)
- `src/metrics.ts` — in-memory counters: reconcile, conflict, batch, upstreamImport, rescueBuffer, branchSwitch, park
- `src/external-change.ts` — `applyExternalChange()` (throwing) + `createExternalChangeHandler()` (error-swallowing wrapper); unified disk→CRDT bridge for both CLI and dev plugin
- `src/agent-sessions.ts` — `AgentSessionManager` class
- `src/api-extension.ts` — HTTP API; includes save-version, rescue buffer, and metrics endpoints

## Package: cli

Commander.js v14 CLI published as `@inkeep/open-knowledge`.

### CLI Commands

| Command                                   | Description                                                          |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `open-knowledge` / `open-knowledge start` | Start Hocuspocus server + serve React app                            |
| `open-knowledge init`                     | Scaffold `.open-knowledge/` and register MCP server in `.mcp.json`   |
| `open-knowledge mcp`                      | Start MCP stdio server (disk-only or connects to running Hocuspocus) |

### Config system

Hierarchical YAML in `.open-knowledge/` directories:

- `~/.open-knowledge/config.yml` — user-level defaults
- `./.open-knowledge/config.yml` — workspace-level overrides
- Precedence: CLI flags > ENV > workspace > user > Zod defaults

### Output & color system

- `src/ui/colors.ts` — Semantic color helpers wrapping picocolors (error, warning, success, info, dim, accent)
- `src/ui/banner.ts` — Vite-style boxed startup banner (cli-boxes + picocolors)
- Respects `NO_COLOR`, `FORCE_COLOR` env vars and `--no-color`/`--color` CLI flags per no-color.org
- Color helpers import picocolors directly; `cli.ts` propagates `--no-color`/`--color` to env vars for other libraries in the dependency tree

### Key files

- `src/cli.ts` — Commander.js entry point (shebang), early color detection
- `src/commands/start.ts` — start command (Hocuspocus + static assets + colored output)
- `src/commands/mcp.ts` — MCP stdio server command
- `src/ui/colors.ts` — Color scheme + semantic helpers
- `src/ui/banner.ts` — Startup banner rendering
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

### Theming

Dark/light/system theme via `next-themes` (class strategy). Key pieces:

- `index.html` inline script reads `localStorage('ok-theme-v1')` and sets `.dark` before React hydrates (FOUC prevention)
- `main.tsx` wraps the app in `<ThemeProvider>` (attribute `class`, default `system`)
- `src/components/ThemeToggle.tsx` — dropdown toggle in the editor header
- `SourceEditor.tsx` uses a CodeMirror `Compartment` to hot-swap `oneDark` theme on `resolvedTheme` change
- `globals.css` defines dark overrides via Tailwind's `.dark` selector for ProseMirror content, callouts, and custom components

### Dev mode

The Vite plugin (`src/server/hocuspocus-plugin.ts`) imports from `@inkeep/open-knowledge-server` — single `bun run dev` starts Vite + Hocuspocus + file watcher on port 5173.

### Key files

- `src/editor/TiptapEditor.tsx` — WYSIWYG editor, HocuspocusProvider
- `src/editor/SourceEditor.tsx` — CodeMirror 6 with y-codemirror.next
- `src/editor/observers.ts` — Bidirectional observer sync
- `src/components/ThemeToggle.tsx` — Dark/light/system theme toggle
- `src/presence/PresenceBar.tsx` — Presence bar component
- `src/presence/AgentUndoButton.tsx` — Undo agent edit button

## CRDT Bridge Architecture

The editor uses a **dual-representation** CRDT model: Y.XmlFragment (WYSIWYG via TipTap) and Y.Text (source mode via CodeMirror), connected by bidirectional observers.

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here (tree structure)
├── Y.Text('source')          ← CodeMirror binds here (flat string)
│
│  Observer A: XmlFragment → Y.Text  (origin: 'sync-from-tree')
│  Observer B: Y.Text → XmlFragment  (origin: 'sync-from-text')
│
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution
```

### Two invariants

1. **Bridge invariant:** `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` — must hold after every propagation path settles.
2. **Baseline invariant:** Observer A's `lastSyncedXmlMd` must match the current XmlFragment state. Staleness causes incorrect diffs. (See `observers.ts:244`)

### Propagation matrix (4 write surfaces x 3 read targets)

| Write Surface             | → Y.Text                         | → XmlFragment                | → Disk               |
| ------------------------- | -------------------------------- | ---------------------------- | -------------------- |
| W1: WYSIWYG (XmlFragment) | Observer A                       | (direct)                     | Persistence debounce |
| W2: Source (Y.Text)       | (direct)                         | Observer B                   | Persistence debounce |
| W3: Agent API             | CRDT sync (WebSocket)            | syncTextToFragment on server | Persistence debounce |
| W4: Disk (file watcher)   | applyExternalChange              | applyExternalChange          | (direct)             |
| Undo/Redo                 | UndoManager + syncTextToFragment | syncTextToFragment           | Persistence debounce |

### transaction.local semantics

- **Local transactions** (`transaction.local === true`): Mutations on the same Y.Doc instance. Observers fire for everything.
- **Remote transactions** (`transaction.local === false`): Arrive via HocuspocusProvider WebSocket sync. Observers SKIP these (origin guards prevent double-sync).
- **Critical:** Layer A unit tests use `transaction.local=true` — NOT the same code path as production.

### Observer A (XmlFragment → Y.Text)

- File: `packages/app/src/editor/observers.ts:247`
- Origin: `'sync-from-tree'`
- Uses `diffLines` to compute incremental delta between `lastSyncedXmlMd` and current XmlFragment markdown
- Debounced (DEBOUNCE\_MS=50ms) to coalesce rapid keystrokes
- Skips entirely for remote (non-local) transactions; refreshes `lastSyncedXmlMd` baseline only
- Updates `lastSyncedXmlMd` after every successful sync

### Observer B (Y.Text → XmlFragment)

- File: `packages/app/src/editor/observers.ts:342`
- Origin: `'sync-from-text'`
- Parses Y.Text markdown via `mdManager.parse()`, applies to XmlFragment via `updateYFragment()`
- Deferred while user is typing in WYSIWYG (TYPING\_DEFER\_MS=300ms)
- Early-exits if XmlFragment already serializes to the same markdown as Y.Text

### syncTextToFragment

- File: `packages/server/src/agent-sessions.ts`
- Called after every `um.undo()`, `um.redo()`, and agent write
- Parses Y.Text → ProseMirror JSON → `updateYFragment()` on the server doc
- **STOP:** Never write to Y.Text without calling `syncTextToFragment` afterward

### Origin-guard truth table

| Transaction Origin      | Observer A (tree→text)          | Observer B (text→tree) |
| ----------------------- | ------------------------------- | ---------------------- |
| `'sync-from-tree'`      | — (self)                        | SKIP                   |
| `'sync-from-text'`      | SKIP                            | — (self)               |
| `'agent-write'`         | Skip (remote; refresh baseline) | Sync normally          |
| `'file-watcher'`        | Sync normally                   | Sync normally          |
| `undefined` (WebSocket) | Sync normally                   | Sync normally          |

## Testing

### Test file naming convention

- `*.test.ts` — Bun test runner (unit, integration, stress). Auto-discovered by `bun test`.
- `*.e2e.ts` — Playwright E2E tests. Auto-discovered by `playwright.config.ts` (`testMatch: /.*\.e2e\.ts$/`). Run via `bun run test:stress:e2e`.
- \*\*Do not use \*\*`*.spec.ts` — Bun auto-discovers both `.test.ts` and `.spec.ts`, which causes collisions when Playwright files use `.spec.ts` (`@playwright/test`'s `test()` throws outside the Playwright runner).

### Test layers

| Layer       | Type                                                              | Location                                                                                                    | Command                                                    |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A           | Unit + stress                                                     | `packages/app/src/editor/observers.test.ts`, `tests/stress/observers.stress.{s1-s8-s9,s2,s4,s5-s6}.test.ts` | `bun run test` (unit), `bun run test:stress:*` (per-shard) |
| B           | HTTP + server-side CRDT                                           | `packages/app/tests/stress/stress-api.ts`                                                                   | `bun run tests/stress/stress-api.ts` (needs dev server)    |
| C           | Playwright E2E                                                    | `packages/app/tests/stress/crdt-stress.e2e.ts`, `tests/stress/ux-interactions.e2e.ts`                       | `bunx playwright test`                                     |
| D           | Fuzz                                                              | `packages/app/tests/stress/observers.fuzz.test.ts`                                                          | `STRESS_FUZZ_SEED=<seed> bun run test`                     |
| Integration | Tier 1 bridge matrix                                              | `packages/app/tests/integration/bridge-matrix.test.ts`                                                      | `bun run test`                                             |
| Fidelity    | PBT invariants (I1-I7) + CommonMark/GFM corpus + P0 entity/escape | `packages/app/tests/fidelity/`                                                                              | `bun run test:fidelity` (also in `bun run check`)          |

### Tier 1 integration harness

File: `packages/app/tests/integration/test-harness.ts`

- `createTestServer()` → spins up real Hocuspocus with HTTP/WebSocket on OS-assigned random port
- `createTestClient(port)` → connects HocuspocusProvider + wires `setupObservers()`
- `getFreePort()` → kernel-allocated port (Hocuspocus `Server.listen(0)` fails due to falsy guard)
- Server uses `debounce: 200` (not production 2s) for fast disk tests

### Writing a new integration test

```typescript
import { createTestServer, createTestClient, agentWriteMd, assertBridgeInvariant, wait } from './test-harness';

let server: TestServer;
beforeAll(async () => { server = await createTestServer(); });
afterAll(async () => { await server.cleanup(); });

test('my propagation test', async () => {
  await testReset(server.port);
  await wait(300);
  const client = await createTestClient(server.port);
  try {
    // Write via one surface, verify another
    await agentWriteMd(server.port, '# Test');
    await wait(500);
    expect(client.ytext.toString()).toContain('Test');
    assertBridgeInvariant(client.ytext, client.fragment);
  } finally {
    client.cleanup();
  }
});
```

### Per-test docName isolation

Integration tests use per-test docNames via `createTestClient(port)` which auto-generates `test-${randomUUID()}`. Tests are safe to run concurrently (`test.concurrent()`, multiple `bun test` processes in the same worktree) because:

1. Each test's Y.Doc is uniquely named and independent.
2. Observer A's typing-defer state is per-doc (`WeakMap<Y.Doc, TypingState>`).
3. `/api/test-reset` is scoped to a specific docName via `?docName=` query param.

**Exception:** tests that verify shared-state behavior (initial sync, test-reset semantics) explicitly pass `'test-doc'` and do not run concurrently with each other.

Client lifecycle is inside the test body via `try/finally` — NOT via `beforeEach/afterEach`. This is required for `test.concurrent()` correctness (the shared `let client` pattern races under concurrent mode).

### Observer bridge coverage

Changes to `observers.ts` (Observer A / Observer B / `applyUserDelta`) require **multi-client test coverage**, not just single-client tests. A remote peer's WYSIWYG edit can arrive as a Y.Text-only transaction during a local user's mid-sync on XmlFragment — this creates divergence states that single-client tests cannot reproduce. PR #43's multi-client test matrix proved this is a real production trigger. See the `applyUserDelta` JSDoc in `observers.ts` for the full explanation.

### Playwright policy

Playwright E2E tests run on every PR. The Playwright suite covers DOM-binding and user-interaction regressions that unit/integration tests cannot reach (e.g., TipTap NodeView rendering, CodeMirror key bindings, presence UI). Do not skip Playwright in CI; do not add Playwright tests for pure bridge-logic changes — those belong in `bridge-matrix.test.ts` and `observers.test.ts`.

### Fuzz replay

```bash
STRESS_FUZZ_SEED=42 bun test packages/app/tests/stress/observers.fuzz.test.ts
```

Fuzz tests write snapshots to `/tmp/fuzz-*` on failure for deterministic reproduction.

## Concurrent Development

### VITE_PORT for custom port

```bash
VITE_PORT=9999 bun run dev        # Dev server on port 9999 (strict: fails if taken)
bun run dev                        # Default port 5173 (not strict)
```

### Port isolation for tests

- **Tier 1 integration tests:** `getFreePort()` allocates kernel-assigned random ports. Zero coordination needed.
- **Playwright tests:** `VITE_PORT` env var passed via `playwright.config.ts` webServer command. Set `VITE_PORT=<random>` for concurrent runs.
- `reuseExistingServer: false` in playwright.config.ts prevents stale server contamination.

### Detecting stale dev servers

```bash
ps aux | grep vite                 # Find running Vite processes
lsof -i :5173                     # Check what's using default port
```

### Worktree isolation

Each worktree has its own content directory. The test harness creates a fresh `tmpDir` per test run — no shared state between worktrees.

**ProseMirror-model duplication in nested worktrees:** Worktrees at `.claude/worktrees/X/` are nested inside the parent repo directory. Bun resolves workspace packages (e.g., `@inkeep/open-knowledge-core`) by walking up the directory tree — finding the parent repo's `packages/core/` and its `node_modules/` first, not the worktree's. When the parent's `prosemirror-model` instance differs from the worktree's, `PmNode.fromJSON()` fails with "looks like multiple versions of prosemirror-model were loaded."

**Fix:** Run `bun install` from the worktree root to create worktree-local `node_modules/`. The dev server is unaffected (Vite `resolve.dedupe` handles it). For test files, prefer direct relative imports (`../../packages/core/src/...`) over workspace imports (`@inkeep/open-knowledge-core`). See `reports/bun-prosemirror-model-dedup/REPORT.md`.

### Multi-agent local workflows

This repo supports multiple agents (or agents + manual dev servers) running concurrently without coordination:

- **Two agents, same worktree:** Each bun process gets its own port (`getFreePort`), its own Hocuspocus tmpdir (`mkdtempSync`), its own Y.Docs, and its own module state.
- **Two agents, separate worktrees:** Stronger isolation via filesystem separation.
- **Agent running Playwright + developer running **`bun run dev`**:** Playwright config sets `OK_TEST_CONTENT_DIR` to an isolated tmpdir; the manual dev server uses the default `packages/content/`. No contention.

No environment variables must be set by hand for any of these scenarios.

## Known Pitfalls

### STOP rules

- **STOP:** Never write raw markdown to Y.Text without calling `syncTextToFragment()` afterward. The XmlFragment will be stale, breaking the bridge invariant.
- **STOP:** Always call `syncTextToFragment()` after `um.undo()` / `um.redo()`. Without it, Y.Text reverts but XmlFragment stays stale.
- **STOP:** Don't bypass `writeTracker` or `skipStoreHooks`. The write tracker prevents self-write feedback loops between persistence and file watcher. `skipStoreHooks` prevents persistence from re-saving a file we just loaded.

### WARN rules

- **WARN:** Markdown round-trip is not always stable. E.g., `## H\nP` normalizes to `## H\n\nP` (paragraph after heading gets a blank line). Test with `serialize(parse(md)) !== md` to find constructs that normalize.
- **WARN:** Observer A's `lastSyncedXmlMd` must be refreshed on ALL XmlFragment changes, not just user edits. A stale baseline produces incorrect diffs that destroy content.
- **WARN:** Layer A tests use `transaction.local=true`. This does NOT exercise the same code path as production where WebSocket updates arrive with `transaction.local=false`.
- **WARN:** `hocuspocus.configure({ extensions: [...] })` REPLACES the extensions array (object spread). Use `hocuspocus.configuration.extensions.push()` to add extensions without losing existing ones.

## Debug Tooling

### Observer instrumentation

Add logging to `observers.ts` to trace sync behavior:

```typescript
// In Observer A callback:
console.log('[Observer A]', { ytextLen: ytext.toString().length, fragLen: serializeFragment(fragment).length, lastSyncedLen: lastSyncedXmlMd.length });
```

### Round-trip stability check

```typescript
const roundTripped = mdManager.serialize(mdManager.parse(md));
if (roundTripped !== md) console.warn('Non-canonical markdown:', { original: md.length, roundTripped: roundTripped.length });
```

### Bridge invariant check

```typescript
const textNorm = stripTrailingWhitespace(ytext.toString());
const fragNorm = stripTrailingWhitespace(serializeFragment(fragment));
console.assert(textNorm === fragNorm, 'Bridge invariant violated');
```

### Fuzz replay for deterministic reproduction

```bash
STRESS_FUZZ_SEED=<seed-from-failure> bun test packages/app/tests/stress/observers.fuzz.test.ts
```

Check `/tmp/fuzz-*` for the snapshot of the failing state.

## Research references

`reports/` contains \~55 prior-art research reports on the tech stack, editor architecture, CRDT collaboration, search engines, MCP tool design, competitive landscape, and related topics. Each report has a `REPORT.md` synthesis and `evidence/` files. See `reports/CATALOGUE.md` for the full index. Key reports:

- `reports/npm-global-cli-packaging/` — CLI packaging research (7 dimensions)
- `reports/auto-persistence-version-history-patterns/` — Auto-persistence and version history
- `reports/bun-module-resolution-extensions/` — Bun module resolution extensions
- `reports/onboarding-multiproject-ux/` — Onboarding multiproject UX
- `reports/crdt-observer-bridge-latency-analysis/` — CRDT observer bridge latency analysis

## Storage-layer fidelity contract

**Storage never sanitizes; render-time layers do.** Raw HTML, backslash escapes, and all literal characters pass through the storage layer unchanged. XSS mitigation is a render-layer concern (DOMPurify in docs site, not in the CRDT/persistence pipeline).

### Seven fidelity invariants

| ID | Invariant                  | Description                                                        |
| -- | -------------------------- | ------------------------------------------------------------------ |
| I1 | Identity                   | `serialize(parse(md)) === md` for supported constructs             |
| I2 | Character preservation     | Every literal char in input appears in output — no entity encoding |
| I3 | Normalization canonicality | `f(f(x)) === f(x)` — double round-trip equals single round-trip    |
| I4 | Idempotence                | `serialize(parse(X))` applied twice produces identical output      |
| I5 | Layer A === Layer B        | mdManager path and Y.Doc path produce the same output              |
| I6 | Multi-client preservation  | Content survives Y.Doc state sync between clients                  |
| I7 | Cross-path consistency     | All write paths produce equivalent serialized output               |

### Irreducible gaps (by design)

- **NG1:** Blank-line count between blocks normalizes (ProseMirror schema limitation)
- **NG2:** GFM table column widths normalize
- **NG3:** Constructs outside our extension set (math `$$`, footnotes, alerts) are NOT semantically preserved
- **NG4:** No storage-layer HTML sanitization — raw HTML passes through unchanged
- **NG5:** HTML entity references (`&amp;` `&lt;` `&gt;`) in source markdown are decoded to literal characters on first parse and remain as literals — the entity form is not preserved
- **NG6:** Non-ambiguous backslash escapes (e.g., `\foo`) lose the backslash on round-trip — only CommonMark §2.4 structurally-ambiguous escapes are preserved via `escapeMark`
- **NG7:** MDX `---` inside a JSX block parses as `thematicBreak` — escape to `\---` or wrap in code fence
- **NG8:** Block-level GFM (tables, tasklists) inside inline `<Note>...</Note>` flattens to inline text — use `<Note>\n\n...\n\n</Note>` form for block children
- **NG9:** Unicode Private Use Area characters U+E000–U+E004 in source content are reserved as internal sentinels by `autolink-void-html-guard.ts` (R23 guard). U+E000 replaces `<` in protected patterns, U+E001 replaces `>`, U+E002 replaces `:` inside autolink URLs (defeats remark-gfm autolink-literal), U+E003 replaces `@` inside autolink URLs (defeats remark-gfm email autolink), U+E004 replaces `{` in unmatched brace positions (defeats remark-mdx expression parser). Source content containing these codepoints may be corrupted by the guard's restoration pass. These PUA characters are not assigned by Unicode and are rare in legitimate content; if encountered in real documents, the guard's sentinel bytes must be remapped to a less-contested PUA range.
- **NG10:** A thematicBreak at document start is normalized from `---` to `***` on serialize. `---` at document position 0 is indistinguishable from empty YAML frontmatter under `remark-frontmatter`; re-parsing `---\n\n<content>` tokenizes differently than `***\n\n<content>`, breaking idempotence (I3/I4/I5/I7). Non-doc-start thematicBreaks preserve `sourceRaw` faithfully. Implemented in `packages/core/src/markdown/to-markdown-handlers.ts:thematicBreak`.
- **NG11:** Documents consisting only of ignore-typed mdast nodes (yaml frontmatter, toml frontmatter, footnoteDefinition) receive a synthesized empty paragraph so the PM doc satisfies `doc.content: 'block+'`. Observed input like `---\n\n---` (empty YAML frontmatter) or a file containing only `[label]: url` reference definitions without body content round-trips to an empty document. Implemented in `packages/core/src/markdown/pipeline.ts:ensureNonEmptyDoc`.

### Markdown pipeline dependency discipline

- `@handlewithcare/remark-prosemirror` pinned to exact version `0.1.5` (no caret). A `bun patch` in `patches/` applies PR #3 fix (empty-text-node + NBSP whitespace preservation)
- `remark-mdx` trio (`remark-mdx`, `mdast-util-mdx`, `micromark-extension-mdxjs`) pinned as a coupled unit — bump all three together
- **Upgrade protocol:** Before bumping any dependency, re-run the 118-case fidelity probe (`tech-probes/r1-preflight-gate/`) and full invariant suite (`bun run test:fidelity`). Verify the remark-prosemirror patch still applies cleanly
- Failed patch surfaces at install time (fail-loud via `patchedDependencies`)
- **Pre-flight probe baseline:** 97/118 whitespace-only, 13/13 P0 entity/escape — see `tech-probes/r1-preflight-gate/REPORT.md`

### Markdown Pipeline — System Design

The markdown pipeline uses `unified + remark` for parsing and serialization, with `@handlewithcare/remark-prosemirror` bridging mdast ↔ ProseMirror.

**Parse direction:**

```
remark-parse → remark-frontmatter → remark-mdx → remark-directive →
remark-gfm → wiki-link micromark ext → [R23 autolink/void-HTML guard] →
position-slice walker → remarkProseMirror (handlers map mdast → PM JSON)
```

**Serialize direction:**

```
fromProseMirror (PM JSON → mdast) → remark-stringify + custom mdast-util-to-markdown handlers
```

**Handler tiers:**

- **Tier A (passthrough):** root, paragraph, text, blockquote, table/row/cell, image, inlineCode, delete, directives
- **Tier B (fidelity):** emphasis, strong, heading, code, thematicBreak, break, list, listItem — reads `node.data.*` from position-slice walker
- **Tier C (custom):** link/linkReference, definition (R12 override), html, MDX nodes, wikiLink

**Position-slice walker** (`position-slice.ts`): runs after all syntax extensions produce mdast, slices original source at `node.position.start.offset` to recover authoring-form delimiters (emphasis `*`/`_`, fence char, bullet marker, etc.). Attaches `node.data.sourceDelimiter`, `node.data.sourceFenceChar`, etc.

**D20 escapeMark:** PM-level mark applied to text runs whose source contained a backslash escape of a structurally-ambiguous char (`\#`, `\*`, `\_`, etc. per CommonMark §2.4). Position-slice walker tags, serialization handler re-emits the backslash.

**Key files:**

- `packages/core/src/markdown/pipeline.ts` — unified pipeline factory
- `packages/core/src/markdown/index.ts` — MarkdownManager wrapper (parse/serialize)
- `packages/core/src/markdown/handlers.ts` → `index.ts` — mdast→PM + PM→mdast handler tables
- `packages/core/src/markdown/to-markdown-handlers.ts` — fidelity-aware serialization overrides
- `packages/core/src/markdown/position-slice.ts` — source-form recovery walker
- `packages/core/src/markdown/wiki-link-micromark.ts` — micromark tokenizer for `[[Page]]` syntax
- `packages/core/src/markdown/autolink-void-html-guard.ts` — R23 regression fix
- `packages/core/src/markdown/mdast-augmentation.ts` — TypeScript type augmentation for custom mdast types

**Schema names (mdast-canonical, D16/D17):** `strong` (not bold), `emphasis` (not italic), `thematicBreak` (not horizontalRule). Unified `list` + `listItem` (not separate bulletList/orderedList/listItem).

## Changesets

```bash
bun run changeset        # Create a new changeset
bun run version          # Apply pending changesets
bun run release          # Publish to npm
```

## Code Style

- React Compiler is enabled for this repo. Do not add `forwardRef`, `memo`, `useMemo`, or `useCallback`; rely on the compiler unless a maintainer explicitly requests an exception
- Use `use()` instead of `useContext()` (React 19 pattern)
- In React components, prefer Tailwind CSS utility classes via `className` instead of inline `style` props. Only use inline styles when there is no practical Tailwind expression for the requirement
- Prefer existing shadcn components before building custom UI primitives. If the needed shadcn component is not installed yet, suggest installing it rather than reimplementing it from scratch


<!-- open-knowledge:begin -->
## Open Knowledge

This repo uses Open Knowledge — agent-collaborative wiki tooling exposed via MCP. The scope of tracked content is `.open-knowledge/config.yml` (default: every `**/*.md` under the repo root).

**Reading (wiki markdown).** Prefer the `exec` MCP tool over native `Read` / `Grep` / `Glob`. `exec` runs `cat` / `ls` / `grep` / `find` / `head` / `tail` / `wc` / `sort` / `uniq` / `cut` with pipes, and every returned path is enriched with frontmatter (title, description, tags), backlink count, and recent shadow-repo activity with agent-vs-human attribution. One tool covers read/list/search with attribution that native tools don't see. Examples: `exec("cat docs/auth.md")`, `exec("ls articles/")`, `exec("grep -rn oauth . | head -5")`.

**Writing (wiki markdown).** Route all edits through `write_document` / `edit_document`. Native `Edit` / `sed` land as anonymous `upstream` imports — you lose agent attribution in the shadow-repo log.

**Linking.** When authoring, link liberally with `[[Page Title]]` wiki-links. Redlinks are fine — they signal "this should exist." Every noun-phrase naming another document should be a link. Backlink density is how this knowledge base stays navigable for the next agent.

**Non-wiki code (`.ts`, `.py`, configs, etc.).** Keep using native `Read` / `Edit` / `Grep` / `Bash`. The MCP tools are for markdown in `content.include`.
<!-- open-knowledge:end -->
