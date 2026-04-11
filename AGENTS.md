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
git checkout <base-branch> -- bun.lock   # accept the base branch's lockfile
bun install                              # regenerate with your branch's dependency changes
git add bun.lock
git rebase --continue                    # (or git merge --continue)
```

Where `<base-branch>` is whichever branch you're rebasing onto or merging from (e.g. `main`, `feat/init-spike`).

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

Hocuspocus CRDT server library — persistence, file-watcher, agent sessions, shadow repo, and HTTP API.

```
Hocuspocus Server
├── Persistence Extension (CRDT → markdown → disk → shadow git)
├── API Extension (onRequest hook for HTTP endpoints)
├── Agent Sessions (DirectConnection + UndoManager per agent)
├── File Watcher (@parcel/watcher disk bridge)
├── HEAD Watcher (.git/HEAD → BatchBegin/BatchEnd lifecycle)
├── Shadow Repo (.git/openknowledge/ — attribution journal)
├── Reconciliation (three-way merge for external writes)
└── Shadow Branch GC (orphaned ref cleanup)
```

### Shadow repo &amp; branch runtime

The shadow repo is a bare git repo at `.git/openknowledge/` (integrated mode) or `.openknowledge/` (standalone mode, no project `.git/`). It stores per-writer WIP refs, upstream-import commits, and checkpoint refs — never touches the project repo's ref namespace or object store.

**Branch-scoped state:** `reconciledBase` (the three-way merge base) is `Map<branch, Map<docName, string>>`. On branch switch, the active scope switches to the target branch's map. WIP refs are namespaced as `refs/wip/<branch>/<writer-id>`.

**Branch switch protocol:** On `BatchBegin` the server parks current Y.Doc in-memory state to shadow refs via `parkBranch()`. On `BatchEnd` with `cross-branch` kind, Y.Docs reset from disk, `reconciledBase` scope switches, and parked WIP from a prior visit is restored via three-way merge (`restoreBranchWIP`).

**Writer lock:** Only one active writer instance may mutate a given shadow root. The lock file at `<shadowDir>/lock` contains pid, hostname, startedAt, worktreeRoot. Stale locks from dead processes are auto-replaced.

### API Endpoints


| Method | Path                          | Purpose                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/document`               | Read live Y.Text state (bypasses persistence debounce)                    |
| POST   | `/api/agent-write`            | Agent write via Y.Text                                                    |
| POST   | `/api/agent-write-md`         | Agent markdown write via Y.Text (append/prepend/replace)                  |
| POST   | `/api/agent-patch`            | Targeted find/replace on live Y.Text — only matched span mutated          |
| POST   | `/api/agent-undo`             | Undo last agent edit (agent-write origin only)                            |
| POST   | `/api/agent-redo`             | Redo last undone agent edit                                               |
| GET    | `/api/agent-undo-status`      | Check canUndo/canRedo                                                     |
| POST   | `/api/test-reset`             | Reset document (E2E test isolation)                                       |
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
- `src/agent-sessions.ts` — `AgentSessionManager` class
- `src/api-extension.ts` — HTTP API; includes save-version, rescue buffer, and metrics endpoints

## Package: cli

Commander.js v14 CLI published as `@inkeep/open-knowledge`.

### CLI Commands


| Command                                   | Description                                         |
| ----------------------------------------- | --------------------------------------------------- |
| `open-knowledge` / `open-knowledge start` | Start Hocuspocus server + serve React app           |
| `open-knowledge mcp`                      | Start MCP stdio server (connects to running server) |


### Config system

Hierarchical YAML in `.open-knowledge/` directories:

- `~/.open-knowledge/config.yml` — user-level defaults
- `./.open-knowledge/config.yml` — workspace-level overrides
- Precedence: CLI flags &gt; ENV &gt; workspace &gt; user &gt; Zod defaults

### Output &amp; color system

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

### Presence &amp; awareness

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
| W4: Disk (file watcher)   | handleExternalChange             | handleExternalChange         | (direct)             |
| Undo/Redo                 | UndoManager + syncTextToFragment | syncTextToFragment           | Persistence debounce |


### transaction.local semantics

- **Local transactions** (`transaction.local === true`): Mutations on the same Y.Doc instance. Observers fire for everything.
- **Remote transactions** (`transaction.local === false`): Arrive via HocuspocusProvider WebSocket sync. Observers SKIP these (origin guards prevent double-sync).
- **Critical:** Layer A unit tests use `transaction.local=true` — NOT the same code path as production.

### Observer A (XmlFragment → Y.Text)

- File: `packages/app/src/editor/observers.ts:247`
- Origin: `'sync-from-tree'`
- Uses `diffLines` to compute incremental delta between `lastSyncedXmlMd` and current XmlFragment markdown
- Debounced (DEBOUNCE_MS=50ms) to coalesce rapid keystrokes
- Skips entirely for remote (non-local) transactions; refreshes `lastSyncedXmlMd` baseline only
- Updates `lastSyncedXmlMd` after every successful sync

### Observer B (Y.Text → XmlFragment)

- File: `packages/app/src/editor/observers.ts:342`
- Origin: `'sync-from-text'`
- Parses Y.Text markdown via `mdManager.parse()`, applies to XmlFragment via `updateYFragment()`
- Deferred while user is typing in WYSIWYG (TYPING_DEFER_MS=300ms)
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

### Test layers


| Layer       | Type                    | Location                                                                                | Command                                                 |
| ----------- | ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A           | Unit + stress           | `packages/app/src/editor/observers.test.ts`, `tests/stress/observers.stress.test.ts`    | `bun run test`                                          |
| B           | HTTP + server-side CRDT | `packages/app/tests/stress/stress-api.ts`                                               | `bun run tests/stress/stress-api.ts` (needs dev server) |
| C           | Playwright E2E          | `packages/app/tests/stress/crdt-stress.spec.ts`, `tests/stress/ux-interactions.spec.ts` | `bunx playwright test`                                  |
| D           | Fuzz                    | `packages/app/tests/stress/observers.fuzz.test.ts`                                      | `STRESS_FUZZ_SEED=<seed> bun run test`                  |
| Integration | Tier 1 bridge matrix    | `packages/app/tests/integration/bridge-matrix.test.ts`                                  | `bun run test`                                          |


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

See `reports/CATALOGUE.md` for the full index. Key reports:

- `reports/npm-global-cli-packaging/` — CLI packaging research (7 dimensions)
- `reports/auto-persistence-version-history-patterns/` — Auto-persistence and version history
- `reports/bun-module-resolution-extensions/` — Bun module resolution extensions
- `reports/onboarding-multiproject-ux/` — Onboarding multiproject UX
- `reports/crdt-observer-bridge-latency-analysis/` — CRDT observer bridge latency analysis

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

