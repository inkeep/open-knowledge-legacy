# Current state — init / start / mcp lifecycle

TLDR: `ok init` and `ok start` already scaffold and run; `ok mcp` discovers via lockfile but does NOT spawn a server. Claude Code's `.claude/launch.json` with `preview_start("open-knowledge")` is the only auto-start hook today, and it's Claude-Code-specific.

## `ok init` (packages/cli/src/commands/init.ts)

- **CONFIRMED** `runInit({cwd, mcp, force, editors, rootInstructions, home})` does four things in order:
  1. `initContent(cwd)` — scaffolds `.open-knowledge/{AGENTS.md, config.yml, cache/, .gitignore}` (source: `packages/cli/src/content/init.ts:1-90`; AGENTS\_MD\_CONTENT content verified).
  2. For each selected editor target, `writeEditorMcpConfig(target, cwd, force, home)` writes `.mcp.json` (Claude Code) or equivalent (Cursor, VS Code, Windsurf). Project-root `.mcp.json` is the Claude target.
  3. If Claude is one of the selected editors, `scaffoldLaunchJson(cwd, force)` writes `.claude/launch.json` with `{name: 'open-knowledge', runtimeExecutable: 'npx', runtimeArgs: ['open-knowledge', 'start'], port: 3000}` (init.ts:138-190).
  4. `upsertRootInstructions(cwd, force)` appends the OK section to the project's root AGENTS.md between `<!-- open-knowledge:begin -->` / `<!-- open-knowledge:end -->` markers.

- **CONFIRMED** Default editor selection: when `--editor` flag is absent AND stdin is a TTY, the interactive multiselect prompt pre-selects editors whose config dir already exists (plus Claude always pre-selected) (init.ts:530-541). When stdin is not a TTY and no flag is given, **defaults to **`['claude']` (init.ts:555-556).

- **CONFIRMED** `--editor all` is a valid flag value that selects all four editors (init.ts:487-493).

- **CONFIRMED** Port `3000` is hardcoded in `scaffoldLaunchJson` (init.ts:145) — this is Claude Code's preview\_start port, not the server's actual port. Claude Code intercepts requests on 3000 and proxies to `ok start`'s actual listening port. *\[VERIFY — re-check if this has been updated since a27bfdc3.]*

## `ok start` (packages/cli/src/commands/start.ts)

- **CONFIRMED** Auto-init branch at start.ts:37-49: if `.open-knowledge/` doesn't exist AND `opts.init !== false`, calls `runInit({cwd, mcp: false})`. `mcp: false` skips editor config writes (makes sense — auto-init only scaffolds content on first-run of `start`; full `init` must be run deliberately).
- **CONFIRMED** `createServer()` from `@inkeep/open-knowledge-server` returns `{hocuspocus, contentFilter, destroy, ready, degraded, lockDir}` (start.ts:76-88). Lock is acquired inside `createServer` via `acquireServerLock` before any side effects.
- **CONFIRMED** HTTP server is ONE process serving BOTH Hocuspocus WebSocket (`/collab`) AND static React assets + content via `sirv` (start.ts:138-190). No separate "UI app" process or "UI lockfile."
- **CONFIRMED** After `httpServer.listen(port, host, ...)` callback fires, `updateServerLockPort(lockDir, realPort)` writes the kernel-allocated port into `server.lock` (start.ts:222-227). This is the discovery handoff.
- **CONFIRMED** Graceful shutdown via idempotent SIGINT/SIGTERM handlers calling `destroy()` exactly once (start.ts:93-113).

## `ok mcp` (packages/cli/src/commands/mcp.ts)

- **CONFIRMED** `discoverServerUrl({lockDir, host, portOverride})` is the entire lifecycle logic (mcp.ts:32-74):
  - `--port N` override (N>0): `ws://<host>:N`
  - `--port 0` override: disk-only
  - `readServerLock(lockDir)` returns live lock with `port > 0`: `ws://localhost:<port>` (uses `localhost` to resolve either IPv4 or IPv6 loopback).
  - Lock exists but `port: 0` (server starting): disk-only ("running instance still starting").
  - No lock: disk-only ("no running instance").
