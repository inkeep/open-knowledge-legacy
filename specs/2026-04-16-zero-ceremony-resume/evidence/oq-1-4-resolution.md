---
title: "OQ-1.4 resolution — `ok ui` lock-collision proxy mode"
description: "Resolves OQ-1.4 (Claude Code `preview_start` behavior when ok ui exits 0 on lock collision). Under autoPort:true, Claude Code may pick a different port than our lock's port; exit 0 leaves the preview pane's proxy target unlistened. Fix: ok ui's collision handler starts a reverse HTTP proxy listening on the requested PORT env var, forwarding to the lock's port. Works in all scenarios."
sources: packages/cli/src/commands/editors.ts, https://code.claude.com/docs/en/desktop (preview_start + autoPort sections), earlier WebFetch persisted at tool-results/toolu_01V6XudMdRRBbixiQBR6dbR2.txt
created: 2026-04-16
last-updated: 2026-04-16
baseline-commit: 5dab8683
type: synthesis
tags:
  - evidence
  - oq-1-4
  - preview-start
  - resolution
---

# OQ-1.4 resolution — `ok ui` lock-collision proxy mode

**TLDR.** OQ-1.4 asked: when Claude Code's `preview_start` spawns `ok ui` after MCP stdio has already spawned one, does Claude Code tolerate the subprocess exiting 0? The answer turns out to be **"it depends on the port"** — under `autoPort:true`, Claude Code picks a fresh port when the preferred (3000) is busy and expects the subprocess to bind it. Exit 0 leaves Claude Code's preview proxy pointing at a port nothing listens on → silent failure. Fix: `ok ui` on lock collision checks `PORT` env var against the lock's port. If they differ, start a reverse HTTP proxy listening on `PORT` and forwarding to the lock's port. Works cleanly in all ordering scenarios.

## Scenarios

### Scenario A — Claude Code's `preview_start` fires first (common)

Per docs: "In most cases, Claude starts the server automatically after editing project files." Triggering edit → auto-preview_start → spawns `ok ui` via launch.json.

1. Claude Code probes port 3000: free. Spawns `npx @inkeep/open-knowledge ui` with `PORT=3000` (autoPort didn't need to reroute).
2. `ok ui` acquires `ui.lock` at port 3000. Binds 3000. Serves.
3. Agent calls tool → MCP stdio → MCP spawns `ok start` detached.
4. `ok start` reads `ui.lock`: alive at 3000 → skips auto-spawn of UI (FR-1.9).
5. MCP's tool responses return `previewUrl` pointing at port 3000.
6. Claude Code's preview pane proxy is on 3000 (matches) → renders correctly.

**Works.** No code path required beyond the existing design.

### Scenario B — MCP stdio spawns first, `preview_start` second

User opens editor, uses agent tool BEFORE clicking preview dropdown. Later clicks preview.

1. MCP stdio spawns `ok start` detached → `ok start` auto-spawns `ok ui` on port 3000. `ui.lock` at 3000.
2. Agent tool returns `previewUrl` pointing at 3000.
3. User clicks preview dropdown → Claude Code's `preview_start` fires:
   - Probes port 3000: busy (our lock owner holds it).
   - `autoPort: true` → picks a free port (e.g., 52345).
   - Sets `PORT=52345` env var.
   - Spawns `npx @inkeep/open-knowledge ui` with `PORT=52345`.
4. Our second `ok ui`:
   - Reads `ui.lock`: alive at port 3000. `acquireProcessLock` throws `ServerLockCollisionError`.
   - **OLD design (exit 0):** exits 0 with "UI already running at 3000". Claude Code's preview proxy is pointed at 52345 → nothing listens → preview pane errors.
   - **NEW design (proxy mode — this resolution):** reads `PORT=52345`; starts a reverse HTTP proxy on port 52345 forwarding to `localhost:3000`. Claude Code's preview proxy connects to 52345 → our proxy forwards to 3000 → content served. Preview pane works.

### Scenario C — Terminal user runs `ok ui` with live lock

User at shell types `ok ui` while another `ok ui` is already running. `PORT` env is not set.

1. `ok ui` tries lock: collision. Reads lock's port (e.g., 3000). Requested port: default 3000.
2. Existing port === requested → "UI already running at http://localhost:3000"; exit 0.

**Unchanged from prior D-022.**

### Scenario D — Claude Code's preview_start re-spawns after proxy was running

User clicks "Stop" then "Start" in preview dropdown. Claude Code sends SIGTERM to the proxy process (scenario B's proxy), re-spawns `ok ui`.

1. Claude Code picks a new port (autoPort may reuse 52345 if free, or pick another).
2. Spawns `ok ui` with `PORT=<new>`.
3. Our `ok ui` sees live lock at 3000 (the original, still running). Starts proxy on `<new>`. Works.

The original `ok ui` on port 3000 is unaffected.

## Design

`ok ui` entry point flow:

```typescript
// packages/cli/src/commands/ui.ts (new)
const requestedPort = Number(process.env.PORT) || defaultPort;  // defaultPort = 3000

try {
  const lock = acquireProcessLock({ lockName: 'ui', contentDir, metadata });
  // normal path — bind requestedPort, serve static + /api/config
  startNormalUi(requestedPort, lock);
} catch (err) {
  if (!(err instanceof ServerLockCollisionError)) throw err;

  const existing = readUiLock(lockDir);
  if (!existing || !isProcessAlive(existing.pid)) {
    // stale — recover by pruning + retry
    removeUiLock(lockDir);
    // retry once
    return main();
  }

  if (existing.port === 0) {
    // race: other ok ui started but hasn't bound yet — poll briefly
    await waitForPortBound(lockDir, /* timeoutMs */ 2000);
    const lockAfter = readUiLock(lockDir);
    if (!lockAfter || lockAfter.port === 0) {
      console.error('UI did not bind within 2s; existing process may be hung. Run `ok clean`.');
      process.exit(1);
    }
    existing.port = lockAfter.port;
  }

  if (existing.port === requestedPort) {
    console.log(`UI already running at http://localhost:${existing.port}`);
    process.exit(0);
  }

  // Proxy mode: bind requestedPort, forward HTTP to existing.port
  console.log(
    `UI running at http://localhost:${existing.port}; acting as HTTP proxy on port ${requestedPort}`,
  );
  startProxyMode({ listenPort: requestedPort, upstreamPort: existing.port });
}
```

Proxy mode implementation:

```typescript
// packages/cli/src/commands/ui-proxy.ts (new)
import http from 'node:http';

