# Zero-Config bunx CLI Packaging — Spec

**Status:** Approved
**Owner(s):** Andrew
**Last updated:** 2026-04-11
**Baseline commit:** 1f72b85
**Links:**
- Research report: [reports/zero-config-bunx-cli-packaging/REPORT.md](../../reports/zero-config-bunx-cli-packaging/REPORT.md)
- Evidence: [./evidence/](./evidence/)

---

## 1) Problem statement

**Situation:** `@inkeep/open-knowledge` is a published npm CLI that starts a CRDT collaboration server, file watcher, and serves a React editor UI. The CLI architecture is sound — `start` is the default Commander.js command, `mcp` provides AI agent tools via MCP stdio, and `init` scaffolds `.open-knowledge/` config. The React app build is compact (2MB). The MCP integration with Claude Code Desktop already works (`.mcp.json` → auto-start on session).

**Complication:** `bunx @inkeep/open-knowledge` doesn't actually work outside the development monorepo. Three gaps compound: (1) the React app assets aren't included in the npm package — `start.ts` resolves them at monorepo-relative paths (`../../app/dist`) that don't exist when installed via bunx, (2) `@parcel/watcher` has a [documented bunx failure mode](https://github.com/oven-sh/bun/issues/19282) where platform-specific binaries don't install in ephemeral contexts, crashing the server on startup, and (3) users must run `init` as a separate manual step before `start`, adding friction to a tool whose primary distribution channel is a single CLI command.

**Resolution:** Four implementation tracks that together make the tool work from a single `bunx @inkeep/open-knowledge` command: (T1) bundle the React app in the CLI package and fix asset path resolution, (T2) add a tiered watcher fallback so @parcel/watcher failures don't crash the server, (T3) auto-scaffold `.open-knowledge/` on first `start` when it doesn't exist, and (T4) ship a Claude Code plugin for fully automatic MCP + preview server setup.

---

## 2) Goals

- **G1:** `bunx @inkeep/open-knowledge` starts the collaboration server, file watcher, and serves the React editor on any machine with Node.js >= 22 or Bun installed — no monorepo checkout required.
- **G2:** The server starts successfully even when `@parcel/watcher` native binaries fail to install (fallback to pure-JS watcher).
- **G3:** Running `bunx @inkeep/open-knowledge` in a directory without `.open-knowledge/` auto-scaffolds it, reducing setup to a single command.
- **G4:** A Claude Code plugin packages both the MCP server and preview server for fully automatic setup in Claude Code Desktop.

---

## 3) Non-goals

- **[NEVER]** NG1: Windows-specific packaging — different platform, different constraints, not the target audience.
- **[NOT NOW]** NG2: MCP Streamable HTTP transport on the `start` server — valid optimization but not needed for zero-config. Revisit if: multi-client MCP access becomes a requirement.
- **[NOT NOW]** NG3: Thin launcher pattern (separate download of assets at runtime) — total package size is ~8MB, well within bounds. Revisit if: package exceeds 50MB.
- **[NOT NOW]** NG4: Docker/container packaging — different distribution channel. Revisit if: cloud deployment becomes a use case.
- **[NOT UNLESS]** NG5: Unscoped package name (`open-knowledge` without `@inkeep/`) — requires registering a new npm package. Only if: typing the full scoped name proves to be a real adoption barrier.

---

## 4) Personas / consumers

- **P1: Developer using Claude Code Desktop** — primary persona. Opens a project in Claude Code, wants AI agent tools available immediately. May also want the browser-based collaborative editor.
- **P2: Developer trying open-knowledge for the first time** — runs `bunx @inkeep/open-knowledge` in their project to evaluate the tool. Zero prior setup. Needs it to just work.
- **P3: Team lead setting up open-knowledge for a team** — runs `init` once, commits `.mcp.json`, and expects every team member to get MCP tools automatically when they open Claude Code.

---

## 5) User journeys

### P2: First-time developer (happy path)