- **CONFIRMED (NEGATIVE)** `ok mcp` does NOT spawn `ok start`, does NOT poll for port-assignment, does NOT retry. If the server isn't running, MCP is disk-only for the session.

## `server.lock` (packages/server/src/server-lock.ts)

- **CONFIRMED** Path: `<contentDir>/.open-knowledge/server.lock` (default contentDir is repo root).
- **CONFIRMED** Shape: `{pid, hostname, port, startedAt, worktreeRoot}`.
- **CONFIRMED** Lifecycle:
  - `acquireServerLock(lockDir)` writes lock with `port: 0` at `createServer()` top, before any side effects.
  - `updateServerLockPort(lockDir, realPort)` is called by the listening caller (CLI or Vite plugin) after `listen()` resolves. Ownership-guarded (refuses to rewrite if pid mismatches).
  - `readServerLock(lockDir)` returns `null | {pid, port, ...}`. Stale-lock detection via `isProcessAlive(pid)` on same host.
  - `releaseServerLock(lockDir)` runs as the LAST step in `destroy()` (CLAUDE.md confirms CC8 shutdown ordering).
  - Collision: live same-host PID holding lock → `ServerLockCollisionError` on second `acquireServerLock` call.
- **CONFIRMED** One server per contentDir is enforced. Multi-project isolation derives from different contentDirs having different lockDirs.

## Existing preview_start integration (Claude Code only)

- **CONFIRMED** `.claude/launch.json` scaffolded by init when `claude` is a selected editor (init.ts:138-190).
- **CONFIRMED (external)** Claude Code's `preview_start("open-knowledge")` reads `.claude/launch.json`, runs `runtimeArgs` as a subprocess, and proxies the preview browser pane to the resulting port. Behavior source: CLAUDE.md references and the `get_preview_url` MCP tool response shape. *\[VERIFY — is the launch lifecycle documented anywhere in-repo?]*
- **NOT FOUND** Equivalent hooks for Cursor, Windsurf, VS Code MCP extensions, or Codex. Searched: `grep -r launch.json packages/cli/src/` → only Claude target. Searched: Cursor/Windsurf docs — no equivalent found in codebase.

## `get_preview_url` tool (existing)

- **CONFIRMED (from CLAUDE.md + MCP tool list):** `get_preview_url(docName)` returns `{previewUrl, previewUrlSource}` where `previewUrlSource` is one of `env | lock | config`. Returns `{previewUrl: null}` when resolution fails (e.g., no live lock with port > 0). Used today for navigating the preview browser BEFORE calling `write_document` / `edit_document`.

## What is NOT in current code (gaps this project would close)

- **NOT FOUND:** MCP stdio process spawning `ok start`. Grep for `spawn` / `child_process` in `packages/cli/src/commands/mcp.ts`: no matches.
- **NOT FOUND:** UI URL field embedded in `write_document` / `edit_document` / `read_document` / `search` / `exec` response shapes. Only `get_preview_url` surfaces URLs — it's a dedicated call, not a side-effect of other tools.
- **NOT FOUND:** Init default set to `all` editors. Default is `['claude']` (init.ts:555-556).

## Implications for the bet

1. Story 1 (MCP-as-starter) needs new code in `mcp.ts` to spawn `ok start` detached. The server.lock infra is reusable — no new lockfile format needed. Orphan-process cleanup (see open question TQ1) is the core design risk.
2. Story 2 (UI URL response contract) needs a shared helper that the MCP server-side tool handlers call before returning. The `get_preview_url` logic moves to a lib; tool responses embed `{ui: {previewUrl}}` (or similar) field.
3. Story 3 (init default = all) is a \~5-line change in `init.ts:555` plus interactive-prompt default expansion.

## Gaps / follow-ups

- **\[VERIFY]** `launch.json` port 3000 hardcode — confirm Claude Code's preview\_start actually uses this port or whether it's ignored.
- **\[VERIFY]** Whether concurrent `ok start` invocations in different contentDirs have ever been stress-tested. Code suggests it should work (per-contentDir locks + port 0) but no explicit test case found.