export function startProxyMode(opts: { listenPort: number; upstreamPort: number }) {
  const proxy = http.createServer((req, res) => {
    const proxyReq = http.request({
      host: 'localhost',
      port: opts.upstreamPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Upstream unreachable: ${err.message}`);
    });
    req.pipe(proxyReq);
  });
  proxy.listen(opts.listenPort);

  // Graceful shutdown on SIGTERM/SIGINT (Claude Code's "Stop server" action).
  const shutdown = () => {
    proxy.close(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
```

No new 3P dependency — Node's built-in `http` module handles request piping natively.

## Why proxy is preferable to alternatives

- **autoPort:false (require port 3000).** When MCP has pre-spawned UI on 3000, Claude Code's preview_start fails visibly. User must `ok stop` to recover. Worse UX.
- **Detect Claude Code env; MCP skips UI spawn for Claude Code users.** Requires reliable environment marker (none documented). Brittle; affects non-preview Claude Code users who WANT MCP to spawn UI.
- **Always MCP-spawn; Claude Code preview_start is optional.** Would mean removing `.claude/launch.json` from init scaffold. Sacrifices Claude Code's preview pane for lifecycle simplicity. Spec explicitly keeps launch.json per D-020.
- **`ok ui` sleeps forever on collision (idle placeholder).** Claude Code's preview pane still sees subprocess "alive" but its proxy target (requested port) has no listener → same silent-failure as exit 0.

Proxy mode is the only option that makes Scenario B work without sacrificing other design intent.

## Implications for SPEC.md

- **D-022 revised (new content below).** Supersedes the current "exit 0 with message" design.
- **FR-1.1 AC expanded.** Lock-collision handling now documents proxy mode.
- **OQ-1.4 → RESOLVED (D-032 new).** Runtime verification goal becomes "confirm proxy mode serves Claude Code's preview pane correctly" (A5 revised).
- **New test requirements:** unit test for proxy request forwarding; integration test for scenario B end-to-end (MCP-spawned UI + separate `ok ui` spawn with PORT env → preview pane proxies through correctly).

## Pointers

- Claude Code preview docs: https://code.claude.com/docs/en/desktop (preview + autoPort sections).
- Earlier investigation: [launch-json-and-port.md](./launch-json-and-port.md).

## Gaps / follow-ups

- Runtime verification planned at implementation time (A5 revised): start MCP spawn, then user-click preview dropdown, confirm preview pane renders doc.
- Proxy mode's performance under sustained traffic (image-heavy docs, large file lists): not benchmarked; expected negligible vs. network latency but worth profiling if users report slowness.
- Claude Code's behavior on proxy's 502 response (when upstream ok ui dies): expected to show an error in preview pane. User can recover with `ok start` or `ok ui` + refresh.