1. Has a project with markdown files in the current directory
2. Runs `bunx @inkeep/open-knowledge` (or `npx @inkeep/open-knowledge`)
3. CLI detects no `.open-knowledge/` → auto-scaffolds it + writes `.mcp.json`
4. Hocuspocus server starts, file watcher begins monitoring `.` for `**/*.md`
5. React editor UI available at `http://localhost:3000`
6. Banner prints URL + setup summary
7. Developer opens browser, sees their markdown files, starts editing

### P2: First-time developer (failure path — @parcel/watcher unavailable)

1. Runs `bunx @inkeep/open-knowledge`
2. @parcel/watcher platform binary not found
3. Server falls back to chokidar, logs warning: `[watcher] @parcel/watcher unavailable, using chokidar fallback`
4. Server starts normally — file watching works, just with slightly less performance
5. No user-visible degradation for typical KB sizes (100-1000 files)

### P1: Claude Code Desktop user (happy path)

1. Team lead has already run `init` and committed `.mcp.json`
2. Developer opens project in Claude Code Desktop
3. Claude Code reads `.mcp.json`, auto-starts `npx @inkeep/open-knowledge mcp`
4. MCP tools available immediately — no manual steps
5. If developer also wants the browser editor, runs `bunx @inkeep/open-knowledge` in terminal

### P1: Claude Code Desktop user with plugin (happy path — Track 4)

1. Developer installs the `open-knowledge` Claude Code plugin
2. Opens any project with `.open-knowledge/` directory
3. Plugin's MCP server starts automatically (bundled in plugin)
4. Plugin's launch config auto-starts the collaboration server as a preview
5. Both MCP tools and browser editor available with zero manual steps

---

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Track |
|---|---|---|---|
| Must | React app assets bundled in CLI npm package | `npm pack --dry-run` shows `dist/public/index.html` and `dist/public/assets/` | T1 |
| Must | Asset path resolution works from npm install | `bunx @inkeep/open-knowledge` serves React UI at the configured port | T1 |
| Must | Server starts when @parcel/watcher is unavailable | Remove `@parcel/watcher` from node_modules, run `start` → server starts with chokidar, logs fallback warning | T2 |
| Must | File change detection works with chokidar fallback | Edit a .md file externally → change detected and reconciled within 2 seconds | T2 |
| Must | Auto-init on first start when `.open-knowledge/` missing | Run `start` in dir without `.open-knowledge/` → directory scaffolded, server starts | T3 |
| Should | Explicit `init` writes `.mcp.json` (auto-init from `start` does NOT) | `start` auto-init creates `.open-knowledge/` only; `init` creates both `.open-knowledge/` and `.mcp.json` | T3 |
| Must | Auto-init is idempotent | Running `start` again doesn't overwrite existing `.open-knowledge/` or `.mcp.json` | T3 |
| Should | Banner indicates auto-init happened | If auto-init ran, banner includes "Scaffolded .open-knowledge/" message | T3 |
| Should | `--no-init` flag to skip auto-scaffolding | `bunx @inkeep/open-knowledge --no-init` skips auto-init even if `.open-knowledge/` is missing | T3 |
| Could | Claude Code plugin with bundled MCP server | Plugin installable via `claude plugin add`, MCP tools available on session start | T4 |
| Could | Plugin launch.json for preview server | `start` command auto-launches as preview server in Claude Code Desktop | T4 |

### Non-functional requirements

- **Performance:** chokidar fallback must detect changes within 2s for directories with ≤1000 files. @parcel/watcher when available: <100ms.
- **Package size:** Published tarball ≤ 15MB (currently ~8MB projected).
- **Startup time:** Cold `bunx` start (first run, including download): ≤ 10s on broadband. Warm start (cached): ≤ 2s.

---

## 7) Success metrics & instrumentation

- **Metric 1: bunx success rate** — `bunx @inkeep/open-knowledge` starts successfully on first try
  - Baseline: 0% (currently broken outside monorepo)
  - Target: 100% on macOS/Linux with Node.js >= 22 or Bun >= 1.1
- **Metric 2: Time to first editor load** — from `bunx` command to React UI accessible in browser
  - Baseline: N/A
  - Target: < 10s cold, < 3s warm
- What we will log: watcher type used (parcel vs chokidar), auto-init triggered (yes/no), startup time

---

## 8) Current state (how it works today)

See [evidence/codebase-current-state.md](evidence/codebase-current-state.md) for full trace.

**Summary:**
- `start.ts` resolves React app at monorepo-relative paths → **breaks** outside monorepo
- `tsdown.config.ts` bundles core+server but has no app asset copy step → **React app not in npm package**
- `file-watcher.ts` hard-imports `@parcel/watcher` → **crashes** if native binary missing
- `init.ts` must be run manually before `start` → **extra setup step**
- Config defaults: port 3000, host localhost, content dir `.`, include `**/*.md`

---

## 9) Proposed solution (vertical slice)

### Track 1: Bundle React app assets + fix path resolution

**Build pipeline changes** in `packages/cli/package.json`:

```json
{
  "scripts": {
    "build:app": "cd ../app && bun run build",
    "build:cli": "tsdown",
    "build:assets": "cp -r ../app/dist dist/public",
    "build": "bun run build:app && bun run build:cli && bun run build:assets",
    "prepublishOnly": "bun run build && bun run test"
  }
}

**Build ordering note:** `build:cli` runs tsdown with `clean: true`, which deletes `dist/`. The `build:assets` step MUST run after `build:cli`. This ordering is enforced by the `&&` chain in `build`. Running `build:cli` independently will delete `dist/public/` — run the full `build` script for a complete output.
```

**Asset path resolution** in `packages/cli/src/commands/start.ts`:

```typescript
const cliDir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
const assetPaths = [
  resolve(cliDir, 'public'),           // npm install: dist/public/ (bundled assets)
  resolve(cliDir, '../../app/dist'),    // monorepo dev (from src/)
  resolve(cliDir, '../../../app/dist'), // monorepo dev (from dist/)
];
const assetDir = assetPaths.find((p) => existsSync(p));
```

The first path (`resolve(cliDir, 'public')`) handles the npm-installed case: when `cli.mjs` runs from `dist/`, it finds `dist/public/`. The existing monorepo paths remain as fallbacks for development.

**Published package structure:**
```
dist/
├── cli.mjs           (CLI entry — ~6MB with bundled core/server)
├── index.mjs          (programmatic API)
├── *.d.mts            (type declarations)
└── public/            (React app — ~2MB)
    ├── index.html
    ├── favicon.svg
    └── assets/
        ├── index-*.js  (1.9MB)
        └── index-*.css (77KB)
```

`"files": ["dist"]` stays unchanged — `dist/public/` is already inside `dist/`.

### Track 2: @parcel/watcher fallback

**Package.json changes** in `packages/server/package.json`:
- Move `@parcel/watcher` from `dependencies` to `optionalDependencies`
- Add `chokidar` (^5.0.0) to `dependencies`

Note: `packages/cli/package.json` also lists `@parcel/watcher` — it can be removed from CLI since it's consumed transitively through the server package that gets bundled by tsdown.

**File watcher changes** in `packages/server/src/file-watcher.ts`:

Replace the hard import:
```typescript
import { type AsyncSubscription, subscribe } from '@parcel/watcher';
```

With a tiered dynamic import:
```typescript
type WatcherBackend = 'parcel' | 'chokidar';

let watcherBackend: WatcherBackend | null = null;

async function getParcelSubscribe() {
  try {
    const mod = await import('@parcel/watcher');
    watcherBackend = 'parcel';
    return mod.subscribe;
  } catch {
    return null;
  }
}

async function startChokidarFallback(
  dir: string,
  onEvent: (events: Array<{ type: string; path: string }>) => void,
  filter: ContentFilter,
): Promise<{ unsubscribe: () => Promise<void> }> {
  const { watch } = await import('chokidar');
  watcherBackend = 'chokidar';
  console.warn('[watcher] @parcel/watcher unavailable, using chokidar fallback');
  
  const { relative } = await import('node:path');
  const watcher = watch(dir, {
    ignoreInitial: true,
    ignored: (path: string) => filter.isExcluded(relative(dir, path)),
  });
  
  // Adapt chokidar events to @parcel/watcher shape
  watcher.on('add', (path) => onEvent([{ type: 'create', path }]));
  watcher.on('change', (path) => onEvent([{ type: 'update', path }]));
  watcher.on('unlink', (path) => onEvent([{ type: 'delete', path }]));
  
  return {
    unsubscribe: () => watcher.close(),
  };
}
```

The existing `startWatcher()` function tries `@parcel/watcher` first, falls back to chokidar. The `DiskEvent` taxonomy and reconciliation pipeline remain unchanged — the fallback just feeds events into the same system.

**Additional import sites** that also need the tiered fallback:
- `packages/server/src/head-watcher.ts` (line 13) — watches `.git/HEAD` for branch switches. Fallback: graceful degradation (log warning, skip git operation watching) rather than full chokidar fallback, since HEAD watching is less critical than content file watching.
- `packages/cli/src/mcp/server.ts` (line 23) — watches `.open-knowledge/` for catalog updates. Fallback: same tiered pattern (try @parcel/watcher, fall back to chokidar).

All three import sites must use dynamic imports with try/catch to avoid crashing when @parcel/watcher is unavailable.

**tsdown.config.ts changes:**
- Keep `@parcel/watcher` in `neverBundle` (native addon cannot be bundled, even with dynamic import)
- Add `chokidar` to `neverBundle` (runtime dependency, not bundled)

### Track 3: Auto-init on first start

**Changes to `packages/cli/src/commands/start.ts`:**

Before the existing content directory check, add:

```typescript
const okDir = resolve(cwd, '.open-knowledge');
if (!existsSync(okDir) && opts.init !== false) {
  const { runInit } = await import('./init.ts');
  // Auto-init scaffolds .open-knowledge/ but does NOT write .mcp.json
  // MCP registration is an explicit step via `init` command (for team setup)
  // This avoids surprising P2 evaluators with untracked files in their repo
  const result = runInit({ cwd, mcp: false });
  autoInitResult = result;
}
```

**Add `--no-init` flag** to the start command:
```typescript
.option('--no-init', 'Skip auto-scaffolding of .open-knowledge/')
```

**Banner update:** If auto-init ran, append a line to the banner:
```
  ✓ Scaffolded .open-knowledge/ (first run)
  Tip: Run `open-knowledge init` to register MCP tools for Claude Code
```

**Key design choice:** Auto-init from `start` does NOT write `.mcp.json`. Rationale: a first-time evaluator (P2) running `bunx @inkeep/open-knowledge` wants to preview the editor — writing `.mcp.json` to their repo root is an unexpected side effect. MCP registration is the job of the explicit `init` command, which is the team setup step (P3).

**Content directory behavior:** The config defaults `content.dir` to `'.'`, which means the current working directory. After auto-init, the server watches `cwd` for `**/*.md` files — which is exactly what a first-time user wants. If `content.dir` is set to a custom path that doesn't exist, auto-init creates the directory.

### Track 4: Claude Code plugin packaging

**Key finding:** `.claude/launch.json` (preview server auto-start) is a **project-level Desktop feature, NOT a plugin feature**. A plugin cannot ship a `launch.json`. However, a plugin CAN start a server via a SessionStart hook.

See [evidence/plugin-format.md](evidence/plugin-format.md) for full investigation.

**Plugin structure:**

```
open-knowledge-plugin/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── hooks/
│   └── hooks.json
└── README.md
```

**plugin.json:**
```json
{
  "name": "open-knowledge",
  "version": "0.1.0",
  "description": "CRDT knowledge base with real-time collaboration and AI agent tools",
  "author": { "name": "Inkeep" },
  "repository": "https://github.com/inkeep/open-knowledge"
}
```

**`.mcp.json`** (must be a separate file — [inline mcpServers in plugin.json are broken](https://github.com/anthropics/claude-code/issues/16143)):
```json
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"]
    }
  }
}
```

**hooks/hooks.json** (optional — auto-start collab server):
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "npx @inkeep/open-knowledge start --quiet &"
      }]
    }]
  }
}
```

**Note on the SessionStart hook approach:** This starts the collab server as a background process when a Claude Code session begins. The server persists between sessions (no cleanup on session end), which is actually desirable — the server should be long-lived. However, starting a background HTTP server in a hook may surprise users, so this should be opt-in or clearly documented.

**Alternative (simpler):** Ship the plugin with MCP server only (no SessionStart hook). The MCP tools work without the collab server — disk-only mode. If the user wants the browser editor, they run `bunx @inkeep/open-knowledge` separately. This is the safer initial approach.

**Plugin installation:** Users install via marketplace or custom marketplace:
```
/plugin install open-knowledge@inkeep-marketplace
# or for development:
claude --plugin-dir ./open-knowledge-plugin
```

**What the plugin provides:**
1. MCP server auto-starts on session — agent tools available immediately
2. No need for `.mcp.json` in the project repo (plugin handles registration)
3. Skills, agents, and hooks bundled if desired

### System design

**Architecture overview:** No new services or runtime components. This spec modifies the build pipeline (T1), adds a fallback code path in the file watcher (T2), adds conditional init logic to the start command (T3), and packages existing functionality as a Claude Code plugin (T4).

**Data flow:** Unchanged. The CRDT collaboration flow (file watcher → DiskEvent → reconciliation → Y.Doc) remains identical. The chokidar fallback produces the same event shape.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Asset resolution | `dist/public/` missing (bad build) | `assetDir` is null | Log warning, serve API-only (no UI) | No browser UI, server still works |
| @parcel/watcher | Native binary not found | Dynamic import throws | Fall back to chokidar | Slightly slower change detection |
| chokidar | Fails to start | Exception in `watch()` | Log error, server starts without file watching | External edits not detected |
| Auto-init | `.open-knowledge/` write fails (permissions) | `runInit` returns `mcpAction: 'failed'` | Log warning, start server without init | Server works, no MCP config |

---

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence |
|---|---|---|---|---|---|---|
| D1 | Use build-time copy (`cp -r`) for React app assets, not a bundler plugin or workspace reference | T | LOCKED | No | Simplest, most debuggable, matches Prisma's approach. Verifiable with `npm pack --dry-run`. | [research report D1](../../reports/zero-config-bunx-cli-packaging/REPORT.md) |
| D2 | Asset path resolution: check `dist/public/` first, keep monorepo paths as fallbacks | T | LOCKED | No | Works for both npm install and monorepo dev. Single line addition. | evidence/codebase-current-state.md |
| D3 | Tiered watcher: @parcel/watcher (optional) → chokidar (guaranteed) | T | DIRECTED | No | Eliminates native addon portability risk. @parcel/watcher stays for performance, chokidar ensures the tool always works. Implementation detail: how to adapt chokidar events to DiskEvent. | [research report D5](../../reports/zero-config-bunx-cli-packaging/REPORT.md) |
| D4 | Auto-init on first `start` with `--no-init` opt-out | P/T | DIRECTED | No | Reduces setup to a single command. Idempotent via existing `runInit`. Opt-out respects user control. | evidence/codebase-current-state.md |
| D5 | Keep MCP registration command as `npx` (not `bunx`) | T | LOCKED | Yes (.mcp.json is committed) | `npx` works in any Node.js environment. `bunx` requires Bun. The MCP server is started by Claude Code, which may not have Bun. | [research report D4](../../reports/zero-config-bunx-cli-packaging/REPORT.md) |
| D6 | Keep `start` and `mcp` as separate commands/processes | P/T | LOCKED | No | Different consumers (humans vs AI agents), different lifecycle (long-lived vs session-scoped). Auto-starting collab server from MCP would fight Claude Code's stdio lifecycle model. | [research report D4](../../reports/zero-config-bunx-cli-packaging/REPORT.md) |
| D7 | Use chokidar ^5.0.0 (ESM-only, Node >= 20) as the watcher fallback | T | LOCKED | No | Lighter than v4 (~80KB vs ~150KB), ESM-only matches our module format. Both v4 and v5 have 1 dep (readdirp). `engines.node >= 22` satisfies v5's requirement. | npm registry, chokidar changelog |
| D8 | chokidar dependency lives in the server package (not CLI) | T | DIRECTED | No | The file watcher is a server concern. Both @parcel/watcher and chokidar belong where the watcher is implemented. | evidence/codebase-current-state.md |
| D9 | Plugin ships MCP server only, no SessionStart hook for collab server (initially) | P | DIRECTED | No | Starting a background HTTP server in a hook could surprise users. Safer initial approach: MCP tools work in disk-only mode. User starts `bunx @inkeep/open-knowledge` separately for browser editor. | evidence/plugin-format.md |
| D10 | Auto-init creates content directory if it doesn't exist (for non-default `content.dir`) | P | DIRECTED | No | Reduces friction. Default `content.dir` is `.` (always exists), but custom dirs should be auto-created. | evidence/codebase-current-state.md |

---

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | What chokidar version to use — v4 (CJS+ESM) or v5 (ESM-only, Node >= 20)? | T | P0 | No | v5: ESM-only, ~80KB, 1 dep, requires Node >= 20. Our `engines.node >= 22` satisfies it. | **Resolved: chokidar ^5.0.0** |
| Q2 | Should auto-init also create a content directory if `content.dir` doesn't exist? | P | P0 | No | Default `content.dir` is `.` (cwd). It always exists. For custom dirs, `start` should create it if missing. | **Resolved: create if missing** |
| Q3 | Claude Code plugin format — exact structure, installation method, launch.json support? | T | P0 (T4) | Yes (T4 only) | Investigated. launch.json is NOT a plugin feature. Plugin uses .mcp.json + optional SessionStart hook. | **Resolved: see evidence/plugin-format.md** |
| Q4 | Should the chokidar fallback in server package depend on chokidar directly, or should it be injected from CLI? | T | P0 | No | chokidar is the file watcher fallback — belongs in server package alongside @parcel/watcher. | **Resolved: server package owns both** |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `import.meta.dirname` resolves to the directory containing the JS file in both Node.js and Bun when run from a bunx/npx cache | HIGH | Test after publishing a test package | Before implementation | Active |
| A2 | chokidar v4/v5 `watch()` API is compatible enough to adapt to DiskEvent taxonomy without major refactoring | HIGH | Read chokidar source, verify event types | Before T2 implementation | Active |
| A3 | sirv's `single: true` mode works correctly when serving from `dist/public/` (SPA fallback for React Router) | HIGH | Already works in monorepo — same sirv config | Before T1 testing | Active |
| A4 | `cp -r` in the build script works on macOS and Linux CI | HIGH | Standard POSIX command | Before T1 | Active |

---

## 13) In Scope (implement now)

### Track 1: Bundle React app assets + fix path resolution
- **Goal:** G1
- **Requirements:** First 2 rows of §6
- **Solution:** §9 Track 1
- **Next actions:** Modify build scripts, update `start.ts` asset paths, test with `npm pack`
- **Risks:** None identified — mechanical changes
- **Instrumentation:** Log asset resolution path at startup

### Track 2: @parcel/watcher fallback
- **Goal:** G2
- **Requirements:** Rows 3-4 of §6
- **Solution:** §9 Track 2
- **Next actions:** Modify file-watcher.ts, update package.json deps, test both paths
- **Risks:** chokidar event timing may differ from @parcel/watcher (batching, debounce). Mitigated by testing reconciliation with both backends.
- **Instrumentation:** Log which watcher backend is active

### Track 3: Auto-init on first start
- **Goal:** G3
- **Requirements:** Rows 5-9 of §6
- **Solution:** §9 Track 3
- **Next actions:** Modify `start.ts` to call `runInit` conditionally, add `--no-init` flag, update banner
- **Risks:** Auto-init writing `.mcp.json` in a repo could surprise users. Mitigated by banner messaging and `--no-init` opt-out.
- **Instrumentation:** Log whether auto-init was triggered

### Track 4: Claude Code plugin packaging
- **Goal:** G4
- **Requirements:** Rows 10-11 of §6 (Could)
- **Solution:** §9 Track 4 (pending investigation)
- **Next actions:** Complete plugin format investigation, design plugin structure
- **Risks:** Plugin format may not support launch.json or preview servers. May need to defer.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Existing users with monorepo setup | Asset path fallback preserves monorepo resolution | `bun run dev` still works |
| npm publish includes React app | `npm pack --dry-run` shows `dist/public/` | Before publish |
| Auto-init doesn't break existing projects | `runInit` is idempotent, `--no-init` opt-out | Test with existing `.open-knowledge/` |
| chokidar adds to dependency tree | chokidar v5 is ~80KB with one dep (readdirp ^5), ESM-only | Check `npm pack` size |

---

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| chokidar event model differs enough to cause reconciliation bugs | Low | Medium | Comprehensive test suite for both watcher backends | Dev |
| Auto-init surprises users who don't want `.open-knowledge/` | Low | Low | `--no-init` flag, clear banner messaging | Dev |
| `import.meta.dirname` behaves differently across runtimes | Very Low | High | Test on Node.js and Bun before release | Dev |
| Claude Code plugin format doesn't support preview servers | Medium | Low (T4 only) | T4 is "Could" priority — can defer without affecting T1-T3 | Dev |

---

## 15) Future Work

### Explored
- **MCP Streamable HTTP transport on `start` server**
  - What we learned: Claude Code supports HTTP transport. The `start` HTTP server could serve MCP at `/mcp`.
  - Recommended approach: Add an MCP HTTP endpoint to the existing HTTP server routing in `start.ts`.
  - Why not in scope: stdio is zero-config (Claude Code manages lifecycle). HTTP requires manual server start.
  - Triggers to revisit: Multi-client MCP access requirement, or if plugin approach needs HTTP.

### Identified
- **Auto-port-finding** — increment port if default is occupied (like Vite). Low effort, improves resilience.
- **Pre-compressed assets** — gzip React app JS/CSS at build time for faster first load. sirv already supports serving `.gz` files.

### Noted
- **Unscoped package name** (`open-knowledge`) — ergonomic improvement for CLI invocation, but requires npm name registration.
- **`--quiet` flag** — suppress banner when started by automation. Useful for script/CI contexts.

---

## 16) Agent constraints

- **SCOPE:** `packages/cli/package.json`, `packages/cli/tsdown.config.ts`, `packages/cli/src/commands/start.ts`, `packages/cli/src/mcp/server.ts`, `packages/server/src/file-watcher.ts`, `packages/server/src/head-watcher.ts`, `packages/server/package.json`
- **EXCLUDE:** `packages/app/` (only built, not modified), `packages/core/`, docs/, `.open-knowledge/`
- **STOP_IF:** Changes to the DiskEvent type taxonomy, changes to the reconciliation pipeline, changes to the MCP server protocol
- **ASK_FIRST:** New runtime dependency beyond chokidar, changes to the published API surface (`exports` in package.json), changes to `.mcp.json` format
